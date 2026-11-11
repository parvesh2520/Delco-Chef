"""DEVELOPMENT ONLY: mark a customer's assigned trial visit as completed, skipping the on-site check-in, so the
decision → subscribe → payment flow can be tested from a desk. Refuses to run in production. Audited.

    python -m scripts.dev_complete_visit 9876543210
"""
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import lookup_hash
from app.models import User, Visit
from app.services import bookings
from app.services.auth import normalize_phone
from app.services.events import Actor, audit


def main(phone: str) -> None:
    if settings.is_production:
        sys.exit("Refusing: this shortcut exists only for development testing.")
    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.phone_hmac == lookup_hash(normalize_phone(phone)), User.role == "customer"))
        if not u:
            sys.exit("No customer with that phone number.")
        v = db.scalar(select(Visit).where(Visit.customer_id == u.id, Visit.kind == "trial",
                                          Visit.status.in_(("scheduled", "chef_travelling", "checked_in")))
                      .order_by(Visit.starts_at).limit(1))
        if not v:
            sys.exit("No assigned trial visit found. Request a trial and have an admin assign a chef first.")
        v.status = "completed"
        bookings.on_visit_finished(db, v)
        audit(db, Actor(None, "system", "dev script"), "DEV: trial visit marked completed", f"Visit {v.id}")
        db.commit()
        print(f"Trial visit {v.id} marked completed. Open the app: Trials > Decide > Subscribe.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python -m scripts.dev_complete_visit <customer phone>")
    main(sys.argv[1])
