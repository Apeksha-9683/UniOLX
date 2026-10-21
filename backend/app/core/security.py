import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_password_hasher = PasswordHasher()
_PIN_TTL = timedelta(minutes=settings.pin_ttl_minutes)


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    if not password_hash or not password:
        return False
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# --------------------------------------------------------------------------
# OTP
# --------------------------------------------------------------------------
def generate_otp() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_otp(code: str) -> str:
    return _password_hasher.hash(code)


def verify_otp_hash(code_hash: str, code: str) -> bool:
    return verify_password(code_hash, code)


# --------------------------------------------------------------------------
# Trade PIN
# --------------------------------------------------------------------------
def generate_pin() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_pin(pin: str) -> str:
    """Argon2id hash, used to verify the seller's attempt."""
    return _password_hasher.hash(pin)


def verify_pin_hash(pin_hash: str, pin: str) -> bool:
    if not pin_hash:
        return False
    return verify_password(pin_hash, pin)


def _pin_cipher_key() -> bytes:
    return hashlib.sha256(settings.pin_secret.encode("utf-8")).digest()


def encrypt_pin(pin: str) -> str:
    """AES-256-GCM so the buyer can still read their own PIN after a reload."""
    nonce = os.urandom(12)
    ciphertext = AESGCM(_pin_cipher_key()).encrypt(nonce, pin.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_pin(token: str) -> str | None:
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
        nonce, ciphertext = raw[:12], raw[12:]
        return AESGCM(_pin_cipher_key()).decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception:
        return None


def pin_expiry() -> datetime:
    return datetime.now(timezone.utc) + _PIN_TTL


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------
def create_access_token(user_id: str, college_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "cid": college_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
