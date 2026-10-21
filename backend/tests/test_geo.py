"""Radius filtering, distance sorting and the bounding box."""

import uuid

import pytest

from tests.conftest import auth_headers

# Roughly the centre of Bengaluru.
BENGALURU = (12.9716, 77.5946)
# About 11 km north, near the airport.
NORTH = (13.0694, 77.5946)
# About 11 km south-east, near Whitefield.
SOUTH_EAST = (12.8949, 77.6859)


async def _listing(db, seller, location_id, title, latitude, longitude):
    from app.models.listing import Listing

    listing = Listing(
        id=uuid.uuid4(),
        seller_id=seller.id,
        college_id=seller.college_id,
        location_id=location_id,
        title=title,
        description="",
        price=1000,
        original_price=1000,
        category="Electronics",
        condition="Good",
        status="Available",
        campus_pickup_spot="Library",
        quantity=1,
        latitude=latitude,
        longitude=longitude,
    )
    db.add(listing)
    await db.commit()
    return listing


async def test_radius_filter_keeps_what_is_inside(
    client, college, buyer, seller, db
):
    from app.models.college import College

    campus = await db.get(College, "rvce")
    await _listing(db, seller, campus.location_id, "Close one", *BENGALURU)
    await _listing(db, seller, campus.location_id, "Far one", *SOUTH_EAST)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={"lat": BENGALURU[0], "lng": BENGALURU[1], "radiusKm": 5},
        )
    ).json()

    titles = [item["title"] for item in body["items"]]
    assert "Close one" in titles
    assert "Far one" not in titles


async def test_distance_is_reported(client, college, buyer, seller, db):
    from app.models.college import College

    campus = await db.get(College, "rvce")
    await _listing(db, seller, campus.location_id, "Near", *BENGALURU)
    await _listing(db, seller, campus.location_id, "North", *NORTH)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={"lat": BENGALURU[0], "lng": BENGALURU[1]},
        )
    ).json()

    distances = {item["title"]: item["distanceKm"] for item in body["items"]}
    assert distances["Near"] < 0.5
    assert distances["North"] > 5


async def test_sort_by_distance_is_ascending(client, college, buyer, seller, db):
    from app.models.college import College

    campus = await db.get(College, "rvce")
    await _listing(db, seller, campus.location_id, "A", *SOUTH_EAST)
    await _listing(db, seller, campus.location_id, "B", *BENGALURU)
    await _listing(db, seller, campus.location_id, "C", *NORTH)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={
                "lat": BENGALURU[0],
                "lng": BENGALURU[1],
                "radiusKm": 100,
                "sortBy": "distance",
            },
        )
    ).json()

    distances = [item["distanceKm"] for item in body["items"]]
    assert distances == sorted(distances)


async def test_the_bounding_box_never_drops_a_valid_result(
    client, college, buyer, seller, db
):
    """A listing just inside the radius must survive the box prefilter.

    The longitude span shrinks with the latitude, so a naive box drops
    results that are close enough.
    """
    from app.models.college import College

    campus = await db.get(College, "rvce")
    # 1 km east of the centre, well inside a 5 km radius
    await _listing(db, seller, campus.location_id, "Just east", BENGALURU[0], BENGALURU[1] + 0.009)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={"lat": BENGALURU[0], "lng": BENGALURU[1], "radiusKm": 5},
        )
    ).json()

    assert "Just east" in [item["title"] for item in body["items"]]


async def test_a_listing_without_coordinates_is_still_listed(
    client, college, buyer, seller, db
):
    from app.models.college import College
    from app.models.listing import Listing

    campus = await db.get(College, "rvce")
    db.add(
        Listing(
            id=uuid.uuid4(),
            seller_id=seller.id,
            college_id=seller.college_id,
            location_id=campus.location_id,
            title="No coordinates",
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

    plain = (await client.get("/api/listings/search", headers=headers)).json()
    assert "No coordinates" in [item["title"] for item in plain["items"]]

    geo = (
        await client.get(
            "/api/listings/search",
            headers=headers,
            params={"lat": BENGALURU[0], "lng": BENGALURU[1]},
        )
    ).json()
    assert "No coordinates" not in [item["title"] for item in geo["items"]]


def test_the_bounding_box_shrinks_with_the_latitude():
    from app.services.geo import bounding_box

    *_, equator_min, equator_max = bounding_box(0.0, 0.0, 10)
    *_, north_min, north_max = bounding_box(60.0, 0.0, 10)
    equator = equator_max - equator_min
    north = north_max - north_min
    assert north > equator, "the longitude span must widen towards the poles"


def test_the_bounding_box_covers_the_radius():
    from app.services.geo import bounding_box

    min_lat, max_lat, min_lng, max_lng = bounding_box(12.9716, 77.5946, 10)
    assert min_lat < 12.9716 < max_lat
    assert min_lng < 77.5946 < max_lng
    # ten kilometres is roughly 0.09 degrees of latitude either way
    assert 0.15 < (max_lat - min_lat) < 0.20
