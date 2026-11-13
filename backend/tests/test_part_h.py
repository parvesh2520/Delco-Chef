"""Part H: personal data protection — security tests beyond the PDF acceptance tests in test_privacy_tracking.py.
All data is disposable and created per test."""
import json
import logging
import sys
from datetime import timedelta

import pytest
from conftest import (
    H,
    admin,
    at,
    customer_with_address,
    login,
    make_chef,
    tomorrow,
    trial_body,
)
from cryptography.exceptions import InvalidTag
from sqlalchemy import select, text
from test_payments import subscribe

from app.core import clock
from app.core.errors import AppError
from app.core.logging import JsonFormatter, redact
from app.core.security import decrypt, encrypt, lookup_hash
from app.models import (
    AuditLog,
    ChefBankAccount,
    ChefDocument,
    DataExport,
    Payment,
    PaymentEvent,
    User,
    Visit,
)
from app.services import privacy
from app.services.storage import storage
from app.services.worker import deliver_outbox

V = "/api/v1"


# ---------------- H3: field encryption and keyed lookup ----------------
def test_encryption_is_randomised_authenticated_and_round_trips():
    a, b = encrypt("9876512345"), encrypt("9876512345")
    assert a != b and b"9876512345" not in a  # random nonce: equal plaintexts give different ciphertexts
    assert decrypt(a) == decrypt(b) == "9876512345"
    tampered = a[:-1] + bytes([a[-1] ^ 1])
    with pytest.raises(InvalidTag):  # GCM tag check: a modified ciphertext never decrypts
        decrypt(tampered)
    with pytest.raises(ValueError):
        decrypt(b"v9" + a[2:])  # unknown key version is refused, not guessed
    assert encrypt(None) is None and decrypt(None) is None


def test_hmac_lookup_finds_customer_without_decrypting(client, otp, db):
    customer_with_address(client, otp, "9876512345")
    h = lookup_hash("9876512345")
    assert h == lookup_hash(" 9876512345 ") and len(h) == 64 and "9876512345" not in h
    u = db.scalar(select(User).where(User.phone_hmac == h))
    assert u and u.role == "customer"
    # signing in again with the same number resolves to the same account via the keyed hash
    again = login(client, otp, "9876512345", "customer")
    assert again["user"]["id"] == str(u.id)


# ---------------- H4/H6: admin phone masking and audited reveal ----------------
def test_phone_reveal_needs_admin_and_reason_and_is_audited(client, otp, db):
    c = customer_with_address(client, otp, "9876581234")
    uid = c["user"]["id"]
    ops = admin(client, otp, db)
    masked = client.get(f"{V}/admin/customers/{uid}", headers=ops["h"]).json()["phone"]
    assert "9876581234" not in masked and masked.endswith("34")
    url = f"{V}/admin/users/{uid}/reveal-phone"
    assert client.post(url, json={}, headers=ops["h"]).status_code == 422  # why is mandatory
    assert client.post(url, json={"reason": "  "}, headers=ops["h"]).status_code == 422
    assert client.post(url, json={"reason": "Customer asked for a call back"}, headers=c["h"]).status_code == 403
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Revealed phone")) is None
    r = client.post(url, json={"reason": "Customer asked for a call back"}, headers=ops["h"])
    assert r.status_code == 200 and r.json()["phone"] == "9876581234"
    log = db.scalar(select(AuditLog).where(AuditLog.action == "Revealed phone"))
    assert (log.actor_id, log.actor_role, log.target, log.reason) == (int(ops["user"]["id"]), "ops_admin", f"User {uid}",
                                                                      "Customer asked for a call back")
    assert log.at is not None and "9876581234" not in json.dumps([log.target, log.reason, log.meta])


def test_chef_token_cannot_reveal_or_read_admin_data(client, otp, db):
    make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    chef = H(login(client, otp, "9111100001", "chef"))
    c = customer_with_address(client, otp, "9876581234")
    for method, path in (("post", f"/admin/users/{c['user']['id']}/reveal-phone"), ("get", f"/admin/customers/{c['user']['id']}"),
                         ("get", "/admin/audit-logs"), ("get", "/admin/chefs/1")):
        assert client.request(method.upper(), f"{V}{path}", json={"reason": "abc"} if method == "post" else None, headers=chef).status_code == 403
    assert client.post(f"{V}/privacy/export", headers=chef).status_code == 403  # export is the customer's own only


# ---------------- H4: chef contact window, reassignment, cancelled visits ----------------
def _assigned(client, otp, db, day):
    asha = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    esha = make_chef(db, "9111100002", "Esha", 12.9750, 77.6420, 4.5)
    ops = admin(client, otp, db)
    c = customer_with_address(client, otp, "9876580001")
    rid = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], day=day), headers=c["h"]).json()["id"]
    assert client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(asha.id)}, headers=ops["h"]).status_code == 200
    a = H(login(client, otp, "9111100001", "chef"))
    vid = client.get(f"{V}/visits", headers=a).json()[0]["id"]
    return ops, c, rid, vid, a, esha


def test_contact_window_edges(client, otp, db):
    day = tomorrow() + timedelta(days=3)
    _, _, _, vid, a, _ = _assigned(client, otp, db, day)
    v = db.get(Visit, int(vid))
    clock.frozen = v.starts_at - timedelta(days=3)  # three days away: refused (PDF acceptance test)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 403
    clock.frozen = v.starts_at - timedelta(hours=2, minutes=1)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 403
    assert "9876580001" not in client.get(f"{V}/visits/{vid}", headers=a).text
    clock.frozen = v.starts_at - timedelta(hours=2)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).json()["phone"] == "9876580001"
    clock.frozen = v.ends_at + timedelta(hours=2)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 200
    clock.frozen = v.ends_at + timedelta(hours=2, minutes=1)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 403
    assert "Test Road" not in client.get(f"{V}/visits/{vid}", headers=a).text


def test_reassignment_removes_previous_chef_access_at_once(client, otp, db):
    day = tomorrow() + timedelta(days=2)
    ops, _, rid, vid, a, esha = _assigned(client, otp, db, day)
    clock.frozen = at(day, 18, 0)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 200
    r = client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(esha.id), "reason": "Asha unwell", "visitId": vid},
                    headers=ops["h"])
    assert r.status_code == 200, r.text
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 404
    assert client.get(f"{V}/visits/{vid}", headers=a).status_code == 404
    assert all(x["id"] != vid for x in client.get(f"{V}/visits", headers=a).json())
    e = H(login(client, otp, "9111100002", "chef"))
    assert client.get(f"{V}/visits/{vid}/customer", headers=e).json()["address"]["line1"] == "12 Test Road"
    log = db.scalar(select(AuditLog).where(AuditLog.action == "Reassigned chef"))
    assert log.reason == "Asha unwell" and log.actor_role == "ops_admin" and log.meta["previous_chef_id"]
    assert db.scalar(select(AuditLog).where(AuditLog.action == "Assigned chef"))


def test_cancelled_visit_never_shows_contact_even_inside_window(client, otp, db):
    day = tomorrow() + timedelta(days=2)
    _, _, _, vid, a, _ = _assigned(client, otp, db, day)
    db.get(Visit, int(vid)).status = "cancelled"
    db.commit()
    clock.frozen = at(day, 18, 0)
    assert client.get(f"{V}/visits/{vid}/customer", headers=a).status_code == 404
    body = client.get(f"{V}/visits/{vid}", headers=a).json()
    assert body["customerPhone"] == "" and body["addressRevealed"] is False and "Test Road" not in json.dumps(body)


def test_customer_never_sees_chef_private_data(client, otp, db):
    day = tomorrow() + timedelta(days=2)
    _, c, _, vid, _, _ = _assigned(client, otp, db, day)
    db.add(ChefBankAccount(chef_id=db.get(Visit, int(vid)).chef_id, account_name="Asha", account_number_enc=encrypt("123456789"),
                           account_last4="6789", ifsc="HDFC0000001"))
    db.commit()
    clock.frozen = at(day, 18, 0)
    out = client.get(f"{V}/visits/{vid}", headers=c["h"]).text
    assert "Asha" in out and "9111100001" not in out and "6789" not in out and "12.9716" not in out
    assert client.get(f"{V}/admin/chefs/1", headers=c["h"]).status_code == 403


# ---------------- H5: chef documents ----------------
def test_documents_and_bank_are_super_admin_only(client, otp, db):
    chef = make_chef(db, "9111100001", "Asha", 12.9716, 77.6412, 4.6)
    d = ChefDocument(chef_id=chef.id, type="pan", value_enc=encrypt("ABCDE1234F"), last4="234F",
                     storage_key=storage.put(f"docs/{chef.id}", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "png"))
    db.add_all([d, ChefBankAccount(chef_id=chef.id, account_name="Asha", account_number_enc=encrypt("123456789"),
                                   account_last4="6789", ifsc="HDFC0000001")])
    db.commit()
    ops = admin(client, otp, db)
    sup = admin(client, otp, db, "super_admin", "9000000002")
    base = f"{V}/admin/chefs/{chef.id}"
    assert client.get(base, headers=ops["h"]).json()["bank"] is None
    assert client.post(f"{base}/bank/reveal", json={"reason": "Payout check"}, headers=ops["h"]).status_code == 403
    assert client.get(f"{base}/documents/{d.id}/file", headers=ops["h"]).status_code == 403
    assert client.post(f"{base}/documents/{d.id}/reveal", json={}, headers=sup["h"]).status_code == 422  # reason required
    # the chef's own profile shows masked values only; another chef's admin routes are refused
    own = H(login(client, otp, "9111100001", "chef"))
    me = client.get(f"{V}/chefs/me", headers=own).text
    assert "ABCDE1234F" not in me and "123456789" not in me and "234F" in me
    assert client.post(f"{base}/documents/{d.id}/reveal", json={"reason": "abc"}, headers=own).status_code == 403
    f = client.get(f"{base}/documents/{d.id}/file", headers=sup["h"])
    assert f.status_code == 200 and f.headers["cache-control"] == "no-store"
    assert client.post(f"{base}/bank/reveal", json={"reason": "Payout check"}, headers=sup["h"]).json()["accountNumber"] == "123456789"
    actions = set(db.scalars(select(AuditLog.action).where(AuditLog.actor_role == "super_admin")))
    assert {"Viewed document file", "Revealed bank account"} <= actions
    assert all("ABCDE1234F" not in (a.target + (a.reason or "")) for a in db.scalars(select(AuditLog)))


# ---------------- H6: audit log is read-only ----------------
def test_audit_log_api_is_read_only_and_super_admin_only(client, otp, db):
    ops = admin(client, otp, db)
    sup = admin(client, otp, db, "super_admin", "9000000002")
    assert client.get(f"{V}/admin/audit-logs", headers=ops["h"]).status_code == 403
    assert client.get(f"{V}/admin/audit-logs", headers=sup["h"]).status_code == 200
    for m in ("put", "patch", "delete"):
        assert getattr(client, m)(f"{V}/admin/audit-logs", headers=sup["h"]).status_code == 405
    db.add(AuditLog(action="x", target="y"))
    db.commit()
    with pytest.raises(Exception, match="append-only"):
        db.execute(text("delete from audit_logs"))
        db.commit()
    db.rollback()


# ---------------- H1/H2: export and deletion ----------------
def test_deletion_scrubs_gateway_copy_and_export_file(client, otp, db):
    c, _, pay, _, _ = subscribe(client, otp, db)
    uid, pid = int(c["user"]["id"]), int(pay["id"])
    db.add(PaymentEvent(gateway="razorpay", gateway_event_id="evt_h_test", event="payment.captured", payment_id=pid,
                        payload={"payload": {"payment": {"entity": {"amount": 100, "contact": "+919876500000",
                                                                    "email": "someone@example.com", "status": "captured"}}}}))
    db.commit()
    client.post(f"{V}/privacy/export", headers=c["h"])
    while deliver_outbox():
        pass
    key = db.scalar(select(DataExport.storage_key).where(DataExport.user_id == uid))
    assert key and storage.get(key)
    # the cancel-first rule: an active subscription blocks deletion with a clear error
    db.execute(text("update subscriptions set status='cancelled' where customer_id=:u"), {"u": uid})
    db.commit()
    assert client.request("DELETE", f"{V}/customers/me", json={"reason": "leaving"}, headers=c["h"]).status_code == 204
    db.expire_all()
    row = db.execute(text("select full_name, email, phone_enc, phone_hmac from users where id=:u"), {"u": uid}).first()
    assert tuple(row) == (None, None, None, None)
    assert db.get(Payment, pid) is not None
    ev = json.dumps(db.scalar(select(PaymentEvent.payload).where(PaymentEvent.payment_id == pid)))
    assert "9876500000" not in ev and "someone@example.com" not in ev and '"amount": 100' in ev
    e = db.scalar(select(DataExport).where(DataExport.user_id == uid))
    assert e.storage_key is None and e.status == "expired"
    with pytest.raises(AppError, match="no longer available"):
        storage.get(key)
    assert db.scalar(select(User).where(User.phone_hmac == lookup_hash(c["user"]["phone"]))) is None


def test_expired_export_files_are_purged(client, otp, db):
    c = customer_with_address(client, otp, "9876512345")
    client.post(f"{V}/privacy/export", headers=c["h"])
    while deliver_outbox():
        pass
    e = db.scalar(select(DataExport))
    key = e.storage_key
    assert privacy.purge_expired_exports(db) == 0 and storage.get(key)
    e.expires_at = clock.now() - timedelta(minutes=1)
    db.commit()
    assert privacy.purge_expired_exports(db) == 1
    db.refresh(e)
    assert e.storage_key is None and client.get(f"{V}/privacy/export", headers=c["h"]).json()["status"] == "expired"
    with pytest.raises(AppError, match="no longer available"):
        storage.get(key)


# ---------------- H7: logging hygiene ----------------
def test_redaction_removes_phones_tokens_and_otps():
    line = redact('login +91 9876512345 code=123456 Authorization: Bearer abc.def-ghi {"otp": "654321"} '
                  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig postgresql://u:p@host/db')
    for secret in ("9876512345", "123456", "abc.def-ghi", "654321", "eyJhbGciOiJIUzI1NiJ9", "u:p@"):
        assert secret not in line


def test_no_personal_data_in_application_logs(client, otp, db, caplog):
    caplog.set_level(logging.DEBUG)
    c = customer_with_address(client, otp, "9876512345")
    ops = admin(client, otp, db)
    client.post(f"{V}/admin/users/{c['user']['id']}/reveal-phone", json={"reason": "Call back"}, headers=ops["h"])
    client.get(f"{V}/customers/me/addresses", headers=c["h"])
    fmt = JsonFormatter()
    out = "\n".join(fmt.format(r) for r in caplog.records)
    for secret in ("9876512345", "12 Test Road", c["token"]):
        assert secret not in out


def test_redaction_catches_spaced_and_prefixed_phone_formats():
    for raw in ("98765 43210", "98765-43210", "+91-98765-43210", "+91 98765 43210", "09876543210", "919876543210"):
        out = redact(f"call {raw} now")
        assert "43210" not in out and "[PHONE]" in out, raw
    # not over-eager: amounts, dates, ids and 5-digit pincodes survive
    keep = "paid 123456 paise on 2026-11-13 for visit 4321 pin 560038"
    assert redact(keep) == keep


def test_database_errors_do_not_carry_bound_values(db):
    from sqlalchemy.exc import IntegrityError
    db.add(User(role="not-a-role", full_name="Probe Name Zq", email="probe@example.invalid"))
    with pytest.raises(IntegrityError) as err:
        db.commit()
    db.rollback()
    assert "hidden due to hide_parameters" in str(err.value)  # SQLAlchemy's own parameter dump is off
    # PostgreSQL still echoes the row in DETAIL; the log formatter removes it (as for any unhandled error).
    try:
        raise err.value
    except IntegrityError:
        rec = logging.LogRecord("app", logging.ERROR, __file__, 1, "Unhandled error", None, sys.exc_info())
    out = JsonFormatter().format(rec)
    assert "Probe Name Zq" not in out and "probe@example.invalid" not in out and "Failing row contains ([REDACTED])" in out
    assert redact("Key (phone_hmac)=(abc123) already exists.") == "Key (phone_hmac)=([REDACTED]) already exists."
