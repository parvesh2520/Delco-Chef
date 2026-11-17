"""Prints JSON with access tokens for load tests (benchmark DB only): one customer, one chef with a travelling visit,
one ops admin, plus a request id for suggestions. Usage: python -m scripts.bench_tokens > loadtest/tokens.json"""
import json
import sys
import uuid

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import encrypt, lookup_hash
from app.models import Chef, ServiceRequest, User, Visit
from app.services import auth


def token(db, user):
    return auth._issue(db, user, uuid.uuid4().hex, "loadtest")["token"]


def main():
    if "neon.tech" in settings.sqlalchemy_url or settings.is_production:
        sys.exit("Benchmark tokens are for the local benchmark database only.")
    db = SessionLocal()
    # The busiest customer, so history is measured on a full page of 20.
    cust = db.scalar(select(User).join(ServiceRequest, ServiceRequest.customer_id == User.id).where(User.role == "customer", User.is_seed)
                     .group_by(User.id).order_by(func.count(ServiceRequest.id).desc()).limit(1))
    chef = db.scalar(select(Chef).where(Chef.is_seed).limit(1))
    admin = db.scalar(select(User).where(User.role == "ops_admin"))
    if admin is None:
        admin = User(role="ops_admin", full_name="Bench Ops", phone_enc=encrypt("9000099999"), phone_hmac=lookup_hash("9000099999"))
        db.add(admin)
        db.flush()
    visit = db.scalar(select(Visit).where(Visit.chef_id == chef.id).order_by(Visit.id.desc()).limit(1))
    visit.status = "chef_travelling"  # so location ingest is accepted
    req = db.scalar(select(ServiceRequest.id).where(ServiceRequest.is_seed).limit(1))
    out = {"customer": token(db, cust), "chef": token(db, db.get(User, chef.user_id)), "admin": token(db, admin),
           "visitId": visit.id, "requestId": req}
    db.commit()
    print(json.dumps(out))


if __name__ == "__main__":
    main()
