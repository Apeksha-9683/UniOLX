from app.models.college import College

PUBLIC_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "yahoo.com",
        "yahoo.co.in",
        "hotmail.com",
        "outlook.com",
        "live.com",
        "icloud.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "zoho.com",
        "rediffmail.com",
        "yandex.com",
        "mail.com",
        "gmx.com",
    }
)

EDUCATION_SUFFIXES = (".ac.in", ".edu.in", ".edu", ".ernet.in")


def email_domain(email: str) -> str:
    return (email or "").strip().lower().split("@")[-1] if "@" in (email or "") else ""


def validate_college_email(email: str, college: College | None) -> str | None:
    """Returns an error message, or None when the email is acceptable."""
    clean = (email or "").strip().lower()
    if "@" not in clean or not clean.split("@")[0]:
        return "Please enter a valid email address."

    domain = email_domain(clean)

    if domain in PUBLIC_EMAIL_DOMAINS:
        return (
            f"Public email providers ({domain}) are not allowed. "
            "Please use your official college email."
        )

    if college is not None and college.domain:
        expected = college.domain.lower().replace("www.", "")
        if expected not in domain:
            return (
                f"Email domain does not match {college.short_name}. "
                f"Please use your official @{college.domain} institutional email."
            )
    elif not domain.endswith(EDUCATION_SUFFIXES):
        return (
            "For unlisted or pending campuses, your official email must end with "
            ".ac.in, .edu.in, or .edu."
        )

    return None


def validate_password(password: str) -> str | None:
    if not password or len(password) < 6:
        return "Password must be at least 6 characters long."
    return None
