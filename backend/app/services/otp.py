import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_otp, hash_otp, verify_otp_hash
from app.models.auth import OtpCode


async def invalidate_existing_otp(db: AsyncSession, email: str) -> None:
    result = await db.execute(
        select(OtpCode).where(
            OtpCode.email == email,
            OtpCode.used_at.is_(None),
        )
    )
    for code in result.scalars().all():
        code.used_at = datetime.now(timezone.utc)


async def create_otp(
    db: AsyncSession,
    email: str,
    user_id: uuid.UUID | None = None,
    purpose: str = "verify_email",
) -> tuple[str, OtpCode]:
    await invalidate_existing_otp(db, email)

    code = generate_otp()
    record = OtpCode(
        email=email,
        user_id=user_id,
        code_hash=hash_otp(code),
        purpose=purpose,
        attempts=0,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.otp_ttl_minutes),
    )
    db.add(record)
    await db.flush()
    return code, record


async def get_live_otp(db: AsyncSession, email: str) -> OtpCode | None:
    result = await db.execute(
        select(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.used_at.is_(None),
        )
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def seconds_until_resend_allowed(db: AsyncSession, email: str) -> int:
    record = await get_live_otp(db, email)
    if record is None:
        return 0
    created = record.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - created).total_seconds()
    remaining = settings.otp_resend_cooldown_seconds - elapsed
    return int(remaining) if remaining > 0 else 0


async def verify_otp(db: AsyncSession, email: str, code: str) -> tuple[bool, str]:
    """Returns (ok, error_message)."""
    clean = (code or "").strip()

    record = await get_live_otp(db, email)
    if record is None:
        return False, "Invalid verification code. Please request a new one."
    if record.expires_at < datetime.now(timezone.utc):
        return False, "Your verification code has expired. Please request a new one."
    if record.attempts >= settings.otp_max_attempts:
        return False, "Too many incorrect attempts. Please request a new code."

    # Development shortcut so the "Fast Demo" hint in the UI keeps working
    # without a mail provider. Never active in production.
    if settings.dev_mode and clean == "123456":
        record.used_at = datetime.now(timezone.utc)
        await db.flush()
        return True, ""

    if not verify_otp_hash(record.code_hash, clean):
        record.attempts += 1
        await db.flush()
        remaining = max(0, settings.otp_max_attempts - record.attempts)
        if remaining == 0:
            return False, "Too many incorrect attempts. Please request a new code."
        return False, f"Invalid verification code. {remaining} attempt(s) left."

    record.used_at = datetime.now(timezone.utc)
    await db.flush()
    return True, ""
