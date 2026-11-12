"""Payment gateway adapters.

RazorpayGateway — Razorpay Payment Links in TEST mode (rzp_test_ keys only).
SandboxGateway  — development-only stand-in used when Razorpay keys are not configured. It serves its own hosted
                  checkout page and delivers HMAC-signed webhooks into the same verification + processing path as
                  Razorpay. It refuses to run in production.
"""
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.core.errors import AppError


@dataclass
class GatewayEvent:
    event_id: str
    type: str  # paid | failed | refund_processed | refund_failed | link_expired | other
    link_id: str | None
    payment_ref: str | None  # gateway payment id
    amount_paise: int | None
    method: str | None
    error: str | None
    refund_id: str | None
    raw: dict
    reference: str | None = None  # our order reference ("pay_<payment id>_<ts>"), when the gateway echoes it
    occurred_at: datetime | None = None  # when the customer paid, per the gateway (a webhook may arrive much later)


def _ts(v) -> datetime | None:
    return datetime.fromtimestamp(int(v), UTC) if v else None


def _hmac(secret: str, msg: bytes) -> str:
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


class RazorpayGateway:
    name = "razorpay"
    base = "https://api.razorpay.com/v1"

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str | None):
        if not key_id.startswith("rzp_test_"):
            raise RuntimeError("Only Razorpay TEST keys are allowed (rzp_test_…).")
        self.key_id, self.key_secret, self.webhook_secret = key_id, key_secret, webhook_secret

    def _post(self, path: str, body: dict) -> dict:
        return self._call("POST", path, body)

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        try:
            r = httpx.request(method, f"{self.base}{path}", json=body, auth=(self.key_id, self.key_secret), timeout=15)
        except httpx.HTTPError:
            raise AppError("GATEWAY_UNAVAILABLE", "Payment gateway is unreachable. Try again shortly.", 503) from None
        if r.status_code >= 400:
            raise AppError("GATEWAY_ERROR", "Payment gateway rejected the request.", 502)
        return r.json()

    def create_link(self, *, reference: str, amount_paise: int, expires_at: datetime, description: str, customer_name: str) -> tuple[str, str]:
        data = self._post("/payment_links", {
            "amount": amount_paise, "currency": "INR", "accept_partial": False, "reference_id": reference,
            "expire_by": int(expires_at.timestamp()), "description": description[:2048],
            "customer": {"name": customer_name[:50]}, "notify": {"sms": False, "email": False}, "reminder_enable": False,
            "notes": {"reference": reference},
            # After checkout Razorpay redirects here with signed parameters (works without a public webhook URL).
            "callback_url": f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/payments/razorpay/callback",
            "callback_method": "get",
        })
        return data["id"], data["short_url"]

    def cancel_link(self, link_id: str) -> None:
        try:
            self._post(f"/payment_links/{link_id}/cancel", {})
        except AppError:
            pass  # already paid/expired/cancelled at the gateway — our DB status is authoritative for refusal

    def refund(self, payment_ref: str, amount_paise: int) -> str:
        return self._post(f"/payments/{payment_ref}/refund", {"amount": amount_paise, "speed": "normal"})["id"]

    def fetch_payment(self, payment_ref: str) -> dict | None:
        """Server-to-gateway check used before trusting a browser redirect: the payment's real status and amount."""
        d = self._call("GET", f"/payments/{payment_ref}")
        return {"status": d.get("status"), "amount": d.get("amount"), "created_at": _ts(d.get("created_at"))}

    def verify_webhook(self, body: bytes, headers: dict) -> bool:
        sig = headers.get("x-razorpay-signature", "")
        return bool(self.webhook_secret) and hmac.compare_digest(_hmac(self.webhook_secret, body), sig)

    def verify_callback(self, link_id: str, reference: str, status: str, payment_ref: str, signature: str) -> bool:
        return hmac.compare_digest(_hmac(self.key_secret, f"{link_id}|{reference}|{status}|{payment_ref}".encode()), signature)

    def parse(self, body: bytes, headers: dict) -> GatewayEvent:
        d = json.loads(body)
        ev = d.get("event", "")
        p = d.get("payload", {})
        pay = (p.get("payment") or {}).get("entity") or {}
        link = (p.get("payment_link") or {}).get("entity") or {}
        refund = (p.get("refund") or {}).get("entity") or {}
        typ = {"payment_link.paid": "paid", "payment.failed": "failed", "refund.processed": "refund_processed",
               "refund.failed": "refund_failed", "payment_link.expired": "link_expired",
               "payment_link.cancelled": "link_expired"}.get(ev, "other")
        event_id = headers.get("x-razorpay-event-id") or f"{ev}:{pay.get('id') or refund.get('id') or link.get('id')}"
        notes = pay.get("notes") if isinstance(pay.get("notes"), dict) else {}
        link_id = link.get("id") or notes.get("payment_link_id")
        # payment.failed carries only the payment entity; our order reference (link notes) is how it finds its order.
        reference = link.get("reference_id") or notes.get("reference")
        # Store only what processing and support need: no contact, email, card, VPA or bank details.
        raw = {"event": ev,
               "payment": {k: pay.get(k) for k in ("id", "amount", "status", "method", "order_id", "error_code",
                                                   "error_description", "created_at") if k in pay},
               "payment_link": {k: link.get(k) for k in ("id", "status", "reference_id", "amount", "amount_paid") if k in link},
               "refund": {k: refund.get(k) for k in ("id", "payment_id", "amount", "status") if k in refund}}
        return GatewayEvent(event_id, typ, link_id, pay.get("id") or refund.get("payment_id"), pay.get("amount") or refund.get("amount"),
                            pay.get("method"), pay.get("error_description"), refund.get("id"), raw, reference,
                            _ts(pay.get("created_at")))


class SandboxGateway:
    name = "sandbox"

    def __init__(self):
        if settings.is_production:
            raise RuntimeError("Sandbox gateway is development-only. Configure Razorpay test keys.")
        self.secret = settings.SANDBOX_WEBHOOK_SECRET

    def create_link(self, *, reference: str, amount_paise: int, expires_at: datetime, description: str, customer_name: str) -> tuple[str, str]:
        link_id = f"plink_sbx_{secrets.token_hex(8)}"
        return link_id, f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/payments/sandbox/checkout/{link_id}"

    def cancel_link(self, link_id: str) -> None:
        return None

    def refund(self, payment_ref: str, amount_paise: int) -> str:
        return f"rfnd_sbx_{secrets.token_hex(8)}"

    def fetch_payment(self, payment_ref: str) -> dict | None:
        return None  # no gateway API to ask: in development the signed callback is the proof (never in production)

    def sign(self, body: bytes) -> str:
        return _hmac(self.secret, body)

    def verify_webhook(self, body: bytes, headers: dict) -> bool:
        return hmac.compare_digest(self.sign(body), headers.get("x-sandbox-signature", ""))

    def verify_callback(self, link_id: str, reference: str, status: str, payment_ref: str, signature: str) -> bool:
        return hmac.compare_digest(_hmac(self.secret, f"{link_id}|{reference}|{status}|{payment_ref}".encode()), signature)

    def parse(self, body: bytes, headers: dict) -> GatewayEvent:
        d = json.loads(body)
        return GatewayEvent(d["id"], d["type"], d.get("link_id"), d.get("payment_ref"), d.get("amount"), d.get("method"),
                            d.get("error"), d.get("refund_id"), d, d.get("reference"), _ts(d.get("created_at")))


_gateway = None


def get_gateway():
    global _gateway
    if _gateway is None:
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            _gateway = RazorpayGateway(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET, settings.RAZORPAY_WEBHOOK_SECRET)
        else:
            _gateway = SandboxGateway()
    return _gateway
