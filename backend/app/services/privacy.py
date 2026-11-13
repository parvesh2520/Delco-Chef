"""Part H: data export, deletion/anonymisation, audited reveals."""
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.core.security import decrypt, encrypt
from app.models import (Address, AttendanceRecord, ChefBankAccount, ChefDocument, Consent, CustomerProfile, DataExport,
                        LocationPoint, Notification, Payment, PaymentEvent, ServiceInterest, ServiceRequest, Subscription,
                        SubscriptionDay, Trial, User, Visit)
from app.services import auth as auth_svc
from app.services.events import Actor, audit, notify
from app.services.presenters import address_json, iso, payment_json, phone_of
from app.services.storage import storage

from sqlalchemy import func


def now() -> datetime:
    return datetime.now(timezone.utc)


def build_export(db: Session, u: User) -> dict:
    """H1: everything we hold about this customer, and nothing about anyone else."""
    prof = db.get(CustomerProfile, u.id)
    reqs = db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == u.id)).all()
    visits = db.scalars(select(Visit).where(Visit.customer_id == u.id)).all()
    subs = db.scalars(select(Subscription).where(Subscription.customer_id == u.id)).all()
    pays = db.scalars(select(Payment).where(Payment.customer_id == u.id)).all()
    return {
        "generatedAt": now().isoformat(),
        "profile": {"name": u.full_name, "phone": phone_of(u), "email": u.email, "createdAt": iso(u.created_at),
                    "preferredLanguage": prof.preferred_language if prof else None, "diet": prof.diet if prof else None,
                    "householdSize": prof.household_size if prof else None},
        "needs": {"cuisines": prof.cuisines if prof else [], "allergies": prof.allergies if prof else [],
                  "allergyNotes": prof.allergy_notes if prof else None},
        "addresses": [address_json(a) for a in db.scalars(select(Address).where(Address.user_id == u.id, Address.deleted_at.is_(None)))],
        "consents": [{"kind": c.kind, "version": c.version, "acceptedAt": iso(c.accepted_at)}
                     for c in db.scalars(select(Consent).where(Consent.user_id == u.id))],
        "serviceInterests": [i.service for i in db.scalars(select(ServiceInterest).where(ServiceInterest.user_id == u.id))],
        "bookings": [{"id": r.id, "service": r.service, "stage": r.stage, "startDate": iso(r.start_date), "members": r.members,
                      "slot": r.slot, "createdAt": iso(r.created_at),
                      "trials": [{"number": t.number, "status": t.status, "decision": t.decision, "decidedAt": iso(t.decided_at)}
                                 for t in db.scalars(select(Trial).where(Trial.request_id == r.id))]} for r in reqs],
        "subscriptions": [{"id": s.id, "service": s.service, "status": s.status, "startDate": iso(s.start_date),
                           "endDate": iso(s.end_date), "amountPaise": s.amount_paise,
                           "offDays": [iso(d.day) for d in db.scalars(select(SubscriptionDay).where(SubscriptionDay.subscription_id == s.id))]}
                          for s in subs],
        "payments": [{k: v for k, v in payment_json(db, p, "customer").items() if k not in ("linkUrl",)} for p in pays],
        "visits": [{"id": v.id, "date": iso(v.starts_at), "status": v.status, "kind": v.kind,
                    "attendance": (lambda a: {"checkInAt": iso(a.check_in_at), "checkOutAt": iso(a.check_out_at),
                                              "workedMinutes": a.worked_minutes} if a else None)(
                        db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))),
                    "trackingPoints": db.scalar(select(func.count()).select_from(LocationPoint).where(LocationPoint.visit_id == v.id))}
                   for v in visits],
        "notifications": [{"title": n.title, "body": n.body, "at": iso(n.created_at)}
                          for n in db.scalars(select(Notification).where(Notification.user_id == u.id).order_by(Notification.id.desc()).limit(500))],
    }


def request_export(db: Session, u: User) -> DataExport:
    exp = DataExport(user_id=u.id, status="processing")
    db.add(exp)
    audit(db, Actor.of(u), "Requested data export", f"User {u.id}")
    db.commit()
    from app.models import OutboxEvent
    db.add(OutboxEvent(event="build_export", payload={"export_id": exp.id}))
    db.commit()
    return exp


def run_export(db: Session, export_id: int) -> None:
    """Runs in the background worker (large accounts don't block the request)."""
    exp = db.get(DataExport, export_id)
    if not exp or exp.status != "processing":
        return
    u = db.get(User, exp.user_id)
    data = json.dumps(build_export(db, u), ensure_ascii=False, indent=2, default=str).encode()
    exp.storage_key = storage.put(f"exports/{u.id}", data, "json")
    exp.status, exp.ready_at, exp.expires_at = "ready", now(), now() + timedelta(days=7)
    notify(db, "export_ready", u.id, "Your data is ready", "Download your data from Settings within 7 days.", "/customer/settings/data-export")


def download_token(export_id: int, expires: int) -> str:
    from app.core.security import secret_hash
    return secret_hash(f"export:{export_id}:{expires}")


def export_json(e: DataExport | None) -> dict:
    """The download URL is signed and valid for 10 minutes, so it can be opened in a browser without a bearer token."""
    if e is None:
        return {"id": "", "status": "none"}
    status = "expired" if e.expires_at and e.expires_at < now() else e.status
    from app.core.config import settings
    url = None
    if status == "ready":
        exp = int((now() + timedelta(minutes=10)).timestamp())
        url = f"{settings.API_V1_STR}/privacy/exports/{e.id}/download?expires={exp}&sig={download_token(e.id, exp)}"
    return {"id": str(e.id), "status": status, "requestedAt": iso(e.requested_at), "readyAt": iso(e.ready_at), "downloadUrl": url}


# Contact fields a payment gateway echoes back in webhook payloads (e.g. Razorpay's payment entity).
_GATEWAY_PII_KEYS = {"contact", "email", "phone", "name", "customer_details", "billing_address", "shipping_address",
                     "address", "vpa", "customer"}


def _scrub(obj):
    if isinstance(obj, dict):
        return {k: ("[deleted]" if k in _GATEWAY_PII_KEYS else _scrub(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    return obj


def _discard_export(e: DataExport) -> None:
    if e.storage_key:
        storage.delete(e.storage_key)
    e.storage_key, e.status = None, "expired"


def purge_expired_exports(db: Session) -> int:
    """Retention: export files live 7 days; afterwards the file is deleted and only the request row stays."""
    rows = db.scalars(select(DataExport).where(DataExport.storage_key.is_not(None), DataExport.expires_at < now())).all()
    for e in rows:
        _discard_export(e)
    db.commit()
    return len(rows)


def delete_account(db: Session, u: User, reason: str | None) -> None:
    """H2: personal fields erased; financial rows kept, now linked only to an anonymous user id."""
    if db.scalar(select(Subscription.id).where(Subscription.customer_id == u.id, Subscription.status == "active")):
        raise AppError("ACTIVE_SUBSCRIPTION", "Cancel your active subscription before deleting your account.", 409)
    t = now()
    for v in db.scalars(select(Visit).where(Visit.customer_id == u.id, Visit.status.in_(("pending_assignment", "needs_manual_assignment", "scheduled")))):
        v.status, v.cancelled_at = "cancelled", t
    for r in db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == u.id, ServiceRequest.stage.not_in(("closed", "payment_done")))):
        r.stage, r.closed_at, r.closed_reason = "closed", t, "Account deleted"
    for a in db.scalars(select(Address).where(Address.user_id == u.id)):
        a.label, a.line1_enc, a.line2_enc, a.landmark_enc = "Deleted", encrypt("Deleted"), None, None
        a.city, a.pincode, a.deleted_at, a.is_default = "Deleted", "000000", t, False
        # keep a valid in-India point so the row satisfies its constraint, but no longer the real pin
        a.lat, a.lng = 20.0, 78.0
    prof = db.get(CustomerProfile, u.id)
    if prof:
        prof.allergies, prof.allergy_notes, prof.cuisines, prof.household_size, prof.diet = [], None, [], None, None
    for r in db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == u.id)):
        r.allergy_notes, r.dietary_notes, r.instructions = None, None, None
    db.execute(update(Notification).where(Notification.user_id == u.id).values(title="—", body="—", href=None))
    # Payment rows stay (financial record) but the gateway's copy of the contact details does not.
    pay_ids = select(Payment.id).where(Payment.customer_id == u.id)
    for ev in db.scalars(select(PaymentEvent).where(PaymentEvent.payment_id.in_(pay_ids))):
        ev.payload = _scrub(ev.payload)
    for e in db.scalars(select(DataExport).where(DataExport.user_id == u.id)):
        _discard_export(e)
    u.full_name, u.email, u.phone_enc, u.phone_hmac = None, None, None, None
    u.status, u.deleted_at = "deleted", t
    auth_svc.revoke_all(db, u.id)
    audit(db, Actor(u.id, "customer"), "Deleted account", f"User {u.id}", reason=reason)
    db.commit()


def reveal_document(db: Session, actor: Actor, chef_id: int, doc_id: int, reason: str | None) -> dict:
    """H5: Super Admin only (enforced at the route); every reveal is audited."""
    d = db.scalar(select(ChefDocument).where(ChefDocument.id == doc_id, ChefDocument.chef_id == chef_id))
    if not d:
        raise not_found("Document")
    audit(db, actor, "Revealed document", f"Chef {chef_id} · {d.type}", reason=reason)
    db.commit()
    return {"value": decrypt(d.value_enc) if d.value_enc else None, "hasFile": bool(d.storage_key),
            "fileUrl": f"/api/v1/admin/chefs/{chef_id}/documents/{d.id}/file" if d.storage_key else None}


def reveal_bank(db: Session, actor: Actor, chef_id: int, reason: str | None) -> dict:
    b = db.get(ChefBankAccount, chef_id)
    if not b:
        raise not_found("Bank account")
    audit(db, actor, "Revealed bank account", f"Chef {chef_id}", reason=reason)
    db.commit()
    return {"accountNumber": decrypt(b.account_number_enc), "upi": decrypt(b.upi_enc)}


def reveal_phone(db: Session, actor: Actor, user_id: int, reason: str | None) -> dict:
    u = db.get(User, user_id)
    if not u or u.status == "deleted":
        raise not_found("User")
    audit(db, actor, "Revealed phone", f"User {user_id}", reason=reason)
    db.commit()
    return {"phone": phone_of(u)}
