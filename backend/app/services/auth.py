"""A1–A4: phone OTP sign-in, abuse limits, access/refresh tokens, one role per phone, admin provisioning only."""
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.errors import AppError
from app.models import Chef, CustomerProfile, OtpChallenge, RefreshToken, User
from app.services.events import Actor, audit

log = logging.getLogger("auth")

OTP_TTL = timedelta(minutes=5)
OTP_MAX_REQUESTS_PER_HOUR = 5
OTP_MAX_ATTEMPTS = 5
OTP_LOCK = timedelta(minutes=15)
PORTAL_ROLES = {"customer": {"customer"}, "chef": {"chef"}, "admin": {"ops_admin", "super_admin"}}
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"[\s\-()]", "", raw or "")
    if digits.startswith("+91"):
        digits = digits[3:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if not PHONE_RE.match(digits):
        raise AppError("INVALID_PHONE", "Enter a valid 10-digit Indian mobile number.", 422, fields={"phone": "invalid"})
    return digits


# ---------------- OTP delivery (provider interface) ----------------
class LogOtpProvider:
    """Mock SMS provider (assignment §3.1). The code is written to the server log in development only."""

    def send(self, phone: str, code: str) -> None:
        if settings.is_production:
            log.warning("OTP issued for %s via log provider; configure a real SMS provider", security.mask_phone(phone))
        else:
            log.info("DEV OTP for %s: %s (valid 5 min)", security.mask_phone(phone), code, extra={"allow_secret": True})


OTP_PROVIDERS = {"log": LogOtpProvider}
otp_provider = OTP_PROVIDERS[settings.OTP_PROVIDER]()


def _user_by_phone(db: Session, phone: str) -> User | None:
    return db.scalar(select(User).where(User.phone_hmac == security.lookup_hash(phone)))


def _check_portal(db: Session, user: User | None, portal: str, phone: str) -> None:
    if portal == "admin" and (user is None or user.role not in PORTAL_ROLES["admin"] or user.status != "active"):
        audit(db, Actor(None, "anonymous"), "Unauthorized admin sign-in attempt", security.mask_phone(phone),
              meta={"phone_hmac": security.lookup_hash(phone)})
        db.commit()
        raise AppError("ADMIN_NOT_AUTHORIZED", "This number is not authorized for the admin app.", 403)
    if user and user.status != "active":
        raise AppError("ACCOUNT_DISABLED", "This account is not active.", 403)
    if user and user.role not in PORTAL_ROLES[portal]:
        raise AppError("ROLE_MISMATCH", "This number is registered for a different app. A number holds one role only.", 403)


def request_otp(db: Session, raw_phone: str, portal: str) -> dict:
    phone = normalize_phone(raw_phone)
    if portal not in PORTAL_ROLES:
        raise AppError("INVALID_PORTAL", "Unknown sign-in portal.", 422)
    phash = security.lookup_hash(phone)
    t = now()
    locked = db.scalar(select(func.max(OtpChallenge.locked_until)).where(OtpChallenge.phone_hmac == phash))
    if locked and locked > t:
        raise AppError("OTP_LOCKED", "Too many wrong codes. Try again later.", 429, retry_after=int((locked - t).total_seconds()) + 1)
    recent = db.scalars(select(OtpChallenge.created_at).where(OtpChallenge.phone_hmac == phash,
                                                              OtpChallenge.created_at > t - timedelta(hours=1))
                        .order_by(OtpChallenge.created_at)).all()
    if len(recent) >= OTP_MAX_REQUESTS_PER_HOUR:
        retry = int((recent[0] + timedelta(hours=1) - t).total_seconds()) + 1
        raise AppError("OTP_RATE_LIMITED", "Too many code requests. Try again later.", 429, retry_after=retry)
    _check_portal(db, _user_by_phone(db, phone), portal, phone)
    # Only the newest code is valid.
    db.execute(update(OtpChallenge).where(OtpChallenge.phone_hmac == phash, OtpChallenge.consumed_at.is_(None))
               .values(consumed_at=t))
    code = security.numeric_code(6)
    db.add(OtpChallenge(phone_hmac=phash, code_hash=security.secret_hash(f"{phash}:{code}"), portal=portal, expires_at=t + OTP_TTL))
    db.commit()
    otp_provider.send(phone, code)
    return {"sentTo": security.mask_phone(phone), "expiresInSec": int(OTP_TTL.total_seconds()), "resendAfterSec": 30}


def verify_otp(db: Session, raw_phone: str, code: str, portal: str, device: str | None = None) -> dict:
    phone = normalize_phone(raw_phone)
    phash = security.lookup_hash(phone)
    t = now()
    ch = db.scalar(select(OtpChallenge).where(OtpChallenge.phone_hmac == phash).order_by(OtpChallenge.created_at.desc())
                   .limit(1).with_for_update())
    if ch and ch.locked_until and ch.locked_until > t:
        raise AppError("OTP_LOCKED", "Too many wrong codes. Try again later.", 429, retry_after=int((ch.locked_until - t).total_seconds()) + 1)
    if not ch or ch.consumed_at is not None:
        raise AppError("OTP_NOT_FOUND", "This code has already been used or replaced. Request a new code.", 400)
    if ch.portal != portal:
        raise AppError("OTP_NOT_FOUND", "Request a new code for this app.", 400)
    if ch.expires_at <= t:
        raise AppError("OTP_EXPIRED", "This code has expired. Request a new code.", 400)
    if not (code or "").isdigit() or not security.constant_eq(ch.code_hash, security.secret_hash(f"{phash}:{code}")):
        ch.attempts += 1
        if ch.attempts >= OTP_MAX_ATTEMPTS:
            ch.locked_until, ch.consumed_at = t + OTP_LOCK, t
            db.commit()
            raise AppError("OTP_LOCKED", "Too many wrong codes. Try again in 15 minutes.", 429, retry_after=int(OTP_LOCK.total_seconds()))
        db.commit()
        left = OTP_MAX_ATTEMPTS - ch.attempts
        raise AppError("OTP_INVALID", f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left.", 400,
                       extra={"attemptsRemaining": left})
    ch.consumed_at = t  # single use

    user = _user_by_phone(db, phone)
    _check_portal(db, user, portal, phone)
    if user is None:  # self sign-up exists for customers and chefs only — never admins
        user = User(role=portal, phone_enc=security.encrypt(phone), phone_hmac=phash)
        db.add(user)
        db.flush()
        if portal == "customer":
            db.add(CustomerProfile(user_id=user.id))
        else:
            db.add(Chef(user_id=user.id, status="draft"))
    tokens = _issue(db, user, uuid.uuid4().hex, device)
    db.commit()
    return session_payload(db, user, tokens)


def _issue(db: Session, user: User, session_id: str, device: str | None) -> dict:
    access, ttl = security.create_access_token(user.id, user.role, session_id)
    refresh = security.new_token()
    db.add(RefreshToken(user_id=user.id, token_hash=security.secret_hash(refresh), session_id=session_id, device=device,
                        expires_at=now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    return {"token": access, "refreshToken": refresh, "expiresIn": ttl}


def session_payload(db: Session, user: User, tokens: dict | None = None) -> dict:
    from app.services.presenters import user_json
    out = {"user": user_json(user), **(tokens or {})}
    if user.role == "customer":
        prof = db.get(CustomerProfile, user.id)
        out["onboarded"] = bool(prof and prof.onboarded_at)
    elif user.role == "chef":
        out["chefStatus"] = db.scalar(select(Chef.status).where(Chef.user_id == user.id))
    return out


def refresh(db: Session, refresh_token: str) -> dict:
    t = now()
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == security.secret_hash(refresh_token)).with_for_update())
    if rt is None:
        raise AppError("REFRESH_INVALID", "Session expired. Please sign in again.", 401)
    if rt.revoked_at or rt.rotated_at:
        # Reuse of a rotated token means it was stolen: kill the whole session.
        db.execute(update(RefreshToken).where(RefreshToken.session_id == rt.session_id, RefreshToken.revoked_at.is_(None))
                   .values(revoked_at=t))
        db.commit()
        raise AppError("REFRESH_REVOKED", "Session expired. Please sign in again.", 401)
    if rt.expires_at <= t:
        raise AppError("REFRESH_EXPIRED", "Session expired. Please sign in again.", 401)
    user = db.get(User, rt.user_id)
    if not user or user.status != "active":
        raise AppError("ACCOUNT_DISABLED", "This account is not active.", 401)
    rt.rotated_at = t
    tokens = _issue(db, user, rt.session_id, rt.device)
    db.commit()
    return session_payload(db, user, tokens)


def revoke_session(db: Session, user_id: int, session_id: str) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.session_id == session_id,
                                          RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))


def revoke_all(db: Session, user_id: int) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))


def list_sessions(db: Session, user_id: int, current_sid: str) -> list[dict]:
    rows = db.execute(select(RefreshToken.session_id, func.min(RefreshToken.created_at), func.max(RefreshToken.created_at),
                             func.max(RefreshToken.device))
                      .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now())
                      .group_by(RefreshToken.session_id)).all()
    return [{"id": sid, "createdAt": c.isoformat(), "lastActiveAt": la.isoformat(), "device": d, "current": sid == current_sid}
            for sid, c, la, d in rows]


def session_active(db: Session, session_id: str) -> bool:
    return db.scalar(select(func.count()).select_from(RefreshToken).where(
        RefreshToken.session_id == session_id, RefreshToken.revoked_at.is_(None))) > 0
