"""Part G: weekly chef earnings — API, permissions, review holds, concurrency and the G4 statement.
The PDF worked example itself is covered at service level in test_privacy_tracking.test_weekly_payout_cycle_part_g."""
import csv
import io
import threading
from datetime import date, time, timedelta

from conftest import H, admin, login, make_chef, make_user
from sqlalchemy import func, select

from app.core import clock
from app.core.database import SessionLocal
from app.core.security import encrypt
from app.domain import ist_datetime
from app.models import (
    Address,
    AttendanceRecord,
    AuditLog,
    Payout,
    PayoutItem,
    ServiceRequest,
    Visit,
)
from app.services import payouts
from app.services.events import Actor

V = "/api/v1"
WEEK = date(2026, 10, 5)  # Monday; the PDF's Asha cycle
NEXT = date(2026, 10, 12)


def seed(db):
    """The PDF table for chef Asha: P1 paid 800, P2 short 480, P3 cancelled, P4 needs review, P5 next cycle."""
    chef = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    cu = make_user(db, "customer", "9876500999", "Payout Customer")
    a = Address(user_id=cu.id, label="Home", line1_enc=encrypt("x"), city="Bengaluru", pincode="560001", lat=12.97, lng=77.64)
    db.add(a)
    db.flush()
    r = ServiceRequest(customer_id=cu.id, service="custom_time", stage="payment_done", members=4, slot="evening",
                       start_date=WEEK, end_date=date(2026, 10, 18), weekdays=[0], diet="veg", address_id=a.id)
    db.add(r)
    db.flush()

    def visit(d, hh, mm, price, worked, status="completed", att_status="ok", kind="subscription"):
        s = ist_datetime(d, time(hh, mm))
        v = Visit(kind=kind, request_id=r.id, customer_id=cu.id, address_id=a.id, lat=a.lat, lng=a.lng, chef_id=chef.id,
                  service_date=d, starts_at=s, ends_at=s + timedelta(hours=1), status=status, price_paise=price)
        db.add(v)
        db.flush()
        if worked is not False:
            db.add(AttendanceRecord(visit_id=v.id, chef_id=chef.id, check_in_at=s,
                                    check_out_at=None if worked is None else s + timedelta(minutes=worked),
                                    worked_minutes=worked, status=att_status))
        return v

    vs = {"P1": visit(WEEK, 19, 0, 100_000, 61), "P2": visit(date(2026, 10, 7), 12, 0, 80_000, 45),
          "P3": visit(date(2026, 10, 9), 18, 0, 80_000, False, status="cancelled"),
          "P4": visit(date(2026, 10, 10), 20, 0, 100_000, None, att_status="needs_review"),
          "P5": visit(NEXT, 0, 30, 80_000, 60)}
    db.commit()
    return chef, vs, visit


def test_unreviewed_exception_is_held_then_carried_forward(db):
    _, _, visit = seed(db)
    # Worked 25 of 60 minutes: flagged "unusual_duration" for Admin review (Part D). Not paid until decided.
    odd = visit(date(2026, 10, 8), 12, 0, 80_000, 25, att_status="exception")
    db.commit()
    payouts.run_cycle(db, WEEK)
    p = db.scalar(select(Payout).where(Payout.cycle_start == WEEK))
    assert p.amount_paise == 128_000 and p.held_paise == 80_000 + 64_000
    assert db.scalar(select(PayoutItem).where(PayoutItem.visit_id == odd.id)) is None
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == odd.id))
    rec.status = "resolved"  # approved as worked 25 min: 640 × 25/60 = 266.66 → 266.66 rounded down per paisa
    db.commit()
    payouts.run_cycle(db, NEXT)
    payouts.run_cycle(db, WEEK)  # re-running the earlier pending cycle never pays the carried visit twice
    items = db.scalars(select(PayoutItem).where(PayoutItem.visit_id == odd.id)).all()
    assert len(items) == 1 and items[0].amount_paise == 64_000 * 25 // 60
    assert db.scalar(select(Payout.cycle_start).where(Payout.id == items[0].payout_id)) == NEXT


def test_cancelled_trial_and_missed_are_never_paid_or_held(db):
    chef, vs, visit = seed(db)
    trial = visit(date(2026, 10, 6), 12, 0, 50_000, 60, kind="trial")
    missed = visit(date(2026, 10, 6), 18, 0, 80_000, False, status="missed")
    db.add(AttendanceRecord(visit_id=missed.id, chef_id=chef.id, status="exception", exception="missed_visit"))
    db.commit()
    payouts.run_cycle(db, WEEK)
    p = db.scalar(select(Payout).where(Payout.cycle_start == WEEK))
    assert (p.amount_paise, p.held_paise, p.visits) == (128_000, 80_000, 2)
    paid = set(db.scalars(select(PayoutItem.visit_id).where(PayoutItem.payout_id == p.id)))
    assert paid == {vs["P1"].id, vs["P2"].id} and trial.id not in paid and missed.id not in paid


def test_two_instances_running_at_once_make_one_payout(db):
    seed(db)
    barrier, errors = threading.Barrier(4), []

    def run():
        s = SessionLocal()
        try:
            barrier.wait()
            payouts.run_cycle(s, WEEK)
        except Exception as e:  # noqa: BLE001
            errors.append(e)
        finally:
            s.close()

    threads = [threading.Thread(target=run) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    rows = db.scalars(select(Payout).where(Payout.cycle_start == WEEK)).all()
    assert len(rows) == 1 and rows[0].amount_paise == 128_000
    assert db.scalar(select(func.count()).select_from(PayoutItem).where(PayoutItem.payout_id == rows[0].id)) == 2


def test_admin_payout_flow_and_permissions(client, otp, db):
    _, vs, _ = seed(db)
    ops = admin(client, otp, db)
    sup = admin(client, otp, db, "super_admin", "9000000002")
    asha = H(login(client, otp, "9111100001", "chef"))
    for h in (ops["h"], asha):
        assert client.get(f"{V}/admin/payouts", headers=h).status_code == 403
        assert client.post(f"{V}/admin/payouts/run", params={"cycleStart": WEEK.isoformat()}, headers=h).status_code == 403
    assert client.post(f"{V}/admin/payouts/run", params={"cycleStart": "2026-10-06"}, headers=sup["h"]).status_code == 422
    rows = client.post(f"{V}/admin/payouts/run", params={"cycleStart": WEEK.isoformat()}, headers=sup["h"]).json()
    assert len(rows) == 1 and rows[0]["amountPaise"] == 128_000 and rows[0]["heldAmount"] == 800.0
    pid = rows[0]["id"]
    for h in (ops["h"], asha):
        assert client.post(f"{V}/admin/payouts/{pid}/adjustments", json={"amountPaise": -5000, "reason": "x"}, headers=h).status_code == 403
        assert client.post(f"{V}/admin/payouts/{pid}/decision", json={"approve": True}, headers=h).status_code == 403
    d = client.get(f"{V}/admin/payouts/{pid}", headers=sup["h"]).json()
    assert [h["visitId"] for h in d["heldItems"]] == [str(vs["P4"].id)] and d["heldItems"][0]["amount"] == 800.0
    assert client.post(f"{V}/admin/payouts/{pid}/adjustments", json={"amountPaise": -5000, "reason": " "}, headers=sup["h"]).status_code == 422
    d = client.post(f"{V}/admin/payouts/{pid}/adjustments", json={"amountPaise": -5000, "reason": "Customer complaint"}, headers=sup["h"]).json()
    assert d["amountPaise"] == 123_000  # PDF: 800 + 480 − 50 = 1,230
    assert client.post(f"{V}/admin/payouts/{pid}/decision", json={"approve": True, "bankReference": "UTR1"}, headers=sup["h"]).status_code == 409
    d = client.post(f"{V}/admin/payouts/{pid}/decision", json={"approve": True}, headers=sup["h"]).json()
    assert d["status"] == "approved" and d["approvedBy"] == "Super Person" and d["approvedAt"]
    assert client.post(f"{V}/admin/payouts/{pid}/adjustments", json={"amountPaise": 100, "reason": "late"}, headers=sup["h"]).status_code == 409
    client.post(f"{V}/admin/payouts/run", params={"cycleStart": WEEK.isoformat()}, headers=sup["h"])
    assert db.get(Payout, int(pid)).amount_paise == 123_000  # approved numbers never change on a re-run
    d = client.post(f"{V}/admin/payouts/{pid}/decision", json={"approve": True, "bankReference": "UTR1"}, headers=sup["h"]).json()
    assert d["status"] == "paid" and d["bankReference"] == "UTR1" and d["paidAt"]
    acts = list(db.scalars(select(AuditLog).where(AuditLog.target == f"Payout {pid}").order_by(AuditLog.id)))
    assert [a.action for a in acts] == ["Payout adjustment", "Approved payout", "Marked payout paid"]
    assert all(a.actor_role == "super_admin" and a.at for a in acts) and acts[0].reason == "Customer complaint"


def test_chef_earnings_statement_and_isolation(client, otp, db):
    chef, vs, _ = seed(db)
    make_chef(db, "9111100002", "Esha", 12.98, 77.65, 4.4)
    asha = H(login(client, otp, "9111100001", "chef"))
    esha = H(login(client, otp, "9111100002", "chef"))
    clock.frozen = ist_datetime(date(2026, 10, 11), time(22, 0))  # Sunday of Asha's cycle
    e = client.get(f"{V}/chefs/me/earnings", headers=asha).json()
    by = {x["id"]: x for x in e["entries"]}
    assert set(by) == {str(vs[k].id) for k in ("P1", "P2", "P3", "P4")}  # P5 belongs to the next cycle
    assert (by[str(vs["P1"].id)]["status"], by[str(vs["P1"].id)]["amount"]) == ("earned", 800.0)
    assert (by[str(vs["P2"].id)]["status"], by[str(vs["P2"].id)]["amount"]) == ("earned", 480.0)
    assert (by[str(vs["P3"].id)]["status"], by[str(vs["P3"].id)]["amount"]) == ("not_payable", 0.0)
    assert (by[str(vs["P4"].id)]["status"], by[str(vs["P4"].id)]["amount"]) == ("held", 800.0)
    assert (e["total"], e["visits"], e["heldAmount"]) == (1280.0, 2, 800.0)
    url = e["statementUrl"]
    r = client.get(url)  # signed link: opened in the phone's browser, no bearer token
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0][0] == "Visit" and len(rows) == 5
    assert {(x[0], x[5], x[6]) for x in rows[1:]} >= {(str(vs["P1"].id), "earned", "800.00"), (str(vs["P4"].id), "held", "800.00")}
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403
    other = url.replace(f"/statements/{chef.id}?", f"/statements/{chef.id + 1}?")
    assert client.get(other).status_code == 403  # a link can't be re-pointed at another chef
    clock.frozen = clock.frozen + timedelta(minutes=11)
    assert client.get(url).status_code == 403  # expired
    assert client.get(f"{V}/chefs/me/earnings", headers=esha).json()["entries"] == []
    # after the cycle runs, the same bookings show their payout status
    clock.frozen = None
    payouts.run_cycle(db, WEEK)
    sup = make_user(db, "super_admin", "9000000002", "Super")
    payouts.decide(db, Actor(sup.id, "super_admin"), db.scalar(select(Payout.id)), True)
    clock.frozen = ist_datetime(date(2026, 10, 11), time(23, 0))
    st = {x["id"]: x["status"] for x in client.get(f"{V}/chefs/me/earnings", headers=asha).json()["entries"]}
    assert st[str(vs["P1"].id)] == "approved" and st[str(vs["P4"].id)] == "held"
