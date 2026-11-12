"""Part F: automatic payment links, verification, idempotent webhooks, failures, refunds, expiry."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.domain import board
from app.domain.refunds import RefundNotAllowed, refund_amount
from app.models import Payment, PaymentEvent, PaymentLink, Refund, ServiceRequest, Subscription, User, Visit
from app.services import settings as settings_svc
from app.services.events import SYSTEM, Actor, audit, notify, notify_admins
from app.services.gateway import GatewayEvent, get_gateway
from app.services.settings import Settings

log = logging.getLogger("payments")


def now() -> datetime:
    return datetime.now(timezone.utc)


def _new_link(db: Session, p: Payment, s: Settings) -> PaymentLink:
    gw = get_gateway()
    cust = db.get(User, p.customer_id)
    sub = db.get(Subscription, p.subscription_id)
    expires = now() + timedelta(hours=s.int("link_validity_h"))
    # The link carries our order reference; the amount is the stored snapshot, never anything the client sent.
    link_id, url = gw.create_link(reference=f"pay_{p.id}_{int(now().timestamp())}", amount_paise=p.amount_paise,
                                  expires_at=expires, description=f"Delco Chefs {sub.service.replace('_', ' ')}",
                                  customer_name=(cust.full_name or "Customer"))
    link = PaymentLink(payment_id=p.id, gateway_link_id=link_id, url=url, amount_paise=p.amount_paise, expires_at=expires)
    db.add(link)
    db.flush()
    amount = f"₹{p.amount_paise // 100:,}.{p.amount_paise % 100:02d}"
    notify(db, "payment_link_created", p.customer_id, "Payment link ready",
           f"Pay {amount} within {s.int('link_validity_h')} hours to start your subscription.", f"/customer/payment/{p.id}",
           channels=("push", "sms", "email"))
    return link


def create_order_and_link(db: Session, sub: Subscription, s: Settings) -> Payment:
    p = Payment(subscription_id=sub.id, customer_id=sub.customer_id, amount_paise=sub.amount_paise, status="CREATED",
                gateway=get_gateway().name)
    db.add(p)
    db.flush()
    _new_link(db, p, s)
    return p


def _lock_payment(db: Session, payment_id: int) -> Payment:
    p = db.scalar(select(Payment).where(Payment.id == payment_id).with_for_update())
    if not p:
        raise not_found("Payment")
    return p


def regenerate_link(db: Session, actor: Actor, payment_id: int, customer_id: int | None = None) -> Payment:
    """One active link per order: the old one is marked replaced (refused at once) and cancelled at the gateway."""
    p = _lock_payment(db, payment_id)
    if customer_id is not None and p.customer_id != customer_id:
        raise not_found("Payment")
    if p.status in ("PAID", "REFUNDED", "PARTIALLY_REFUNDED"):
        raise AppError("PAYMENT_ALREADY_PAID", "This order is already paid.", 409)
    sub = db.get(Subscription, p.subscription_id)
    if sub.status == "cancelled":
        raise AppError("SUBSCRIPTION_CANCELLED", "This subscription was cancelled.", 409)
    for old in db.scalars(select(PaymentLink).where(PaymentLink.payment_id == p.id, PaymentLink.status == "active")):
        old.status, old.replaced_at = "replaced", now()
        get_gateway().cancel_link(old.gateway_link_id)
    db.flush()
    _new_link(db, p, settings_svc.load(db))
    if actor.role != "customer":
        audit(db, actor, "Regenerated payment link", f"Payment {p.id}")
    db.commit()
    return p


def resend_link(db: Session, actor: Actor, payment_id: int) -> Payment:
    p = _lock_payment(db, payment_id)
    link = db.scalar(select(PaymentLink).where(PaymentLink.payment_id == p.id, PaymentLink.status == "active"))
    if not link or link.expires_at <= now():
        raise AppError("PAYMENT_LINK_EXPIRED", "The link has expired. Regenerate a new one.", 409)
    notify(db, "payment_link_created", p.customer_id, "Payment link reminder", "Your payment link is waiting.",
           f"/customer/payment/{p.id}", channels=("push", "sms", "email"))
    audit(db, actor, "Resent payment link", f"Payment {p.id}")
    db.commit()
    return p


# ---------------- Confirmation ----------------
def _mark_paid(db: Session, p: Payment, link: PaymentLink, ev: GatewayEvent) -> str:
    if p.status == "PAID":
        return "already_paid"
    t = now()
    p.status, p.gateway_payment_id, p.method, p.paid_at = "PAID", ev.payment_ref, ev.method, t
    p.attempts += 1
    link.status = "paid"
    sub = db.get(Subscription, p.subscription_id)
    from app.services import subscriptions
    subscriptions.activate(db, sub, t)
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == sub.request_id).with_for_update())
    if r.stage == "subscription_requested":
        from app.services.bookings import move
        move(db, r, board.Stage.PAYMENT_DONE, "payment", SYSTEM, f"Payment {p.id} confirmed")
        r.paid_at = t
    amount = f"₹{p.amount_paise // 100:,}.{p.amount_paise % 100:02d}"
    notify(db, "payment_success", p.customer_id, "Payment received", f"{amount} received. Your subscription is active.",
           f"/customer/payment/{p.id}")
    return "paid"


def _refund_dead_link(db: Session, p: Payment, ev: GatewayEvent) -> str:
    """Money arrived on an expired/replaced link: refunded automatically (README) and flagged to admins."""
    if db.scalar(select(Refund).where(Refund.gateway_refund_id.is_not(None), Refund.payment_id == p.id,
                                      Refund.reason.like(f"%{ev.payment_ref}%"))):
        return "dead_link_already_refunded"
    rid = get_gateway().refund(ev.payment_ref, ev.amount_paise or p.amount_paise)
    db.add(Refund(payment_id=p.id, amount_paise=ev.amount_paise or p.amount_paise, gateway_refund_id=rid, status="requested",
                  reason=f"Auto-refund: paid on a dead link ({ev.payment_ref})"))
    notify_admins(db, "payment_dead_link", "Payment on dead link", f"Payment {p.id} received on an expired/replaced link and was refunded.",
                  f"/admin/payments/{p.id}")
    return "dead_link_refunded"


def accepts_payment(link: PaymentLink, paid_at: datetime | None) -> bool:
    """A replaced or cancelled link refuses money at once. An active or expired link accepts a payment the customer made
    before it expired, so a webhook delayed past the expiry (or past our expiry job) is not wrongly refunded."""
    if link.status in ("replaced", "cancelled"):
        return False
    if link.status == "paid":
        return True  # _mark_paid answers already_paid
    return (paid_at or now()) < link.expires_at


def _payment_for_reference(db: Session, reference: str | None) -> Payment | None:
    """Our link reference is "pay_<payment id>_<timestamp>"; Razorpay echoes it on events that lack the link id."""
    parts = (reference or "").split("_")
    if len(parts) == 3 and parts[0] == "pay" and parts[1].isdigit():
        return db.get(Payment, int(parts[1]))
    return None


def process_event(db: Session, ev: GatewayEvent) -> str:
    link = db.scalar(select(PaymentLink).where(PaymentLink.gateway_link_id == ev.link_id)) if ev.link_id else None
    if ev.type == "refund_failed":
        rf = db.scalar(select(Refund).where(Refund.gateway_refund_id == ev.refund_id).with_for_update())
        if not rf or rf.status != "requested":
            return "refund_ignored"
        rf.status = "failed"
        notify_admins(db, "refund_failed", "Refund failed", f"Refund {rf.id} for payment {rf.payment_id} failed at the gateway. "
                      "Follow up with the customer.", f"/admin/payments/{rf.payment_id}")
        return "refund_failed"
    if ev.type == "refund_processed":
        rf = db.scalar(select(Refund).where(Refund.gateway_refund_id == ev.refund_id).with_for_update())
        if not rf or rf.status == "processed":
            return "refund_ignored"
        rf.status, rf.confirmed_at = "processed", now()
        if rf.reason.startswith("Auto-refund"):
            return "dead_link_refund_confirmed"
        p = _lock_payment(db, rf.payment_id)
        p.refunded_paise = min(p.amount_paise, p.refunded_paise + rf.amount_paise)
        p.status = "REFUNDED" if p.refunded_paise >= p.amount_paise else "PARTIALLY_REFUNDED"
        notify(db, "refund_processed", p.customer_id, "Refund processed", f"₹{rf.amount_paise / 100:,.2f} refunded.", f"/customer/payment/{p.id}")
        return "refund_processed"
    if link is None:
        by_ref = _payment_for_reference(db, ev.reference)
        if by_ref is None or ev.type != "failed":
            return "unknown_link"
        p = _lock_payment(db, by_ref.id)
    else:
        p = _lock_payment(db, link.payment_id)
        db.refresh(link)  # re-read under the payment lock: expiry, cancel and regenerate change links while holding it
    if ev.type == "paid":
        if ev.amount_paise is not None and ev.amount_paise != link.amount_paise:
            notify_admins(db, "payment_amount_mismatch", "Payment amount mismatch", f"Payment {p.id} needs review.", f"/admin/payments/{p.id}")
            return "amount_mismatch_flagged"
        if not accepts_payment(link, ev.occurred_at):
            return _refund_dead_link(db, p, ev)
        return _mark_paid(db, p, link, ev)
    if ev.type == "failed":
        if p.status not in ("CREATED", "FAILED"):
            return "ignored_already_paid"  # a late failure never undoes a success or a refund
        if db.get(Subscription, p.subscription_id).status == "cancelled":
            return "ignored_order_cancelled"
        p.status, p.failed_at, p.failure_reason = "FAILED", now(), (ev.error or "Payment failed")[:200]
        p.attempts += 1
        notify(db, "payment_failed", p.customer_id, "Payment failed", "Your payment didn't go through. Tap to retry with the same link.",
               f"/customer/payment/{p.id}")
        return "failed"
    if ev.type == "link_expired" and link is not None and link.status == "active":
        link.status = "expired"
        return "link_expired"
    return "ignored"


def handle_webhook(db: Session, body: bytes, headers: dict) -> dict:
    gw = get_gateway()
    if not gw.verify_webhook(body, headers):
        log.warning("Rejected webhook with invalid signature")
        raise AppError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature.", 400)
    ev = gw.parse(body, headers)
    # Idempotency: the event id is unique; a redelivery inserts nothing and changes nothing.
    inserted = db.execute(insert(PaymentEvent).values(gateway=gw.name, gateway_event_id=ev.event_id, event=ev.type, payload=ev.raw)
                          .on_conflict_do_nothing(index_elements=["gateway_event_id"]).returning(PaymentEvent.id)).scalar()
    if inserted is None:
        db.rollback()
        return {"status": "duplicate"}
    outcome = process_event(db, ev)
    db.execute(PaymentEvent.__table__.update().where(PaymentEvent.id == inserted).values(outcome=outcome))
    db.commit()
    return {"status": outcome}


def _confirmed_paid(link: PaymentLink, payment_ref: str) -> tuple[str, datetime | None]:
    """A signed redirect only says the browser came back. Before anything is marked PAID, ask the gateway itself for
    the payment: it must be captured, for exactly the link's amount. Returns ("ok" | "not_paid" | "unverified", paid_at)."""
    try:
        info = get_gateway().fetch_payment(payment_ref)
    except AppError:
        return "unverified", None  # gateway unreachable: the webhook settles it later; nothing changes now
    if info is None:  # development sandbox only (refused in production): no gateway API, the signature is the proof
        return "ok", None
    if info["status"] != "captured" or info["amount"] != link.amount_paise:
        return "not_paid", None
    return "ok", info["created_at"]


def _settle_signed_success(db: Session, p: Payment, link: PaymentLink, payment_ref: str) -> str:
    check, paid_at = _confirmed_paid(link, payment_ref)
    if check != "ok":
        return "verification_pending" if check == "unverified" else "not_paid"
    db.refresh(link)
    ev = GatewayEvent(f"callback:{payment_ref}", "paid", link.gateway_link_id, payment_ref, link.amount_paise, None, None, None, {},
                      occurred_at=paid_at)
    if not accepts_payment(link, paid_at):
        return _refund_dead_link(db, p, ev)
    return _mark_paid(db, p, link, ev)


def handle_redirect_callback(db: Session, link_id: str, reference: str, status: str, payment_ref: str, signature: str) -> str:
    """Razorpay's checkout redirect. The HMAC signature (key secret) authenticates it; no login is needed.
    Idempotent with the webhook: whichever arrives first marks PAID, the other is a no-op."""
    gw = get_gateway()
    if not gw.verify_callback(link_id, reference, status, payment_ref, signature):
        raise AppError("PAYMENT_SIGNATURE_INVALID", "Payment could not be verified.", 400)
    link = db.scalar(select(PaymentLink).where(PaymentLink.gateway_link_id == link_id))
    if not link:
        raise not_found("Payment link")
    p = _lock_payment(db, link.payment_id)
    outcome = _settle_signed_success(db, p, link, payment_ref) if status == "paid" else "not_paid"
    db.commit()
    return outcome


def verify_client_callback(db: Session, customer_id: int, payment_id: int, body: dict) -> Payment:
    """F2: the app returns from checkout with the gateway's signed parameters; verify them server-side.
    The webhook may already have done this — either order ends PAID exactly once."""
    p = _lock_payment(db, payment_id)
    if p.customer_id != customer_id:
        raise not_found("Payment")
    gw = get_gateway()
    link_id, ref, status, pref, sig = (body.get(k, "") for k in ("linkId", "referenceId", "status", "paymentRef", "signature"))
    if not gw.verify_callback(link_id, ref, status, pref, sig):
        raise AppError("PAYMENT_SIGNATURE_INVALID", "Payment could not be verified.", 400)
    link = db.scalar(select(PaymentLink).where(PaymentLink.gateway_link_id == link_id, PaymentLink.payment_id == p.id))
    if not link:
        raise not_found("Payment link")
    if status == "paid":
        _settle_signed_success(db, p, link, pref)
    db.commit()
    return p


def cancel_unpaid_order(db: Session, sub: Subscription, at: datetime) -> None:
    """A subscription closed before payment: cancel it and stop every active link, here and at the gateway, so the
    customer can no longer pay for a card that is closed. A no-op once the order is paid or already cancelled."""
    if sub.status != "pending_payment":
        return
    sub.status, sub.cancelled_at = "cancelled", at
    p = db.scalar(select(Payment).where(Payment.subscription_id == sub.id))
    if p:
        for link in db.scalars(select(PaymentLink).where(PaymentLink.payment_id == p.id, PaymentLink.status == "active")):
            link.status = "cancelled"
            get_gateway().cancel_link(link.gateway_link_id)


# ---------------- Refunds (F5) ----------------
def first_visit_at(db: Session, sub: Subscription) -> datetime:
    first = db.scalar(select(Visit.starts_at).where(Visit.subscription_id == sub.id, Visit.status != "cancelled")
                      .order_by(Visit.starts_at).limit(1))
    if first is None:  # schedule not built yet by the worker: derive the first visit from start date + slot
        from app.domain import ist_datetime
        from app.services.bookings import _slot_times
        first = ist_datetime(sub.start_date, _slot_times(settings_svc.load(db), sub.slot)[0])
    return first


def refund_quote(db: Session, sub: Subscription, p: Payment | None, at: datetime) -> int:
    """The refund a cancellation at `at` earns, from the server's stored amount and the 2-hour rule. Never from the app.
    Cancelling after the first visit has started is outside the assignment's rule and is refused (handled by support)."""
    if sub.status != "active" or not p or p.status != "PAID":
        return 0
    s = settings_svc.load(db)
    try:
        return refund_amount(p.amount_paise, first_visit_at(db, sub), at, full_refund_before_hours=s.float("refund_full_before_h"),
                             partial_percent=s.int("refund_partial_pct"))
    except RefundNotAllowed:
        raise AppError("REFUND_NOT_ALLOWED", "Cancellation after the first visit is handled by support.", 409) from None


def _own_subscription(db: Session, customer: User, sub_id: int, *, lock: bool) -> tuple[Subscription, Payment | None]:
    # Lock order matches payment confirmation (payment, then subscription, then request), so they never deadlock.
    q = select(Payment).join(Subscription, Subscription.id == Payment.subscription_id).where(
        Subscription.id == sub_id, Subscription.customer_id == customer.id)
    p = db.scalar(q.with_for_update(of=Payment) if lock else q)
    sq = select(Subscription).where(Subscription.id == sub_id, Subscription.customer_id == customer.id)
    sub = db.scalar(sq.with_for_update() if lock else sq)
    if not sub:
        raise not_found("Subscription")
    if sub.status not in ("pending_payment", "active"):
        raise AppError("SUBSCRIPTION_NOT_CANCELLABLE", "This subscription cannot be cancelled.", 409)
    return sub, p


def cancellation_preview(db: Session, customer: User, sub_id: int) -> dict:
    """What cancelling now would refund, so the app shows the server's number before the customer confirms."""
    sub, p = _own_subscription(db, customer, sub_id, lock=False)
    paise = refund_quote(db, sub, p, now())
    paid = bool(sub.status == "active" and p and p.status == "PAID")
    return {"subscriptionId": str(sub.id), "paid": paid, "amountPaid": p.amount_paise / 100 if paid else 0,
            "refundPaise": paise, "refundAmount": paise / 100, "fullRefund": paid and paise == p.amount_paise,
            "firstVisitAt": first_visit_at(db, sub).isoformat() if paid else None}


def cancel_subscription(db: Session, customer: User, sub_id: int, reason: str | None) -> dict:
    sub, p = _own_subscription(db, customer, sub_id, lock=True)
    r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == sub.request_id).with_for_update())
    refund_paise = refund_quote(db, sub, p, now())
    if refund_paise:
        # Requested from the gateway and tracked as "requested": the payment becomes REFUNDED / PARTIALLY_REFUNDED only
        # when the gateway confirms it (refund.processed). The subscription row lock above stops a second request.
        rid = get_gateway().refund(p.gateway_payment_id, refund_paise)
        db.add(Refund(payment_id=p.id, amount_paise=refund_paise, gateway_refund_id=rid, reason=reason or "Customer cancelled"))
    elif sub.status == "pending_payment":
        cancel_unpaid_order(db, sub, now())
    sub.status, sub.cancelled_at = "cancelled", now()
    for v in db.scalars(select(Visit).where(Visit.subscription_id == sub.id, Visit.status.in_(("pending_assignment", "needs_manual_assignment", "scheduled")))):
        v.status, v.cancelled_at = "cancelled", now()
    if r.stage == "subscription_requested":
        from app.services.bookings import move
        move(db, r, board.Stage.CLOSED, "customer", Actor.of(customer), "Customer cancelled subscription")
        r.closed_reason = "Customer cancelled"
    audit(db, Actor.of(customer), "Cancelled subscription", f"Subscription {sub.id}", reason=reason, meta={"refund_paise": refund_paise})
    db.commit()
    return {"subscriptionId": str(sub.id), "refundAmount": refund_paise / 100, "refundPaise": refund_paise}


# ---------------- Scheduled (F6) ----------------
def expire_links_and_close_unpaid(db: Session) -> tuple[int, int]:
    s = settings_svc.load(db)
    t = now()
    expired = 0
    for link in db.scalars(select(PaymentLink).where(PaymentLink.status == "active", PaymentLink.expires_at <= t)
                           .with_for_update(skip_locked=True)):
        link.status = "expired"
        expired += 1
        p = db.get(Payment, link.payment_id)
        notify(db, "payment_link_expired", p.customer_id, "Payment link expired", "Generate a fresh link from the app to subscribe.",
               f"/customer/payment/{p.id}")
    db.commit()
    closed = 0
    cutoff = t - timedelta(days=s.int("unpaid_close_days"))
    from app.services.bookings import move
    due = db.scalars(select(ServiceRequest.id).where(ServiceRequest.stage == "subscription_requested",
                                                     ServiceRequest.subscription_requested_at < cutoff)).all()
    for rid in due:
        # Same lock order as a payment confirmation (payment, then request), and re-checked under the locks: a payment
        # landing at this moment either wins (the card has moved to payment_done) or then finds its link cancelled and
        # is refunded. Safe to run repeatedly: a closed card no longer matches.
        pay = db.scalar(select(Payment).join(Subscription, Subscription.id == Payment.subscription_id)
                        .where(Subscription.request_id == rid).with_for_update(of=Payment))
        r = db.scalar(select(ServiceRequest).where(ServiceRequest.id == rid).with_for_update())
        if r.stage != "subscription_requested" or (pay is not None and pay.status not in ("CREATED", "FAILED")):
            db.commit()
            continue
        move(db, r, board.Stage.CLOSED, "system", SYSTEM, "Unpaid for 7 days")
        r.closed_reason = "Not paid within the time limit"
        sub = db.scalar(select(Subscription).where(Subscription.request_id == r.id))
        if sub:
            cancel_unpaid_order(db, sub, t)
        closed += 1
        db.commit()
    return expired, closed
