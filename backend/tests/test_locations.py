"""The place tree: integrity, derivation and campus landmarks."""

import uuid

import pytest

from tests.conftest import auth_headers


async def test_location_tree_is_consistent(db, college):
    from app.models.location import Location
    from sqlalchemy import select

    result = await db.execute(select(Location))
    locations = {item.id: item for item in result.scalars().all()}

    assert locations, "expected the place tree to exist"

    for location in locations.values():
        if location.parent_id is None:
            assert location.type == "country"
            assert not location.ancestors
            continue

        parent = locations.get(location.parent_id)
        assert parent is not None, f"{location.name} has a missing parent"
        # the materialised path must agree with the parent link
        assert location.ancestors[-1] == parent.id
        assert parent.ancestors == location.ancestors[:-1]
        # a child always sits below its parent in the hierarchy
        assert location.type != "country"


async def test_location_tree_has_no_cycles(db, college):
    from app.models.location import Location
    from sqlalchemy import select

    result = await db.execute(select(Location))
    for location in result.scalars().all():
        seen = set()
        node = location
        while node is not None:
            assert node.id not in seen, f"cycle at {node.name}"
            seen.add(node.id)
            node = (
                await db.get(Location, node.parent_id) if node.parent_id is not None else None
            )


async def test_college_fields_are_derived_from_the_tree(client, college, db):
    from app.models.location import PickupSpot

    db.add(
        PickupSpot(
            id=uuid.uuid4(),
            college_id="rvce",
            name="Central Library Lawns",
            sort_order=1,
            is_active=True,
        )
    )
    await db.commit()

    body = (await client.get("/api/colleges")).json()
    rvce = next(item for item in body if item["id"] == "rvce")

    assert rvce["name"] == "RV College of Engineering"
    assert rvce["city"] == "Bengaluru"
    assert rvce["state"] == "Karnataka"
    assert rvce["campusSpots"] == ["Central Library Lawns"]


async def test_location_tree_endpoint(client, college):
    body = (await client.get("/api/locations/tree")).json()

    assert body
    root = body[0]
    assert root["type"] == "country"
    assert root["name"] == "India"
    assert root["children"], "the country should have states"
    assert all(child["parentId"] == root["id"] for child in root["children"])
    assert "childIds" in root


async def test_location_search_finds_a_city(client, college):
    body = (await client.get("/api/locations/search", params={"q": "bengaluru"})).json()
    assert body
    assert body[0]["name"] == "Bengaluru"
    assert body[0]["type"] == "city"
    assert body[0]["latitude"] is not None


async def test_location_search_needs_two_characters(client, college):
    assert (await client.get("/api/locations/search", params={"q": "b"})).json() == []


async def test_location_by_slug_and_by_id(client, college):
    tree = (await client.get("/api/locations/tree")).json()
    city = next(
        grandchild
        for root in tree
        for child in root["children"]
        for grandchild in child["children"]
        if grandchild["name"] == "Bengaluru"
    )

    by_slug = (await client.get(f"/api/locations/{city['slug']}")).json()
    by_id = (await client.get(f"/api/locations/{city['id']}")).json()

    assert by_slug["id"] == by_id["id"] == city["id"]


async def test_unknown_location_is_404(client, college):
    response = await client.get("/api/locations/does-not-exist")
    assert response.status_code == 404


async def test_listings_in_a_location_include_its_descendants(
    client, college, buyer, seller, db
):
    from app.models.listing import Listing

    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=seller.id,
            college_id=seller.college_id,
            location_id=await _campus_location_id(db, "rvce"),
            title="Inside the campus",
            description="",
            price=100,
            original_price=100,
            category="Electronics",
            condition="Good",
            status="Available",
            campus_pickup_spot="Library",
            quantity=1,
        )
    )
    await db.commit()

    city = (await client.get("/api/locations/search", params={"q": "bengaluru"})).json()[0]
    body = (await client.get(f"/api/locations/{city['id']}/listings")).json()

    titles = [item["title"] for item in body]
    assert "Inside the campus" in titles


async def _campus_location_id(db, college_id: str):
    from app.models.college import College

    college = await db.get(College, college_id)
    return college.location_id


async def test_pickup_spot_endpoints(client, college, db):
    from app.models.location import PickupSpot

    db.add(
        PickupSpot(
            id=uuid.uuid4(),
            college_id="rvce",
            name="Central Library Lawns",
            latitude=12.97,
            longitude=77.59,
            sort_order=1,
            is_active=True,
        )
    )
    await db.commit()

    body = (await client.get("/api/pickup-spots", params={"collegeId": "rvce"})).json()
    assert len(body) == 1
    assert body[0]["name"] == "Central Library Lawns"
    assert body[0]["latitude"] == 12.97


async def test_a_custom_pickup_spot_is_created_on_demand(client, college, buyer):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post(
        "/api/listings",
        headers=headers,
        json={
            "title": "A listing with a made up meeting point",
            "description": "",
            "price": 100,
            "originalPrice": 100,
            "category": "Electronics",
            "condition": "Good",
            "campusPickupSpot": "Behind the new block",
            "images": [],
            "specs": {},
            "tags": [],
            "quantity": 1,
        },
    )
    assert response.status_code == 201
    assert response.json()["campusPickupSpot"] == "Behind the new block"

    spots = (await client.get("/api/pickup-spots", params={"collegeId": "rvce"})).json()
    assert "Behind the new block" in [spot["name"] for spot in spots]


async def test_a_known_pickup_spot_is_reused(client, college, buyer, db):
    from app.models.location import PickupSpot

    db.add(
        PickupSpot(
            id=uuid.uuid4(),
            college_id="rvce",
            name="Central Library Lawns",
            latitude=12.97,
            longitude=77.59,
            sort_order=1,
            is_active=True,
        )
    )
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    await client.post(
        "/api/listings",
        headers=headers,
        json={
            "title": "Uses a known landmark",
            "description": "",
            "price": 100,
            "originalPrice": 100,
            "category": "Electronics",
            "condition": "Good",
            "campusPickupSpot": "Central Library Lawns",
            "images": [],
            "specs": {},
            "tags": [],
            "quantity": 1,
        },
    )

    spots = (await client.get("/api/pickup-spots", params={"collegeId": "rvce"})).json()
    matching = [spot for spot in spots if spot["name"] == "Central Library Lawns"]
    assert len(matching) == 1


async def test_requesting_a_new_campus_builds_the_chain(client, college):
    response = await client.post(
        "/api/colleges/requests",
        json={"name": "New Institute of Technology", "city": "Chennai", "state": "Tamil Nadu"},
    )
    body = response.json()
    assert body["success"] is True
    assert body["college"]["city"] == "Chennai"
    assert body["college"]["state"] == "Tamil Nadu"

    places = (await client.get("/api/locations/tree")).json()
    tamil = next(
        state
        for root in places
        for state in root["children"]
        if state["name"] == "Tamil Nadu"
    )
    chennai = next(city for city in tamil["children"] if city["name"] == "Chennai")
    campus = next(
        child for child in chennai["children"] if child["name"] == "New Institute of Technology"
    )
    assert campus["type"] == "campus"
