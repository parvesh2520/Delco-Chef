"""Customer profile/addresses/consents (A5, A8–A10) and chef onboarding/off-days (A12, B6)."""
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.security import encrypt
from app.domain import ist_today
from app.domain.geo import within_india
from app.models import (Address, Chef, ChefBankAccount, ChefDocument, ChefOffDay, ChefSkill, Consent, CustomerProfile,
                        ServiceInterest, ServiceRequest, User, Visit)
from app.services.events import notify, notify_admins
from app.services.storage import storage, validate_image

MAX_ADDRESSES = 3
# Preferred language (A5): the languages chefs can declare at registration, so customer and chef can be matched.
LANGUAGES = {"en": "English", "hi": "Hindi", "pa": "Punjabi", "bn": "Bengali", "ta": "Tamil", "mr": "Marathi"}
TERMS_VERSION = "2026-11"
LOCATION_VERSION = "2026-11"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def now() -> datetime:
    return datetime.now(timezone.utc)


def _name(v: str | None, field: str = "fullName") -> str:
    v = (v or "").strip()
    if not 2 <= len(v) <= 80:
        raise AppError("VALIDATION_ERROR", "Name must be 2 to 80 characters.", 422, fields={field: "Name must be 2 to 80 characters."})
    return v


def _email(v: str | None) -> str | None:
    v = (v or "").strip() or None
    if v and not EMAIL_RE.match(v):
        raise AppError("VALIDATION_ERROR", "Enter a valid email.", 422, fields={"email": "invalid"})
    return v


# ---------------- Customer ----------------
def profile_json(db: Session, u: User) -> dict:
    from app.services.presenters import phone_of
    p = db.get(CustomerProfile, u.id)
    consent = db.scalar(select(func.max(Consent.accepted_at)).where(Consent.user_id == u.id, Consent.kind == "terms"))
    return {"id": str(u.id), "fullName": u.full_name or "", "phone": phone_of(u), "email": u.email,
            "householdSize": p.household_size if p else None, "preferredLanguage": p.preferred_language if p else "en",
            "diet": p.diet if p else None, "cuisines": p.cuisines if p else [], "allergies": p.allergies if p else [],
            "allergyNotes": p.allergy_notes if p else None, "consentAcceptedAt": consent.isoformat() if consent else None,
            "onboarded": bool(p and p.onboarded_at)}


def update_profile(db: Session, u: User, body: dict) -> dict:
    p = db.get(CustomerProfile, u.id)
    if "fullName" in body:
        u.full_name = _name(body["fullName"])
    if "email" in body:
        u.email = _email(body["email"])
    if "householdSize" in body and body["householdSize"] is not None:
        if not 1 <= int(body["householdSize"]) <= 20:
            raise AppError("VALIDATION_ERROR", "Household size must be 1 to 20.", 422, fields={"householdSize": "range"})
        p.household_size = int(body["householdSize"])
    if "preferredLanguage" in body:
        lang = body["preferredLanguage"] or "en"
        if lang not in LANGUAGES:
            raise AppError("VALIDATION_ERROR", "Choose one of the listed languages.", 422, fields={"preferredLanguage": "invalid"})
        p.preferred_language = lang
    if "diet" in body and body["diet"]:
        if body["diet"] not in ("veg", "non_veg", "eggetarian", "vegan", "jain"):
            raise AppError("VALIDATION_ERROR", "Unknown dietary preference.", 422, fields={"diet": "invalid"})
        p.diet = body["diet"]
    allergy_changed = False
    if "allergies" in body or "allergyNotes" in body:
        new_a = [a.strip() for a in body.get("allergies", p.allergies) or [] if a.strip()]
        new_n = (body.get("allergyNotes", p.allergy_notes) or "").strip() or None
        if new_a and not new_n:
            raise AppError("VALIDATION_ERROR", "Describe the allergy.", 422, fields={"allergyNotes": "required"})
        allergy_changed = (new_a, new_n) != (p.allergies, p.allergy_notes)
        p.allergies, p.allergy_notes = new_a, new_n
    if allergy_changed:
        _propagate_allergy_change(db, u, p)
    db.commit()
    return profile_json(db, u)


def _propagate_allergy_change(db: Session, u: User, p: CustomerProfile) -> None:
    """B step 5: allergy changes reach the assigned chef immediately (open requests updated, chef notified)."""
    for r in db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == u.id,
                                                     ServiceRequest.stage.not_in(("closed",)))):
        r.allergies, r.allergy_notes = p.allergies, p.allergy_notes
        chefs = set(db.scalars(select(Visit.chef_id).where(Visit.request_id == r.id, Visit.chef_id.is_not(None),
                                                           Visit.status.in_(("scheduled", "chef_travelling", "checked_in"))).distinct()))
        for cid in chefs:
            notify(db, "allergy_changed", db.get(Chef, cid).user_id, "⚠ Allergy information changed",
                   f"{u.full_name or 'Your customer'}: {p.allergy_notes or 'no allergies now'}.", "/chef/jobs")


def complete_onboarding(db: Session, u: User) -> dict:
    p = db.get(CustomerProfile, u.id)
    if not u.full_name:
        raise AppError("ONBOARDING_INCOMPLETE", "Add your name first.", 409)
    if not db.scalar(select(func.count()).select_from(Address).where(Address.user_id == u.id, Address.deleted_at.is_(None))):
        raise AppError("ONBOARDING_INCOMPLETE", "Add an address first.", 409)
    if not db.scalar(select(func.count()).select_from(Consent).where(Consent.user_id == u.id, Consent.kind == "terms")):
        raise AppError("ONBOARDING_INCOMPLETE", "Accept the terms first.", 409)
    p.onboarded_at = p.onboarded_at or now()
    db.commit()
    return profile_json(db, u)


def accept_consent(db: Session, u: User, kinds: list[str]) -> dict:
    for k in kinds or ["terms", "location"]:
        if k not in ("terms", "location"):
            raise AppError("VALIDATION_ERROR", "Unknown consent.", 422)
        db.add(Consent(user_id=u.id, kind=k, version=TERMS_VERSION if k == "terms" else LOCATION_VERSION))
    db.commit()
    return profile_json(db, u)


def list_addresses(db: Session, u: User) -> list[Address]:
    return db.scalars(select(Address).where(Address.user_id == u.id, Address.deleted_at.is_(None))
                      .order_by(Address.is_default.desc(), Address.id)).all()


def get_address(db: Session, u: User, address_id: int) -> Address:
    a = db.scalar(select(Address).where(Address.id == address_id, Address.user_id == u.id, Address.deleted_at.is_(None)))
    if not a:
        raise not_found("Address")  # another customer's address is indistinguishable from a missing one
    return a


def save_address(db: Session, u: User, body: dict, address_id: int | None = None) -> Address:
    errors = {}
    try:
        lat, lng = float(body.get("lat")), float(body.get("lng"))
        if not within_india(lat, lng):
            errors["lat"] = "Location must be within India."
    except (TypeError, ValueError):
        lat = lng = 0.0
        errors["lat"] = "Pick a location on the map."
    line1 = (body.get("line1") or "").strip()
    if not 3 <= len(line1) <= 200:
        errors["line1"] = "Enter the address (3 to 200 characters)."
    if not re.fullmatch(r"\d{6}", str(body.get("pincode") or "")):
        errors["pincode"] = "Enter a 6-digit pincode."
    city = (body.get("city") or "").strip()
    if not 2 <= len(city) <= 60:
        errors["city"] = "Enter the city."
    label = (body.get("label") or "Home").strip()[:40]
    if errors:
        raise AppError("VALIDATION_ERROR", next(iter(errors.values())), 422, fields=errors)
    existing = list_addresses(db, u)
    if address_id is None:
        if len(existing) >= MAX_ADDRESSES:
            raise AppError("ADDRESS_LIMIT", "You can save up to 3 addresses.", 409)
        a = Address(user_id=u.id)
        db.add(a)
    else:
        a = get_address(db, u, address_id)
    a.label, a.line1_enc, a.city, a.pincode, a.lat, a.lng = label, encrypt(line1), city, str(body["pincode"]), lat, lng
    a.line2_enc = encrypt((body.get("line2") or "").strip() or None)
    a.landmark_enc = encrypt((body.get("landmark") or "").strip() or None)
    make_default = bool(body.get("isDefault")) or not any(x.is_default for x in existing if x is not a)
    if make_default:
        for x in existing:
            if x is not a and x.is_default:
                x.is_default = False
        db.flush()
    a.is_default = make_default or (a.is_default and address_id is not None)
    db.commit()
    return a


def delete_address(db: Session, u: User, address_id: int) -> None:
    a = get_address(db, u, address_id)
    a.deleted_at, a.is_default = now(), False
    db.flush()
    rest = list_addresses(db, u)
    if rest and not any(x.is_default for x in rest):
        rest[0].is_default = True
    db.commit()


def register_interest(db: Session, u: User, service: str) -> dict:
    if service not in ("home_food", "party_mode"):
        raise AppError("VALIDATION_ERROR", "Notify me is only for coming-soon services.", 422)
    already = db.get(ServiceInterest, (u.id, service)) is not None
    if not already:
        db.add(ServiceInterest(user_id=u.id, service=service))
        try:
            db.commit()
        except IntegrityError:  # a concurrent duplicate tap: the interest is already saved
            db.rollback()
            already = True
    return {"service": service, "interested": True, "alreadyRegistered": already}


def interested_services(db: Session, user_id: int) -> set[str]:
    return set(db.scalars(select(ServiceInterest.service).where(ServiceInterest.user_id == user_id)))


# ---------------- Chef ----------------
def chef_update(db: Session, chef: Chef, body: dict) -> Chef:
    u = db.get(User, chef.user_id)
    if "name" in body or "fullName" in body:
        u.full_name = _name(body.get("name") or body.get("fullName"), "name")
    if "email" in body:
        u.email = _email(body["email"])
    for f, col in (("city", "city"), ("area", "area"), ("specialities", "specialities")):
        if f in body:
            setattr(chef, col, (body[f] or "").strip()[:500] or None)
    if "active" in body and chef.status == "approved":
        chef.active = bool(body["active"])
    db.commit()
    return chef


def submit_application(db: Session, chef: Chef, body: dict) -> Chef:
    """A12: cuisines, experience, ID number, tax number, bank account, at least one document image."""
    if chef.status not in ("draft", "rejected"):
        raise AppError("APPLICATION_ALREADY_SUBMITTED", "Your application is already submitted.", 409)
    errors = {}
    u = db.get(User, chef.user_id)
    try:
        u.full_name = _name(body.get("fullName"))
    except AppError:
        errors["fullName"] = "Name must be 2 to 80 characters."
    try:
        u.email = _email(body.get("email"))
    except AppError:
        errors["email"] = "Enter a valid email."
    cuisines = sorted({c.strip() for c in body.get("cuisines") or [] if c and c.strip()})
    if not cuisines:
        errors["cuisines"] = "Choose at least one cuisine."
    try:
        exp = int(body.get("experienceYears"))
        if not 0 <= exp <= 60:
            raise ValueError
    except (TypeError, ValueError):
        errors["experienceYears"] = "Enter years of experience (0–60)."
        exp = 0
    try:
        lat, lng = float(body.get("homeLat")), float(body.get("homeLng"))
        if not within_india(lat, lng):
            raise ValueError
    except (TypeError, ValueError):
        errors["homeLat"] = "Set your home base on the map."
        lat = lng = None
    aadhaar = re.sub(r"\s", "", body.get("idNumber") or "")
    pan = (body.get("taxNumber") or "").strip().upper()
    if not re.fullmatch(r"\d{12}", aadhaar):
        errors["idNumber"] = "Enter a 12-digit ID number."
    if not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", pan):
        errors["taxNumber"] = "Enter a valid PAN (ABCDE1234F)."
    bank = body.get("bank") or {}
    acct = re.sub(r"\s", "", bank.get("accountNumber") or "")
    if not re.fullmatch(r"\d{9,18}", acct):
        errors["bank.accountNumber"] = "Enter a valid account number."
    if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", (bank.get("ifsc") or "").upper()):
        errors["bank.ifsc"] = "Enter a valid IFSC."
    if not (bank.get("accountName") or "").strip():
        errors["bank.accountName"] = "Enter the account holder name."
    has_doc = db.scalar(select(func.count()).select_from(ChefDocument).where(ChefDocument.chef_id == chef.id, ChefDocument.storage_key.is_not(None)))
    if not has_doc:
        errors["documents"] = "Upload at least one document image."
    if errors:
        db.rollback()
        raise AppError("VALIDATION_ERROR", next(iter(errors.values())), 422, fields=errors)
    chef.city, chef.area = (body.get("city") or "").strip()[:60], (body.get("area") or "").strip()[:80]
    chef.experience_years, chef.specialities, chef.home_lat, chef.home_lng = exp, (body.get("specialities") or "")[:500], lat, lng
    chef.skills = [ChefSkill(chef_id=chef.id, cuisine=c) for c in cuisines]
    for typ, val in (("aadhaar", aadhaar), ("pan", pan)):
        d = db.scalar(select(ChefDocument).where(ChefDocument.chef_id == chef.id, ChefDocument.type == typ))
        if d is None:
            d = ChefDocument(chef_id=chef.id, type=typ)
            db.add(d)
        d.value_enc, d.last4, d.status = encrypt(val), val[-4:], "pending"
    b = db.get(ChefBankAccount, chef.id) or ChefBankAccount(chef_id=chef.id)
    b.account_name, b.account_number_enc, b.account_last4, b.ifsc = bank["accountName"].strip()[:80], encrypt(acct), acct[-4:], bank["ifsc"].upper()
    b.upi_enc = encrypt(bank.get("upi")) if bank.get("upi") else None
    db.add(b)
    chef.status, chef.submitted_at, chef.rejection_reason = "submitted", now(), None
    notify_admins(db, "chef_application", "New chef application", f"{u.full_name} applied to join.", f"/admin/super/chef-applications/{chef.id}")
    db.commit()
    return chef


def upload_document(db: Session, chef: Chef, doc_type: str, data: bytes, content_type: str | None, file_name: str | None) -> ChefDocument:
    if doc_type not in ("aadhaar", "pan", "police_verification", "photo", "food_safety"):
        raise AppError("VALIDATION_ERROR", "Unknown document type.", 422)
    ctype, _ = validate_image(data, content_type)
    d = db.scalar(select(ChefDocument).where(ChefDocument.chef_id == chef.id, ChefDocument.type == doc_type))
    if d is None:
        d = ChefDocument(chef_id=chef.id, type=doc_type)
        db.add(d)
    elif d.storage_key:
        storage.delete(d.storage_key)
    d.storage_key = storage.put(f"chef-docs/{chef.id}", data, "png" if ctype == "image/png" else "jpg")
    d.file_name, d.status, d.uploaded_at = (file_name or f"{doc_type}.jpg")[:120], "pending", now()
    db.commit()
    return d


def off_days(db: Session, chef: Chef) -> list[str]:
    return [d.isoformat() for d in db.scalars(select(ChefOffDay.day).where(ChefOffDay.chef_id == chef.id,
                                                                           ChefOffDay.day >= ist_today()).order_by(ChefOffDay.day))]


def save_off_days(db: Session, chef: Chef, days: list[str]) -> dict:
    """B6: new assignments on these dates are blocked; existing assignments on them are flagged to admins."""
    today = ist_today()
    wanted: set[date] = set()
    for x in days:
        try:
            d = date.fromisoformat(x[:10])
        except ValueError:
            raise AppError("VALIDATION_ERROR", f"Invalid date {x}.", 422) from None
        if d < today:
            raise AppError("VALIDATION_ERROR", "Off-days must be today or later.", 422)
        wanted.add(d)
    current = {r.day: r for r in db.scalars(select(ChefOffDay).where(ChefOffDay.chef_id == chef.id, ChefOffDay.day >= today))}
    for d, r in current.items():
        if d not in wanted:
            db.delete(r)
    for d in wanted - set(current):
        db.add(ChefOffDay(chef_id=chef.id, day=d))
    conflicts = db.scalars(select(Visit).where(Visit.chef_id == chef.id, Visit.service_date.in_(wanted),
                                               Visit.status.in_(("scheduled", "chef_travelling")))).all()
    if conflicts:
        notify_admins(db, "off_day_conflict", "Chef off-day conflict",
                      f"A chef marked {len(conflicts)} assigned visit(s) as off-days. Reassign them.", "/admin/requests")
    db.commit()
    return {"days": sorted(d.isoformat() for d in wanted), "conflicts": [str(v.id) for v in conflicts]}
