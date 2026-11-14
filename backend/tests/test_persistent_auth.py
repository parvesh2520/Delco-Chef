"""Persistent sessions: lifetimes, sliding rotation, lost-response grace, replay detection, per-device logout, roles."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.core.security import JWT_AUDIENCE, secret_hash
from app.models import RefreshToken
from app.services import auth as auth_svc
from tests.conftest import H, admin, login, make_user

V = "/api/v1"


def refresh(client, token):
    return client.post(f"{V}/auth/refresh", json={"refreshToken": token})


def live_rows(db, sid):
    db.expire_all()
    return db.scalars(select(RefreshToken).where(RefreshToken.session_id == sid, RefreshToken.rotated_at.is_(None),
                                                 RefreshToken.revoked_at.is_(None))).all()


def claims(s):
    return jwt.decode(s["token"], settings.SECRET_KEY, algorithms=["HS256"], audience=JWT_AUDIENCE)


def shift_clock(monkeypatch, delta):
    real = auth_svc.now
    monkeypatch.setattr(auth_svc, "now", lambda: real() + delta)


def test_login_creates_session_with_configured_lifetimes(client, otp, db):
    s = login(client, otp, "9876511001", "customer")
    c = claims(s)
    assert c["exp"] - c["iat"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 == s["expiresIn"] == 900
    assert c["iss"] == "delco-chefs" and c["aud"] == JWT_AUDIENCE and c["role"] == "customer"
    row = db.scalar(select(RefreshToken).where(RefreshToken.session_id == c["sid"]))
    assert row.token_hash == secret_hash(s["refreshToken"]) and s["refreshToken"] not in row.token_hash
    assert timedelta(days=29, hours=23) < row.expires_at - row.created_at <= timedelta(days=30, minutes=1)
    assert client.get(f"{V}/customers/me", headers=H(s)).status_code == 200


def test_expired_access_token_is_rejected_then_refresh_restores(client, otp, monkeypatch):
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", -1)
    s = login(client, otp, "9876511002", "customer")
    r = client.get(f"{V}/customers/me", headers=H(s))
    assert r.status_code == 401 and r.json()["error"]["code"] == "TOKEN_EXPIRED"
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15)
    r1 = refresh(client, s["refreshToken"])
    assert r1.status_code == 200 and r1.json()["user"]["role"] == "customer"
    assert client.get(f"{V}/customers/me", headers=H(r1.json())).status_code == 200


def test_token_without_audience_is_rejected(client, otp):
    s = login(client, otp, "9876511003", "customer")
    c = claims(s)
    del c["aud"]
    forged = jwt.encode(c, settings.SECRET_KEY, algorithm="HS256")
    assert client.get(f"{V}/customers/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_rotation_is_sliding_and_keeps_one_live_token(client, otp, db, monkeypatch):
    s = login(client, otp, "9876511004", "customer")
    sid = claims(s)["sid"]
    shift_clock(monkeypatch, timedelta(days=20))
    r1 = refresh(client, s["refreshToken"]).json()
    assert r1["refreshToken"] != s["refreshToken"] and claims(r1)["sid"] == sid
    [head] = live_rows(db, sid)
    assert head.token_hash == secret_hash(r1["refreshToken"])
    assert head.expires_at - head.created_at > timedelta(days=29)  # extended from the refresh, not from login


def test_old_token_reuse_after_grace_revokes_only_that_session(client, otp, monkeypatch):
    phone = "9876511005"
    a = login(client, otp, phone, "customer")
    b = login(client, otp, phone, "customer")  # second device
    a1 = refresh(client, a["refreshToken"]).json()
    shift_clock(monkeypatch, timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS + 1))
    r = refresh(client, a["refreshToken"])
    assert r.status_code == 401 and r.json()["error"]["code"] == "REFRESH_REVOKED"
    assert refresh(client, a1["refreshToken"]).status_code == 401  # whole family is dead
    assert client.get(f"{V}/customers/me", headers=H(a1)).status_code == 401
    # The other device is untouched.
    assert client.get(f"{V}/customers/me", headers=H(b)).status_code == 200
    assert refresh(client, b["refreshToken"]).status_code == 200


def test_lost_response_retry_within_grace_keeps_session(client, otp, db):
    s = login(client, otp, "9876511006", "customer")
    sid = claims(s)["sid"]
    lost = refresh(client, s["refreshToken"]).json()  # the phone never receives this
    again = refresh(client, s["refreshToken"])
    assert again.status_code == 200
    [head] = live_rows(db, sid)
    assert head.token_hash == secret_hash(again.json()["refreshToken"])
    assert refresh(client, again.json()["refreshToken"]).status_code == 200
    # The undelivered token was superseded: presenting it later is a replay and ends the session.
    assert refresh(client, lost["refreshToken"]).json()["error"]["code"] == "REFRESH_REVOKED"


def test_older_rotated_token_is_replay_even_within_grace(client, otp):
    s = login(client, otp, "9876511007", "customer")
    r1 = refresh(client, s["refreshToken"]).json()
    r2 = refresh(client, r1["refreshToken"]).json()
    assert refresh(client, s["refreshToken"]).json()["error"]["code"] == "REFRESH_REVOKED"
    assert refresh(client, r2["refreshToken"]).status_code == 401


def test_expired_refresh_token_rejected(client, otp, monkeypatch):
    s = login(client, otp, "9876511008", "customer")
    shift_clock(monkeypatch, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS, seconds=1))
    r = refresh(client, s["refreshToken"])
    assert r.status_code == 401 and r.json()["error"]["code"] == "REFRESH_EXPIRED"


def test_unknown_refresh_token_rejected(client):
    assert refresh(client, "not-a-real-token").json()["error"]["code"] == "REFRESH_INVALID"


def test_revoked_session_cannot_refresh_and_logout_is_per_device(client, otp):
    phone = "9876511009"
    a = login(client, otp, phone, "customer")
    b = login(client, otp, phone, "customer")
    assert client.post(f"{V}/auth/logout", json={"refreshToken": a["refreshToken"]}, headers=H(a)).status_code == 204
    assert client.get(f"{V}/customers/me", headers=H(a)).json()["error"]["code"] == "SESSION_REVOKED"
    assert refresh(client, a["refreshToken"]).status_code == 401
    assert client.get(f"{V}/customers/me", headers=H(b)).status_code == 200
    assert refresh(client, b["refreshToken"]).status_code == 200


def test_end_session_from_another_device(client, otp):
    phone = "9876511010"
    a = login(client, otp, phone, "customer")
    b = login(client, otp, phone, "customer")
    sid_a = claims(a)["sid"]
    assert client.delete(f"{V}/auth/sessions/{sid_a}", headers=H(b)).status_code == 204
    assert refresh(client, a["refreshToken"]).status_code == 401
    assert client.get(f"{V}/customers/me", headers=H(b)).status_code == 200


def test_concurrent_refreshes_leave_exactly_one_live_token(client, otp, db):
    s = login(client, otp, "9876511011", "customer")
    sid = claims(s)["sid"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: refresh(client, s["refreshToken"]), range(6)))
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    live = live_rows(db, sid)
    assert len(live) == 1
    assert live[0].token_hash in {secret_hash(r.json()["refreshToken"]) for r in results}


def test_customer_cannot_touch_another_users_session(client, otp):
    a = login(client, otp, "9876511012", "customer")
    b = login(client, otp, "9876511013", "customer")
    # B ends A's session id and sends A's refresh token to logout: neither affects A.
    assert client.delete(f"{V}/auth/sessions/{claims(a)['sid']}", headers=H(b)).status_code == 204
    assert client.post(f"{V}/auth/logout", json={"refreshToken": a["refreshToken"]}, headers=H(b)).status_code == 204
    assert client.get(f"{V}/customers/me", headers=H(a)).status_code == 200
    assert refresh(client, a["refreshToken"]).status_code == 200
    assert client.get(f"{V}/customers/me", headers=H(b)).status_code == 401  # B logged out its own session
    ids = [x["id"] for x in client.get(f"{V}/auth/sessions", headers=H(a)).json()]
    assert ids == [claims(a)["sid"]]


def test_roles_survive_refresh_and_permissions_hold(client, otp, db):
    make_user(db, "chef", "9111111001", "Chef One")
    chef = refresh(client, login(client, otp, "9111111001", "chef")["refreshToken"]).json()
    ops = admin(client, otp, db)
    ops = refresh(client, ops["refreshToken"]).json()
    sup = admin(client, otp, db, role="super_admin", phone="9000000002")
    sup = refresh(client, sup["refreshToken"]).json()
    cust = refresh(client, login(client, otp, "9876511014", "customer")["refreshToken"]).json()
    assert [x["user"]["role"] for x in (chef, ops, sup, cust)] == ["chef", "ops_admin", "super_admin", "customer"]
    assert client.get(f"{V}/admin/dashboard", headers=H(ops)).status_code == 200
    assert client.get(f"{V}/admin/admins", headers=H(sup)).status_code == 200
    assert client.get(f"{V}/admin/admins", headers=H(ops)).status_code == 403
    for s in (chef, cust):
        assert client.get(f"{V}/admin/dashboard", headers=H(s)).status_code == 403
    assert client.get(f"{V}/customers/me", headers=H(chef)).status_code == 403
