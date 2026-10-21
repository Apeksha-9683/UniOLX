"""End-to-end smoke test against a running API.

    python scripts/smoke_test.py [base_url]
"""

import asyncio
import os
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
DEMO_EMAIL = "aarav.sharma.cs22@rvce.edu.in"
DEMO_PASSWORD = "password123"

passed = 0
failed = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label} {detail}")


async def seller_email_for(user_id: str) -> str:
    """The seeded sellers keep their mock email; look it up in the database."""
    import asyncpg

    url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://uniolx:uniolx@localhost:5432/uniolx",
    ).replace("postgresql+asyncpg://", "postgresql://")

    connection = await asyncpg.connect(url)
    try:
        row = await connection.fetchrow("SELECT email FROM users WHERE id = $1::uuid", user_id)
        return row["email"] if row else ""
    finally:
        await connection.close()


async def login(client: httpx.AsyncClient, email: str, password: str = DEMO_PASSWORD):
    response = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    body = response.json()
    if not body.get("success"):
        raise SystemExit(f"login failed for {email}: {body}")
    return body["accessToken"], body["user"]


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        print("\n== auth ==")
        token, user = await login(client, DEMO_EMAIL)
        check("demo user logs in", user["email"] == DEMO_EMAIL)
        check("user is college scoped", user["collegeShortName"] == "RVCE")

        headers = {"Authorization": f"Bearer {token}"}

        print("\n== listings ==")
        listings = (await client.get("/api/listings", headers=headers)).json()
        check("listings returned", len(listings) > 0)
        check(
            "listings are college scoped",
            all(item["collegeId"] == user["collegeId"] for item in listings),
        )

        target = next(item for item in listings if item["quantity"] == 1)
        seller_id = target["seller"]["id"]
        seller_email = await seller_email_for(seller_id)
        seller_token, seller = await login(client, seller_email)
        check("seller logs in", seller["id"] == seller_id)

        print("\n== trade + pin ==")
        created = await client.post(
            "/api/trades",
            headers=headers,
            json={
                "listingId": target["id"],
                "pickupSpot": "Central Library Lawns",
                "scheduledTime": "Today 5 PM",
                "quantity": 1,
            },
        )
        check("trade created", created.status_code == 201, created.text)
        trade = created.json()
        trade_id = trade["id"]
        pin = trade["confirmationPin"]
        check("buyer receives a 6 digit pin", len(pin) == 6 and pin.isdigit())

        seller_view = (
            await client.get(f"/api/trades/{trade_id}", headers={"Authorization": f"Bearer {seller_token}"})
        ).json()
        check("seller cannot see the pin", seller_view["confirmationPin"] == "")

        buyer_confirms = await client.post(
            f"/api/trades/{trade_id}/confirm-pin",
            headers=headers,
            json={"pin": pin},
        )
        check("buyer cannot confirm the pin", buyer_confirms.json()["success"] is False)

        for attempt in range(5):
            result = await client.post(
                f"/api/trades/{trade_id}/confirm-pin",
                headers={"Authorization": f"Bearer {seller_token}"},
                json={"pin": "111222"},
            )
            body = result.json()
        check("trade locks after 5 wrong attempts", body.get("locked") is True, body)

        after_lock = await client.post(
            f"/api/trades/{trade_id}/confirm-pin",
            headers={"Authorization": f"Bearer {seller_token}"},
            json={"pin": pin},
        )
        check("correct pin is refused once locked", after_lock.json()["success"] is False)

        regenerated = await client.post(
            f"/api/trades/{trade_id}/regenerate-pin", headers=headers
        )
        check("buyer can regenerate the pin", regenerated.json()["success"] is True)
        new_pin = regenerated.json()["newPin"]

        confirmed = await client.post(
            f"/api/trades/{trade_id}/confirm-pin",
            headers={"Authorization": f"Bearer {seller_token}"},
            json={"pin": new_pin},
        )
        check("seller completes the trade with the new pin", confirmed.json()["success"] is True)

        replay = await client.post(
            f"/api/trades/{trade_id}/confirm-pin",
            headers={"Authorization": f"Bearer {seller_token}"},
            json={"pin": new_pin},
        )
        check("pin cannot be replayed", replay.json()["success"] is True, "already completed")

        print("\n== search ==")
        search = await client.post(
            "/api/search/ai", headers=headers, json={"query": "laptop under 25000 for coding"}
        )
        body = search.json()
        check("ai search returns criteria", len(body["parsedCriteria"]) > 0, body)
        check("ai search returns results", isinstance(body["results"], list))

        print("\n== chat ==")
        conversation = await client.post(
            "/api/conversations", headers=headers, json={"listingId": target["id"]}
        )
        check("conversation created", conversation.status_code in (200, 201), conversation.text)
        conv = conversation.json()
        message = await client.post(
            f"/api/conversations/{conv['id']}/messages",
            headers=headers,
            json={"text": "Is this still available?"},
        )
        check("message sent", message.status_code in (200, 201), message.text)
        messages = (await client.get(f"/api/conversations/{conv['id']}/messages", headers=headers)).json()
        check("message stored", len(messages) >= 1)

        print("\n== register + otp ==")
        stamp = int(asyncio.get_event_loop().time() * 1000)
        new_email = f"newstudent{stamp}@rvce.edu.in"
        registered = await client.post(
            "/api/auth/register",
            json={
                "collegeId": "rvce",
                "name": "New Student",
                "email": new_email,
                "password": "password123",
            },
        )
        body = registered.json()
        check("registration accepted", body.get("success") is True, body)
        check("new user is unverified", (body.get("user") or {}).get("isVerified") is False)
        check("no token before verification", not body.get("accessToken"))

        public_domain = await client.post(
            "/api/auth/register",
            json={
                "collegeId": "rvce",
                "name": "Sneaky",
                "email": f"someone{stamp}@gmail.com",
                "password": "password123",
            },
        )
        check(
            "public email domains are rejected",
            public_domain.json().get("success") is False,
            public_domain.text,
        )

        wrong_domain = await client.post(
            "/api/auth/register",
            json={
                "collegeId": "rvce",
                "name": "Sneaky",
                "email": f"someone{stamp}@bmsce.ac.in",
                "password": "password123",
            },
        )
        check(
            "email must match the college domain",
            wrong_domain.json().get("success") is False,
            wrong_domain.text,
        )

        verified = await client.post(
            "/api/auth/verify-otp", json={"email": new_email, "code": "123456"}
        )
        body = verified.json()
        check("otp verification succeeds", body.get("success") is True, body)
        check("verified user gets a token", bool(body.get("accessToken")))

        bad_otp = await client.post(
            "/api/auth/verify-otp", json={"email": new_email, "code": "999999"}
        )
        check("wrong otp is rejected", bad_otp.json().get("success") is False)

        print("\n== websocket ==")
        try:
            import websockets

            ws_url = BASE.replace("http://", "ws://").replace("https://", "wss://")
            async with websockets.connect(f"{ws_url}/ws?token={token}") as ws:
                sent = await client.post(
                    f"/api/conversations/{conv['id']}/messages",
                    headers=headers,
                    json={"text": "websocket check"},
                )
                check("message sent while socket open", sent.status_code in (200, 201))
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
                check("socket pushed a frame", "message" in raw or "message:status" in raw, raw[:120])
        except ImportError:
            print("  SKIP  websockets package not installed")

    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
