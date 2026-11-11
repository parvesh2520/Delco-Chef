"""Cryptography: field encryption (AES-256-GCM), keyed lookups (HMAC-SHA256), OTP/token hashing, JWTs."""
import base64
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_ENC_KEY = base64.urlsafe_b64decode(settings.FIELD_ENCRYPTION_KEY)
_HMAC_KEY = base64.urlsafe_b64decode(settings.HMAC_LOOKUP_KEY)
if len(_ENC_KEY) != 32:
    raise RuntimeError("FIELD_ENCRYPTION_KEY must decode to 32 bytes")
_aes = AESGCM(_ENC_KEY)
_VERSION = b"v1"


def encrypt(plain: str | None) -> bytes | None:
    """AES-256-GCM with a random 96-bit nonce. Stored as version|nonce|ciphertext+tag."""
    if plain is None:
        return None
    nonce = os.urandom(12)
    return _VERSION + nonce + _aes.encrypt(nonce, plain.encode(), None)


def decrypt(blob: bytes | None) -> str | None:
    if blob is None:
        return None
    blob = bytes(blob)
    if blob[:2] != _VERSION:
        raise ValueError("Unknown ciphertext version")
    return _aes.decrypt(blob[2:14], blob[14:], None).decode()


def lookup_hash(value: str) -> str:
    """Deterministic keyed hash so encrypted columns stay searchable (e.g. find a user by phone)."""
    return hmac.new(_HMAC_KEY, value.strip().encode(), hashlib.sha256).hexdigest()


def secret_hash(value: str) -> str:
    """For OTPs, refresh tokens and check-in codes: keyed with SECRET_KEY so a DB leak alone can't brute-force 6 digits."""
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def constant_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def numeric_code(digits: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(digits))


def new_token() -> str:
    return secrets.token_urlsafe(48)


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return f"+91 {phone[:2]}••••••{phone[-2:]}"


def mask_tail(value: str | None, keep: int = 4) -> str:
    if not value:
        return ""
    return "•" * max(len(value) - keep, 4) + value[-keep:]


def create_access_token(user_id: int, role: str, session_id: str) -> tuple[str, int]:
    ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "role": role, "sid": session_id, "iat": now,
               "exp": now + timedelta(seconds=ttl), "jti": uuid.uuid4().hex, "typ": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256"), ttl


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload
