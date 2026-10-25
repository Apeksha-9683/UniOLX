import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.config import BackendSettings, get_settings
from backend.app.db import Database


def hash_password(password: str) -> str:
    salt = hashlib.sha256(password.encode()).hexdigest()[:32]
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, expected = encoded.split("$", 1)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(actual, expected)


def _encode_part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def create_token(user_id: str, settings: BackendSettings) -> str:
    header = _encode_part(b'{"alg":"HS256","typ":"JWT"}')
    payload = _encode_part(
        json.dumps(
            {"sub": user_id, "exp": int(time.time()) + settings.jwt_expiry_minutes * 60},
            separators=(",", ":"),
        ).encode()
    )
    signature = hmac.new(
        settings.jwt_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256
    ).digest()
    return f"{header}.{payload}.{_encode_part(signature)}"


def decode_token(token: str, settings: BackendSettings) -> dict[str, Any]:
    try:
        header, payload, signature = token.split(".")
        expected = hmac.new(
            settings.jwt_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        claims = json.loads(
            base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode()
        )
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if not hmac.compare_digest(supplied, expected) or claims.get("exp", 0) < time.time():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return claims


bearer = HTTPBearer(auto_error=False)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: BackendSettings = Depends(get_settings),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    claims = decode_token(credentials.credentials, settings)
    database = Database.from_settings()
    with database.connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (claims.get("sub"),)).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    user = dict(row)
    user.pop("password_hash", None)
    user["is_verified"] = bool(user["is_verified"])
    return user
