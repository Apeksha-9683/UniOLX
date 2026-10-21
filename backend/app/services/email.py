import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("uniolx.email")

RESEND_ENDPOINT = "https://api.resend.com/emails"

OTP_TEMPLATE = """Hi {name},

Your UniOLX verification code is {code}.

It expires in {minutes} minutes. If you did not request this, ignore this email.

- The UniOLX team
"""


async def send_otp_email(to: str, code: str, name: str = "student") -> bool:
    """Send the OTP through Resend. Returns False when it could not be sent."""
    if not settings.email_api_key:
        logger.info("[email:noop] no EMAIL_API_KEY set, skipping send to %s", to)
        return False

    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": "Your UniOLX verification code",
        "text": OTP_TEMPLATE.format(name=name, code=code, minutes=settings.otp_ttl_minutes),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                RESEND_ENDPOINT,
                json=payload,
                headers={"Authorization": f"Bearer {settings.email_api_key}"},
            )
        if response.status_code >= 300:
            logger.error("[email:error] resend returned %s: %s", response.status_code, response.text)
            return False
        return True
    except httpx.HTTPError as exc:
        logger.error("[email:error] %s", exc)
        return False
