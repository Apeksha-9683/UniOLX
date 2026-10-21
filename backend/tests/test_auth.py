import pytest

from tests.conftest import auth_headers, make_user


async def register(client, email, college_id="rvce", password="password123"):
    return await client.post(
        "/api/auth/register",
        json={
            "collegeId": college_id,
            "name": "New Student",
            "email": email,
            "password": password,
        },
    )


async def test_register_rejects_public_email_domains(client, college):
    response = await register(client, "student@gmail.com")
    body = response.json()
    assert body["success"] is False
    assert "not allowed" in body["error"].lower()


async def test_register_rejects_a_mismatched_college_domain(client, college):
    response = await register(client, "student@bmsce.ac.in")
    body = response.json()
    assert body["success"] is False
    assert "does not match" in body["error"]


async def test_register_rejects_short_passwords(client, college):
    response = await register(client, "student@rvce.edu.in", password="123")
    assert response.json()["success"] is False


async def test_register_creates_an_unverified_user(client, college):
    response = await register(client, "student@rvce.edu.in")
    body = response.json()
    assert body["success"] is True
    assert body["user"]["isVerified"] is False
    assert body["user"]["collegeId"] == "rvce"
    assert not body.get("accessToken")


async def test_duplicate_email_is_rejected(client, college, db):
    await make_user(db, college, "taken@rvce.edu.in")
    response = await register(client, "taken@rvce.edu.in")
    assert response.json()["success"] is False


async def test_otp_verification_returns_tokens(client, college):
    await register(client, "student@rvce.edu.in")
    response = await client.post(
        "/api/auth/verify-otp", json={"email": "student@rvce.edu.in", "code": "123456"}
    )
    body = response.json()
    assert body["success"] is True
    assert body["accessToken"]
    assert body["refreshToken"]
    assert body["user"]["isVerified"] is True


async def test_wrong_otp_is_rejected(client, college):
    await register(client, "student@rvce.edu.in")
    response = await client.post(
        "/api/auth/verify-otp", json={"email": "student@rvce.edu.in", "code": "999999"}
    )
    assert response.json()["success"] is False


async def test_otp_attempts_are_capped(client, college):
    await register(client, "student@rvce.edu.in")
    for _ in range(5):
        await client.post(
            "/api/auth/verify-otp", json={"email": "student@rvce.edu.in", "code": "000111"}
        )
    response = await client.post(
        "/api/auth/verify-otp", json={"email": "student@rvce.edu.in", "code": "123456"}
    )
    assert response.json()["success"] is False


async def test_resend_otp_has_a_cooldown(client, college, monkeypatch):
    await register(client, "student@rvce.edu.in")
    blocked = await client.post(
        "/api/auth/resend-otp", json={"email": "student@rvce.edu.in"}
    )
    assert blocked.json()["success"] is False
    assert "wait" in blocked.json()["message"].lower()

    from app.core.config import settings

    monkeypatch.setattr(settings, "otp_resend_cooldown_seconds", 0)
    allowed = await client.post(
        "/api/auth/resend-otp", json={"email": "student@rvce.edu.in"}
    )
    assert allowed.json()["success"] is True


async def test_login_rejects_a_wrong_password(client, college, db):
    await make_user(db, college, "buyer@rvce.edu.in", password="password123")
    response = await client.post(
        "/api/auth/login", json={"email": "buyer@rvce.edu.in", "password": "nope"}
    )
    assert response.json()["success"] is False


async def test_login_requires_a_verified_email(client, college, db):
    await make_user(db, college, "pending@rvce.edu.in", verified=False)
    response = await client.post(
        "/api/auth/login", json={"email": "pending@rvce.edu.in", "password": "password123"}
    )
    body = response.json()
    assert body["success"] is False
    assert "verify" in body["error"].lower()


async def test_me_requires_a_token(client, college):
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_me_returns_the_current_user(client, college, db):
    await make_user(db, college, "buyer@rvce.edu.in")
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.get("/api/auth/me", headers=headers)
    body = response.json()
    assert body["email"] == "buyer@rvce.edu.in"
    assert body["collegeShortName"] == "RVCE"


async def test_profile_can_be_updated(client, college, db):
    await make_user(db, college, "buyer@rvce.edu.in")
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.patch(
        "/api/users/me", headers=headers, json={"branch": "ECE", "hostel": "Cauvery Block C"}
    )
    body = response.json()
    assert body["branch"] == "ECE"
    assert body["hostel"] == "Cauvery Block C"
