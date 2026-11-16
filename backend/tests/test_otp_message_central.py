"""Message Central VerifyNow: it makes and checks the code; our attempt limits and single use still apply."""
import httpx
import pytest

from app.core.config import settings
from app.services import auth as auth_svc

V = "/api/v1"


class FakeMessageCentral:
    """In-memory VerifyNow: issues tokens, sends a fixed 6-digit code per verificationId, validates it once."""

    def __init__(self):
        self.calls, self.codes, self.n, self.expire_token_once, self.fail_send = [], {}, 0, False, False

    def request(self, method, url, params=None, headers=None, timeout=None):
        path = url.removeprefix(auth_svc.MessageCentralOtpProvider.BASE)
        self.calls.append((method, path, dict(params or {}), dict(headers or {})))
        if path == "/auth/v1/authentication/token":
            assert params["customerId"] == "C-TEST" and params["key"] == "cGFzcw=="  # base64("pass")
            self.n += 1
            return httpx.Response(200, json={"status": 200, "token": f"tok{self.n}"})
        if self.expire_token_once:
            self.expire_token_once = False
            return httpx.Response(401, json={"responseCode": 401})
        if path == "/verification/v3/send":
            if self.fail_send:
                return httpx.Response(400, json={"responseCode": 511, "message": "INVALID_COUNTRY_CODE"})
            assert params["otpLength"] == 6 and params["flowType"] == "SMS" and headers["authToken"].startswith("tok")
            vid = str(1000 + len(self.codes))
            self.codes[vid] = "482913"
            return httpx.Response(200, json={"responseCode": 200, "message": "SUCCESS", "data": {"verificationId": vid}})
        if path == "/verification/v3/validateOtp":
            vid, code = params["verificationId"], params["code"]
            if self.codes.get(vid) is None:
                return httpx.Response(400, json={"responseCode": 703, "message": "ALREADY_VERIFIED"})
            if code != self.codes[vid]:
                return httpx.Response(400, json={"responseCode": 702, "message": "WRONG_OTP_PROVIDED"})
            self.codes[vid] = None
            return httpx.Response(200, json={"responseCode": 200, "data": {"verificationStatus": "VERIFICATION_COMPLETED"}})
        raise AssertionError(path)


@pytest.fixture
def mc(monkeypatch):
    fake = FakeMessageCentral()
    monkeypatch.setattr(settings, "MESSAGE_CENTRAL_CUSTOMER_ID", "C-TEST")
    monkeypatch.setattr(settings, "MESSAGE_CENTRAL_PASSWORD", "pass")
    monkeypatch.setattr(auth_svc.httpx, "request", fake.request)
    monkeypatch.setattr(auth_svc, "otp_provider", auth_svc.MessageCentralOtpProvider())
    return fake


def _request(client, phone):
    return client.post(f"{V}/auth/otp/request", json={"phone": phone, "portal": "customer"})


def _verify(client, phone, code):
    return client.post(f"{V}/auth/otp/verify", json={"phone": phone, "code": code, "portal": "customer"})


def test_code_sent_and_checked_by_message_central(client, mc):
    assert _request(client, "9876500081").status_code == 200
    wrong = _verify(client, "9876500081", "111111")
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "OTP_INVALID"
    assert wrong.json()["error"]["attemptsRemaining"] == 4  # our attempt limit still counts
    ok = _verify(client, "9876500081", "482913")
    assert ok.status_code == 200
    again = _verify(client, "9876500081", "482913")  # single use
    assert again.json()["error"]["code"] == "OTP_NOT_FOUND"
    assert sum(1 for c in mc.calls if c[1] == "/auth/v1/authentication/token") == 1  # token reused


def test_expired_token_is_renewed_once(client, mc):
    _request(client, "9876500082")
    mc.expire_token_once = True
    assert _verify(client, "9876500082", "482913").status_code == 200
    assert sum(1 for c in mc.calls if c[1] == "/auth/v1/authentication/token") == 2


def test_failed_send_falls_back_to_our_logged_code(client, mc, monkeypatch):
    mc.fail_send = True
    logged = []
    monkeypatch.setattr(auth_svc.log, "info", lambda msg, *a, **k: logged.append(msg % a))
    assert _request(client, "9876500083").status_code == 200  # codes are logged in tests: sign-in carries on
    code = next(m.split(": ")[1][:6] for m in logged if m.startswith("DEV OTP"))
    assert _verify(client, "9876500083", code).status_code == 200  # checked against our own hash, not the provider
