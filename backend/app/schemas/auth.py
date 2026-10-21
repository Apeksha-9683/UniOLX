from app.schemas.base import CamelModel
from app.schemas.user import User


class RegisterRequest(CamelModel):
    college_id: str
    name: str
    email: str
    password: str
    branch: str | None = None


class LoginRequest(CamelModel):
    email: str
    password: str


class VerifyOtpRequest(CamelModel):
    email: str
    code: str


class ResendOtpRequest(CamelModel):
    email: str


class AuthResult(CamelModel):
    success: bool
    user: User | None = None
    error: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    # Only populated when DEV_MODE is on, so the demo flow keeps working.
    dev_otp: str | None = None


class MessageResponse(CamelModel):
    success: bool
    message: str
