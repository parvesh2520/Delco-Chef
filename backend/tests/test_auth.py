from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.models import AuditLog, OtpChallenge
from conftest import H, admin, customer_with_address, login, make_user, trial_body

V = "/api/v1"


def test_sixth_otp_request_in_an_hour_is_refused(client):
    for _ in range(5):
        assert client.post(f"{V}/auth/otp/request", json={"phone": "9876500001", "portal": "customer"}).status_code == 200
    r = client.post(f"{V}/auth/otp/request", json={"phone": "9876500001", "portal": "customer"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "OTP_RATE_LIMITED"
    assert r.json()["error"]["retryAfter"] > 0 and int(r.headers["Retry-After"]) > 0


def test_expired_and_used_otp_fail(client, otp, db):
    client.post(f"{V}/auth/otp/request", json={"phone": "9876500002", "portal": "customer"})
    db.execute(update(OtpChallenge).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    db.commit()
    r = client.post(f"{V}/auth/otp/verify", json={"phone": "9876500002", "code": otp.codes["9876500002"], "portal": "customer"})
    assert r.json()["error"]["code"] == "OTP_EXPIRED"
    client.post(f"{V}/auth/otp/request", json={"phone": "9876500002", "portal": "customer"})
    body = {"phone": "9876500002", "code": otp.codes["9876500002"], "portal": "customer"}
    assert client.post(f"{V}/auth/otp/verify", json=body).status_code == 200
    r = client.post(f"{V}/auth/otp/verify", json=body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "OTP_NOT_FOUND"


def test_five_wrong_attempts_lock_for_15_minutes(client, otp):
    client.post(f"{V}/auth/otp/request", json={"phone": "9876500003", "portal": "customer"})
    wrong = "000000" if otp.codes["9876500003"] != "000000" else "111111"
    codes = [client.post(f"{V}/auth/otp/verify", json={"phone": "9876500003", "code": wrong, "portal": "customer"}).json()["error"]
             for _ in range(5)]
    assert codes[0]["code"] == "OTP_INVALID" and codes[0]["attemptsRemaining"] == 4
    assert codes[-1]["code"] == "OTP_LOCKED"
    r = client.post(f"{V}/auth/otp/request", json={"phone": "9876500003", "portal": "customer"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "OTP_LOCKED" and r.json()["error"]["retryAfter"] > 800


def test_otp_is_stored_hashed_only(client, otp, db):
    client.post(f"{V}/auth/otp/request", json={"phone": "9876500004", "portal": "customer"})
    row = db.scalar(select(OtpChallenge))
    assert otp.codes["9876500004"] not in row.code_hash and len(row.code_hash) == 64


def test_refresh_rotation_reuse_and_logout(client, otp):
    s = login(client, otp, "9876500005", "customer")
    r1 = client.post(f"{V}/auth/refresh", json={"refreshToken": s["refreshToken"]})
    assert r1.status_code == 200 and r1.json()["refreshToken"] != s["refreshToken"]
    # Reusing the rotated token revokes the session family.
    assert client.post(f"{V}/auth/refresh", json={"refreshToken": s["refreshToken"]}).json()["error"]["code"] == "REFRESH_REVOKED"
    assert client.post(f"{V}/auth/refresh", json={"refreshToken": r1.json()["refreshToken"]}).status_code == 401
    s2 = login(client, otp, "9876500005", "customer")
    assert client.post(f"{V}/auth/logout", json={"refreshToken": s2["refreshToken"]}, headers=H(s2)).status_code == 204
    assert client.get(f"{V}/customers/me", headers=H(s2)).status_code == 401
    assert client.post(f"{V}/auth/refresh", json={"refreshToken": s2["refreshToken"]}).status_code == 401


def test_protected_endpoint_without_token_is_401(client):
    for path in ("/customers/me", "/customers/me/addresses", "/admin/dashboard", "/chefs/me", "/payments", "/visits"):
        assert client.get(f"{V}{path}").status_code == 401, path


def test_other_customers_address_is_never_returned(client, otp):
    a = customer_with_address(client, otp, "9876500006")
    b = customer_with_address(client, otp, "9876500007")
    r = client.get(f"{V}/customers/me/addresses/{a['addressId']}", headers=b["h"])
    assert r.status_code == 404 and "Test Road" not in r.text
    r = client.post(f"{V}/requests", json=trial_body("monthly_subscription", a["addressId"]), headers=b["h"])
    assert r.status_code == 422 and "addressId" in r.json()["error"]["fields"]


def test_unprovisioned_admin_refused_and_audited(client, otp, db):
    r = client.post(f"{V}/auth/otp/request", json={"phone": "9123400000", "portal": "admin"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "ADMIN_NOT_AUTHORIZED"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Unauthorized admin sign-in attempt")) is not None


def test_otp_never_creates_admin_and_customer_cannot_use_admin_api(client, otp, db):
    cust = login(client, otp, "9876500008", "customer")
    assert client.post(f"{V}/auth/otp/request", json={"phone": "9876500008", "portal": "admin"}).status_code == 403
    for path in ("/admin/dashboard", "/admin/requests", "/admin/settings", "/admin/admins"):
        assert client.get(f"{V}{path}", headers=H(cust)).status_code == 403, path
    make_user(db, "chef", "9111100000", "Chef One")
    chef = login(client, otp, "9111100000", "chef")
    assert client.get(f"{V}/admin/dashboard", headers=H(chef)).status_code == 403
    assert client.post(f"{V}/admin/requests/1/assign", json={"chefId": "1"}, headers=H(chef)).status_code == 403
    assert client.post(f"{V}/admin/requests/1/assign", json={"chefId": "1"}, headers=H(cust)).status_code == 403


def test_one_role_per_phone(client, otp):
    login(client, otp, "9876500009", "customer")
    r = client.post(f"{V}/auth/otp/request", json={"phone": "9876500009", "portal": "chef"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "ROLE_MISMATCH"


def test_only_super_admin_creates_admins(client, otp, db):
    ops = admin(client, otp, db)
    assert client.post(f"{V}/admin/admins", json={"name": "New Ops", "phone": "9000000099", "email": "o@example.com", "role": "ops_admin"},
                       headers=ops["h"]).status_code == 403
    sup = admin(client, otp, db, "super_admin", "9000000002")
    r = client.post(f"{V}/admin/admins", json={"name": "New Ops", "phone": "9000000099", "email": "o@example.com", "role": "ops_admin"},
                    headers=sup["h"])
    assert r.status_code == 201 and "•" in r.json()["phone"]
    assert login(client, otp, "9000000099", "admin")["user"]["role"] == "ops_admin"


def test_invalid_phone_and_latitude_outside_india(client, otp):
    r = client.post(f"{V}/auth/otp/request", json={"phone": "12345", "portal": "customer"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_PHONE"
    s = login(client, otp, "9876500010", "customer")
    r = client.post(f"{V}/customers/me/addresses", json={"line1": "1 Somewhere", "city": "London", "pincode": "123456", "lat": 51.5,
                                                         "lng": -0.12}, headers=H(s))
    assert r.status_code == 422 and r.json()["error"]["fields"]["lat"] == "Location must be within India."


def test_name_length_and_max_three_addresses(client, otp):
    s = customer_with_address(client, otp, "9876500011")
    assert client.patch(f"{V}/customers/me", json={"fullName": "A"}, headers=s["h"]).json()["error"]["fields"]["fullName"]
    for i in range(2):
        assert client.post(f"{V}/customers/me/addresses", json={"label": f"A{i}", "line1": "2 Road", "city": "Bengaluru",
                                                                 "pincode": "560001", "lat": 12.97, "lng": 77.6}, headers=s["h"]).status_code == 201
    r = client.post(f"{V}/customers/me/addresses", json={"label": "X", "line1": "3 Road", "city": "Bengaluru", "pincode": "560001",
                                                         "lat": 12.97, "lng": 77.6}, headers=s["h"])
    assert r.json()["error"]["code"] == "ADDRESS_LIMIT"
    defaults = [a for a in client.get(f"{V}/customers/me/addresses", headers=s["h"]).json() if a["isDefault"]]
    assert len(defaults) == 1


def test_new_customer_end_to_end_onboarding(client, otp):
    s = customer_with_address(client, otp, "9876500012", "New Person")
    assert s["onboarded"] is False
    assert client.post(f"{V}/customers/me/consent", json={"kinds": ["terms", "location"]}, headers=s["h"]).status_code == 200
    assert client.post(f"{V}/customers/me/onboarding/complete", headers=s["h"]).json()["onboarded"] is True
    services = client.get(f"{V}/services", headers=s["h"]).json()
    assert [x["type"] for x in services] == ["monthly_subscription", "custom_time", "home_food", "party_mode"]
    assert services[0]["eligibility"]["trialStatus"] == "not_started"
    r = client.post(f"{V}/requests", json=trial_body("monthly_subscription", s["addressId"]), headers=s["h"])
    assert r.status_code == 201 and r.json()["status"] == "pending_assignment"
    me = client.get(f"{V}/auth/me", headers=s["h"]).json()
    assert me["onboarded"] is True and me["user"]["fullName"] == "New Person"
