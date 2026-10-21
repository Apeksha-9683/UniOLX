"""Contract tests.

The frontend is not allowed to change in this pass, so these tests pin the
exact response shapes it consumes. If a mapper or a router starts returning a
different set of keys, these fail loudly.
"""

from tests.conftest import auth_headers

COLLEGE_KEYS = {
    "id",
    "name",
    "shortName",
    "city",
    "state",
    "domain",
    "status",
    "campusSpots",
    "popularBranches",
    "isVerified",
}

LISTING_KEYS = {
    "id",
    "title",
    "description",
    "price",
    "originalPrice",
    "category",
    "condition",
    "status",
    "collegeId",
    "collegeName",
    "campusPickupSpot",
    "seller",
    "images",
    "specs",
    "tags",
    "postedAt",
    "isWishlisted",
    "viewsCount",
    "quantity",
}

SELLER_KEYS = {
    "id",
    "name",
    "collegeId",
    "collegeName",
    "branch",
    "avatar",
    "isVerified",
    "rating",
    "totalReviews",
    "hostelOrArea",
}

USER_KEYS = {
    "id",
    "name",
    "email",
    "collegeId",
    "collegeName",
    "collegeShortName",
    "branch",
    "year",
    "semester",
    "hostel",
    "avatar",
    "isVerified",
    "rating",
    "totalReviews",
    "completedTrades",
    "joinedDate",
}


async def test_college_shape_is_unchanged(client, college, db):
    response = await client.get("/api/colleges")
    body = response.json()

    assert body, "expected at least one college"
    assert set(body[0].keys()) == COLLEGE_KEYS


async def test_listing_shape_is_unchanged(client, college, buyer, seller, db):
    from app.models.listing import Listing

    db.add(
        Listing(
            id=buyer.id,
            seller_id=seller.id,
            college_id=seller.college_id,
            title="Contract test item",
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
    body = (await client.get("/api/listings", headers=headers)).json()

    assert body
    assert set(body[0].keys()) == LISTING_KEYS
    assert set(body[0]["seller"].keys()) == SELLER_KEYS


async def test_user_shape_is_unchanged(client, college, buyer, db):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (await client.get("/api/auth/me", headers=headers)).json()
    assert set(body.keys()) == USER_KEYS


async def test_login_response_shape_is_unchanged(client, college, db):
    from tests.conftest import make_user

    await make_user(db, college, "buyer@rvce.edu.in")
    body = (await client.post(
        "/api/auth/login",
        json={"email": "buyer@rvce.edu.in", "password": "password123"},
    )).json()

    assert {
        "success",
        "user",
        "error",
        "accessToken",
        "refreshToken",
        "devOtp",
    } == set(body.keys())
    assert set(body["user"].keys()) == USER_KEYS
