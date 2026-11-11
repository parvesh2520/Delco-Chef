"""Part F acceptance tests (sandbox gateway, same signed-webhook path as Razorpay)."""
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.domain import ist_today
from app.models import Notification, Payment, PaymentLink, Refund, Subscription, Visit
from app.services import subscriptions
from app.services.worker import deliver_outbox
from test_trials import finish, new_trial, setup
from conftest import admin, trial_body

V = "/api/v1"
SECRET = settings.SANDBOX_WEBHOOK_SECRET


def webhook(client, event: dict, sig: str | None = None):
    body = json.dumps(event).encode()
    sig = sig or hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    return client.post(f"{V}/payments/webhook", content=body, headers={"x-sandbox-signature": sig, "content-type": "application/json"})


def paid_event(link_id, amount, eid="evt_1", pref="pay_1"):
    return {"id": eid, "type": "paid", "link_id": link_id, "payment_ref": pref, "amount": amount, "method": "upi"}


def subscribe(client, otp, db, service="monthly_subscription", **kw):
    chef, chef2, ops, c = setup(client, otp, db)
    req = client.post(f"{V}/requests", json=trial_body(service, c["addressId"], slot="morning", amount=1, **kw), headers=c["h"])
    rid, t1 = req.json()["id"], req.json()["trials"][0]["id"]
    client.post(f"{V}/admin/requests/{rid}/assign", json={"chefId": str(chef.id)}, headers=ops["h"])
    finish(db, t1)
    d = client.post(f"{V}/trials/{t1}/decision", json={"decision": "subscribe", "amount": 1}, headers=c["h"]).json()
    pay = client.get(f"{V}/payments/by-subscription/{d['subscriptionId']}", headers=c["h"]).json()
    link = db.scalar(select(PaymentLink).where(PaymentLink.payment_id == int(pay["id"]), PaymentLink.status == "active"))
    return c, ops, pay, link, d["subscriptionId"]


def test_monthly_link_created_at_once_for_server_price(client, otp, db):
    c, _, pay, link, _ = subscribe(client, otp, db)
    assert pay["amountPaise"] == 2_080_000 and link.amount_paise == 2_080_000  # client amount=1 ignored
    hours = (link.expires_at - link.created_at).total_seconds() / 3600
    assert abs(hours - 48) < 0.01 and pay["status"] == "link_created"
    deliver_outbox()
    assert any(n["title"] == "Payment link ready" for n in client.get(f"{V}/notifications", headers=c["h"]).json())


def test_custom_time_link_amount(client, otp, db):
    today = ist_today()
    monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    _, _, pay, _, _ = subscribe(client, otp, db, "custom_time", startDate=monday.isoformat(), durationDays=14, weekdays=[0, 1, 2, 3, 4, 5])
    assert pay["amountPaise"] == 960_000


def test_webhook_twice_and_before_client_callback(client, otp, db):
    c, _, pay, link, sub_id = subscribe(client, otp, db)
    ev = paid_event(link.gateway_link_id, link.amount_paise)
    assert webhook(client, ev).json()["status"] == "paid"
    assert webhook(client, ev).json()["status"] == "duplicate"
    cb = {"linkId": link.gateway_link_id, "referenceId": "ref", "status": "paid", "paymentRef": "pay_1"}
    cb["signature"] = hmac.new(SECRET.encode(), f"{cb['linkId']}|ref|paid|pay_1".encode(), hashlib.sha256).hexdigest()
    r = client.post(f"{V}/payments/{pay['id']}/verify", json=cb, headers=c["h"])
    assert r.status_code == 200 and r.json()["status"] == "paid"
    db.expire_all()
    sub = db.get(Subscription, int(sub_id))
    assert sub.status == "active" and db.get(Payment, int(pay["id"])).attempts == 1
    assert db.scalar(select(func.count()).select_from(Visit).where(Visit.subscription_id == sub.id)) == 0  # not built in the request
    while deliver_outbox():
        pass
    db.expire_all()
    visits = db.scalar(select(func.count()).select_from(Visit).where(Visit.subscription_id == sub.id))
    assert visits == 28  # whole 28-day cycle, morning slot
    while deliver_outbox():
        pass
    n = db.scalar(select(func.count()).select_from(Notification).where(Notification.event == "payment_success"))
    assert n == 1
    req = client.get(f"{V}/requests", headers=c["h"]).json()[0]
    assert req["status"] == "converted"


def test_invalid_signature_rejected(client, otp, db):
    _, _, _, link, _ = subscribe(client, otp, db)
    r = webhook(client, paid_event(link.gateway_link_id, link.amount_paise), sig="0" * 64)
    assert r.status_code == 400 and r.json()["error"]["code"] == "WEBHOOK_SIGNATURE_INVALID"


def test_failed_then_retry_same_link(client, otp, db):
    c, _, pay, link, _ = subscribe(client, otp, db)
    r = webhook(client, {"id": "evt_f", "type": "failed", "link_id": link.gateway_link_id, "payment_ref": "pay_f", "error": "Declined"})
    assert r.json()["status"] == "failed"
    p = client.get(f"{V}/payments/{pay['id']}", headers=c["h"]).json()
    assert p["status"] == "failed" and p["linkUrl"]  # retry with the same link, no re-entry
    deliver_outbox()
    assert any(n["title"] == "Payment failed" for n in client.get(f"{V}/notifications", headers=c["h"]).json())
    assert webhook(client, paid_event(link.gateway_link_id, link.amount_paise, "evt_ok", "pay_ok")).json()["status"] == "paid"


def test_regenerated_link_kills_old_one(client, otp, db):
    c, ops, pay, old, _ = subscribe(client, otp, db)
    r = client.post(f"{V}/payments/{pay['id']}/regenerate", headers=c["h"])
    assert r.status_code == 200
    db.expire_all()
    statuses = {x.gateway_link_id: x.status for x in db.scalars(select(PaymentLink))}
    assert statuses[old.gateway_link_id] == "replaced" and list(statuses.values()).count("active") == 1
    assert webhook(client, paid_event(old.gateway_link_id, old.amount_paise)).json()["status"] == "dead_link_refunded"
    db.expire_all()
    assert db.get(Payment, int(pay["id"])).status == "CREATED" and db.scalar(select(Refund)) is not None
    links = client.get(f"{V}/admin/payment-links", headers=ops["h"]).json()
    assert {x["status"] for x in links} == {"active", "replaced"}


def test_rate_change_keeps_existing_link(client, otp, db):
    _, ops, pay, link, _ = subscribe(client, otp, db)
    r = client.put(f"{V}/admin/settings/pricing", json={"values": {"rate_paise_per_person_hour": 25000}}, headers=ops["h"])
    assert r.status_code == 200
    db.expire_all()
    assert db.get(PaymentLink, link.id).amount_paise == 2_080_000
    from app.services import settings as s_svc
    from app.domain.pricing import monthly_price
    assert monthly_price(s_svc.load(db).int("rate_paise_per_person_hour"), 4, "morning") == 2_600_000


def test_late_payment_moves_cycle_not_price(client, otp, db):
    _, _, pay, link, sub_id = subscribe(client, otp, db)
    sub = db.get(Subscription, int(sub_id))
    start = sub.start_date
    paid_at = datetime.combine(start + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=6)
    subscriptions.activate(db, sub, paid_at)
    db.commit()
    assert sub.start_date == start + timedelta(days=3) and sub.end_date == sub.start_date + timedelta(days=27)
    assert sub.amount_paise == 2_080_000


def test_cancel_with_full_refund_then_refund_confirmed(client, otp, db):
    c, _, pay, link, sub_id = subscribe(client, otp, db)
    webhook(client, paid_event(link.gateway_link_id, link.amount_paise))
    r = client.post(f"{V}/subscriptions/{sub_id}/cancel", json={"reason": "Changed plans"}, headers=c["h"])
    assert r.status_code == 200 and r.json()["refundPaise"] == 2_080_000
    rf = db.scalar(select(Refund))
    assert webhook(client, {"id": "evt_r", "type": "refund_processed", "refund_id": rf.gateway_refund_id}).json()["status"] == "refund_processed"
    assert client.get(f"{V}/payments/{pay['id']}", headers=c["h"]).json()["gatewayStatus"] == "REFUNDED"


def test_chef_never_sees_payments(client, otp, db):
    from conftest import H, login
    _, _, pay, _, _ = subscribe(client, otp, db)
    chef = H(login(client, otp, "9111100001", "chef"))
    assert client.get(f"{V}/payments", headers=chef).status_code == 403
    assert client.get(f"{V}/payments/{pay['id']}", headers=chef).status_code == 404
    assert admin  # noqa


def test_redirect_callback_marks_paid_once_and_rejects_forgery(client, otp, db):
    _, _, pay, link, sub_id = subscribe(client, otp, db)
    q = {"razorpay_payment_id": "pay_cb", "razorpay_payment_link_id": link.gateway_link_id,
         "razorpay_payment_link_reference_id": "ref", "razorpay_payment_link_status": "paid"}
    msg = f"{link.gateway_link_id}|ref|paid|pay_cb".encode()
    forged = client.get(f"{V}/payments/razorpay/callback", params={**q, "razorpay_signature": "0" * 64})
    assert forged.status_code == 400
    q["razorpay_signature"] = hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()
    assert "successful" in client.get(f"{V}/payments/razorpay/callback", params=q).text
    assert "already confirmed" in client.get(f"{V}/payments/razorpay/callback", params=q).text
    db.expire_all()
    assert db.get(Subscription, int(sub_id)).status == "active"
