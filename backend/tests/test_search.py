import uuid

from app.models.listing import Listing
from tests.conftest import auth_headers


async def make_listing(db, seller, title, price, category="Electronics", specs=None, tags=None):
    listing = Listing(
        id=uuid.uuid4(),
        seller_id=seller.id,
        college_id=seller.college_id,
        title=title,
        description="A well kept item",
        price=price,
        original_price=price * 2,
        category=category,
        condition="Good",
        status="Available",
        campus_pickup_spot="Central Library Lawns",
        quantity=1,
        specs=specs or {},
        tags=tags or [],
    )
    db.add(listing)
    await db.commit()
    await db.refresh(listing)
    return listing


async def test_ai_search_parses_a_budget(client, college, buyer, seller, db):
    await make_listing(db, seller, "Lenovo ThinkPad T480", 21000, specs={"RAM": "16 GB"})
    await make_listing(db, seller, "Cheap thinkpad", 9000)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post(
        "/api/search/ai", headers=headers, json={"query": "laptop under 25000 with 16 gb ram"}
    )
    body = response.json()

    assert "parsedCriteria" in body
    keys = {item["key"] for item in body["parsedCriteria"]}
    assert "budget" in keys
    assert "category" in keys
    assert body["summary"]


async def test_ai_search_respects_the_budget(client, college, buyer, seller, db):
    await make_listing(db, seller, "Expensive laptop", 90000)
    await make_listing(db, seller, "Cheap laptop", 12000)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.post(
            "/api/search/ai", headers=headers, json={"query": "laptop under 20000"}
        )
    ).json()

    prices = [entry["listing"]["price"] for entry in body["results"]]
    assert all(price <= 20000 for price in prices)
    assert 12000 in prices


async def test_ai_search_only_returns_the_own_college(client, college, buyer, outsider, db):
    from app.models.listing import Listing as ListingModel

    await make_listing(db, buyer, "RVCE laptop", 12000)
    db.add(
        ListingModel(
            id=uuid.uuid4(),
            seller_id=outsider.id,
            college_id=outsider.college_id,
            title="BMSCE laptop",
            description="",
            price=12000,
            original_price=12000,
            category="Electronics",
            condition="Good",
            status="Available",
            campus_pickup_spot="Library",
            quantity=1,
        )
    )
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.post(
            "/api/search/ai", headers=headers, json={"query": "laptop under 20000"}
        )
    ).json()

    titles = [entry["listing"]["title"] for entry in body["results"]]
    assert "BMSCE laptop" not in titles
    assert "RVCE laptop" in titles


async def test_ai_search_handles_a_greeting(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.post("/api/search/ai", headers=headers, json={"query": "hello"})
    ).json()

    assert body["isVagueOrGreeting"] is True
    assert body["results"] == []
    assert body["alternativeSuggestions"]


async def test_ai_search_gives_reasons(client, college, buyer, seller, db):
    await make_listing(
        db, seller, "MacBook Air M1", 42000, specs={"RAM": "8 GB", "Storage": "256 GB"}
    )
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.post(
            "/api/search/ai", headers=headers, json={"query": "laptop under 50000 for coding"}
        )
    ).json()

    assert body["results"]
    entry = body["results"][0]
    assert entry["matchScore"] > 0
    assert entry["matchReasons"]


async def test_campus_buddy_returns_matches(client, college, buyer, seller, db):
    await make_listing(db, seller, "Casio fx-991CW calculator", 950, category="Electronics")
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.post(
            "/api/search/campus-buddy", headers=headers, json={"query": "calculator"}
        )
    ).json()

    assert body["answer"]
    assert body["matchedListings"]
    assert body["suggestedPrompts"]


async def test_search_requires_authentication(client, college):
    assert (await client.post("/api/search/ai", json={"query": "laptop"})).status_code == 401
