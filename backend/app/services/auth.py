import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_expiry,
)
from app.models.auth import RefreshToken
from app.models.user import User


async def issue_tokens(db: AsyncSession, user: User) -> tuple[str, str]:
    access_token = create_access_token(str(user.id), user.college_id)
    refresh_token = generate_refresh_token()

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_expiry(),
        )
    )
    await db.flush()
    return access_token, refresh_token


async def rotate_refresh_token(
    db: AsyncSession, refresh_token: str
) -> tuple[User, str, str] | None:
    from datetime import datetime, timezone

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(refresh_token),
            RefreshToken.revoked_at.is_(None),
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    if record.expires_at < datetime.now(timezone.utc):
        return None

    user = await db.get(User, record.user_id)
    if user is None:
        return None

    record.revoked_at = datetime.now(timezone.utc)
    await db.flush()

    access_token, new_refresh = await issue_tokens(db, user)
    return user, access_token, new_refresh


async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> None:
    from datetime import datetime, timezone

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
    )
    record = result.scalar_one_or_none()
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        await db.flush()


async def revoke_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    from datetime import datetime, timezone

    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    for record in result.scalars().all():
        record.revoked_at = datetime.now(timezone.utc)
    await db.flush()
