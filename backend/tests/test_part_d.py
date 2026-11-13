"""Part D: boundaries, validation, code lock visibility, concurrency, auto-closure, admin review, photo access, S3 storage.
Customer pin 12.9784, 77.6408; visit tomorrow 19:00–20:00 IST (see test_attendance.setup)."""
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from botocore.stub import Stubber
from conftest import (
    PIN,
    H,
    at,
    customer_with_address,
    login,
    make_chef,
    tomorrow,
    trial_body,
)
from sqlalchemy import func, select
from test_attendance import NEAR, code_of, photo, setup

from app.core import clock
from app.core.database import SessionLocal
from app.domain.geo import haversine_km
from app.models import AttendanceRecord, AuditLog, Visit
from app.services import attendance
from app.services.storage import S3Storage, storage

V = "/api/v1"
LAT, LNG = PIN


def offset_north(metres: float) -> float:
    return LAT + metres / 111_194.9  # degrees of latitude per metre on the haversine sphere (R = 6371 km)


def check_in(client, h, vid, code, pos=None, **extra):
    sid = photo(client, h, vid, "check_in_selfie").json()["id"]
    return client.post(f"{V}/visits/{vid}/check-in", json={**(pos or NEAR), "code": code, "selfiePhotoId": sid, **extra}, headers=h)


def check_out(client, h, vid):
    s = photo(client, h, vid, "check_out_selfie").json()["id"]
    f = photo(client, h, vid, "food").json()["id"]
    return client.post(f"{V}/visits/{vid}/check-out", json={**NEAR, "selfiePhotoId": s, "foodPhotoId": f}, headers=h)


# ---------------- D1: GPS validation ----------------
@pytest.mark.parametrize("pos,expected", [
    ({"lat": "nan", "lng": "nan", "accuracy": 5}, "LOCATION_REQUIRED"),
    ({"lat": LAT, "lng": LNG, "accuracy": "nan"}, "GPS_ACCURACY_POOR"),
    ({"lat": 91, "lng": LNG, "accuracy": 5}, "LOCATION_REQUIRED"),
    ({"lat": LAT, "lng": 181, "accuracy": 5}, "LOCATION_REQUIRED"),
    ({"lat": 0, "lng": 0, "accuracy": 5}, "LOCATION_REQUIRED"),
    ({"lat": LAT, "lng": LNG}, "GPS_ACCURACY_POOR"),
    ({"lat": LAT, "lng": LNG, "accuracy": -1}, "GPS_ACCURACY_POOR"),
    ({"accuracy": 5}, "LOCATION_REQUIRED"),
])
def test_invalid_or_missing_coordinates_rejected(client, otp, db, pos, expected):
    vid, code, h, *_ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 55)
    r = check_in(client, h, vid, code, pos)
    assert r.status_code == 422 and code_of(r) == expected
    db.expire_all()
    assert db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == int(vid))) is None


def test_radius_and_accuracy_boundaries(client, otp, db):
    vid, code, h, *_ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 55)
    far = {"lat": offset_north(201), "lng": LNG, "accuracy": 10}
    assert haversine_km(far["lat"], LNG, LAT, LNG) * 1000 > 200
    assert code_of(check_in(client, h, vid, code, far)) == "CHECKIN_TOO_FAR"
    assert code_of(check_in(client, h, vid, code, {**NEAR, "accuracy": 100.5})) == "GPS_ACCURACY_POOR"
    near = {"lat": offset_north(199), "lng": LNG, "accuracy": 100}  # accuracy exactly at the limit is accepted
    r = check_in(client, h, vid, code, near)
    assert r.status_code == 200 and 198 <= r.json()["checkInDistanceM"] <= 200


@pytest.mark.parametrize("hh,mm,ss,ok", [(18, 30, 0, True), (18, 29, 59, False), (19, 30, 0, True), (19, 30, 1, False)])
def test_window_boundaries(client, otp, db, hh, mm, ss, ok):
    vid, code, h, *_ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), hh, mm) + timedelta(seconds=ss)
    r = check_in(client, h, vid, code)
    if ok:
        assert r.status_code == 200, r.text
    else:
        assert code_of(r) == ("CHECKIN_TOO_EARLY" if hh == 18 else "CHECKIN_TOO_LATE")


def test_customer_cannot_check_in_and_unassigned_chef_cannot(client, otp, db):
    vid, code, _, cust, _ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 55)
    assert client.post(f"{V}/visits/{vid}/check-in", json={**NEAR, "code": code, "selfiePhotoId": "1"}, headers=cust["h"]).status_code == 403
    make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    other = H(login(client, otp, "9111100002", "chef"))
    assert photo(client, other, vid, "check_in_selfie").status_code == 404


# ---------------- D2: code ----------------
def test_lockout_is_visible_to_admin_and_stays_locked(client, otp, db):
    vid, code, h, _, ops = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 50)
    wrong = "0000" if code != "0000" else "1111"
    for _ in range(5):
        client.post(f"{V}/visits/{vid}/check-in/verify-code", json={"code": wrong}, headers=h)
    rows = client.get(f"{V}/admin/attendance?status=exception", headers=ops["h"]).json()
    assert [(r["visitId"], r["exception"], r["codeAttempts"]) for r in rows] == [(vid, "code_locked", 5)]
    assert code_of(check_in(client, h, vid, code)) == "CHECKIN_LOCKED"  # even the right code
    detail = client.get(f"{V}/admin/attendance/{rows[0]['id']}", headers=ops["h"]).json()
    assert sum(e["result"] == "CHECKIN_CODE_INVALID" for e in detail["events"]) == 5


def test_code_from_another_booking_is_rejected(client, otp, db):
    vid, code, h, _, ops = setup(client, otp, db)
    other = customer_with_address(client, otp, "9876570002", "Other")
    rid = client.post(f"{V}/requests", json=trial_body("custom_time", other["addressId"], slot="morning"), headers=other["h"]).json()["id"]
    chef = db.scalar(select(Visit.chef_id).where(Visit.id == int(vid)))
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef)}, headers=ops["h"]).status_code == 200
    other_code = client.get(f"{V}/visits", headers=other["h"]).json()[0]["checkInCode"]
    if other_code == code:
        pytest.skip("the two random codes happened to be equal (1 in 10,000)")
    clock.frozen = at(tomorrow(), 18, 55)
    assert code_of(check_in(client, h, vid, other_code)) == "CHECKIN_CODE_INVALID"
    assert check_in(client, h, vid, code).status_code == 200


def test_code_is_single_use_and_never_shown_after_use(client, otp, db):
    vid, code, h, cust, _ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 55)
    assert check_in(client, h, vid, code).status_code == 200
    r = client.post(f"{V}/visits/{vid}/check-in/verify-code", json={"code": code}, headers=h)
    assert code_of(r) == "CHECKIN_CODE_USED"
    assert client.get(f"{V}/visits/{vid}", headers=cust["h"]).json()["checkInCode"] is None
    assert client.get(f"{V}/visits/{vid}", headers=h).json().get("checkInCode") is None  # never shown to the chef


def test_customer_sees_only_own_code(client, otp, db):
    vid, _, *_ = setup(client, otp, db)
    stranger = customer_with_address(client, otp, "9876570003", "Stranger")
    assert client.get(f"{V}/visits/{vid}", headers=stranger["h"]).status_code == 404
    assert all(v["id"] != vid for v in client.get(f"{V}/visits", headers=stranger["h"]).json())


def test_concurrent_check_ins_make_one_record(client, otp, db):
    vid, code, h, *_ = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 18, 55)
    sid = photo(client, h, vid, "check_in_selfie").json()["id"]
    body = {**NEAR, "code": code, "selfiePhotoId": sid}
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda _: client.post(f"{V}/visits/{vid}/check-in", json=body, headers=h), range(6)))
    assert {r.status_code for r in results} == {200}
    assert len({r.json()["id"] for r in results}) == 1
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(AttendanceRecord).where(AttendanceRecord.visit_id == int(vid))) == 1


# ---------------- D3/D4: photos and check-out ----------------
def test_check_out_rules_and_server_time(client, otp, db):
    vid, code, h, *_ = setup(client, otp, db)
    d = tomorrow()
    clock.frozen = at(d, 18, 55)
    assert code_of(client.post(f"{V}/visits/{vid}/check-out", json={}, headers=h)) == "CHECKOUT_BEFORE_CHECKIN"
    assert check_in(client, h, vid, code).status_code == 200
    s = photo(client, h, vid, "check_out_selfie").json()["id"]
    assert code_of(client.post(f"{V}/visits/{vid}/check-out", json={"foodPhotoId": None}, headers=h)) == "SELFIE_REQUIRED"
    assert code_of(client.post(f"{V}/visits/{vid}/check-out", json={"selfiePhotoId": s}, headers=h)) == "FOOD_PHOTO_REQUIRED"
    f = photo(client, h, vid, "food").json()["id"]
    clock.frozen = at(d, 19, 55)
    # A phone-sent time or duration is ignored; a non-finite position is simply not recorded.
    body = {"selfiePhotoId": s, "foodPhotoId": f, "lat": "nan", "lng": 77.64, "checkOutAt": "2000-01-01T00:00:00Z", "workedMinutes": 999}
    first = client.post(f"{V}/visits/{vid}/check-out", json=body, headers=h)
    assert first.status_code == 200 and first.json()["workedMinutes"] == 60 and first.json()["status"] == "ok"
    again = client.post(f"{V}/visits/{vid}/check-out", json=body, headers=h)
    assert again.json() == first.json()  # retry: same record, nothing double-counted
    assert client.get(f"{V}/visits/{vid}", headers=h).json()["status"] == "completed"


def test_photo_access_by_role_and_missing_file(client, otp, db):
    vid, _, h, cust, ops = setup(client, otp, db)
    pid = photo(client, h, vid, "check_in_selfie").json()["id"]
    assert client.get(f"{V}/media/photos/{pid}", headers=h).status_code == 200
    assert client.get(f"{V}/media/photos/{pid}", headers=ops["h"]).status_code == 200
    assert client.get(f"{V}/media/photos/{pid}", headers=cust["h"]).status_code == 404
    assert client.get(f"{V}/media/photos/{pid}").status_code == 401
    make_chef(db, "9111100002", "Esha", 12.9988, 77.6590, 4.4)
    assert client.get(f"{V}/media/photos/{pid}", headers=H(login(client, otp, "9111100002", "chef"))).status_code == 404
    from app.models import Photo
    key = db.get(Photo, int(pid)).storage_key
    storage.delete(key)  # e.g. wiped by a redeploy
    r = client.get(f"{V}/media/photos/{pid}", headers=ops["h"])
    assert r.status_code == 404 and code_of(r) == "FILE_NOT_FOUND"


def test_s3_storage_put_get_delete():
    import boto3
    client = boto3.client("s3", region_name="auto", endpoint_url="https://example.r2.cloudflarestorage.com",
                          aws_access_key_id="test", aws_secret_access_key="test")
    s3 = S3Storage("delco-media", client)
    with Stubber(client) as stub:
        stub.add_response("put_object", {})
        key = s3.put("visits/1", b"\x89PNGdata", "png")
        assert key.startswith("visits/1/") and key.endswith(".png")
        from botocore.response import StreamingBody
        stub.add_response("get_object", {"Body": StreamingBody(io.BytesIO(b"\x89PNGdata"), 8)}, {"Bucket": "delco-media", "Key": key})
        assert s3.get(key) == b"\x89PNGdata"
        stub.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404)
        with pytest.raises(Exception) as e:
            s3.get("visits/1/missing.png")
        assert getattr(e.value, "code", None) == "FILE_NOT_FOUND"
        stub.add_response("delete_object", {}, {"Bucket": "delco-media", "Key": key})
        s3.delete(key)


# ---------------- D4: automatic closure ----------------
def _checked_in(client, otp, db):
    vid, code, h, _, ops = setup(client, otp, db)
    clock.frozen = at(tomorrow(), 19, 0)
    assert check_in(client, h, vid, code).status_code == 200
    return vid, h, ops


def test_auto_close_boundary_idempotent(client, otp, db):
    vid, _, ops = _checked_in(client, otp, db)
    d = tomorrow()
    clock.frozen = at(d, 20, 30)  # exactly end + 30: not yet
    assert attendance.auto_close(SessionLocal()) == 0
    clock.frozen = at(d, 20, 31)
    assert attendance.auto_close(SessionLocal()) == 1
    assert attendance.auto_close(SessionLocal()) == 0  # repeated run changes nothing
    db.expire_all()
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.visit_id == int(vid)))
    assert (rec.status, rec.exception, rec.worked_minutes) == ("needs_review", "missing_check_out", 60)
    assert rec.check_out_at == at(d, 20, 0) and rec.check_in_selfie_id is not None  # evidence kept
    rows = client.get(f"{V}/admin/attendance?status=exception", headers=ops["h"]).json()
    assert rows[0]["exception"] == "missing_check_out"


def test_auto_close_concurrent_workers_close_once(client, otp, db):
    _checked_in(client, otp, db)
    clock.frozen = at(tomorrow(), 21, 0)

    def run(_):
        s = SessionLocal()
        try:
            return attendance.auto_close(s)
        finally:
            s.close()
    with ThreadPoolExecutor(max_workers=4) as ex:
        assert sum(ex.map(run, range(4))) == 1


# ---------------- D5: admin review ----------------
def _needs_review(client, otp, db):
    _, h, ops = _checked_in(client, otp, db)
    clock.frozen = at(tomorrow(), 21, 0)
    attendance.auto_close(SessionLocal())
    rid = client.get(f"{V}/admin/attendance?status=exception", headers=ops["h"]).json()[0]["id"]
    return rid, h, ops


def test_admin_reject_requires_reason_and_zeroes_pay(client, otp, db):
    rid, h, ops = _needs_review(client, otp, db)
    url = f"{V}/admin/attendance/{rid}/resolve"
    assert client.post(url, json={"decision": "reject", "resolution": "no"}, headers=ops["h"]).status_code == 422
    assert client.post(url, json={"decision": "approve", "resolution": "ok"}, headers=h).status_code == 403  # chef
    r = client.post(url, json={"decision": "reject", "resolution": "Customer says chef left at 19:20"}, headers=ops["h"])
    assert r.status_code == 200
    j = r.json()
    assert (j["status"], j["decision"], j["workedMinutes"]) == ("resolved", "rejected", 0)
    assert j["reviewedBy"] == "Ops Person" and j["reviewedAt"]
    again = client.post(url, json={"decision": "approve", "resolution": "changed my mind"}, headers=ops["h"])
    assert again.status_code == 409 and code_of(again) == "ATTENDANCE_ALREADY_REVIEWED"
    db.expire_all()
    log = db.scalar(select(AuditLog).where(AuditLog.target == f"Attendance {rid}"))
    assert log.action == "Rejected attendance" and log.meta["worked_minutes_before"] == 60 and log.meta["worked_minutes_after"] == 0


def test_admin_approve_with_correction(client, otp, db):
    rid, _, ops = _needs_review(client, otp, db)
    r = client.post(f"{V}/admin/attendance/{rid}/resolve",
                    json={"decision": "approve", "resolution": "Chef called; left 19:45", "workedMinutes": 45}, headers=ops["h"])
    j = r.json()
    assert (j["decision"], j["workedMinutes"], j["status"]) == ("approved", 45, "resolved")


def test_customer_cannot_review(client, otp, db):
    rid, _, _ = _needs_review(client, otp, db)
    cust = customer_with_address(client, otp, "9876570004", "Cust")
    assert client.post(f"{V}/admin/attendance/{rid}/resolve", json={"resolution": "x"}, headers=cust["h"]).status_code == 403
    assert client.get(f"{V}/admin/attendance/{rid}", headers=cust["h"]).status_code == 403
