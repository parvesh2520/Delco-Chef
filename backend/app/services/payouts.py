"""Part G: weekly chef payouts. One payout per chef per cycle (unique index); approved payouts are frozen."""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.domain import IST
from app.domain.payouts import PayableVisit, chef_share, cycle_start
from app.models import AttendanceRecord, Chef, Payout, PayoutItem, User, Visit
from app.services import settings as settings_svc
from app.services.events import Actor, audit


def _bounds(start: date) -> tuple[datetime, datetime]:
    a = datetime.combine(start, time(0), tzinfo=IST).astimezone(timezone.utc)
    return a, a + timedelta(days=7)


NOT_PAYABLE_STATUSES = ("cancelled", "missed")
REVIEW_STATUSES = ("needs_review", "exception")  # both wait for an Admin decision (D5) before they can be paid


def _payable(db: Session, v: Visit) -> PayableVisit:
    a = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == v.id))
    cancelled = v.status in NOT_PAYABLE_STATUSES
    # Held back only if it could become payable: an unreviewed cancelled visit or trial is simply not payable.
    review = bool(a and a.status in REVIEW_STATUSES) and not cancelled and v.kind != "trial"
    return PayableVisit(v.id, v.price_paise, int((v.ends_at - v.starts_at).total_seconds() // 60),
                        a.worked_minutes if a and a.check_out_at else None, v.kind, cancelled, review)


def run_cycle(db: Session, start: date) -> int:
    """Safe to repeat and to run on several instances: the payout row is claimed with INSERT … ON CONFLICT and locked."""
    s = settings_svc.load(db)
    share_pct = s.int("chef_share_pct")
    lo, hi = _bounds(start)
    in_cycle = db.scalars(select(Visit).where(Visit.chef_id.is_not(None), Visit.starts_at >= lo, Visit.starts_at < hi)).all()
    # Carried forward: earlier visits that were held for review, now resolved, and never paid.
    carried = db.scalars(select(Visit).join(AttendanceRecord, AttendanceRecord.visit_id == Visit.id).where(
        Visit.starts_at < lo, AttendanceRecord.status == "resolved", AttendanceRecord.check_in_at.is_not(None),
        ~select(PayoutItem.id).where(PayoutItem.visit_id == Visit.id).exists())).all()
    by_chef: dict[int, list[Visit]] = {}
    for v in in_cycle + carried:
        by_chef.setdefault(v.chef_id, []).append(v)
    for chef_id, visits in by_chef.items():
        db.execute(insert(Payout).values(chef_id=chef_id, cycle_start=start).on_conflict_do_nothing(index_elements=["chef_id", "cycle_start"]))
        p = db.scalar(select(Payout).where(Payout.chef_id == chef_id, Payout.cycle_start == start).with_for_update())
        if p.status != "pending":
            continue  # approved numbers never change
        db.query(PayoutItem).filter(PayoutItem.payout_id == p.id, PayoutItem.kind == "visit").delete()
        db.flush()
        held = count = 0
        for v in visits:
            amt = chef_share(_payable(db, v), share_pct)
            if amt is None:
                held += v.price_paise * share_pct // 100
                continue
            if amt <= 0 or db.scalar(select(PayoutItem.id).where(PayoutItem.visit_id == v.id)):
                continue
            db.add(PayoutItem(payout_id=p.id, visit_id=v.id, amount_paise=amt, kind="visit"))
            count += 1
        db.flush()
        p.visits, p.held_paise = count, held
        p.amount_paise = db.scalar(select(func.coalesce(func.sum(PayoutItem.amount_paise), 0)).where(PayoutItem.payout_id == p.id))
    db.commit()
    return len(by_chef)


def run_due(db: Session) -> int:
    """Called hourly by the worker; generates the previous cycle once it's past Monday 06:00 IST."""
    now_ist = datetime.now(IST)
    this_week = cycle_start(now_ist)
    if now_ist.weekday() == 0 and now_ist.time() < time(6):
        return 0
    return run_cycle(db, this_week - timedelta(days=7))


def adjust(db: Session, actor: Actor, payout_id: int, amount_paise: int, reason: str) -> Payout:
    p = db.scalar(select(Payout).where(Payout.id == payout_id).with_for_update())
    if not p:
        raise not_found("Payout")
    if p.status != "pending":
        raise AppError("PAYOUT_LOCKED", "Approved payouts can no longer change.", 409)
    if not (reason or "").strip():
        raise AppError("VALIDATION_ERROR", "A reason is required.", 422)
    db.add(PayoutItem(payout_id=p.id, amount_paise=amount_paise, kind="adjustment", note=reason.strip()[:200], created_by=actor.id))
    db.flush()
    p.amount_paise = db.scalar(select(func.sum(PayoutItem.amount_paise)).where(PayoutItem.payout_id == p.id))
    audit(db, actor, "Payout adjustment", f"Payout {p.id}", reason=reason, meta={"amount_paise": amount_paise})
    db.commit()
    return p


def decide(db: Session, actor: Actor, payout_id: int, approve: bool, bank_reference: str | None = None) -> Payout:
    p = db.scalar(select(Payout).where(Payout.id == payout_id).with_for_update())
    if not p:
        raise not_found("Payout")
    if bank_reference:
        if p.status != "approved":
            raise AppError("PAYOUT_NOT_APPROVED", "Approve the payout before marking it paid.", 409)
        p.status, p.bank_reference, p.paid_at = "paid", bank_reference[:64], datetime.now(timezone.utc)
        audit(db, actor, "Marked payout paid", f"Payout {p.id}", meta={"bank_reference": bank_reference})
    else:
        if p.status != "pending":
            raise AppError("PAYOUT_LOCKED", "This payout has already been decided.", 409)
        p.status, p.approved_by, p.approved_at = ("approved" if approve else "rejected"), actor.id, datetime.now(timezone.utc)
        audit(db, actor, "Approved payout" if approve else "Rejected payout", f"Payout {p.id}")
    db.commit()
    return p


def held_items(db: Session, p: Payout) -> list[dict]:
    """G3: bookings of this chef and cycle held back because their attendance still awaits review."""
    share_pct = settings_svc.load(db).int("chef_share_pct")
    lo, hi = _bounds(p.cycle_start)
    q = (select(Visit).join(AttendanceRecord, AttendanceRecord.visit_id == Visit.id)
         .where(Visit.chef_id == p.chef_id, Visit.starts_at >= lo, Visit.starts_at < hi,
                AttendanceRecord.status.in_(REVIEW_STATUSES))
         .order_by(Visit.starts_at))
    return [{"visitId": str(v.id), "date": v.starts_at.isoformat(), "amount": (v.price_paise * share_pct // 100) / 100}
            for v in db.scalars(q) if _payable(db, v).needs_review]


def payout_json(db: Session, p: Payout, detail: bool = False) -> dict:
    name = db.scalar(select(User.full_name).join(Chef, Chef.user_id == User.id).where(Chef.id == p.chef_id))
    out = {"id": str(p.id), "chefId": str(p.chef_id), "chefName": name or "", "period": f"{p.cycle_start:%d %b} – {p.cycle_start + timedelta(days=6):%d %b %Y}",
           "cycleStart": p.cycle_start.isoformat(), "visits": p.visits, "amount": p.amount_paise / 100, "amountPaise": p.amount_paise,
           "heldAmount": p.held_paise / 100, "status": p.status, "bankReference": p.bank_reference,
           "approvedAt": p.approved_at.isoformat() if p.approved_at else None}
    if detail:
        out["approvedBy"] = db.scalar(select(User.full_name).where(User.id == p.approved_by)) if p.approved_by else None
        out["paidAt"] = p.paid_at.isoformat() if p.paid_at else None
        out["heldItems"] = held_items(db, p)
        out["items"] = [{"id": str(i.id), "visitId": str(i.visit_id) if i.visit_id else None, "amount": i.amount_paise / 100,
                         "kind": i.kind, "note": i.note} for i in db.scalars(select(PayoutItem).where(PayoutItem.payout_id == p.id))]
    return out


def statement(db: Session, chef: Chef, start: date) -> list[dict]:
    """G4: every booking of this chef in the cycle, with its pay status and amount, using the same rules as run_cycle.
    Status: earned (payable, cycle not run yet) | pending/approved/paid/rejected (on a payout) | held (attendance under
    review) | not_payable (cancelled, missed, trial or nothing worked) | upcoming (not worked yet)."""
    share_pct = settings_svc.load(db).int("chef_share_pct")
    lo, hi = _bounds(start)
    rows = []
    for v in db.scalars(select(Visit).where(Visit.chef_id == chef.id, Visit.starts_at >= lo, Visit.starts_at < hi)
                        .order_by(Visit.starts_at)):
        item = db.scalar(select(PayoutItem).where(PayoutItem.visit_id == v.id))
        pv = _payable(db, v)
        amt = chef_share(pv, share_pct)
        if item:
            status, paise = db.scalar(select(Payout.status).where(Payout.id == item.payout_id)), item.amount_paise
        elif amt is None:
            status, paise = "held", v.price_paise * share_pct // 100
        elif amt > 0:
            status, paise = "earned", amt
        elif pv.cancelled or pv.kind == "trial" or pv.worked_minutes is not None:
            status, paise = "not_payable", 0
        else:
            status, paise = "upcoming", 0
        cust = db.scalar(select(User.full_name).where(User.id == v.customer_id))
        rows.append({"id": str(v.id), "date": v.starts_at.isoformat(), "customerName": cust or "Customer", "kind": v.kind,
                     "visitStatus": v.status, "status": status, "amountPaise": paise, "amount": paise / 100})
    return rows


def statement_csv(rows: list[dict]) -> str:
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Visit", "Scheduled (IST)", "Customer", "Type", "Visit status", "Pay status", "Amount (Rs)"])
    for r in rows:
        w.writerow([r["id"], datetime.fromisoformat(r["date"]).astimezone(IST).strftime("%Y-%m-%d %H:%M"), r["customerName"],
                    r["kind"], r["visitStatus"], r["status"], f"{r['amountPaise'] / 100:.2f}"])
    return buf.getvalue()


def statement_token(chef_id: int, start: date, expires: int) -> str:
    """Signed, short-lived statement link so the phone's browser can download it without a bearer token."""
    from app.core.security import secret_hash
    return secret_hash(f"statement:{chef_id}:{start.isoformat()}:{expires}")


def chef_earnings(db: Session, chef: Chef) -> dict:
    from app.core import clock
    from app.core.config import settings
    start = cycle_start(clock.now())
    entries = statement(db, chef, start)
    earning = [e for e in entries if e["status"] in ("earned", "pending", "approved", "paid")]
    pending = db.scalar(select(func.coalesce(func.sum(Payout.amount_paise), 0)).where(Payout.chef_id == chef.id,
                                                                                    Payout.status.in_(("pending", "approved"))))
    exp = int((clock.now() + timedelta(minutes=10)).timestamp())
    url = (f"{settings.API_V1_STR}/chefs/statements/{chef.id}?cycleStart={start.isoformat()}&expires={exp}"
           f"&sig={statement_token(chef.id, start, exp)}")
    return {"period": f"{start:%d %b} – {start + timedelta(days=6):%d %b %Y}", "cycleStart": start.isoformat(),
            "total": sum(e["amountPaise"] for e in earning) / 100, "visits": len(earning),
            "heldAmount": sum(e["amountPaise"] for e in entries if e["status"] == "held") / 100,
            "pendingPayout": pending / 100, "entries": entries, "statementUrl": url}
