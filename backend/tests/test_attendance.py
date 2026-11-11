"""Part D acceptance tests. Pin 12.9784, 77.6408. Booking tomorrow 19:00–20:00 IST."""
import os

from sqlalchemy import func, select

from app.core import clock
from app.models import AttendanceEvent, AttendanceRecord
from conftest import H, PNG, admin, at, customer_with_address, login, make_chef, tomorrow, trial_body

V = "/api/v1"
NEAR = {"lat": 12.97948, "lng": 77.6408, "accuracy": 10, "deviceId": "test-device"}  # 120 m
FAR = {"lat": 12.98155, "lng": 77.6408, "accuracy": 10}  # 350 m


def png() -> bytes:
    return PNG + os.urandom(16)


def setup(client, otp, db):
    asha = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, "9876570001")
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"]), headers=c["h"]).json()["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(asha.id)}, headers=ops["h"])
    visit = client.get(f"{V}/visits", headers=c["h"]).json()[0]
    chef = login(client, otp, "9111100001", "chef")
    return visit["id"], visit["checkInCode"], H(chef), c, ops


def photo(client, h, vid, kind, data=None, ctype="image/png"):
    return client.post(f"{V}/visits/{vid}/photos", data={"kind": kind}, files={"file": ("p.png", data or png(), ctype)}, headers=h)


def code_of(r):
    return r.json()["error"]["code"]


def test_check_in_acceptance_table(client, otp, db):
    vid, code, h, cust, ops = setup(client, otp, db)
    assert code and len(code) == 4
    d = tomorrow()
    selfie = photo(client, h, vid, "check_in_selfie").json()["id"]
    ci = lambda pos, **kw: client.post(f"{V}/visits/{vid}/check-in", json={**pos, "code": code, "selfiePhotoId": selfie, **kw}, headers=h)  # noqa: E731

    clock.frozen = at(d, 18, 55)
    assert code_of(ci(FAR)) == "CHECKIN_TOO_FAR"                       # 2
    clock.frozen = at(d, 18, 20)
    assert code_of(ci(NEAR)) == "CHECKIN_TOO_EARLY"                    # 3
    clock.frozen = at(d, 19, 45)
    assert code_of(ci(NEAR)) == "CHECKIN_TOO_LATE"                     # 4
    clock.frozen = at(d, 19, 0)
    r = ci({**NEAR, "accuracy": 250})
    assert code_of(r) == "GPS_ACCURACY_POOR"                           # 5
    r = client.post(f"{V}/visits/{vid}/check-out", json={**NEAR}, headers=h)
    assert code_of(r) == "CHECKOUT_BEFORE_CHECKIN"                     # 7
    clock.frozen = at(d, 18, 50)
    wrong = "0000" if code != "0000" else "1111"
    r1 = ci(NEAR, code=wrong)
    r2 = ci(NEAR, selfiePhotoId=None)
    assert code_of(r1) == "CHECKIN_CODE_INVALID" and r1.json()["error"]["attemptsRemaining"] == 4  # 8
    assert code_of(r2) == "SELFIE_REQUIRED" and code_of(r1) != code_of(r2)

    clock.frozen = at(d, 18, 40)
    first = ci(NEAR)                                                    # 1
    assert first.status_code == 200, first.text
    again = ci(NEAR)                                                    # 6
    assert again.json()["id"] == first.json()["id"]
    assert db.scalar(select(func.count()).select_from(AttendanceRecord)) == 1
    # The customer no longer sees a used code.
    assert client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()["checkInCode"] is None

    clock.frozen = at(d, 19, 41)
    s2 = photo(client, h, vid, "check_out_selfie").json()["id"]
    r = client.post(f"{V}/visits/{vid}/check-out", json={**NEAR, "selfiePhotoId": s2}, headers=h)
    assert code_of(r) == "FOOD_PHOTO_REQUIRED"                          # 9
    food = photo(client, h, vid, "food").json()["id"]
    r = client.post(f"{V}/visits/{vid}/check-out", json={**NEAR, "selfiePhotoId": s2, "foodPhotoId": food,
                                                          "workedMinutes": 999}, headers=h)
    assert r.status_code == 200 and r.json()["workedMinutes"] == 61 and r.json()["status"] == "ok"
    # Every attempt is in the audit trail with position, accuracy and device.
    ev = db.scalars(select(AttendanceEvent).where(AttendanceEvent.kind == "check_in")).all()
    assert {e.result for e in ev} >= {"CHECKIN_TOO_FAR", "CHECKIN_TOO_EARLY", "GPS_ACCURACY_POOR", "OK"}
    assert any(e.device_id == "test-device" for e in ev)
    # Trial completed → customer must decide.
    trial = client.get(f"{V}/trials", headers=cust["h"]).json()[0]
    assert trial["status"] == "completed" and trial["allowedDecisions"] == ["subscribe", "another_trial"]


def test_five_wrong_codes_lock(client, otp, db):
    vid, code, h, *_ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 50)
    wrong = "0000" if code != "0000" else "1111"
    results = [client.post(f"{V}/visits/{vid}/check-in/verify-code", json={"code": wrong}, headers=h).json()["error"] for _ in range(5)]
    assert results[-1]["attemptsRemaining"] == 0
    r = client.post(f"{V}/visits/{vid}/check-in/verify-code", json={"code": code}, headers=h)
    assert code_of(r) == "CHECKIN_LOCKED"


def test_photo_validation(client, otp, db):
    vid, _, h, *_ = setup(client, otp, db)
    assert code_of(photo(client, h, vid, "check_in_selfie", b"GIF89a" + b"0" * 40, "image/gif")) == "PHOTO_INVALID_TYPE"
    assert code_of(photo(client, h, vid, "check_in_selfie", PNG + b"0" * (5 * 1024 * 1024))) == "PHOTO_TOO_LARGE"
    same = png()
    assert photo(client, h, vid, "check_in_selfie", same).status_code == 201
    assert code_of(photo(client, h, vid, "check_in_selfie", same)) == "PHOTO_REUSED"


def test_short_visit_flagged_and_customer_unavailable(client, otp, db):
    vid, code, h, cust, ops = setup(client, otp, db)
    d = tomorrow()
    clock.frozen = at(d, 18, 20)
    early =client.post(f"{V}/visits/{vid}/customer-unavailable", json={**NEAR, "note": "No answer"}, headers=h)
    assert code_of(early) == "CHECKIN_TOO_EARLY"
    clock.frozen = at(d, 19, 5)
    r = client.post(f"{V}/visits/{vid}/customer-unavailable", json={**NEAR, "note": "No answer"}, headers=h)
    assert r.status_code == 200 and r.json()["exception"] == "customer_unavailable"
    rows = client.get(f"{V}/admin/attendance?status=exception", headers=ops["h"]).json()
    assert rows and rows[0]["exception"] == "customer_unavailable"
    res = client.post(f"{V}/admin/attendance/{rows[0]['id']}/resolve", json={"resolution": "Customer confirmed absence"}, headers=ops["h"])
    assert res.json()["status"] == "resolved"


def test_other_chef_cannot_touch_visit(client, otp, db):
    vid, code, *_ = setup(client, otp, db)
    make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    other = H(login(client, otp, "9111100002", "chef"))
    assert client.get(f"{V}/visits/{vid}", headers=other).status_code == 404
    assert client.post(f"{V}/visits/{vid}/check-in", json={**NEAR, "code": code}, headers=other).status_code == 404
