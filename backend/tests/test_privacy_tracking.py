"""Parts E, G, H acceptance tests."""
import json
from datetime import date, datetime, time, timedelta

from sqlalchemy import select, text

from app.core import clock
from app.core.security import encrypt
from app.domain import ist_datetime
from app.models import Address, AttendanceRecord, AuditLog, ChefDocument, Payment, Payout, ServiceRequest, User, Visit
from app.services import payouts, tracking
from app.services.events import Actor
from app.services.worker import deliver_outbox
from conftest import H, PNG, admin, at, customer_with_address, login, make_chef, make_user, tomorrow, trial_body
from test_payments import subscribe

V = "/api/v1"


# ---------------- H: privacy ----------------
def test_export_contains_my_data_only(client, otp, db):
    c, _, pay, _, _ = subscribe(client, otp, db)
    other = customer_with_address(client, otp, "9876599999", "Someone Else")
    assert client.post(f"{V}/privacy/export", headers=c["h"]).status_code == 202
    while deliver_outbox():
        pass
    e = client.get(f"{V}/privacy/export", headers=c["h"]).json()
    assert e["status"] == "ready"
    data = client.get(e["downloadUrl"])  # signed URL: no bearer token needed (opened in the browser)
    body = data.json()
    assert set(body) >= {"profile", "needs", "addresses", "consents", "bookings", "subscriptions", "payments", "visits"}
    assert body["payments"][0]["amountPaise"] == 2_080_000 and "Someone Else" not in data.text
    tampered = e["downloadUrl"].replace("sig=", "sig=0")
    assert client.get(tampered).status_code == 403 and other  # a forged/foreign link never returns data
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Requested data export"))


def test_delete_account_anonymises_but_keeps_payments(client, otp, db):
    c, _, pay, _, _ = subscribe(client, otp, db)
    uid = int(c["user"]["id"])
    assert client.request("DELETE", f"{V}/customers/me", json={"reason": "test"}, headers=c["h"]).status_code == 204
    db.expire_all()
    u = db.get(User, uid)
    assert (u.full_name, u.email, u.phone_enc, u.phone_hmac, u.status) == (None, None, None, None, "deleted")
    assert all(a.city == "Deleted" for a in db.scalars(select(Address).where(Address.user_id == uid)))
    assert db.get(Payment, int(pay["id"])).customer_id == uid  # financial record kept, linked to an anonymous id
    assert client.get(f"{V}/customers/me", headers=c["h"]).status_code == 401  # sessions revoked
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Deleted account"))


def test_raw_columns_are_encrypted(client, otp, db):
    c = customer_with_address(client, otp, "9876512345")
    row = db.execute(text("select phone_enc, phone_hmac from users where role='customer'")).first()
    assert b"9876512345" not in bytes(row[0]) and "9876512345" not in row[1]
    line = db.execute(text("select line1_enc from addresses")).scalar()
    assert b"Test Road" not in bytes(line)
    assert c


def test_audit_log_is_append_only(db):
    db.add(AuditLog(action="x", target="y"))
    db.commit()
    try:
        db.execute(text("update audit_logs set action='z'"))
        db.commit()
        raise AssertionError("audit log was editable")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        assert "append-only" in str(e)


def test_chef_contact_window(client, otp, db):
    asha = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, "9876580001")
    day = tomorrow() + timedelta(days=2)
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], day=day), headers=c["h"]).json()["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(asha.id)}, headers=ops["h"])
    chef = H(login(client, otp, "9111100001", "chef"))
    vid = client.get(f"{V}/visits", headers=chef).json()[0]["id"]
    r = client.get(f"{V}/visits/{vid}/customer", headers=chef)
    assert r.status_code == 403 and r.json()["error"]["code"] == "CONTACT_NOT_AVAILABLE"
    assert "Test Road" not in client.get(f"{V}/visits/{vid}", headers=chef).text
    clock.frozen = at(day, 18, 0)
    assert client.get(f"{V}/visits/{vid}/customer", headers=chef).json()["address"]["line1"] == "12 Test Road"
    other = make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    assert other and client.get(f"{V}/visits/{vid}/customer", headers=H(login(client, otp, "9111100002", "chef"))).status_code == 404


def test_document_reveal_permissions(client, otp, db):
    chef = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    d = ChefDocument(chef_id=chef.id, type="aadhaar", value_enc=encrypt("123456789012"), last4="9012")
    db.add(d)
    db.commit()
    ops = admin(client, otp, db)
    sup = admin(client, otp, db, "super_admin", "9000000002")
    assert client.get(f"{V}/admin/chefs/{chef.id}", headers=ops["h"]).json()["documents"] == []
    assert client.post(f"{V}/admin/chefs/{chef.id}/documents/{d.id}/reveal", json={}, headers=ops["h"]).status_code == 403
    masked = client.get(f"{V}/admin/chefs/{chef.id}", headers=sup["h"]).json()["documents"][0]["maskedValue"]
    assert masked.endswith("9012") and "1234" not in masked
    r = client.post(f"{V}/admin/chefs/{chef.id}/documents/{d.id}/reveal", json={"reason": "Verification"}, headers=sup["h"])
    assert r.json()["value"] == "123456789012"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Revealed document", AuditLog.reason == "Verification"))


def test_admin_sees_masked_phone(client, otp, db):
    c = customer_with_address(client, otp, "9876581234")
    client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"])
    ops = admin(client, otp, db)
    phone = client.get(f"{V}/admin/requests", headers=ops["h"]).json()["items"][0]["customerPhone"]
    assert "9876581234" not in phone and phone.endswith("34")


# ---------------- E: tracking ----------------
def _travelling(client, otp, db, n=3):
    ops = admin(client, otp, db)
    out = []
    for i in range(n):
        ch = make_chef(db, f"91111000{i + 1:02d}", f"Chef{i}", 12.9716, 77.6412, 4.6)
        c = customer_with_address(client, otp, f"98765900{i:02d}")
        rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
        client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(ch.id)}, headers=ops["h"])
        vid = client.get(f"{V}/visits", headers=c["h"]).json()[0]["id"]
        out.append((c, H(login(client, otp, f"91111000{i + 1:02d}", "chef")), vid))
    return out


def test_tracking_window_and_isolation(client, otp, db):
    trips = _travelling(client, otp, db)
    d = tomorrow()
    clock.frozen = at(d, 18, 40)
    for c, ch, vid in trips:
        assert client.post(f"{V}/visits/{vid}/travel/start", headers=ch).status_code == 200
    for step in range(60):  # 3 chefs × 60 points
        clock.frozen = at(d, 18, 46) + timedelta(seconds=5 * step)
        for i, (c, ch, vid) in enumerate(trips):
            pt = {"lat": 12.95 + i * 0.001 + step * 0.0004, "lng": 77.62 + step * 0.0003, "accuracy": 8}
            assert client.post(f"{V}/visits/{vid}/location", json={"points": [pt]}, headers=ch).status_code == 200
    (c0, ch0, v0), (c1, _, v1) = trips[0], trips[1]
    snap = client.get(f"{V}/visits/{v0}/tracking", headers=c0["h"]).json()
    assert snap["available"] and abs(snap["chefLocation"]["lat"] - (12.95 + 59 * 0.0004)) < 1e-9 and snap["etaMinutes"] >= 1
    assert client.get(f"{V}/visits/{v1}/tracking", headers=c0["h"]).status_code == 404
    clock.frozen = clock.frozen + timedelta(seconds=35)
    assert client.get(f"{V}/visits/{v0}/tracking", headers=c0["h"]).json()["stale"] is True
    tracking.flush(db)
    assert db.execute(text("select count(*) from location_points")).scalar() == 180
    # Chef from another visit cannot post to this one.
    assert client.post(f"{V}/visits/{v1}/location", json={"points": [{"lat": 12.9, "lng": 77.6}]}, headers=ch0).status_code == 404


def test_tracking_not_yet_and_ended(client, otp, db):
    (c, ch, vid), = _travelling(client, otp, db, 1)
    d = tomorrow()
    clock.frozen = at(d, 18, 40)
    client.post(f"{V}/visits/{vid}/travel/start", headers=ch)
    clock.frozen = at(d, 18, 40)
    r = client.get(f"{V}/visits/{vid}/tracking", headers=c["h"])
    assert r.json()["error"]["code"] == "TRACKING_NOT_AVAILABLE_YET"  # 20 min before start
    v = db.get(Visit, int(vid))
    v.status = "checked_in"
    db.commit()
    clock.frozen = at(d, 19, 0)
    assert client.get(f"{V}/visits/{vid}/tracking", headers=c["h"]).json()["error"]["code"] == "TRACKING_ENDED"


# ---------------- G: payouts ----------------
def test_weekly_payout_cycle_part_g(db):
    chef = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    sup = make_user(db, "super_admin", "9000000002", "Super")
    cu = make_user(db, "customer", "9876500999", "Payout Customer")
    a = Address(user_id=cu.id, label="Home", line1_enc=encrypt("x"), city="Bengaluru", pincode="560001", lat=12.97, lng=77.64)
    db.add(a)
    db.flush()
    r = ServiceRequest(customer_id=cu.id, service="custom_time", stage="payment_done", members=4, slot="evening",
                       start_date=date(2026, 10, 5), end_date=date(2026, 10, 18), weekdays=[0], diet="veg", address_id=a.id)
    db.add(r)
    db.flush()

    def visit(d, hh, mm, price, status="completed"):
        s = ist_datetime(d, time(hh, mm))
        v = Visit(kind="subscription", request_id=r.id, customer_id=cu.id, address_id=a.id, lat=a.lat, lng=a.lng, chef_id=chef.id,
                  service_date=d, starts_at=s, ends_at=s + timedelta(hours=1), status=status, price_paise=price)
        db.add(v)
        db.flush()
        return v

    def att(v, ci_min, worked, status="ok"):
        rec = AttendanceRecord(visit_id=v.id, chef_id=chef.id, check_in_at=v.starts_at + timedelta(minutes=ci_min),
                               check_out_at=None if worked is None else v.starts_at + timedelta(minutes=ci_min + worked),
                               worked_minutes=worked, status=status)
        db.add(rec)
        return rec

    p1 = visit(date(2026, 10, 5), 19, 0, 100_000)
    att(p1, 3, 61)
    p2 = visit(date(2026, 10, 7), 12, 0, 80_000)
    att(p2, 0, 45)
    visit(date(2026, 10, 9), 18, 0, 80_000, status="cancelled")
    p4 = visit(date(2026, 10, 10), 20, 0, 100_000)
    rec4 = att(p4, 0, None, status="needs_review")
    p5 = visit(date(2026, 10, 12), 0, 30, 80_000)
    att(p5, 0, 60)
    db.commit()
    payouts.run_cycle(db, date(2026, 10, 5))
    payouts.run_cycle(db, date(2026, 10, 5))  # safe to repeat
    rows = db.scalars(select(Payout).where(Payout.cycle_start == date(2026, 10, 5))).all()
    assert len(rows) == 1 and rows[0].amount_paise == 128_000 and rows[0].held_paise == 80_000
    p = payouts.adjust(db, Actor(sup.id, "super_admin"), rows[0].id, -5_000, "Customer complaint")
    assert p.amount_paise == 123_000
    rec4.status, rec4.worked_minutes, rec4.check_out_at = "resolved", 60, p4.ends_at
    db.commit()
    payouts.run_cycle(db, date(2026, 10, 12))
    nxt = db.scalar(select(Payout).where(Payout.cycle_start == date(2026, 10, 12)))
    assert nxt.amount_paise == 144_000
    payouts.decide(db, Actor(sup.id, "super_admin"), p.id, True)
    try:
        payouts.adjust(db, Actor(sup.id, "super_admin"), p.id, 100, "late")
        raise AssertionError("approved payout changed")
    except Exception as e:  # noqa: BLE001
        assert getattr(e, "code", "") == "PAYOUT_LOCKED"
    assert json and PNG and datetime  # noqa
