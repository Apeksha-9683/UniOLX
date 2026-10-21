"""The category tree, its facet counts and the structured attributes."""

import uuid

from tests.conftest import auth_headers


async def test_category_tree_is_consistent(db, category_tree):
    from app.models.category import Category
    from sqlalchemy import select

    result = await db.execute(select(Category))
    categories = {item.id: item for item in result.scalars().all()}

    for category in categories.values():
        if category.parent_id is None:
            assert category.level == 1
            assert not category.ancestors
            continue

        parent = categories.get(category.parent_id)
        assert parent is not None
        assert category.level == parent.level + 1
        assert category.ancestors[-1] == parent.id
        assert parent.ancestors == category.ancestors[:-1]
        # the path mirrors the tree
        assert category.path == f"{parent.path}/{category.slug.split('/')[-1]}"


async def test_category_tree_endpoint(client, college, category_tree):
    body = (await client.get("/api/categories/tree")).json()

    assert body
    root = body[0]
    assert root["name"] == "Electronics"
    assert root["level"] == 1
    assert root["childIds"], "the root should list its children"
    assert root["photosMax"] == 8
    assert root["viewType"] == "gallery"

    leaf = root["children"][0]
    assert leaf["level"] == 2
    assert leaf["path"] == "electronics/laptops"
    assert leaf["parentId"] == root["id"]


async def test_category_attributes_endpoint(client, college, category_tree):
    body = (
        await client.get(
            f"/api/categories/{category_tree['laptops'].slug}/attributes"
        )
    ).json()

    keys = {item["key"] for item in body}
    assert {"ram", "brand"} <= keys

    ram = next(item for item in body if item["key"] == "ram")
    assert ram["dataType"] == "range"
    assert ram["unit"] == "GB"
    assert ram["minValue"] == 2

    brand = next(item for item in body if item["key"] == "brand")
    assert brand["dataType"] == "enum"
    assert "Apple" in brand["options"]


async def test_offer_counts_match_the_real_listings(
    client, college, buyer, seller, db, category_tree
):
    from app.models.listing import Listing

    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=seller.id,
            college_id=seller.college_id,
            category_id=category_tree["laptops"].id,
            location_id=await _campus_location_id(db, "rvce"),
            title="Counted laptop",
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

    body = (await client.get("/api/categories/tree")).json()
    electronics = next(item for item in body if item["name"] == "Electronics")
    laptops = next(item for item in electronics["children"] if item["name"] == "Laptops")

    assert laptops["offerCount"] == 1
    # the count rolls up to the parent
    assert electronics["offerCount"] == 1


async def test_listing_attributes_mirror_the_specs(client, college, buyer, seller, db, category_tree):
    from app.models.category import ListingAttribute
    from sqlalchemy import select

    headers = await auth_headers(client, "seller@rvce.edu.in")
    response = await client.post(
        "/api/listings",
        headers=headers,
        json={
            "title": "Attributed laptop",
            "description": "",
            "price": 100,
            "originalPrice": 100,
            "category": "Electronics",
            "condition": "Good",
            "campusPickupSpot": "Library",
            "images": [],
            "specs": {"RAM": "16GB", "Brand": "Lenovo", "Touchscreen": "true"},
            "tags": [],
            "quantity": 1,
        },
    )
    assert response.status_code == 201

    result = await db.execute(
        select(ListingAttribute).where(
            ListingAttribute.listing_id == uuid.UUID(response.json()["id"])
        )
    )
    attributes = {item.key: item for item in result.scalars().all()}

    assert attributes["ram"].value_num == 16
    assert attributes["brand"].value == "Lenovo"
    assert attributes["touchscreen"].value_bool is True


async def test_photos_max_is_enforced(client, college, buyer, category_tree):
    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post(
        "/api/listings",
        headers=headers,
        json={
            "title": "Too many photos",
            "description": "",
            "price": 100,
            "originalPrice": 100,
            "category": "Electronics",
            "condition": "Good",
            "campusPickupSpot": "Library",
            "images": [f"https://example.com/{index}.jpg" for index in range(12)],
            "specs": {},
            "tags": [],
            "quantity": 1,
        },
    )
    assert response.status_code == 400
    assert "photos" in response.json()["detail"].lower()


async def test_the_search_endpoint_returns_the_olx_envelope(
    client, college, buyer, seller, db, category_tree
):
    from app.models.listing import Listing

    for index in range(3):
        db.add(
            Listing(
                id=uuid.uuid4(),
                seller_id=seller.id,
                college_id=seller.college_id,
                category_id=category_tree["laptops"].id,
                location_id=await _campus_location_id(db, "rvce"),
                title=f"Listed laptop {index}",
                description="",
                price=1000 + index,
                original_price=1000 + index,
                category="Electronics",
                condition="Good",
                status="Available",
                campus_pickup_spot="Library",
                quantity=1,
            )
        )
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (await client.get("/api/listings/search", headers=headers)).json()

    assert set(body.keys()) == {"items", "total", "page", "size", "nextPage"}
    assert body["total"] == 3
    assert body["page"] == 0
    assert body["size"] == 20
    assert body["nextPage"] is None
    assert len(body["items"]) == 3


async def test_the_search_endpoint_paginates(client, college, buyer, seller, db, category_tree):
    from app.models.listing import Listing

    for index in range(5):
        db.add(
            Listing(
                id=uuid.uuid4(),
                seller_id=seller.id,
                college_id=seller.college_id,
                category_id=category_tree["laptops"].id,
                location_id=await _campus_location_id(db, "rvce"),
                title=f"Paged laptop {index}",
                description="",
                price=1000 + index,
                original_price=1000 + index,
                category="Electronics",
                condition="Good",
                status="Available",
                campus_pickup_spot="Library",
                quantity=1,
            )
        )
    await db.commit()

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    first = (await client.get("/api/listings/search", headers=headers, params={"size": 2})).json()
    second = (
        await client.get("/api/listings/search", headers=headers, params={"size": 2, "page": 1})
    ).json()

    assert first["total"] == 5
    assert len(first["items"]) == 2
    assert first["nextPage"] == 1
    assert second["page"] == 1
    assert second["nextPage"] == 2

    ids = {item["id"] for item in first["items"]} | {item["id"] for item in second["items"]}
    assert len(ids) == 4


async def test_search_by_category(client, college, buyer, seller, db, category_tree):
    from app.models.listing import Listing

    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=seller.id,
            college_id=seller.college_id,
            category_id=category_tree["laptops"].id,
            location_id=await _campus_location_id(db, "rvce"),
            title="A laptop",
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
    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=seller.id,
            college_id=seller.college_id,
            category_id=category_tree["electronics"].id,
            location_id=await _campus_location_id(db, "rvce"),
            title="A generic gadget",
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

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={"categoryId": category_tree["laptops"].slug},
        )
    ).json()

    assert body["total"] == 1
    assert body["items"][0]["title"] == "A laptop"


async def _campus_location_id(db, college_id: str):
    from app.models.college import College

    college = await db.get(College, college_id)
    return college.location_id
