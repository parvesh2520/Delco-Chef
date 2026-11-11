import html
import json
import secrets

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ADMIN_ROLES, Principal, current, customer_only
from app.api.schemas import CallbackIn
from app.core.database import get_db
from app.core.errors import AppError, not_found
from app.models import Payment, PaymentLink, Subscription
from app.services import payments as svc
from app.services.gateway import SandboxGateway, get_gateway
from app.services.presenters import payment_json

router = APIRouter(prefix="/payments", tags=["Payments"])


def _visible(db: Session, p: Principal, payment_id: int) -> Payment:
    pay = db.get(Payment, payment_id)
    if not pay or (p.user.role == "customer" and pay.customer_id != p.user.id) or p.user.role == "chef":
        raise not_found("Payment")  # chefs never see payment information
    return pay


@router.get("", summary="Customer: my payment history. Admin: all payments.")
def list_payments(p: Principal = Depends(current), db: Session = Depends(get_db)):
    q = select(Payment).order_by(Payment.created_at.desc()).limit(200)
    if p.user.role == "customer":
        q = q.where(Payment.customer_id == p.user.id)
    elif p.user.role not in ADMIN_ROLES:
        raise AppError("FORBIDDEN", "You do not have access to this.", 403)
    return [payment_json(db, x, p.user.role) for x in db.scalars(q)]


@router.get("/by-subscription/{sub_id}")
def for_subscription(sub_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    pay = db.scalar(select(Payment).where(Payment.subscription_id == sub_id))
    if not pay:
        return None
    return payment_json(db, _visible(db, p, pay.id), p.user.role)


@router.get("/{payment_id}")
def get_payment(payment_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    return payment_json(db, _visible(db, p, payment_id), p.user.role)


@router.get("/{payment_id}/receipt", summary="Receipt for a paid order (no card details are ever stored)")
def receipt(payment_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    pay = _visible(db, p, payment_id)
    if pay.status not in ("PAID", "REFUNDED", "PARTIALLY_REFUNDED"):
        raise AppError("RECEIPT_NOT_AVAILABLE", "A receipt is available after payment.", 409)
    sub = db.get(Subscription, pay.subscription_id)
    return {"receiptNo": f"DC-{pay.id:06d}", **payment_json(db, pay, p.user.role), "startDate": sub.start_date.isoformat(),
            "endDate": sub.end_date.isoformat(), "members": sub.members, "visits": sub.planned_visits,
            "perVisit": sub.per_visit_paise / 100}


@router.post("/{payment_id}/regenerate", summary="Fresh link; the old one stops working immediately")
def regenerate(payment_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    pay = _visible(db, p, payment_id)
    pay = svc.regenerate_link(db, p.actor, pay.id, p.user.id if p.user.role == "customer" else None)
    return payment_json(db, pay, p.user.role)


@router.post("/{payment_id}/resend")
def resend(payment_id: int, p: Principal = Depends(current), db: Session = Depends(get_db)):
    pay = _visible(db, p, payment_id)
    return payment_json(db, svc.resend_link(db, p.actor, pay.id), p.user.role)


@router.post("/{payment_id}/verify", summary="Verify the gateway's signed checkout callback")
def verify(payment_id: int, body: CallbackIn, p: Principal = Depends(customer_only), db: Session = Depends(get_db)):
    return payment_json(db, svc.verify_client_callback(db, p.user.id, payment_id, body.model_dump()), "customer")


@router.post("/webhook", include_in_schema=True, summary="Gateway webhook: signature-verified, idempotent")
async def webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    return svc.handle_webhook(db, body, {k.lower(): v for k, v in request.headers.items()})


@router.get("/razorpay/callback", response_class=HTMLResponse, summary="Razorpay checkout redirect (signature-verified)")
def razorpay_callback(razorpay_payment_id: str = "", razorpay_payment_link_id: str = "", razorpay_payment_link_reference_id: str = "",
                      razorpay_payment_link_status: str = "", razorpay_signature: str = "", db: Session = Depends(get_db)):
    outcome = svc.handle_redirect_callback(db, razorpay_payment_link_id, razorpay_payment_link_reference_id,
                                           razorpay_payment_link_status, razorpay_payment_id, razorpay_signature)
    msg = {"paid": "Payment successful. Return to the Delco app.", "already_paid": "Payment already confirmed. Return to the Delco app.",
           "dead_link_refunded": "This link was no longer valid; your payment will be refunded."}.get(outcome, "Payment was not completed. Return to the app to retry.")
    return f"<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:24px'><h2>{html.escape(msg)}</h2></body>"


# ---------------- Development sandbox checkout (only when Razorpay keys are absent) ----------------
def _sandbox() -> SandboxGateway:
    gw = get_gateway()
    if not isinstance(gw, SandboxGateway):
        raise not_found("Page")
    return gw


@router.get("/sandbox/checkout/{link_id}", response_class=HTMLResponse, include_in_schema=False)
def sandbox_page(link_id: str, db: Session = Depends(get_db)):
    _sandbox()
    link = db.scalar(select(PaymentLink).where(PaymentLink.gateway_link_id == link_id))
    if not link:
        raise not_found("Link")
    amount = f"₹{link.amount_paise // 100:,}.{link.amount_paise % 100:02d}"
    lid = html.escape(link_id)
    return f"""<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><title>Test checkout</title>
<style>body{{font-family:system-ui;margin:0;padding:24px;background:#F7F2EA;color:#2D2340}}.c{{max-width:420px;margin:auto;background:#fff;border-radius:16px;padding:24px}}
button{{width:100%;padding:14px;border:0;border-radius:12px;font-size:16px;margin-top:12px}}.p{{background:#2D2340;color:#fff}}.f{{background:#fde8e8;color:#9b1c1c}}
.t{{background:#fff3cd;padding:8px 12px;border-radius:8px;font-size:13px}}</style></head><body><div class=c>
<p class=t>TEST MODE · Delco sandbox gateway · no real money moves</p><h2>Delco Chefs</h2><p>Amount <b>{amount}</b></p>
<p>Link status: <b>{html.escape(link.status)}</b></p>
<form method=post><input type=hidden name=method value=upi><button class=p name=outcome value=paid>Pay {amount} (test)</button>
<button class=f name=outcome value=failed>Simulate failure (test)</button></form></div></body></html>"""


@router.post("/sandbox/checkout/{link_id}", response_class=HTMLResponse, include_in_schema=False)
def sandbox_submit(link_id: str, outcome: str = Form(...), method: str = Form("upi"), db: Session = Depends(get_db)):
    """The sandbox 'gateway' signs a webhook and delivers it through the real verification + processing path."""
    gw = _sandbox()
    link = db.scalar(select(PaymentLink).where(PaymentLink.gateway_link_id == link_id))
    if not link:
        raise not_found("Link")
    pref = f"pay_sbx_{secrets.token_hex(8)}"
    event = {"id": f"evt_{secrets.token_hex(10)}", "type": "paid" if outcome == "paid" else "failed", "link_id": link_id,
             "payment_ref": pref, "amount": link.amount_paise, "method": method,
             "error": None if outcome == "paid" else "Payment declined by the test bank"}
    body = json.dumps(event).encode()
    result = svc.handle_webhook(db, body, {"x-sandbox-signature": gw.sign(body)})
    msg = {"paid": "Payment successful. Return to the Delco app.", "failed": "Payment failed. Return to the app to retry.",
           "dead_link_refunded": "This link is no longer valid. Your payment was refunded."}.get(result["status"], result["status"])
    return f"<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:24px'><h2>{html.escape(msg)}</h2></body>"
