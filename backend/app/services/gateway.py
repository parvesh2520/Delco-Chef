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
from datetime import datetime

import httpx

from app.core.config import settings
from app.core.errors import AppError


@dataclass
class GatewayEvent:
    event_id: str
    type: str  # paid | failed | refund_processed | link_expired | other
    link_id: str | None
    payment_ref: str | None  # gateway payment id
    amount_paise: int | None
    method: str | None
    error: str | None
    refund_id: str | None
    raw: dict


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
        try:
            r = httpx.post(f"{self.base}{path}", json=body, auth=(self.key_id, self.key_secret), timeout=15)
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
               "payment_link.expired": "link_expired", "payment_link.cancelled": "link_expired"}.get(ev, "other")
        event_id = headers.get("x-razorpay-event-id") or f"{ev}:{pay.get('id') or refund.get('id') or link.get('id')}"
        link_id = link.get("id") or (pay.get("notes") or {}).get("payment_link_id")
        return GatewayEvent(event_id, typ, link_id, pay.get("id") or refund.get("payment_id"), pay.get("amount") or refund.get("amount"),
                            pay.get("method"), pay.get("error_description"), refund.get("id"), d)


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

    def sign(self, body: bytes) -> str:
        return _hmac(self.secret, body)

    def verify_webhook(self, body: bytes, headers: dict) -> bool:
        return hmac.compare_digest(self.sign(body), headers.get("x-sandbox-signature", ""))

    def verify_callback(self, link_id: str, reference: str, status: str, payment_ref: str, signature: str) -> bool:
        return hmac.compare_digest(_hmac(self.secret, f"{link_id}|{reference}|{status}|{payment_ref}".encode()), signature)

    def parse(self, body: bytes, headers: dict) -> GatewayEvent:
        d = json.loads(body)
        return GatewayEvent(d["id"], d["type"], d.get("link_id"), d.get("payment_ref"), d.get("amount"), d.get("method"),
                            d.get("error"), d.get("refund_id"), d)


_gateway = None


def get_gateway():
    global _gateway
    if _gateway is None:
        if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET:
            _gateway = RazorpayGateway(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET, settings.RAZORPAY_WEBHOOK_SECRET)
        else:
            _gateway = SandboxGateway()
    return _gateway
