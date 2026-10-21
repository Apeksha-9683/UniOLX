"""The place tree, the way OLX exposes it.

`GET /api/locations` mirrors OLX's location objects: an id, a name, a type,
coordinates, a parent and a live listing count.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.models.listing import Listing
from app.models.location import Location, PickupSpot
from app.schemas.listing import Listing as ListingSchema
from app.schemas.location import Location as LocationSchema
from app.schemas.location import PickupSpot as PickupSpotSchema
from app.schemas.mappers import listing_to_schema
from app.services.catalog import counts_by_location
from app.services.places import PlaceIndex

router = APIRouter(prefix="/api/locations", tags=["locations"])
pickup_router = APIRouter(prefix="/api/pickup-spots", tags=["locations"])


def _to_schema(
    location: Location,
    places: PlaceIndex,
    counts: dict[uuid.UUID, int],
    child_ids: list[str] | None = None,
) -> LocationSchema:
    return LocationSchema(
        id=str(location.id),
        slug=location.slug,
        name=location.name,
        type=location.type,
        parent_id=str(location.parent_id) if location.parent_id else None,
        latitude=float(location.latitude) if location.latitude is not None else None,
        longitude=float(location.longitude) if location.longitude is not None else None,
        address_line=location.address_line or "",
        sort_order=location.sort_order,
        is_active=location.is_active,
        child_ids=child_ids if child_ids is not None else [],
        offer_count=counts.get(location.id, 0),
    )


async def _resolve(db, places: PlaceIndex, identifier: str) -> Location | None:
    """Accept either the uuid or the slug."""
    try:
        return await db.get(Location, uuid.UUID(identifier))
    except (ValueError, AttributeError, TypeError):
        return places.by_slug(identifier)


@router.get("")
async def list_locations(
    db: DbSession,
    type: str | None = Query(None, description="country|state|city|district|campus"),
    parent_id: str | None = None,
):
    places = await PlaceIndex.load(db)
    counts = await counts_by_location(db)

    locations = places.all()
    if type:
        locations = [item for item in locations if item.type == type]
    if parent_id:
        parent = await _resolve(db, places, parent_id)
        if parent is None:
            return []
        allowed = set(places.descendants_of(parent))
        locations = [item for item in locations if item.id in allowed]

    locations.sort(key=lambda item: (item.type, item.sort_order, item.name))
    return [
        _to_schema(
            item,
            places,
            counts,
            [str(child.id) for child in item.children],
        )
        for item in locations
    ]


@router.get("/tree")
async def location_tree(
    db: DbSession,
    type: str | None = Query(None, description="Trim the tree below this level"),
):
    places = await PlaceIndex.load(db)
    counts = await counts_by_location(db)

    children_by_parent: dict[uuid.UUID | None, list[Location]] = {}
    for location in places.all():
        children_by_parent.setdefault(location.parent_id, []).append(location)

    def build(location: Location) -> dict:
        children = sorted(
            children_by_parent.get(location.id, []),
            key=lambda item: (item.sort_order, item.name),
        )
        if type and location.type == type:
            children = []
        return _to_schema(
            location,
            places,
            counts,
            [str(child.id) for child in children],
        ).model_dump(by_alias=True) | {
            "children": [build(child) for child in children]
        }

    roots = sorted(
        children_by_parent.get(None, []), key=lambda item: (item.sort_order, item.name)
    )
    return [build(root) for root in roots]


@router.get("/search")
async def search_locations(
    db: DbSession, q: str = Query("", description="Search text"), limit: int = 8
):
    query = (q or "").strip().lower()
    if len(query) < 2:
        return []

    places = await PlaceIndex.load(db)
    counts = await counts_by_location(db)

    matches = []
    for location in places.all():
        if query in location.name.lower() or query in location.slug.lower():
            matches.append(location)
    matches.sort(key=lambda item: (item.type != "city", item.type != "campus", item.name))
    return [
        _to_schema(item, places, counts, [str(child.id) for child in item.children])
        for item in matches[:limit]
    ]


@router.get("/popular")
async def popular_locations(db: DbSession, limit: int = 12):
    places = await PlaceIndex.load(db)
    counts = await counts_by_location(db)

    ranked = sorted(
        [item for item in places.all() if item.type in ("state", "city")],
        key=lambda item: (-counts.get(item.id, 0), item.name),
    )
    return [
        _to_schema(item, places, counts, [str(child.id) for child in item.children])
        for item in ranked[:limit]
    ]


@router.get("/{identifier:path}/listings")
async def listings_in_location(identifier: str, db: DbSession):
    places = await PlaceIndex.load(db)
    location = await _resolve(db, places, identifier)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Location not found"
        )

    allowed = places.descendants_of(location)
    result = await db.execute(
        select(Listing)
        .where(
            Listing.location_id.in_(allowed),
            Listing.status.notin_(("Archived", "Cancelled")),
        )
        .order_by(Listing.posted_at.desc())
    )
    listings = list(result.unique().scalars().all())
    return [listing_to_schema(item).model_dump(by_alias=True) for item in listings]


@router.get("/{identifier:path}")
async def get_location(identifier: str, db: DbSession):
    places = await PlaceIndex.load(db)
    location = await _resolve(db, places, identifier)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Location not found"
        )
    counts = await counts_by_location(db)
    return _to_schema(
        location, places, counts, [str(child.id) for child in location.children]
    )


@pickup_router.get("")
async def list_pickup_spots(db: DbSession, collegeId: str | None = None):
    stmt = select(PickupSpot).order_by(PickupSpot.sort_order, PickupSpot.name)
    if collegeId:
        stmt = stmt.where(PickupSpot.college_id == collegeId)
    result = await db.execute(stmt)
    return [
        PickupSpotSchema(
            id=str(spot.id),
            college_id=spot.college_id,
            name=spot.name,
            description=spot.description or "",
            latitude=float(spot.latitude) if spot.latitude is not None else None,
            longitude=float(spot.longitude) if spot.longitude is not None else None,
            sort_order=spot.sort_order,
            is_active=spot.is_active,
        ).model_dump(by_alias=True)
        for spot in result.scalars().all()
    ]
