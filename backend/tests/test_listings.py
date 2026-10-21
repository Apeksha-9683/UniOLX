import uuid

from tests.conftest import auth_headers, make_user

LISTING_PAYLOAD = {
    "title": "Casio fx-991CW Scientific Calculator",
    "description": "Used for two semesters, mint condition.",
    "price": 950,
    "originalPrice": 1595,
    "category": "Electronics",
    "condition": "Like New",
    "campusPickupSpot": "Cauvery Hostel Gate 2",
    "images": ["https://example.com/a.jpg"],
    "specs": {"Model": "fx-991CW"},
    "tags": ["calculator", "casio"],
    "quantity": 1,
}


async def test_listings_require_authentication(client, college):
    assert (await client.get("/api/listings")).status_code == 401


async def test_listings_are_scoped_to_the_own_college(client, college, buyer, outsider, db):
    from app.models.listing import Listing

    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=buyer.id,
            college_id=buyer.college_id,
            title="RVCE laptop",
            description="",
            price=1000,
            original_price=1000,
            category="Electronics",
            condition="Good",
            status="Available",
            campus_pickup_spot="Library",
            quantity=1,
        )
    )
    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=outsider.id,
            college_id=outsider.college_id,
            title="BMSCE laptop",
            description="",
            price=1000,
            original_price=1000,
            category="Electronics",
            condition="Good",
            status="Available",
            campus_pickup_spot="Library",
            quantity=1,
        )
    )
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    listings = (await client.get("/api/listings", headers=headers)).json()

    assert len(listings) == 1
    assert listings[0]["collegeId"] == "rvce"
    assert listings[0]["title"] == "RVCE laptop"


async def test_listing_detail_is_hidden_from_other_colleges(client, college, buyer, outsider, db):
    from app.models.listing import Listing

    listing = Listing(
        id=uuid.uuid4(),
        seller_id=outsider.id,
        college_id=outsider.college_id,
        title="BMSCE laptop",
        description="",
        price=1000,
        original_price=1000,
        category="Electronics",
        condition="Good",
        status="Available",
        campus_pickup_spot="Library",
        quantity=1,
    )
    db.add(listing)
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.get(f"/api/listings/{listing.id}", headers=headers)
    assert response.status_code == 404


async def test_create_listing_uses_the_authenticated_college(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post("/api/listings", headers=headers, json=LISTING_PAYLOAD)
    body = response.json()

    assert response.status_code == 201
    assert body["collegeId"] == "rvce"
    assert body["collegeName"] == "RV College of Engineering"
    assert body["status"] == "Available"
    assert body["seller"]["name"] == "Test Student"
    assert body["seller"]["collegeName"] == "RVCE"
    assert body["images"] == ["https://example.com/a.jpg"]
    assert body["tags"] == ["calculator", "casio"]


async def test_only_the_seller_can_edit_a_listing(client, college, buyer, seller):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    created = (await client.post("/api/listings", headers=headers, json=LISTING_PAYLOAD)).json()

    seller_headers = await auth_headers(client, "seller@rvce.edu.in")
    response = await client.patch(
        f"/api/listings/{created['id']}",
        headers=seller_headers,
        json={"title": "hijacked"},
    )
    assert response.status_code == 404

    allowed = await client.patch(
        f"/api/listings/{created['id']}", headers=headers, json={"title": "Updated title"}
    )
    assert allowed.status_code == 200
    assert allowed.json()["title"] == "Updated title"


async def test_archiving_hides_the_listing(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    created = (await client.post("/api/listings", headers=headers, json=LISTING_PAYLOAD)).json()

    assert (await client.delete(f"/api/listings/{created['id']}", headers=headers)).status_code == 200
    listings = (await client.get("/api/listings", headers=headers)).json()
    assert listings == []


async def test_wishlist_toggles(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    created = (await client.post("/api/listings", headers=headers, json=LISTING_PAYLOAD)).json()

    first = await client.post(f"/api/wishlist/{created['id']}/toggle", headers=headers)
    assert first.json()["isWishlisted"] is True

    wishlist = (await client.get("/api/wishlist", headers=headers)).json()
    assert len(wishlist) == 1
    assert wishlist[0]["isWishlisted"] is True

    second = await client.post(f"/api/wishlist/{created['id']}/toggle", headers=headers)
    assert second.json()["isWishlisted"] is False
    assert (await client.get("/api/wishlist", headers=headers)).json() == []


async def test_filters_are_applied(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    await client.post("/api/listings", headers=headers, json=LISTING_PAYLOAD)
    await client.post(
        "/api/listings",
        headers=headers,
        json={**LISTING_PAYLOAD, "title": "Hero cycle", "price": 4000, "category": "Cycles & Commute"},
    )

    filtered = (
        await client.get(
            "/api/listings", headers=headers, params={"category": "Cycles & Commute"}
        )
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["title"] == "Hero cycle"

    by_price = (await client.get("/api/listings", headers=headers, params={"maxPrice": 1000})).json()
    assert len(by_price) == 1
    assert by_price[0]["price"] == 950


async def test_college_search(client, college):
    matches = (await client.get("/api/colleges/search", params={"q": "rv"})).json()
    assert len(matches) == 1
    assert matches[0]["shortName"] == "RVCE"

    short = (await client.get("/api/colleges/search", params={"q": "r"})).json()
    assert short == []


async def test_college_can_be_requested(client, college):
    response = await client.post(
        "/api/colleges/requests",
        json={"name": "New Institute of Technology", "city": "Chennai", "state": "Tamil Nadu"},
    )
    body = response.json()
    assert body["success"] is True
    assert body["college"]["status"] == "pending"
    assert body["college"]["name"] == "New Institute of Technology"
