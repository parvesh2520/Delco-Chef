"""Ops Admin + Super Admin. Role checks are server-side dependencies on every route."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Principal, admin_only, super_admin_only
from app.api.schemas import (ActiveIn, AdjustIn, AdminIn, AssignIn, ChefDecisionIn, MoveIn, PayoutDecisionIn, PushTrialIn,
                             ReasonIn, ResolveIn, SettingsIn)
from app.core.database import get_db
from app.core.errors import AppError, not_found
from app.core.security import encrypt, lookup_hash, mask_phone
from app.domain import IST, ist_today
from app.models import (Assignment, AttendanceRecord, AuditLog, BoardMove, Chef, ChefDocument, Payment, PaymentLink, Payout,
                        ServiceRequest, Subscription, User, Visit)
from app.services import attendance, bookings, payouts, privacy
from app.services import settings as settings_svc
from app.services.auth import normalize_phone
from app.services.events import audit, notify
from app.services.presenters import (address_json, chef_json, chef_name, iso, payment_json, phone_of, request_json,
                                     subscription_json, visit_slot)
from app.services.storage import storage

router = APIRouter(prefix="/admin", tags=["Admin"])


def _s(db: Session):
    return settings_svc.load(db)


@router.get("/dashboard", summary="Live counts from the database")
def dashboard(p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    today = ist_today()
    count = lambda q: db.scalar(select(func.count()).select_from(q.subquery())) or 0  # noqa: E731
    return {
        "pendingRequests": count(select(ServiceRequest.id).where(ServiceRequest.stage.in_(("request", "trial2_requested")))),
        "trialsToday": count(select(Visit.id).where(Visit.kind == "trial", Visit.service_date == today, Visit.status != "cancelled")),
        "activeSubscriptions": count(select(Subscription.id).where(Subscription.status == "active")),
        "pendingPayments": count(select(Payment.id).where(Payment.status.in_(("CREATED", "FAILED")))),
        "attendanceExceptions": count(select(AttendanceRecord.id).where(AttendanceRecord.status.in_(("exception", "needs_review")))),
        "pendingChefApplications": count(select(Chef.id).where(Chef.status.in_(("submitted", "under_review")))),
        "needsManualAssignment": count(select(Visit.id).where(Visit.status.in_(("needs_manual_assignment",)))),
    }


STATUS_STAGES = {"pending_assignment": ("request", "trial2_requested"), "trial_scheduled": ("trial1_scheduled", "trial2_scheduled"),
                 "awaiting_decision": ("trial1_awaiting_decision", "trial2_awaiting_decision"),
                 "awaiting_payment": ("subscription_requested",), "converted": ("payment_done",), "closed": ("closed",)}


@router.get("/requests", summary="Request queue with filters, keyset pagination")
def requests(status: str | None = None, service: str | None = None, limit: int = Query(50, ge=1, le=100), cursor: str | None = None,
             p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(ServiceRequest)
    if status in STATUS_STAGES:
        q = q.where(ServiceRequest.stage.in_(STATUS_STAGES[status]))
    elif status:
        q = q.where(ServiceRequest.stage == status)
    if service:
        q = q.where(ServiceRequest.service == service)
    if cursor:
        ts, rid = cursor.split("_")
        q = q.where((ServiceRequest.created_at, ServiceRequest.id) < (datetime.fromisoformat(ts), int(rid)))
    rows = db.scalars(q.order_by(ServiceRequest.created_at.desc(), ServiceRequest.id.desc()).limit(limit + 1)).all()
    s = _s(db)
    nxt = f"{rows[limit - 1].created_at.isoformat()}_{rows[limit - 1].id}" if len(rows) > limit else None
    from app.services.presenters import Prefetch
    pf = Prefetch(db, rows[:limit])
    return {"items": [request_json(db, r, s, p.user.role, max_trials=s.int("max_free_trials"), pf=pf) for r in rows[:limit]], "nextCursor": nxt}


def _req(db: Session, rid: int) -> ServiceRequest:
    r = db.get(ServiceRequest, rid)
    if not r:
        raise not_found("Request")
    return r


@router.get("/requests/{request_id}")
def get_request(request_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    s = _s(db)
    r = _req(db, request_id)
    out = request_json(db, r, s, p.user.role, max_trials=s.int("max_free_trials"))
    v = bookings.target_visit(db, r)
    out["targetVisit"] = {"id": str(v.id), "date": iso(v.starts_at), "slot": visit_slot(v), "kind": v.kind, "status": v.status,
                          "chefId": str(v.chef_id) if v.chef_id else None} if v else None
    return out


@router.get("/requests/{request_id}/suggestions", summary="Ranked eligible chefs (score + parts) and excluded chefs with reasons")
def suggestions(request_id: int, visitId: int | None = None, date: str | None = None, p: Principal = Depends(admin_only),
                db: Session = Depends(get_db)):
    r = _req(db, request_id)
    if date and not visitId:  # ranking for a proposed date, e.g. before pushing trial 2
        from datetime import date as _date
        v = bookings.proposed_visit(db, r, _date.fromisoformat(date[:10]))
        return [bookings.suggestion_json(x) for x in bookings.trim(bookings.suggest(db, v))]
    v = db.get(Visit, visitId) if visitId else bookings.target_visit(db, r)
    if not v or v.request_id != r.id:
        return []
    return [bookings.suggestion_json(x) for x in bookings.trim(bookings.suggest(db, v))]


@router.post("/requests/{request_id}/assign", summary="Confirm (or change) the chef. Reassignment needs a reason.")
def assign(request_id: int, body: AssignIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    r = _req(db, request_id)
    v = db.get(Visit, int(body.visitId)) if body.visitId else bookings.target_visit(db, r)
    if not v or v.request_id != r.id:
        raise AppError("NOTHING_TO_ASSIGN", "This request has no visit waiting for a chef.", 409)
    bookings.assign(db, p.actor, v.id, int(body.chefId), body.reason)
    s = _s(db)
    return request_json(db, db.get(ServiceRequest, r.id), s, p.user.role, max_trials=s.int("max_free_trials"))


@router.get("/requests/{request_id}/assignments", summary="Assignment history incl. ranked list at the time")
def history(request_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Assignment).where(Assignment.request_id == request_id).order_by(Assignment.created_at.desc())).all()
    out = []
    for a in rows:
        by = db.scalar(select(User.full_name).where(User.id == a.assigned_by)) if a.assigned_by else "System"
        out.append({"id": str(a.id), "requestId": str(a.request_id), "visitId": str(a.visit_id), "chefName": chef_name(db, a.chef_id),
                    "previousChefName": chef_name(db, a.previous_chef_id), "action": a.action, "status": a.status, "reason": a.reason,
                    "score": float(a.score) if a.score is not None else None, "scoreParts": a.score_parts,
                    "runnerUp": chef_name(db, a.runner_up_chef_id), "by": by or "Admin", "at": iso(a.created_at)})
    return out


@router.post("/requests/{request_id}/push-trial", summary="Push trial 2 while trial 1 awaits the decision")
def push_trial(request_id: int, body: PushTrialIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    r = bookings.push_second_trial(db, p.actor, request_id, int(body.chefId), date.fromisoformat(body.date[:10]))
    s = _s(db)
    return request_json(db, r, s, p.user.role, max_trials=s.int("max_free_trials"))


@router.post("/requests/{request_id}/move", summary="Board move (validated against the allowed transitions)")
def move(request_id: int, body: MoveIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    r = bookings.admin_move(db, p.actor, request_id, body.to, body.note)
    s = _s(db)
    return request_json(db, r, s, p.user.role, max_trials=s.int("max_free_trials"))


@router.get("/board", summary="Trial board: one card per customer per service")
def board(p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    s = _s(db)
    rows = db.scalars(select(ServiceRequest).where(ServiceRequest.stage != "closed").order_by(ServiceRequest.created_at.desc()).limit(200)).all()
    from app.services.presenters import Prefetch
    pf = Prefetch(db, rows)
    return [request_json(db, r, s, p.user.role, max_trials=s.int("max_free_trials"), pf=pf) for r in rows]


@router.get("/requests/{request_id}/moves")
def moves(request_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(BoardMove).where(BoardMove.request_id == request_id).order_by(BoardMove.at)).all()
    return [{"from": m.from_stage, "to": m.to_stage, "by": (db.scalar(select(User.full_name).where(User.id == m.actor_id)) if m.actor_id else m.actor_kind),
             "actorKind": m.actor_kind, "note": m.note, "at": iso(m.at)} for m in rows]


@router.get("/stage-summary", summary="C9 funnel: customers per stage, conversion, avg time to assignment")
def stage_summary(p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    c = lambda col: db.scalar(select(func.count()).where(col.is_not(None)).select_from(ServiceRequest)) or 0  # noqa: E731
    total = db.scalar(select(func.count()).select_from(ServiceRequest)) or 0
    stages = {"requested": total, "assigned": c(ServiceRequest.assigned_at), "trialDone": c(ServiceRequest.trial_done_at),
              "subscriptionRequested": c(ServiceRequest.subscription_requested_at), "paid": c(ServiceRequest.paid_at)}
    keys = list(stages)
    conv = {f"{a}->{b}": round(stages[b] * 100 / stages[a], 1) if stages[a] else 0 for a, b in zip(keys, keys[1:])}
    avg = db.scalar(select(func.avg(func.extract("epoch", ServiceRequest.assigned_at - ServiceRequest.created_at)))
                    .where(ServiceRequest.assigned_at.is_not(None)))
    by_status = dict(db.execute(select(ServiceRequest.stage, func.count()).group_by(ServiceRequest.stage)).all())
    return {"stages": stages, "conversionPercent": conv, "avgMinutesToAssignment": round(float(avg) / 60, 1) if avg else None,
            "byStage": by_status}


@router.get("/customers/{customer_id}")
def customer(customer_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    u = db.get(User, customer_id)
    if not u or u.role != "customer":
        raise not_found("Customer")
    s = _s(db)
    reqs = db.scalars(select(ServiceRequest).where(ServiceRequest.customer_id == u.id).order_by(ServiceRequest.created_at.desc())).all()
    from app.models import Address
    addr = db.scalar(select(Address).where(Address.user_id == u.id, Address.deleted_at.is_(None)).order_by(Address.is_default.desc()))
    return {"id": str(u.id), "name": u.full_name or "Customer", "phone": mask_phone(phone_of(u)), "address": address_json(addr),
            "requests": [request_json(db, r, s, p.user.role) for r in reqs],
            "subscriptions": [subscription_json(db, x, s) for x in db.scalars(select(Subscription).where(Subscription.customer_id == u.id))]}


@router.post("/users/{user_id}/reveal-phone", summary="Reveal a full phone number (audited)")
def reveal_phone(user_id: int, body: ReasonIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    return privacy.reveal_phone(db, p.actor, user_id, body.reason)


@router.get("/chefs/{chef_id}", summary="Chef profile. Ops Admin never sees identity or bank documents.")
def chef(chef_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(Chef, chef_id)
    if not c:
        raise not_found("Chef")
    return chef_json(db, c, p.user.role)


# ---------------- Attendance ----------------
def _att_json(db: Session, a: AttendanceRecord) -> dict:
    v = db.get(Visit, a.visit_id)
    cust = db.scalar(select(User.full_name).where(User.id == v.customer_id))
    status = {"needs_review": "exception", "open": "ok"}.get(a.status, a.status)
    return {"id": str(a.id), "visitId": str(v.id), "chefName": chef_name(db, a.chef_id), "customerName": cust or "Customer",
            "date": iso(v.starts_at), "slot": visit_slot(v), "checkInAt": iso(a.check_in_at), "checkOutAt": iso(a.check_out_at),
            "checkInDistanceM": a.check_in_distance_m, "checkOutDistanceM": a.check_out_distance_m,
            "codeVerified": v.code_used_at is not None, "selfieCaptured": a.check_in_selfie_id is not None,
            "foodPhotoCaptured": a.food_photo_id is not None, "status": status, "rawStatus": a.status, "exception": a.exception,
            "resolution": a.resolution, "workedMinutes": a.worked_minutes, "codeAttempts": v.code_attempts,
            "photos": {k: (f"/api/v1/media/photos/{pid}" if pid else None) for k, pid in
                       (("checkInSelfie", a.check_in_selfie_id), ("checkOutSelfie", a.check_out_selfie_id), ("food", a.food_photo_id))}}


@router.get("/attendance")
def attendance_list(status: str | None = None, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(AttendanceRecord).order_by(AttendanceRecord.created_at.desc()).limit(200)
    if status == "exception":
        q = q.where(AttendanceRecord.status.in_(("exception", "needs_review")))
    elif status:
        q = q.where(AttendanceRecord.status == status)
    return [_att_json(db, a) for a in db.scalars(q)]


@router.get("/attendance/{record_id}")
def attendance_get(record_id: int, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    a = db.get(AttendanceRecord, record_id)
    if not a:
        raise not_found("Attendance record")
    return _att_json(db, a)


@router.post("/attendance/{record_id}/resolve", summary="Correct & approve (who/what/why recorded)")
def attendance_resolve(record_id: int, body: ResolveIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    return _att_json(db, attendance.resolve(db, p.actor, record_id, body.resolution, body.workedMinutes))


# ---------------- Payments (admin view) ----------------
@router.get("/payment-links", summary="Every link with status Active / Paid / Expired / Replaced")
def links(p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rows = db.execute(select(PaymentLink, Payment).join(Payment, Payment.id == PaymentLink.payment_id)
                      .order_by(PaymentLink.created_at.desc()).limit(200)).all()
    return [{"id": str(link.id), "paymentId": str(pay.id), "url": link.url if link.status == "active" else None,
             "amount": link.amount_paise / 100, "status": "expired" if link.status == "active" and link.expires_at <= now else link.status,
             "expiresAt": iso(link.expires_at), "createdAt": iso(link.created_at),
             "customerName": db.scalar(select(User.full_name).where(User.id == pay.customer_id)) or "Customer"} for link, pay in rows]


# ---------------- Settings ----------------
@router.get("/settings")
def get_settings(p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    return settings_svc.sections(db)


@router.get("/settings/{section}")
def get_section(section: str, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    sec = next((x for x in settings_svc.sections(db) if x["key"] == section), None)
    if not sec:
        raise not_found("Settings section")
    return sec


@router.put("/settings/{section}", summary="Change settings live (no redeploy); audited")
def put_section(section: str, body: SettingsIn, p: Principal = Depends(admin_only), db: Session = Depends(get_db)):
    changes = settings_svc.save_section(db, section, {k: str(v) for k, v in body.values.items()}, p.user.id)
    for key, old, new in changes:
        audit(db, p.actor, "Updated setting", f"{key}: {old} → {new}")
    db.commit()
    return next(x for x in settings_svc.sections(db) if x["key"] == section)


# ---------------- Super Admin ----------------
def _admin_json(u: User) -> dict:
    return {"id": str(u.id), "name": u.full_name or "", "phone": mask_phone(phone_of(u)), "email": u.email or "", "role": u.role,
            "active": u.status == "active", "createdAt": iso(u.created_at)}


@router.get("/admins")
def admins(p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return [_admin_json(u) for u in db.scalars(select(User).where(User.role.in_(("ops_admin", "super_admin"))).order_by(User.created_at))]


@router.post("/admins", status_code=201, summary="Provision an admin. The only way an admin account can exist.")
def create_admin(body: AdminIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    phone = normalize_phone(body.phone)
    if db.scalar(select(User.id).where(User.phone_hmac == lookup_hash(phone))):
        raise AppError("PHONE_IN_USE", "This number already has an account (a number holds one role only).", 409)
    from app.services.accounts import _email, _name
    u = User(role=body.role, full_name=_name(body.name, "name"), email=_email(body.email), phone_enc=encrypt(phone),
             phone_hmac=lookup_hash(phone), created_by=p.user.id)
    db.add(u)
    db.flush()
    audit(db, p.actor, "Created admin", f"{u.full_name} ({body.role})", meta={"user_id": u.id})
    db.commit()
    return _admin_json(u)


@router.patch("/admins/{user_id}")
def set_admin_active(user_id: int, body: ActiveIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.role not in ("ops_admin", "super_admin"):
        raise not_found("Admin")
    if u.id == p.user.id and not body.active:
        raise AppError("CANNOT_DISABLE_SELF", "You cannot deactivate your own account.", 409)
    u.status = "active" if body.active else "disabled"
    if not body.active:
        from app.services.auth import revoke_all
        revoke_all(db, u.id)
    audit(db, p.actor, "Activated admin" if body.active else "Deactivated admin", u.full_name or str(u.id))
    db.commit()
    return _admin_json(u)


@router.get("/chef-applications")
def chef_applications(p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(Chef).where(Chef.status != "draft").order_by(Chef.submitted_at.desc().nulls_last()))
    return [chef_json(db, c, "super_admin") for c in rows]


@router.post("/chef-applications/{chef_id}/decision", summary="Approve or reject (reason required, visible to the chef)")
def decide_chef(chef_id: int, body: ChefDecisionIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    c = db.get(Chef, chef_id)
    if not c:
        raise not_found("Chef")
    if c.status not in ("submitted", "under_review", "approved", "rejected"):
        raise AppError("APPLICATION_NOT_SUBMITTED", "This application hasn't been submitted.", 409)
    if not body.approve and not (body.reason or "").strip():
        raise AppError("VALIDATION_ERROR", "A rejection reason is required.", 422, fields={"reason": "required"})
    c.status, c.decided_at, c.decided_by = ("approved" if body.approve else "rejected"), datetime.now(timezone.utc), p.user.id
    c.rejection_reason = None if body.approve else body.reason.strip()
    if body.approve:
        db.query(ChefDocument).filter(ChefDocument.chef_id == c.id).update({"status": "verified"})
    notify(db, "chef_application", c.user_id, "Application approved" if body.approve else "Application not approved",
           "Welcome to Delco Chefs!" if body.approve else f"Reason: {c.rejection_reason}", "/chef/register/status")
    audit(db, p.actor, "Approved chef" if body.approve else "Rejected chef", f"Chef {c.id}", reason=body.reason)
    db.commit()
    return chef_json(db, c, "super_admin")


@router.post("/chefs/{chef_id}/documents/{doc_id}/reveal", summary="Super Admin only; every reveal is audited")
def reveal_document(chef_id: int, doc_id: int, body: ReasonIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return privacy.reveal_document(db, p.actor, chef_id, doc_id, body.reason)


@router.post("/chefs/{chef_id}/bank/reveal")
def reveal_bank(chef_id: int, body: ReasonIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return privacy.reveal_bank(db, p.actor, chef_id, body.reason)


@router.get("/chefs/{chef_id}/documents/{doc_id}/file")
def document_file(chef_id: int, doc_id: int, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    d = db.scalar(select(ChefDocument).where(ChefDocument.id == doc_id, ChefDocument.chef_id == chef_id))
    if not d or not d.storage_key:
        raise not_found("Document")
    audit(db, p.actor, "Viewed document file", f"Chef {chef_id} · {d.type}")
    db.commit()
    data = storage.get(d.storage_key)
    return Response(data, media_type="image/png" if data[:4] == b"\x89PNG" else "image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/audit-logs", summary="Append-only audit trail (read-only API)")
def audit_logs(limit: int = Query(100, ge=1, le=500), p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.at.desc()).limit(limit))
    return [{"id": str(a.id), "actor": a.actor_name or a.actor_role or "System", "actorRole": a.actor_role, "action": a.action,
             "target": a.target, "reason": a.reason, "at": iso(a.at)} for a in rows]


@router.get("/payouts")
def list_payouts(p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return [payouts.payout_json(db, x) for x in db.scalars(select(Payout).order_by(Payout.cycle_start.desc(), Payout.id).limit(200))]


@router.get("/payouts/{payout_id}")
def get_payout(payout_id: int, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    x = db.get(Payout, payout_id)
    if not x:
        raise not_found("Payout")
    return payouts.payout_json(db, x, detail=True)


@router.post("/payouts/{payout_id}/decision", summary="Approve / reject, or mark paid with a bank reference")
def decide_payout(payout_id: int, body: PayoutDecisionIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return payouts.payout_json(db, payouts.decide(db, p.actor, payout_id, body.approve, body.bankReference), detail=True)


@router.post("/payouts/{payout_id}/adjustments")
def adjust_payout(payout_id: int, body: AdjustIn, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    return payouts.payout_json(db, payouts.adjust(db, p.actor, payout_id, body.amountPaise, body.reason), detail=True)


@router.post("/payouts/run", summary="Run the payout cycle for a week (idempotent)")
def run_payouts(cycleStart: str, p: Principal = Depends(super_admin_only), db: Session = Depends(get_db)):
    start = date.fromisoformat(cycleStart)
    if start.weekday() != 0:
        raise AppError("VALIDATION_ERROR", "cycleStart must be a Monday.", 422)
    payouts.run_cycle(db, start)
    return [payouts.payout_json(db, x) for x in db.scalars(select(Payout).where(Payout.cycle_start == start))]
