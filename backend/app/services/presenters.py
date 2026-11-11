"""Serialisers producing the camelCase shapes in mobile/src/types. Visibility rules (H4) are applied here:
callers pass the viewer's role and these functions decide what may be shown."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decrypt, mask_phone
from app.domain import IST, parse_hhmm
from app.models import (Address, Assignment, AttendanceRecord, Chef, ChefBankAccount, ChefDocument, Payment,
                        PaymentLink, ServiceRequest, Subscription, SubscriptionDay, Trial, User, Visit)
from app.services.settings import Settings

STAGE_TO_STATUS = {
    "request": "pending_assignment", "trial1_scheduled": "trial_scheduled", "trial1_awaiting_decision": "awaiting_decision",
    "trial2_requested": "pending_assignment", "trial2_scheduled": "trial_scheduled",
    "trial2_awaiting_decision": "awaiting_decision", "subscription_requested": "awaiting_payment",
    "payment_done": "converted",
}
SERVICE_TITLES = {"monthly_subscription": "Monthly Subscription", "custom_time": "Custom Time"}


def iso(v: datetime | date | None) -> str | None:
    return v.isoformat() if v else None


def rupees(paise: int | None) -> float | None:
    return None if paise is None else paise / 100


def phone_of(u: User | None) -> str:
    return decrypt(u.phone_enc) if u and u.phone_enc else ""


def user_json(u: User) -> dict:
    return {"id": str(u.id), "fullName": u.full_name or "", "phone": phone_of(u), "email": u.email, "role": u.role,
            "createdAt": iso(u.created_at)}


def address_json(a: Address | None) -> dict | None:
    if a is None:
        return None
    return {"id": str(a.id), "label": a.label, "line1": decrypt(a.line1_enc), "line2": decrypt(a.line2_enc),
            "landmark": decrypt(a.landmark_enc), "city": a.city, "pincode": a.pincode, "lat": a.lat, "lng": a.lng,
            "isDefault": a.is_default}


def area_only(a: Address | None) -> dict | None:
    """What a chef / admin list sees before the reveal window: no street, no house number."""
    if a is None:
        return None
    return {"id": str(a.id), "label": a.label, "line1": f"{a.city} {a.pincode}", "city": a.city, "pincode": a.pincode,
            "lat": round(a.lat, 2), "lng": round(a.lng, 2), "isDefault": a.is_default, "masked": True}


def slot_label(slot: str, s: Settings) -> str:
    mins = s.int("visit_minutes")

    def win(key: str) -> str:
        st = parse_hhmm(s.raw(key))
        end = (datetime.combine(date.today(), st) + timedelta(minutes=mins)).time()
        return f"{st.strftime('%H:%M')}-{end.strftime('%H:%M')}"
    return {"morning": win("slot_morning"), "evening": win("slot_evening"),
            "both": f"{win('slot_morning')} & {win('slot_evening')}"}.get(slot, slot)


def visit_slot(v: Visit) -> str:
    a, b = v.starts_at.astimezone(IST), v.ends_at.astimezone(IST)
    return f"{a:%H:%M}-{b:%H:%M}"


def chef_name(db: Session, chef_id: int | None) -> str | None:
    if not chef_id:
        return None
    return db.scalar(select(User.full_name).join(Chef, Chef.user_id == User.id).where(Chef.id == chef_id))


def requirements_json(r: ServiceRequest, s: Settings) -> dict:
    return {"members": r.members, "meals": r.meals, "slot": r.slot, "slotLabel": slot_label(r.slot, s),
            "startDate": iso(r.start_date), "endDate": iso(r.end_date),
            "durationDays": ((r.end_date - r.start_date).days + 1) if r.end_date else None, "weekdays": r.weekdays,
            "cuisines": r.cuisines, "diet": r.diet, "dietaryNotes": r.dietary_notes, "allergies": r.allergies,
            "allergyNotes": r.allergy_notes, "hasAllergies": bool(r.allergies or r.allergy_notes),
            "instructions": r.instructions, "addressId": str(r.address_id)}


class Prefetch:
    """Batch-loads everything request_json needs for a page of requests (avoids N+1: 300+ queries → 7)."""

    def __init__(self, db: Session, rows: list[ServiceRequest]):
        from app.models import ChefOffDay
        ids = [r.id for r in rows]
        self.users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({r.customer_id for r in rows})))}
        self.addresses = {a.id: a for a in db.scalars(select(Address).where(Address.id.in_({r.address_id for r in rows})))}
        self.trials: dict[int, list[Trial]] = {}
        for t in db.scalars(select(Trial).where(Trial.request_id.in_(ids)).order_by(Trial.number, Trial.id)):
            self.trials.setdefault(t.request_id, []).append(t)
        trial_ids = [t.id for ts in self.trials.values() for t in ts]
        self.visit_by_trial = {v.trial_id: v for v in db.scalars(select(Visit).where(Visit.trial_id.in_(trial_ids)))} if trial_ids else {}
        self.subs = dict(db.execute(select(Subscription.request_id, Subscription.id).where(Subscription.request_id.in_(ids))).all())
        chef_ids = {r.chef_id for r in rows if r.chef_id} | {v.chef_id for v in self.visit_by_trial.values() if v.chef_id}
        self.chef_names = dict(db.execute(select(Chef.id, User.full_name).join(User, User.id == Chef.user_id)
                                          .where(Chef.id.in_(chef_ids))).all()) if chef_ids else {}
        self.conflicts = set(db.scalars(select(Visit.request_id).join(
            ChefOffDay, (Visit.chef_id == ChefOffDay.chef_id) & (Visit.service_date == ChefOffDay.day)).where(
            Visit.request_id.in_(ids), Visit.status.in_(("scheduled", "pending_assignment"))))) if ids else set()


def trial_json(db: Session, t: Trial, s: Settings, max_trials: int, pf: "Prefetch | None" = None) -> dict:
    v = pf.visit_by_trial.get(t.id) if pf else db.scalar(select(Visit).where(Visit.trial_id == t.id))
    cname = (pf.chef_names.get(v.chef_id) if pf else chef_name(db, v.chef_id)) if v and v.chef_id else None
    allowed: list[str] = []
    if t.status == "completed" and t.decision is None:
        allowed = ["subscribe", "another_trial"] if t.number < max_trials else ["subscribe", "reject"]
    status = {"requested": "pending_assignment"}.get(t.status, t.status)
    return {"id": str(t.id), "requestId": str(t.request_id), "service": t.service, "number": t.number, "status": status,
            "date": iso(v.starts_at) if v else None, "slot": visit_slot(v) if v else None,
            "chefId": str(v.chef_id) if v and v.chef_id else None, "chefName": cname,
            "visitId": str(v.id) if v else None, "decision": t.decision, "decidedAt": iso(t.decided_at),
            "allowedDecisions": allowed, "counted": t.counted, "pushed": t.pushed_by is not None}


def request_status(r: ServiceRequest) -> str:
    return STAGE_TO_STATUS.get(r.stage) or ("rejected" if (r.closed_reason or "").startswith("Customer rejected") else "cancelled")


def request_json(db: Session, r: ServiceRequest, s: Settings, viewer_role: str, *, max_trials: int = 2,
                 pf: Prefetch | None = None) -> dict:
    if pf:
        cust, addr, trials, sub_id = pf.users.get(r.customer_id), pf.addresses.get(r.address_id), pf.trials.get(r.id, []), pf.subs.get(r.id)
    else:
        cust = db.get(User, r.customer_id)
        addr = db.get(Address, r.address_id)
        trials = db.scalars(select(Trial).where(Trial.request_id == r.id).order_by(Trial.number, Trial.id)).all()
        sub_id = db.scalar(select(Subscription.id).where(Subscription.request_id == r.id))
    status = request_status(r)
    is_admin = viewer_role in ("ops_admin", "super_admin")
    conflict = False
    if pf:
        conflict = is_admin and r.id in pf.conflicts
    elif is_admin and r.chef_id:
        from app.models import ChefOffDay
        conflict = db.scalar(select(ChefOffDay.day).join(Visit, (Visit.chef_id == ChefOffDay.chef_id) & (Visit.service_date == ChefOffDay.day))
                             .where(Visit.request_id == r.id, Visit.status.in_(("scheduled", "pending_assignment")))
                             .limit(1)) is not None
    return {
        "id": str(r.id), "customerId": str(r.customer_id), "customerName": (cust.full_name if cust else None) or "Customer",
        "customerPhone": mask_phone(phone_of(cust)) if is_admin else phone_of(cust),
        "service": r.service, "status": status, "stage": r.stage, "isOpen": r.stage not in ("closed", "payment_done"),
        "requirements": requirements_json(r, s), "address": address_json(addr) if viewer_role == "customer" else area_only(addr),
        "trials": [trial_json(db, t, s, max_trials, pf) for t in trials],
        "assignedChefId": str(r.chef_id) if r.chef_id else None,
        "assignedChefName": (pf.chef_names.get(r.chef_id) if pf else chef_name(db, r.chef_id)) if r.chef_id else None,
        "subscriptionId": str(sub_id) if sub_id else None, "createdAt": iso(r.created_at), "closedReason": r.closed_reason,
        "conflict": conflict,
        "timeline": {"requestedAt": iso(r.created_at), "assignedAt": iso(r.assigned_at), "trialDoneAt": iso(r.trial_done_at),
                     "subscriptionRequestedAt": iso(r.subscription_requested_at), "paidAt": iso(r.paid_at), "closedAt": iso(r.closed_at)},
    }


def subscription_json(db: Session, sub: Subscription, s: Settings) -> dict:
    days = db.scalars(select(SubscriptionDay).where(SubscriptionDay.subscription_id == sub.id)).all()
    pay = db.scalar(select(Payment).where(Payment.subscription_id == sub.id))
    from app.services import subscriptions as subs
    sched = subs.schedule_for(db, sub)
    return {"id": str(sub.id), "requestId": str(sub.request_id), "service": sub.service, "status": sub.status,
            "chefName": chef_name(db, sub.chef_id), "startDate": iso(sub.start_date), "endDate": iso(sched.end_date),
            "plannedEndDate": iso(sub.end_date), "slot": slot_label(sub.slot, s), "slotCode": sub.slot, "meals": sub.meals,
            "members": sub.members, "amount": rupees(sub.amount_paise), "amountPaise": sub.amount_paise,
            "perVisitPaise": sub.per_visit_paise, "plannedVisits": sub.planned_visits, "weekdays": sub.weekdays,
            "offDays": sorted(iso(d.day) for d in days if d.kind == "off"),
            "missedDays": sorted(iso(d.day) for d in days if d.kind == "missed"),
            "freeOffDaysLeft": sched.free_off_days_left, "paymentId": str(pay.id) if pay else None,
            "activatedAt": iso(sub.activated_at)}


def visit_status(v: Visit) -> str:
    return {"checked_in": "cooking", "needs_manual_assignment": "pending_assignment"}.get(v.status, v.status)


def visit_json(db: Session, v: Visit, viewer_role: str, *, now: datetime | None = None) -> dict:
    """Customer: own visit incl. check-in code. Chef: full address/phone only from 2h before start to 2h after end (H4).
    Admin: masked phone."""
    now = now or datetime.now(timezone.utc)
    r = db.get(ServiceRequest, v.request_id)
    cust = db.get(User, v.customer_id)
    addr = db.get(Address, v.address_id)
    phone = phone_of(cust)
    in_window = v.starts_at - timedelta(hours=2) <= now <= v.ends_at + timedelta(hours=2)
    if viewer_role == "customer":
        address, phone_out = address_json(addr), phone
    elif viewer_role == "chef":
        address = address_json(addr) if in_window else area_only(addr)
        phone_out = phone if in_window else ""
    else:
        address, phone_out = address_json(addr), mask_phone(phone)
    att = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
    code = decrypt(v.check_in_code_enc) if viewer_role == "customer" and v.check_in_code_enc and not v.code_used_at else None
    trial_max = 4
    return {
        "id": str(v.id), "kind": v.kind, "refId": str(v.trial_id or v.subscription_id or v.request_id), "requestId": str(v.request_id),
        "service": r.service, "date": iso(v.starts_at), "startsAt": iso(v.starts_at), "endsAt": iso(v.ends_at),
        "serviceDate": iso(v.service_date), "slot": visit_slot(v), "status": visit_status(v),
        "chefId": str(v.chef_id) if v.chef_id else None, "chefName": chef_name(db, v.chef_id) or "To be assigned",
        "customerName": (cust.full_name if cust else None) or "Customer", "customerPhone": phone_out, "address": address,
        "addressRevealed": viewer_role != "chef" or in_window,
        "checkInCode": code, "members": min(r.members, trial_max) if v.kind == "trial" else r.members, "meals": r.meals,
        "diet": r.diet, "cuisines": r.cuisines, "allergies": r.allergies, "allergyNotes": r.allergy_notes,
        "hasAllergies": bool(r.allergies or r.allergy_notes), "instructions": r.instructions, "dietaryNotes": r.dietary_notes,
        "checkInAt": iso(att.check_in_at) if att else None, "checkOutAt": iso(att.check_out_at) if att else None,
        "workedMinutes": att.worked_minutes if att else None, "codeLocked": v.code_attempts >= 5 and not v.code_used_at,
        "price": rupees(v.price_paise) if viewer_role != "chef" else None,
    }


def assignment_json(db: Session, a: Assignment, chef_lat: float | None, chef_lng: float | None, s: Settings) -> dict:
    from app.domain.geo import haversine_km
    v = db.get(Visit, a.visit_id)
    r = db.get(ServiceRequest, a.request_id)
    cust = db.get(User, v.customer_id)
    addr = db.get(Address, v.address_id)
    dist = haversine_km(v.lat, v.lng, chef_lat, chef_lng) if chef_lat is not None else 0
    return {"id": str(a.id), "requestId": str(a.request_id), "visitId": str(v.id), "kind": v.kind, "service": r.service,
            "customerName": (cust.full_name if cust else None) or "Customer", "area": f"{addr.city} {addr.pincode}" if addr else "",
            "date": iso(v.starts_at), "slot": visit_slot(v), "status": a.status, "distanceKm": round(dist, 1),
            "members": min(r.members, 4) if v.kind == "trial" else r.members, "meals": r.meals, "diet": r.diet,
            "allergies": r.allergies, "allergyNotes": r.allergy_notes, "hasAllergies": bool(r.allergies or r.allergy_notes),
            "cuisines": r.cuisines, "instructions": r.instructions, "action": a.action,
            "respondBy": iso(a.created_at + timedelta(minutes=s.int("chef_response_min"))) if a.status == "offered" else None}


def chef_json(db: Session, c: Chef, viewer_role: str) -> dict:
    """Super Admin: masked documents & bank (reveal is a separate audited call). Ops Admin: no identity/bank documents.
    The chef: their own data, masked."""
    u = db.get(User, c.user_id)
    from app.models import AttendanceRecord as AR
    from sqlalchemy import func
    completed = db.scalar(select(func.count()).select_from(AR).where(AR.chef_id == c.id, AR.check_out_at.is_not(None))) or 0
    out = {"id": str(c.id), "name": u.full_name or "", "phone": mask_phone(phone_of(u)) if viewer_role != "chef" else phone_of(u),
           "email": u.email if viewer_role in ("chef", "super_admin") else None, "city": c.city or "", "area": c.area or "",
           "experienceYears": c.experience_years, "cuisines": sorted(s.cuisine for s in c.skills), "specialities": c.specialities,
           "rating": float(c.rating), "completedVisits": completed, "status": c.status, "active": c.active,
           "rejectionReason": c.rejection_reason, "joinedAt": iso(c.created_at), "submittedAt": iso(c.submitted_at),
           "homeLat": c.home_lat if viewer_role in ("chef", "super_admin") else None,
           "homeLng": c.home_lng if viewer_role in ("chef", "super_admin") else None, "documents": [], "bank": None}
    if viewer_role in ("chef", "super_admin"):
        out["documents"] = [{"id": str(d.id), "type": d.type, "status": d.status,
                             "maskedValue": ("•••• " + d.last4) if d.last4 else ("Photo on file" if d.storage_key else ""),
                             "fileName": d.file_name or "", "uploadedAt": iso(d.uploaded_at), "hasFile": bool(d.storage_key)}
                            for d in db.scalars(select(ChefDocument).where(ChefDocument.chef_id == c.id).order_by(ChefDocument.id))]
        b = db.get(ChefBankAccount, c.id)
        if b:
            out["bank"] = {"accountName": b.account_name, "accountNumberMasked": "•••• " + b.account_last4, "ifsc": b.ifsc,
                           "upi": "on file" if b.upi_enc else None}
    return out


def payment_json(db: Session, p: Payment, viewer_role: str) -> dict:
    sub = db.get(Subscription, p.subscription_id)
    cust = db.get(User, p.customer_id)
    link = db.scalar(select(PaymentLink).where(PaymentLink.payment_id == p.id).order_by(PaymentLink.id.desc()).limit(1))
    now = datetime.now(timezone.utc)
    link_status = link.status if link else None
    if link and link.status == "active" and link.expires_at <= now:
        link_status = "expired"
    if p.status == "PAID":
        status = "paid"
    elif p.status in ("REFUNDED", "PARTIALLY_REFUNDED"):
        status = p.status.lower()
    elif p.status == "FAILED" and link_status == "active":
        status = "failed"
    elif link_status in ("expired", "replaced", "cancelled") or link is None:
        status = "expired"
    else:
        status = "pending" if p.attempts else "link_created"
    return {"id": str(p.id), "subscriptionId": str(p.subscription_id), "customerId": str(p.customer_id),
            "customerName": (cust.full_name if cust else None) or "Customer", "service": sub.service,
            "amount": rupees(p.amount_paise), "amountPaise": p.amount_paise, "status": status, "gatewayStatus": p.status,
            "linkUrl": link.url if link and link_status == "active" else "", "linkStatus": link_status,
            "linkExpiresAt": iso(link.expires_at) if link else None, "createdAt": iso(p.created_at), "paidAt": iso(p.paid_at),
            "method": p.method, "reference": p.gateway_payment_id, "attempts": p.attempts,
            "refundedAmount": rupees(p.refunded_paise), "failureReason": p.failure_reason, "gateway": p.gateway}
