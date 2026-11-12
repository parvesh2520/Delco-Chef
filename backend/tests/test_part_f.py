"""Part F: the Razorpay adapter end to end with Razorpay-shaped webhook payloads. Only the HTTP call to Razorpay is
faked; signature checks, parsing, idempotency, state changes and refunds run through the real code."""
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import pytest
from conftest import customer_with_address, tomorrow, trial_body
from sqlalchemy import func, select
from test_trials import finish, setup

from app.core.errors import AppError
from app.models import (
    Notification,
    Payment,
    PaymentEvent,
    PaymentLink,
    Refund,
    ServiceRequest,
    Subscription,
)
from app.services import gateway, payments
from app.services.gateway import RazorpayGateway
from app.services.worker import deliver_outbox

V = "/api/v1"
WHSEC, KEYSEC = "whsec_test_only", "key_secret_test_only"


class FakeRazorpay(RazorpayGateway):
    """The real adapter with its HTTP call replaced by an in-memory Razorpay."""

    def __init__(self):
        super().__init__("rzp_test_fake", KEYSEC, WHSEC)
        self.payments: dict[str, dict] = {}
        self.calls: list[tuple] = []
        self.down = False
        self.n = 0

    def _call(self, method, path, body=None):
        self.calls.append((method, path, body))
        if self.down:
            raise AppError("GATEWAY_UNAVAILABLE", "down", 503)
        self.n += 1
        if path == "/payment_links":
            return {"id": f"plink_t{self.n}", "short_url": f"https://rzp.io/t{self.n}"}
        if path.endswith("/cancel"):
            return {}
        if path.endswith("/refund"):
            return {"id": f"rfnd_t{self.n}"}
        return self.payments[path.rsplit("/", 1)[-1]]


@pytest.fixture
def rzp(monkeypatch):
    fake = FakeRazorpay()
    monkeypatch.setattr(gateway, "_gateway", fake)
    return fake


def ts(dt: datetime) -> int:
    return int(dt.timestamp())


def send(client, payload: dict, event_id: str, secret: str = WHSEC):
    body = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post(f"{V}/payments/webhook", content=body,
                       headers={"x-razorpay-signature": sig, "x-razorpay-event-id": event_id, "content-type": "application/json"})


def link_paid(link: PaymentLink, pref: str, at: datetime | None = None, amount: int | None = None) -> dict:
    amount = link.amount_paise if amount is None else amount
    pay = {"id": pref, "entity": "payment", "amount": amount, "currency": "INR", "status": "captured", "method": "upi",
           "created_at": ts(at or datetime.now(UTC)), "email": "someone@example.com", "contact": "+919876543210",
           "vpa": "someone@okbank", "notes": {"reference": "x"}}
    return {"entity": "event", "event": "payment_link.paid", "payload": {
        "payment_link": {"entity": {"id": link.gateway_link_id, "status": "paid", "amount": amount, "amount_paid": amount,
                                    "reference_id": "x"}},
        "payment": {"entity": pay}}}


def payment_failed(reference: str, pref: str, amount: int) -> dict:
    """Razorpay's payment.failed carries only the payment entity: no payment-link id."""
    return {"entity": "event", "event": "payment.failed", "payload": {"payment": {"entity": {
        "id": pref, "amount": amount, "status": "failed", "method": "card", "error_code": "BAD_REQUEST_ERROR",
        "error_description": "Payment was declined by the bank", "notes": {"reference": reference},
        "created_at": ts(datetime.now(UTC))}}}}


def refund_event(kind: str, rf: Refund, pref: str) -> dict:
    return {"entity": "event", "event": f"refund.{kind}", "payload": {
        "refund": {"entity": {"id": rf.gateway_refund_id, "payment_id": pref, "amount": rf.amount_paise, "status": kind}},
        "payment": {"entity": {"id": pref, "amount": rf.amount_paise, "status": "refunded"}}}}


def subscribe(client, otp, db, phone="9876560001", staff=None, day=None):
    if staff:
        chef, ops = staff
        c = customer_with_address(client, otp, phone)
    else:
        chef, _, ops, c = setup(client, otp, db, phone=phone)
    req = client.post(f"{V}/requests", json=trial_body("monthly_subscription", c["addressId"], slot="morning", day=day), headers=c["h"]).json()
    client.post(f"{V}/admin/requests/{req['id']}/assign", json={"chefId": str(chef.id)}, headers=ops["h"])
    finish(db, req["trials"][0]["id"])
    d = client.post(f"{V}/trials/{req['trials'][0]['id']}/decision", json={"decision": "subscribe", "amount": 1}, headers=c["h"]).json()
    db.expire_all()
    p = db.scalar(select(Payment).where(Payment.subscription_id == int(d["subscriptionId"])))
    link = db.scalar(select(PaymentLink).where(PaymentLink.payment_id == p.id, PaymentLink.status == "active"))
    return c, ops, p, link, chef


def paid_and_scheduled(client, db, link, pref="pay_ok"):
    assert send(client, link_paid(link, pref), f"evt_{pref}").json()["status"] == "paid"
    while deliver_outbox():
        pass
    db.expire_all()


def notes(db, user_id, event):
    while deliver_outbox():
        pass
    return db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.event == event))


# ---------------- F3: signatures, idempotency, ordering ----------------
def test_valid_signed_razorpay_webhook_activates_once_and_stores_no_contact_details(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    assert rzp.calls[0][2]["amount"] == p.amount_paise == 2_080_000  # server price; the app's amount=1 was ignored
    assert send(client, link_paid(link, "pay_A"), "evt_A").json()["status"] == "paid"
    db.expire_all()
    assert db.get(Payment, p.id).status == "PAID" and db.get(Subscription, p.subscription_id).status == "active"
    stored = db.scalar(select(PaymentEvent).where(PaymentEvent.gateway_event_id == "evt_A"))
    text = json.dumps(stored.payload)
    assert stored.outcome == "paid" and "someone@" not in text and "+91" not in text and "okbank" not in text


def test_invalid_signature_is_rejected_and_not_recorded(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    r = send(client, link_paid(link, "pay_A"), "evt_bad", secret="wrong-secret")
    assert r.status_code == 400 and r.json()["error"]["code"] == "WEBHOOK_SIGNATURE_INVALID"
    db.expire_all()
    assert db.get(Payment, p.id).status == "CREATED"
    assert db.scalar(select(func.count()).select_from(PaymentEvent)) == 0


def test_missing_webhook_secret_rejects_everything(client, otp, db, monkeypatch):
    fake = FakeRazorpay()
    fake.webhook_secret = None
    monkeypatch.setattr(gateway, "_gateway", fake)
    _, _, _, link, _ = subscribe(client, otp, db)
    assert send(client, link_paid(link, "pay_A"), "evt_A").status_code == 400


def test_duplicate_delivery_changes_state_and_notifies_once(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    ev = link_paid(link, "pay_A")
    assert send(client, ev, "evt_A").json()["status"] == "paid"
    assert send(client, ev, "evt_A").json()["status"] == "duplicate"
    assert send(client, ev, "evt_A_redelivered_with_new_id").json()["status"] == "already_paid"
    db.expire_all()
    assert notes(db, p.customer_id, "payment_success") == 1 and notes(db, p.customer_id, "subscription_active") == 1


def test_delayed_success_paid_before_expiry_is_accepted_after_the_expiry_job(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    link.expires_at = datetime.now(UTC) - timedelta(minutes=5)  # the 48 hours have passed since
    db.commit()
    payments.expire_links_and_close_unpaid(db)
    db.expire_all()
    assert db.get(PaymentLink, link.id).status == "expired"
    late = link_paid(link, "pay_late", at=link.expires_at - timedelta(minutes=1))  # paid in time, delivered late
    assert send(client, late, "evt_late").json()["status"] == "paid"
    db.expire_all()
    assert db.get(Payment, p.id).status == "PAID" and db.scalar(select(func.count()).select_from(Refund)) == 0


def test_payment_made_after_expiry_is_refunded_not_activated(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    link.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    db.commit()
    assert send(client, link_paid(link, "pay_dead"), "evt_dead").json()["status"] == "dead_link_refunded"
    db.expire_all()
    assert db.get(Payment, p.id).status == "CREATED" and db.get(Subscription, p.subscription_id).status == "pending_payment"
    assert db.scalar(select(Refund.amount_paise)) == p.amount_paise


def test_replaced_link_refuses_even_a_payment_made_in_time(client, otp, db, rzp):
    c, _, p, old, _ = subscribe(client, otp, db)
    assert client.post(f"{V}/payments/{p.id}/regenerate", headers=c["h"]).status_code == 200
    db.expire_all()
    assert send(client, link_paid(old, "pay_old"), "evt_old").json()["status"] == "dead_link_refunded"
    assert db.get(Payment, p.id).status == "CREATED"


def test_failed_event_without_link_id_is_matched_by_reference_then_retry_succeeds(client, otp, db, rzp):
    c, _, p, link, _ = subscribe(client, otp, db)
    ref = rzp.calls[0][2]["reference_id"]
    r = send(client, payment_failed(ref, "pay_F", link.amount_paise), "evt_F")
    assert r.json()["status"] == "failed"
    db.expire_all()
    pay = db.get(Payment, p.id)
    assert pay.status == "FAILED" and pay.failure_reason == "Payment was declined by the bank"
    assert notes(db, p.customer_id, "payment_failed") == 1
    shown = client.get(f"{V}/payments/{p.id}", headers=c["h"]).json()
    assert shown["status"] == "failed" and shown["linkUrl"]  # retry on the same link, no details re-entered
    assert send(client, link_paid(link, "pay_retry"), "evt_retry").json()["status"] == "paid"
    db.expire_all()
    assert db.get(Subscription, p.subscription_id).status == "active"


def test_failure_arriving_after_success_changes_nothing(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    assert send(client, link_paid(link, "pay_A"), "evt_A").json()["status"] == "paid"
    ref = rzp.calls[0][2]["reference_id"]
    assert send(client, payment_failed(ref, "pay_B", link.amount_paise), "evt_B").json()["status"] == "ignored_already_paid"
    db.expire_all()
    assert db.get(Payment, p.id).status == "PAID" and notes(db, p.customer_id, "payment_failed") == 0


def test_amount_mismatch_is_flagged_not_activated(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    assert send(client, link_paid(link, "pay_A", amount=100), "evt_A").json()["status"] == "amount_mismatch_flagged"
    db.expire_all()
    assert db.get(Subscription, p.subscription_id).status == "pending_payment"


# ---------------- F2: a browser redirect alone never activates ----------------
def _redirect(client, link, pref, status="paid"):
    msg = f"{link.gateway_link_id}|ref|{status}|{pref}".encode()
    sig = hmac.new(KEYSEC.encode(), msg, hashlib.sha256).hexdigest()
    return client.get(f"{V}/payments/razorpay/callback", params={
        "razorpay_payment_id": pref, "razorpay_payment_link_id": link.gateway_link_id, "razorpay_payment_link_reference_id": "ref",
        "razorpay_payment_link_status": status, "razorpay_signature": sig})


def test_signed_redirect_is_confirmed_with_razorpay_before_activation(client, otp, db, rzp):
    _, _, p, link, _ = subscribe(client, otp, db)
    rzp.payments["pay_X"] = {"id": "pay_X", "status": "failed", "amount": link.amount_paise, "created_at": ts(datetime.now(UTC))}
    assert "not completed" in _redirect(client, link, "pay_X").text  # signature valid, but Razorpay says not captured
    rzp.payments["pay_Y"] = {"id": "pay_Y", "status": "captured", "amount": 100, "created_at": ts(datetime.now(UTC))}
    assert "not completed" in _redirect(client, link, "pay_Y").text  # wrong amount
    rzp.down = True
    assert "not completed" in _redirect(client, link, "pay_Z").text  # cannot confirm: wait for the webhook
    db.expire_all()
    assert db.get(Payment, p.id).status == "CREATED" and db.get(Subscription, p.subscription_id).status == "pending_payment"
    rzp.down = False
    rzp.payments["pay_Z"] = {"id": "pay_Z", "status": "captured", "amount": link.amount_paise, "created_at": ts(datetime.now(UTC))}
    assert "successful" in _redirect(client, link, "pay_Z").text
    assert send(client, link_paid(link, "pay_Z"), "evt_Z").json()["status"] == "already_paid"  # webhook after: no-op
    db.expire_all()
    assert db.get(Subscription, p.subscription_id).status == "active" and notes(db, p.customer_id, "payment_success") == 1


# ---------------- F5: cancellation and refunds ----------------
def _cancel_at(client, c, sub_id, monkeypatch, db, before_first: timedelta):
    """Preview and cancel as if the clock read `before_first` ahead of the first visit."""
    first = payments.first_visit_at(db, db.get(Subscription, sub_id))
    with monkeypatch.context() as m:
        m.setattr(payments, "now", lambda: first - before_first)
        preview = client.get(f"{V}/subscriptions/{sub_id}/cancel-preview", headers=c["h"]).json()
        done = client.post(f"{V}/subscriptions/{sub_id}/cancel", json={"reason": "Plans changed", "refundPaise": 1}, headers=c["h"])
    return preview, done


def test_full_refund_requested_then_confirmed_by_razorpay(client, otp, db, rzp, monkeypatch):
    c, ops, p, link, _ = subscribe(client, otp, db)
    paid_and_scheduled(client, db, link)
    preview, done = _cancel_at(client, c, p.subscription_id, monkeypatch, db, timedelta(hours=3))
    assert preview["fullRefund"] is True and preview["refundPaise"] == p.amount_paise
    assert done.status_code == 200 and done.json()["refundPaise"] == p.amount_paise  # the client's refundPaise is ignored
    assert [b for _, path, b in rzp.calls if path.endswith("/refund")] == [{"amount": p.amount_paise, "speed": "normal"}]
    db.expire_all()
    rf = db.scalar(select(Refund).where(Refund.payment_id == p.id))
    assert rf.status == "requested" and db.get(Payment, p.id).status == "PAID"  # not refunded until Razorpay confirms
    shown = client.get(f"{V}/payments/{p.id}", headers=c["h"]).json()
    assert shown["refunds"][0]["status"] == "requested" and "links" not in shown
    assert send(client, refund_event("processed", rf, "pay_ok"), "evt_rf").json()["status"] == "refund_processed"
    assert send(client, refund_event("processed", rf, "pay_ok"), "evt_rf").json()["status"] == "duplicate"
    db.expire_all()
    assert db.get(Payment, p.id).status == "REFUNDED" and db.get(Payment, p.id).refunded_paise == p.amount_paise
    admin_view = client.get(f"{V}/payments/{p.id}", headers=ops["h"]).json()
    assert admin_view["refunds"][0]["status"] == "processed" and admin_view["links"][0]["status"] == "paid"


def test_half_refund_at_exactly_two_hours_and_duplicate_cancel_refused(client, otp, db, rzp, monkeypatch):
    c, _, p, link, _ = subscribe(client, otp, db)
    paid_and_scheduled(client, db, link)
    preview, done = _cancel_at(client, c, p.subscription_id, monkeypatch, db, timedelta(hours=2))
    assert preview["fullRefund"] is False and preview["refundPaise"] == p.amount_paise // 2
    assert done.json()["refundPaise"] == p.amount_paise // 2
    again = client.post(f"{V}/subscriptions/{p.subscription_id}/cancel", json={}, headers=c["h"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "SUBSCRIPTION_NOT_CANCELLABLE"
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Refund).where(Refund.payment_id == p.id)) == 1
    rf = db.scalar(select(Refund).where(Refund.payment_id == p.id))
    send(client, refund_event("processed", rf, "pay_ok"), "evt_rf")
    db.expire_all()
    assert db.get(Payment, p.id).status == "PARTIALLY_REFUNDED"


def test_refund_failed_at_gateway_is_tracked_and_flagged(client, otp, db, rzp, monkeypatch):
    c, _, p, link, _ = subscribe(client, otp, db)
    paid_and_scheduled(client, db, link)
    _cancel_at(client, c, p.subscription_id, monkeypatch, db, timedelta(hours=5))
    db.expire_all()
    rf = db.scalar(select(Refund).where(Refund.payment_id == p.id))
    assert send(client, refund_event("failed", rf, "pay_ok"), "evt_rff").json()["status"] == "refund_failed"
    db.expire_all()
    assert db.get(Refund, rf.id).status == "failed" and db.get(Payment, p.id).status == "PAID"
    while deliver_outbox():
        pass
    assert db.scalar(select(func.count()).select_from(Notification).where(Notification.event == "refund_failed")) >= 1


def test_cancelling_after_first_visit_is_refused_without_inventing_a_policy(client, otp, db, rzp, monkeypatch):
    c, _, p, link, _ = subscribe(client, otp, db)
    paid_and_scheduled(client, db, link)
    _, done = _cancel_at(client, c, p.subscription_id, monkeypatch, db, -timedelta(minutes=1))
    assert done.status_code == 409 and done.json()["error"]["code"] == "REFUND_NOT_ALLOWED"
    db.expire_all()
    assert db.get(Subscription, p.subscription_id).status == "active"


def test_cancelling_unpaid_order_kills_its_link(client, otp, db, rzp):
    c, _, p, link, _ = subscribe(client, otp, db)
    preview = client.get(f"{V}/subscriptions/{p.subscription_id}/cancel-preview", headers=c["h"]).json()
    assert preview["paid"] is False and preview["refundPaise"] == 0
    assert client.post(f"{V}/subscriptions/{p.subscription_id}/cancel", json={}, headers=c["h"]).status_code == 200
    assert any(path == f"/payment_links/{link.gateway_link_id}/cancel" for _, path, _ in rzp.calls)
    assert send(client, link_paid(link, "pay_late"), "evt_late").json()["status"] == "dead_link_refunded"
    db.expire_all()
    assert db.get(Subscription, p.subscription_id).status == "cancelled"


# ---------------- F6: expiry and the 7-day close ----------------
def test_seven_day_close_boundary_idempotent_and_never_closes_paid(client, otp, db, rzp):
    _, ops, p, link, chef = subscribe(client, otp, db)
    r = db.scalar(select(ServiceRequest).join(Subscription, Subscription.request_id == ServiceRequest.id)
                  .where(Subscription.id == p.subscription_id))
    r.subscription_requested_at = datetime.now(UTC) - timedelta(days=7) + timedelta(minutes=1)
    db.commit()
    assert payments.expire_links_and_close_unpaid(db)[1] == 0  # just under 7 days
    db.expire_all()
    r = db.get(ServiceRequest, r.id)
    r.subscription_requested_at = datetime.now(UTC) - timedelta(days=7, minutes=1)
    db.commit()
    assert payments.expire_links_and_close_unpaid(db)[1] == 1
    assert payments.expire_links_and_close_unpaid(db) == (0, 0)  # safe to run again
    db.expire_all()
    assert db.get(ServiceRequest, r.id).stage == "closed" and db.get(Subscription, p.subscription_id).status == "cancelled"
    assert db.get(PaymentLink, link.id).status == "cancelled"
    # Money that still arrives for the closed order is refunded, never activates it.
    assert send(client, link_paid(link, "pay_after"), "evt_after").json()["status"] == "dead_link_refunded"

    _, _, p2, link2, _ = subscribe(client, otp, db, phone="9876560099", staff=(chef, ops),
                                 day=tomorrow() + timedelta(days=3))
    assert send(client, link_paid(link2, "pay_2"), "evt_2").json()["status"] == "paid"
    db.expire_all()
    r2 = db.scalar(select(ServiceRequest).join(Subscription, Subscription.request_id == ServiceRequest.id)
                   .where(Subscription.id == p2.subscription_id))
    r2.subscription_requested_at = datetime.now(UTC) - timedelta(days=30)
    db.commit()
    payments.expire_links_and_close_unpaid(db)
    db.expire_all()
    assert db.get(ServiceRequest, r2.id).stage == "payment_done" and db.get(Subscription, p2.subscription_id).status == "active"


# ---------------- Authorization ----------------
def test_payment_and_refund_access_by_role(client, otp, db, rzp):
    c, ops, p, _, _ = subscribe(client, otp, db)
    other = customer_with_address(client, otp, "9876560077", "Other")
    assert client.get(f"{V}/payments/{p.id}", headers=other["h"]).status_code == 404
    assert client.get(f"{V}/subscriptions/{p.subscription_id}/cancel-preview", headers=other["h"]).status_code == 404
    assert client.post(f"{V}/subscriptions/{p.subscription_id}/cancel", json={}, headers=other["h"]).status_code == 404
    assert client.post(f"{V}/subscriptions/{p.subscription_id}/cancel", json={}, headers=ops["h"]).status_code == 403
    assert client.get(f"{V}/admin/payment-links", headers=c["h"]).status_code == 403
    assert client.get(f"{V}/admin/payment-links", headers=ops["h"]).json()[0]["status"] == "active"
    assert "links" in client.get(f"{V}/payments/{p.id}", headers=ops["h"]).json()
