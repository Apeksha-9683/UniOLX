import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.listing import Listing
from app.models.trade import Trade
from tests.conftest import auth_headers


async def make_listing(db, seller, title="Hero cycle", price=4000, quantity=1) -> Listing:
    listing = Listing(
        id=uuid.uuid4(),
        seller_id=seller.id,
        college_id=seller.college_id,
        title=title,
        description="A good cycle",
        price=price,
        original_price=price * 2,
        category="Cycles & Commute",
        condition="Good",
        status="Available",
        campus_pickup_spot="Central Library Lawns",
        quantity=quantity,
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return listing


async def start_trade(client, buyer_headers, listing) -> dict:
    response = await client.post(
        "/api/trades",
        headers=buyer_headers,
        json={
            "listingId": str(listing.id),
            "pickupSpot": "Central Library Lawns",
            "scheduledTime": "Today 5 PM",
            "quantity": 1,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_buyer_receives_the_pin_and_the_seller_does_not(
    client, college, buyer, seller, db
):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")

    trade = await start_trade(client, buyer_headers, listing)
    assert len(trade["confirmationPin"]) == 6
    assert trade["confirmationPin"].isdigit()
    assert trade["attemptsLeft"] == 5
    assert trade["status"] == "Pending"

    seller_view = (await client.get(f"/api/trades/{trade['id']}", headers=seller_headers)).json()
    assert seller_view["confirmationPin"] == ""


async def test_only_the_seller_can_confirm_the_pin(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")

    trade = await start_trade(client, buyer_headers, listing)
    pin = trade["confirmationPin"]

    buyer_attempt = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=buyer_headers, json={"pin": pin}
    )
    assert buyer_attempt.json()["success"] is False

    seller_attempt = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=seller_headers, json={"pin": pin}
    )
    assert seller_attempt.json()["success"] is True


async def test_wrong_pin_counts_down_and_locks_the_trade(
    client, college, buyer, seller, db
):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)
    pin = trade["confirmationPin"]

    for expected_left in (4, 3, 2, 1, 0):
        response = await client.post(
            f"/api/trades/{trade['id']}/confirm-pin",
            headers=seller_headers,
            json={"pin": "000000"},
        )
        body = response.json()
        assert body["success"] is False
        assert body["attemptsLeft"] == expected_left

    assert body["locked"] is True

    locked = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=seller_headers, json={"pin": pin}
    )
    assert locked.json()["success"] is False
    assert locked.json()["locked"] is True


async def test_expired_pin_is_refused(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)
    pin = trade["confirmationPin"]

    record = (
        await db.execute(select(Trade).where(Trade.id == uuid.UUID(trade["id"])))
    ).scalar_one()
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.commit()

    response = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=seller_headers, json={"pin": pin}
    )
    body = response.json()
    assert body["success"] is False
    assert body["expired"] is True


async def test_buyer_can_regenerate_the_pin(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    regenerated = await client.post(
        f"/api/trades/{trade['id']}/regenerate-pin", headers=buyer_headers
    )
    body = regenerated.json()
    assert body["success"] is True
    assert len(body["newPin"]) == 6
    assert body["newPin"] != trade["confirmationPin"]

    old_pin_attempt = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin",
        headers=seller_headers,
        json={"pin": trade["confirmationPin"]},
    )
    assert old_pin_attempt.json()["success"] is False

    new_pin_attempt = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin",
        headers=seller_headers,
        json={"pin": body["newPin"]},
    )
    assert new_pin_attempt.json()["success"] is True


async def test_seller_cannot_regenerate_the_pin(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    response = await client.post(
        f"/api/trades/{trade['id']}/regenerate-pin", headers=seller_headers
    )
    assert response.status_code == 400


async def test_pin_is_single_use(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)
    pin = trade["confirmationPin"]

    await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=seller_headers, json={"pin": pin}
    )

    record = (
        await db.execute(select(Trade).where(Trade.id == uuid.UUID(trade["id"])))
    ).scalar_one()
    assert record.pin_hash is None
    assert record.pin_enc is None

    replay = await client.post(
        f"/api/trades/{trade['id']}/confirm-pin", headers=seller_headers, json={"pin": pin}
    )
    assert replay.json()["success"] is True  # already completed, still idempotent
    assert replay.json()["message"].lower().startswith("trade completed")


async def test_confirming_marks_the_listing_sold(client, college, buyer, seller, db):
    listing = await make_listing(db, seller, quantity=1)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    await client.post(
        f"/api/trades/{trade['id']}/confirm-pin",
        headers=seller_headers,
        json={"pin": trade["confirmationPin"]},
    )

    await db.refresh(listing)
    assert listing.status == "Sold"
    assert listing.quantity == 0


async def test_partial_quantity_keeps_the_listing_available(
    client, college, buyer, seller, db
):
    listing = await make_listing(db, seller, quantity=3)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    await client.post(
        f"/api/trades/{trade['id']}/confirm-pin",
        headers=seller_headers,
        json={"pin": trade["confirmationPin"]},
    )

    await db.refresh(listing)
    assert listing.quantity == 2
    assert listing.status == "Available"


async def test_two_buyers_cannot_claim_the_same_item(client, college, buyer, seller, db, outsider):
    from tests.conftest import make_user

    second_buyer = await make_user(db, college, "buyer2@rvce.edu.in", name="Second Buyer")
    listing = await make_listing(db, seller, quantity=1)

    first_headers = await auth_headers(client, "buyer@rvce.edu.in")
    second_headers = await auth_headers(client, "buyer2@rvce.edu.in")

    responses = await asyncio.gather(
        client.post(
            "/api/trades",
            headers=first_headers,
            json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
        ),
        client.post(
            "/api/trades",
            headers=second_headers,
            json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
        ),
    )

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [201, 400]

    failed = next(response for response in responses if response.status_code == 400)
    assert "no longer available" in failed.json()["detail"].lower()


async def test_buyer_cannot_trade_with_their_own_listing(client, college, buyer, db):
    listing = await make_listing(db, buyer)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post(
        "/api/trades",
        headers=buyer_headers,
        json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
    )
    assert response.status_code == 400
    assert "own listing" in response.json()["detail"].lower()


async def test_buyers_cannot_trade_across_colleges(client, college, buyer, outsider, db):
    listing = await make_listing(db, outsider)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post(
        "/api/trades",
        headers=buyer_headers,
        json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
    )
    assert response.status_code == 400


async def test_trade_can_be_cancelled(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    response = await client.post(
        f"/api/trades/{trade['id']}/cancel", headers=buyer_headers, json={"reason": "changed my mind"}
    )
    assert response.json()["success"] is True

    await db.refresh(listing)
    assert listing.status == "Available"


async def test_outside_users_cannot_see_the_trade(client, college, buyer, seller, outsider, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    trade = await start_trade(client, buyer_headers, listing)

    outsider_headers = await auth_headers(client, "outsider@bmsce.ac.in")
    response = await client.get(f"/api/trades/{trade['id']}", headers=outsider_headers)
    assert response.status_code == 404
