import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import hash_password, verify_password
from app.core.validation import validate_college_email, validate_password
from app.models.college import College
from app.models.user import User
from app.schemas.auth import (
    AuthResult,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResendOtpRequest,
    VerifyOtpRequest,
)
from app.schemas.mappers import user_to_schema
from app.schemas.user import UserPatch
from app.services.auth import issue_tokens, revoke_all_for_user
from app.services.email import send_otp_email
from app.services.otp import create_otp, seconds_until_resend_allowed, verify_otp

logger = logging.getLogger("uniolx.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/users", tags=["users"])


def _avatar_for(name: str) -> str:
    from urllib.parse import quote

    return (
        "https://api.dicebear.com/7.x/bottts/svg?seed="
        f"{quote(name)}&backgroundColor=ffc72c"
    )


@router.post("/register", response_model=AuthResult)
async def register(payload: RegisterRequest, db: DbSession):
    email = (payload.email or "").strip().lower()
    name = (payload.name or "").strip()

    college = await db.get(College, payload.college_id)
    if college is None:
        return AuthResult(success=False, error="Please select a valid college.")

    error = validate_college_email(email, college)
    if error:
        return AuthResult(success=False, error=error)

    error = validate_password(payload.password)
    if error:
        return AuthResult(success=False, error=error)

    if not name:
        return AuthResult(success=False, error="Please enter your full name.")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        return AuthResult(success=False, error="An account with this email already exists.")

    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(payload.password),
        name=name,
        college_id=college.id,
        branch=payload.branch or "Undergraduate",
        year=1,
        semester=1,
        hostel="Freshers Hostel Block",
        avatar=_avatar_for(name),
        is_verified=False,
        rating=5.0,
        total_reviews=0,
        completed_trades=0,
    )
    db.add(user)
    await db.flush()

    code, _ = await create_otp(db, email, user_id=user.id)
    delivered = await send_otp_email(email, code, name)
    if not delivered:
        logger.info("[auth] OTP for %s (dev): %s", email, code)

    await db.commit()

    return AuthResult(
        success=True,
        user=user_to_schema(user),
        dev_otp=(code if settings.dev_mode else None),
    )


@router.post("/verify-otp", response_model=AuthResult)
async def verify_otp_code(payload: VerifyOtpRequest, db: DbSession):
    email = (payload.email or "").strip().lower()
    ok, error = await verify_otp(db, email, (payload.code or "").strip())
    if not ok:
        await db.commit()
        return AuthResult(success=False, error=error)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        await db.commit()
        return AuthResult(success=False, error="No account found for this email.")

    user.is_verified = True
    await db.flush()

    access_token, refresh_token = await issue_tokens(db, user)
    await db.commit()

    return AuthResult(
        success=True,
        user=user_to_schema(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/resend-otp", response_model=MessageResponse)
async def resend_otp(payload: ResendOtpRequest, db: DbSession):
    email = (payload.email or "").strip().lower()

    wait = await seconds_until_resend_allowed(db, email)
    if wait > 0:
        return MessageResponse(
            success=False,
            message=f"Please wait {wait} seconds before requesting a new code.",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        # Do not leak whether the email exists.
        return MessageResponse(
            success=True,
            message=f"A fresh 6-digit verification code has been dispatched to {email}.",
        )

    code, _ = await create_otp(db, email, user_id=user.id)
    delivered = await send_otp_email(email, code, user.name)
    if not delivered:
        logger.info("[auth] resent OTP for %s (dev): %s", email, code)

    await db.commit()

    return MessageResponse(
        success=True,
        message=f"A fresh 6-digit verification code has been dispatched to {email}.",
    )


@router.post("/login", response_model=AuthResult)
async def login(payload: LoginRequest, db: DbSession):
    email = (payload.email or "").strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(user.password_hash, payload.password or ""):
        return AuthResult(success=False, error="Invalid email or password.")

    if not user.is_verified:
        return AuthResult(
            success=False,
            error="Please verify your college email before signing in.",
        )

    access_token, refresh_token = await issue_tokens(db, user)
    await db.commit()

    return AuthResult(
        success=True,
        user=user_to_schema(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=AuthResult)
async def refresh(payload: dict, db: DbSession):
    from app.services.auth import rotate_refresh_token

    token = (payload or {}).get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh token")

    rotated = await rotate_refresh_token(db, token)
    if rotated is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user, access_token, new_refresh = rotated
    await db.commit()
    return AuthResult(
        success=True,
        user=user_to_schema(user),
        access_token=access_token,
        refresh_token=new_refresh,
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: CurrentUser, db: DbSession):
    await revoke_all_for_user(db, current_user.id)
    await db.commit()
    return MessageResponse(success=True, message="Signed out.")


@router.get("/me")
async def me(current_user: CurrentUser):
    return user_to_schema(current_user)


@users_router.patch("/me")
async def update_me(patch: UserPatch, current_user: CurrentUser, db: DbSession):
    data = patch.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return user_to_schema(current_user)
