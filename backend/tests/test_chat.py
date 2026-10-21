import uuid

from app.models.listing import Listing
from tests.conftest import auth_headers


async def make_listing(db, seller, title="Hero cycle"):
    listing = Listing(
        id=uuid.uuid4(),
        seller_id=seller.id,
        college_id=seller.college_id,
        title=title,
        description="A good cycle",
        price=4000,
        original_price=8000,
        category="Cycles & Commute",
        condition="Good",
        status="Available",
        campus_pickup_spot="Central Library Lawns",
        quantity=1,
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return listing


async def test_conversation_is_created_for_a_listing(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    headers = await auth_headers(client, "buyer@rvce.edu.in")

    response = await client.post(
        "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
    )
    body = response.json()

    assert response.status_code == 201
    assert body["listingId"] == str(listing.id)
    assert body["otherUser"]["name"] == "Seller Student"
    assert body["otherUser"]["college"].startswith("RVCE")


async def test_conversation_is_reused(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    headers = await auth_headers(client, "buyer@rvce.edu.in")

    first = await client.post(
        "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
    )
    second = await client.post(
        "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
    )
    assert first.json()["id"] == second.json()["id"]


async def test_messages_are_stored_and_returned(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    headers = await auth_headers(client, "buyer@rvce.edu.in")

    conversation = (
        await client.post(
            "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
        )
    ).json()

    sent = await client.post(
        f"/api/conversations/{conversation['id']}/messages",
        headers=headers,
        json={"text": "Is this still available?"},
    )
    body = sent.json()
    assert body["text"] == "Is this still available?"
    assert body["isMine"] is True

    messages = (
        await client.get(f"/api/conversations/{conversation['id']}/messages", headers=headers)
    ).json()
    assert len(messages) == 1
    assert messages[0]["text"] == "Is this still available?"


async def test_empty_messages_are_rejected(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    conversation = (
        await client.post(
            "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
        )
    ).json()

    response = await client.post(
        f"/api/conversations/{conversation['id']}/messages", headers=headers, json={"text": "  "}
    )
    assert response.status_code == 400


async def test_outsiders_cannot_open_a_conversation(client, college, buyer, seller, outsider, db):
    listing = await make_listing(db, seller)
    headers = await auth_headers(client, "outsider@bmsce.ac.in")
    response = await client.post(
        "/api/conversations", headers=headers, json={"listingId": str(listing.id)}
    )
    assert response.status_code == 400


async def test_notifications_are_created_and_marked_read(client, college, buyer, seller, db):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")
    seller_headers = await auth_headers(client, "seller@rvce.edu.in")

    await client.post(
        "/api/trades",
        headers=buyer_headers,
        json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
    )

    notifications = (await client.get("/api/notifications", headers=seller_headers)).json()
    assert notifications
    assert notifications[0]["type"] == "trade"
    assert notifications[0]["read"] is False

    marked = await client.post(
        f"/api/notifications/{notifications[0]['id']}/read", headers=seller_headers
    )
    assert marked.status_code == 200

    after = (await client.get("/api/notifications", headers=seller_headers)).json()
    assert after[0]["read"] is True


async def test_notifications_are_not_shared_between_users(
    client, college, buyer, seller, outsider, db
):
    listing = await make_listing(db, seller)
    buyer_headers = await auth_headers(client, "buyer@rvce.edu.in")

    await client.post(
        "/api/trades",
        headers=buyer_headers,
        json={"listingId": str(listing.id), "pickupSpot": "Library", "scheduledTime": "5 PM"},
    )

    outsider_headers = await auth_headers(client, "outsider@bmsce.ac.in")
    notifications = (await client.get("/api/notifications", headers=outsider_headers)).json()
    assert notifications == []
