"""DEVELOPMENT ONLY: mark a customer's assigned trial visit as completed, skipping the on-site check-in, so the
decision → subscribe → payment flow can be tested from a desk. Refuses to run in production. Audited.

    python -m scripts.dev_complete_visit 9876543210

Only a visit with a live chef assignment is completed: one the chef accepted, or an offer still inside the response
window. An offer that expired (or is past the window and about to be expired by the worker) is reported explicitly;
the script never re-activates or bypasses it. Assign a chef again from the admin app instead.
"""
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import lookup_hash
from app.domain import IST
from app.models import Assignment, User, Visit
from app.services import bookings
from app.services import settings as settings_svc
from app.services.auth import normalize_phone
from app.services.events import Actor, audit

OPEN_TRIAL = ("pending_assignment", "needs_manual_assignment", "scheduled", "chef_travelling", "checked_in")


class NotCompletable(Exception):
    """The customer's trial visit can't be completed; the message says why and what to do."""


def completable_trial(db: Session, customer: User) -> Visit:
    """The customer's next open trial visit, if its chef assignment is still live. Raises NotCompletable otherwise."""
    v = db.scalar(select(Visit).where(Visit.customer_id == customer.id, Visit.kind == "trial", Visit.status.in_(OPEN_TRIAL))
                  .order_by(Visit.starts_at).limit(1))
    if not v:
        raise NotCompletable("No open trial visit found. Request a trial first.")
    latest = db.scalar(select(Assignment).where(Assignment.visit_id == v.id).order_by(Assignment.id.desc()).limit(1))
    if v.chef_id is None:
        if latest and latest.status == "expired":
            raise NotCompletable(f"Visit {v.id}: the chef's offer expired unanswered "
                                 f"(offered {latest.created_at.astimezone(IST):%d %b %H:%M}). Assign a chef again from the admin app.")
        raise NotCompletable(f"Visit {v.id} has no chef assigned. Have an admin assign a chef first.")
    if latest is None or latest.chef_id != v.chef_id or latest.status not in ("offered", "accepted"):
        raise NotCompletable(f"Visit {v.id} has no live assignment for its chef. Reassign it from the admin app.")
    if bookings.offer_is_stale(latest, settings_svc.load(db)):
        raise NotCompletable(f"Visit {v.id}: the chef did not accept within the response window, so the offer is expiring. "
                             "Have the chef accept it in time, or assign again from the admin app.")
    return v


def complete_trial(db: Session, customer: User) -> Visit:
    v = completable_trial(db, customer)
    v.status = "completed"
    bookings.on_visit_finished(db, v)
    audit(db, Actor(None, "system", "dev script"), "DEV: trial visit marked completed", f"Visit {v.id}")
    db.commit()
    return v


def main(phone: str) -> None:
    if settings.is_production:
        sys.exit("Refusing: this shortcut exists only for development testing.")
    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.phone_hmac == lookup_hash(normalize_phone(phone)), User.role == "customer"))
        if not u:
            sys.exit("No customer with that phone number.")
        try:
            v = complete_trial(db, u)
        except NotCompletable as e:
            sys.exit(str(e))
        print(f"Trial visit {v.id} marked completed. Open the app: Trials > Decide > Subscribe.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m scripts.dev_complete_visit <customer phone>")
    main(sys.argv[1])
