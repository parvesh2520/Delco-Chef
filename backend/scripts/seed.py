"""Development seed: fictional people only, created through the real services so every row obeys the business rules.

    python -m scripts.seed            # add seed data (idempotent: skips if seed users exist)
    python -m scripts.seed --purge    # remove seed data (only rows owned by is_seed users)

Never runs in production unless --allow-production is passed explicitly.
"""
import argparse
import sys
from datetime import timedelta

from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import encrypt, lookup_hash
from app.domain import ist_today
from app.models import Address, Chef, ChefDocument, ChefOffDay, ChefSkill, Consent, CustomerProfile, PaymentLink, User, Visit
from app.services import bookings, payments, subscriptions
from app.services.events import SYSTEM
from app.services.gateway import GatewayEvent
from app.services.worker import deliver_outbox

PIN = (12.9784, 77.6408)  # Indiranagar, Bengaluru (Part B booking pin)

ADMINS = [("9000000001", "Karan Mehta", "ops_admin"), ("9000000002", "Riya Kapoor", "super_admin")]
# Part B fixture chefs (fictional), plus a rejected applicant.
CHEFS = [("9111111111", "Asha Rao", 12.9716, 77.6412, 4.6, ["North Indian", "Punjabi"], "approved", True),
         ("9111111113", "Esha Iyer", 12.9988, 77.6590, 4.4, ["North Indian", "South Indian"], "approved", True),
         ("9111111114", "Bala Krishnan", 12.9352, 77.6245, 4.9, ["North Indian", "Continental"], "approved", True),
         ("9111111115", "Dev Malhotra", 12.9609, 77.6387, 4.5, ["North Indian", "Chinese"], "approved", True),
         ("9111111116", "Chitra Nair", 13.0827, 77.5877, 4.7, ["North Indian"], "approved", True),
         ("9111111117", "Farah Khan", 12.9800, 77.6400, 4.8, ["North Indian"], "approved", False),
         ("9111111118", "Gopal Shetty", 12.9750, 77.6350, 4.6, ["South Indian"], "approved", True),
         ("9111111119", "Hema Pillai", 12.9700, 77.6300, 4.9, ["North Indian", "Bengali"], "approved", True),
         ("9111111120", "Isha Verma", 12.9790, 77.6420, 4.8, ["North Indian"], "submitted", True),
         ("9111111112", "Ravi Applicant", 12.9600, 77.6500, 0, ["Gujarati"], "rejected", True)]
CUSTOMERS = [("9876543210", "Aarav Sharma", PIN), ("9876543211", "Neha Verma", (12.9719, 77.6412)),
             ("9876543212", "Rohit Malhotra", (12.9800, 77.6450)), ("9876543213", "Priya Nair", (12.9650, 77.6380)),
             ("9876543214", "Kavya Iyer", (12.9850, 77.6390))]


def user(db, role, phone, name):
    u = User(role=role, phone_enc=encrypt(phone), phone_hmac=lookup_hash(phone), full_name=name, is_seed=True,
             email=f"{name.split()[0].lower()}@example.com")
    db.add(u)
    db.flush()
    return u


def seed() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).where(User.is_seed.is_(True)).limit(1)):
            print("Seed data already present; nothing to do (use --purge first to re-seed).")
            return
        phones = [x[0] for x in ADMINS + CHEFS + CUSTOMERS]
        taken = db.scalar(select(User.id).where(User.phone_hmac.in_([lookup_hash(p) for p in phones])).limit(1))
        if taken:
            sys.exit("A seed phone number already belongs to a real (non-seed) account. Not touching it; seed aborted.")
        for phone, name, role in ADMINS:
            user(db, role, phone, name)
        chefs = {}
        for phone, name, lat, lng, rating, cuisines, status, active in CHEFS:
            u = user(db, "chef", phone, name)
            c = Chef(user_id=u.id, status=status, active=active, home_lat=lat, home_lng=lng, rating=rating, city="Bengaluru",
                     area="Indiranagar", experience_years=5, is_seed=True,
                     rejection_reason="Documents were unreadable. Please re-upload." if status == "rejected" else None)
            db.add(c)
            db.flush()
            db.add_all([ChefSkill(chef_id=c.id, cuisine=x) for x in cuisines])
            db.add_all([ChefDocument(chef_id=c.id, type="aadhaar", value_enc=encrypt(f"5000{c.id:08d}"), last4=f"{c.id:04d}",
                                     status="verified" if status == "approved" else "pending"),
                        ChefDocument(chef_id=c.id, type="pan", value_enc=encrypt(f"ABCDE{c.id:04d}F"), last4=f"{c.id:03d}F",
                                     status="verified" if status == "approved" else "pending")])
            chefs[name.split()[0]] = c
        db.add(ChefOffDay(chef_id=chefs["Hema"].id, day=ist_today() + timedelta(days=1)))
        customers = []
        for phone, name, (lat, lng) in CUSTOMERS:
            u = user(db, "customer", phone, name)
            db.add(CustomerProfile(user_id=u.id, household_size=3, diet="veg", onboarded_at=u.created_at, is_seed=True))
            db.add(Address(user_id=u.id, label="Home", line1_enc=encrypt(f"{len(customers) + 10} 12th Main Road"),
                           landmark_enc=encrypt("Near the park"), city="Bengaluru", pincode="560038", lat=lat, lng=lng,
                           is_default=True, is_seed=True))
            db.add_all([Consent(user_id=u.id, kind="terms", version="2026-11"), Consent(user_id=u.id, kind="location", version="2026-11")])
            customers.append(u)
        db.commit()

        def addr(u):
            return str(db.scalar(select(Address.id).where(Address.user_id == u.id)))

        def body(service, u, day, slot="evening", **kw):
            b = {"members": 4, "slot": slot, "startDate": day.isoformat(), "meals": ["dinner"], "cuisines": ["North Indian"],
                 "diet": "veg", "allergies": [], "addressId": addr(u)}
            if service == "custom_time":
                b.update(durationDays=14, weekdays=[0, 1, 2, 3, 4, 5])
            b.update(kw)
            return b

        tomorrow = ist_today() + timedelta(days=1)
        aarav, neha, rohit, priya, kavya = customers
        # Neha: new trial request waiting in the admin queue.
        bookings.create_request(db, neha, "monthly_subscription", body("monthly_subscription", neha, tomorrow,
                                allergies=["Peanuts"], allergyNotes="Child is allergic to peanuts — no groundnut oil."))
        # Rohit: Custom Time trial assigned to Asha (tomorrow evening).
        r = bookings.create_request(db, rohit, "custom_time", body("custom_time", rohit, tomorrow))
        bookings.assign(db, SYSTEM, bookings.target_visit(db, r).id, chefs["Asha"].id)
        # Aarav: Monthly trial 1 completed, awaiting decision.
        r = bookings.create_request(db, aarav, "monthly_subscription", body("monthly_subscription", aarav, tomorrow + timedelta(days=1), slot="morning"))
        v = bookings.target_visit(db, r)
        bookings.assign(db, SYSTEM, v.id, chefs["Bala"].id)
        v.status = "completed"
        bookings.on_visit_finished(db, v)
        db.commit()
        # Priya & Kavya: trial completed → subscribed. Priya paid (active), Kavya's link is waiting.
        for cust, pay, chef, slot in ((priya, True, "Esha", "morning"), (kavya, False, "Dev", "evening")):
            r = bookings.create_request(db, cust, "monthly_subscription", body("monthly_subscription", cust, tomorrow + timedelta(days=2), slot=slot))
            v = bookings.target_visit(db, r)
            bookings.assign(db, SYSTEM, v.id, chefs[chef].id)
            v.status = "completed"
            bookings.on_visit_finished(db, v)
            db.commit()
            trial = db.scalar(select(Visit).where(Visit.id == v.id)).trial_id
            res = bookings.decide(db, cust, trial, "subscribe")
            if pay:
                sub = db.get(subscriptions.Subscription, int(res["subscriptionId"]))
                p = db.scalar(select(payments.Payment).where(payments.Payment.subscription_id == sub.id))
                link = db.scalar(select(PaymentLink).where(PaymentLink.payment_id == p.id, PaymentLink.status == "active"))
                payments.process_event(db, GatewayEvent(f"seed_{p.id}", "paid", link.gateway_link_id, f"pay_seed_{p.id}", link.amount_paise,
                                                        "upi", None, None, {"seed": True}))
                db.commit()
        for t in ("service_requests", "trials", "visits", "subscriptions", "payments", "attendance_records"):
            col = {"service_requests": "customer_id", "trials": "customer_id", "visits": "customer_id", "subscriptions": "customer_id",
                   "payments": "customer_id"}.get(t)
            if col:
                db.execute(text(f"update {t} set is_seed = true where {col} in (select id from users where is_seed)"))
        db.commit()
        while deliver_outbox():
            pass
        print("Seeded:", len(ADMINS), "admins,", len(CHEFS), "chefs,", len(CUSTOMERS), "customers. Sign in with any seeded phone; "
              "OTP is printed in the backend log.")
    finally:
        db.close()


def purge() -> None:
    """Deletes only data owned by is_seed users. Audit rows are append-only and are kept."""
    db = SessionLocal()
    try:
        ids = "select id from users where is_seed"
        for stmt in (
            f"delete from notifications where user_id in ({ids})",
            f"delete from outbox_events where (payload->>'user_id')::bigint in ({ids})",
            f"delete from payment_events where payment_id in (select id from payments where customer_id in ({ids}))",
            f"delete from refunds where payment_id in (select id from payments where customer_id in ({ids}))",
            f"delete from payment_links where payment_id in (select id from payments where customer_id in ({ids}))",
            f"delete from payments where customer_id in ({ids})",
            f"delete from payout_items where visit_id in (select id from visits where customer_id in ({ids}))",
            f"delete from attendance_records where visit_id in (select id from visits where customer_id in ({ids}))",
            f"delete from assignments where request_id in (select id from service_requests where customer_id in ({ids}))",
            f"delete from visits where customer_id in ({ids})",
            f"delete from subscriptions where customer_id in ({ids})",
            f"delete from service_requests where customer_id in ({ids})",
            f"delete from payouts where chef_id in (select id from chefs where user_id in ({ids}))",
            f"delete from chef_last_locations where chef_id in (select id from chefs where user_id in ({ids}))",
            f"delete from chefs where user_id in ({ids})",
            f"delete from users where is_seed",
        ):
            db.execute(text(stmt))
        db.commit()
        print("Seed data removed.")
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--purge", action="store_true")
    ap.add_argument("--allow-production", action="store_true")
    a = ap.parse_args()
    if settings.is_production and not a.allow_production:
        sys.exit("Refusing to seed demo accounts in production.")
    purge() if a.purge else seed()
