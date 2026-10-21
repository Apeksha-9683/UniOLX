"""Listing services: place resolution, structured attributes and the search."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category, CategoryAttribute, ListingAttribute
from app.models.listing import Listing
from app.models.location import Location, PickupSpot
from app.models.user import User
from app.schemas.mappers import listing_to_schema
from app.services import geo
from app.services.places import PlaceIndex

HIDDEN_STATUSES = ("Archived", "Cancelled")


# ---------------------------------------------------------------------------
# Pickup spots
# ---------------------------------------------------------------------------
async def resolve_pickup_spot(
    db: AsyncSession, college_id: str, name: str
) -> PickupSpot | None:
    """Find a known campus landmark, or create one for a custom string."""
    clean = (name or "").strip()
    if not clean:
        return None

    result = await db.execute(
        select(PickupSpot).where(
            PickupSpot.college_id == college_id,
            func.lower(PickupSpot.name) == clean.lower(),
        )
    )
    found = result.scalar_one_or_none()
    if found is not None:
        return found

    spot = PickupSpot(
        id=uuid.uuid4(),
        college_id=college_id,
        name=clean,
        sort_order=100,
        is_active=True,
    )
    db.add(spot)
    await db.flush()
    return spot


# ---------------------------------------------------------------------------
# Structured attributes
# ---------------------------------------------------------------------------
def _coerce(value) -> tuple[str | None, float | None, bool | None]:
    """Split a spec value into its text, numeric and boolean forms."""
    if value is None:
        return None, None, None
    if isinstance(value, bool):
        return ("true" if value else "false"), None, value
    if isinstance(value, (int, float)):
        return str(value), float(value), None

    text_value = str(value).strip()
    lowered = text_value.lower()
    if lowered in ("true", "yes"):
        return "true", None, True
    if lowered in ("false", "no"):
        return "false", None, False

    number = None
    cleaned = text_value.replace(",", "").strip()
    try:
        if cleaned.lower().endswith("gb"):
            number = float(cleaned[:-2].strip())
        elif cleaned.lower().endswith("mb"):
            number = float(cleaned[:-2].strip())
        elif cleaned.lower().endswith("k"):
            number = float(cleaned[:-1].strip()) * 1000
        else:
            number = float(cleaned)
    except ValueError:
        number = None

    return text_value, number, None


async def sync_listing_attributes(
    db: AsyncSession, listing: Listing, specs: dict | None = None
) -> None:
    """Write the typed attribute rows that mirror the JSONB `specs` column.

    Attributes belong to a category, so a listing without one has no typed
    attributes (its `specs` JSONB mirror is still kept).
    """
    await db.execute(
        delete(ListingAttribute).where(ListingAttribute.listing_id == listing.id)
    )
    if not specs or listing.category_id is None:
        await db.flush()
        return

    category_id = listing.category_id

    # The stored key has to match the category's declared attribute key, so
    # "RAM" and "ram" end up as the same, filterable, attribute.
    declared = await _declared_keys(db, category_id)

    for key, value in specs.items():
        text_value, number_value, bool_value = _coerce(value)
        if text_value is None and number_value is None and bool_value is None:
            continue
        db.add(
            ListingAttribute(
                listing_id=listing.id,
                category_id=category_id,
                key=declared.get(str(key).strip().lower(), str(key).strip().lower())[:64],
                value=text_value,
                value_num=number_value,
                value_bool=bool_value,
            )
        )
    await db.flush()


async def _declared_keys(db: AsyncSession, category_id) -> dict[str, str]:
    if category_id is None:
        return {}
    result = await db.execute(
        select(CategoryAttribute.key).where(CategoryAttribute.category_id == category_id)
    )
    return {key.lower(): key for key in result.scalars().all()}


async def category_for_listing(
    db: AsyncSession, category_name: str, category_slug: str | None = None
) -> Category | None:
    """The most specific category whose name matches the listing's category.

    The listing's `category` column holds a top-level name such as
    "Electronics"; the tree also has the leaves under it, so the deepest
    matching name wins.
    """
    result = await db.execute(select(Category))
    categories = list(result.scalars().all())

    if category_slug:
        for category in categories:
            if category.slug == category_slug:
                return category

    needle = (category_name or "").strip().lower()
    if not needle:
        return None

    matches = [category for category in categories if category.name.lower() == needle]
    if not matches:
        matches = [
            category
            for category in categories
            if needle in category.name.lower() or category.name.lower() in needle
        ]
    if not matches:
        return None

    return max(matches, key=lambda category: category.level)


# ---------------------------------------------------------------------------
# The OLX-style search
# ---------------------------------------------------------------------------
class ListingSearchParams:
    def __init__(
        self,
        query: str | None = None,
        category_id: str | None = None,
        location_id: str | None = None,
        college_id: str | None = None,
        condition: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        attributes: dict[str, str] | None = None,
        page: int = 0,
        size: int = 20,
        sort_by: str = "newest",
        lat: float | None = None,
        lng: float | None = None,
        radius_km: float | None = None,
    ) -> None:
        self.query = query
        self.category_id = category_id
        self.location_id = location_id
        self.college_id = college_id
        self.condition = condition
        self.min_price = min_price
        self.max_price = max_price
        self.attributes = attributes or {}
        self.page = max(0, page)
        self.size = max(1, min(100, size))
        self.sort_by = sort_by
        self.lat = lat
        self.lng = lng
        self.radius_km = radius_km


def _listing_options():
    return (
        selectinload(Listing.seller).selectinload(User.college),
        selectinload(Listing.college),
        selectinload(Listing.images),
    )


async def search_listings(
    db: AsyncSession, params: ListingSearchParams
) -> dict:
    """The OLX response envelope: items, total, page, size, next_page."""
    places = await PlaceIndex.load(db)

    stmt = select(Listing).options(*_listing_options())

    # Campus scoping stays: a student only ever sees their own campus unless
    # they widen the search to a place.
    location_ids: list[uuid.UUID] | None = None
    if params.location_id:
        location = await _resolve_location(db, places, params.location_id)
        if location is not None:
            location_ids = places.descendants_of(location)
    elif params.college_id:
        college_location_id = await _college_location_id(db, params.college_id)
        location_ids = places.descendants_of(places.get(college_location_id))

    if location_ids:
        stmt = stmt.where(Listing.location_id.in_(location_ids))
    else:
        stmt = stmt.where(Listing.college_id == params.college_id)

    stmt = stmt.where(Listing.status.notin_(HIDDEN_STATUSES))

    if params.category_id:
        category = await _resolve_category(db, places, params.category_id)
        if category is not None:
            # the category itself plus everything filed below it
            allowed = [category.id] + [
                other.id
                for other in await _all_categories(db)
                if category.id in (other.ancestors or [])
            ]
            stmt = stmt.where(Listing.category_id.in_(allowed))

    if params.condition and params.condition != "All":
        stmt = stmt.where(Listing.condition == params.condition)
    if params.min_price is not None:
        stmt = stmt.where(Listing.price >= params.min_price)
    if params.max_price is not None:
        stmt = stmt.where(Listing.price <= params.max_price)
    if params.query:
        like = f"%{params.query.strip()}%"
        stmt = stmt.where(
            Listing.title.ilike(like) | Listing.description.ilike(like)
        )

    for key, value in params.attributes.items():
        stmt = stmt.where(
            Listing.id.in_(
                select(ListingAttribute.listing_id).where(
                    ListingAttribute.key == key,
                    ListingAttribute.value.ilike(f"%{value}%"),
                )
            )
        )

    has_geo = params.lat is not None and params.lng is not None
    if has_geo and params.radius_km:
        stmt = geo.apply_radius(
            stmt,
            Listing.latitude,
            Listing.longitude,
            params.lat,
            params.lng,
            params.radius_km,
        )
        stmt = stmt.where(
            geo.haversine_expr(
                "listings.latitude", "listings.longitude", params.lat, params.lng
            )
            <= params.radius_km
        )
    elif has_geo:
        stmt = stmt.where(Listing.latitude.isnot(None))

    if params.sort_by == "price_low":
        stmt = stmt.order_by(Listing.price.asc())
    elif params.sort_by == "price_high":
        stmt = stmt.order_by(Listing.price.desc())
    elif params.sort_by == "discount":
        stmt = stmt.order_by(
            (Listing.original_price - Listing.price).desc() / Listing.original_price.desc()
        )
    elif params.sort_by == "distance" and has_geo:
        stmt = stmt.order_by(
            geo.haversine_expr(
                "listings.latitude", "listings.longitude", params.lat, params.lng
            ).asc()
        )
    else:
        stmt = stmt.order_by(Listing.posted_at.desc())

    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = int((await db.execute(count_stmt)).scalar_one() or 0)

    stmt = stmt.offset(params.page * params.size).limit(params.size)
    result = await db.execute(stmt)
    listings = list(result.unique().scalars().all())

    items = []
    for listing in listings:
        schema = listing_to_schema(listing)
        payload = schema.model_dump(by_alias=True)
        if has_geo and listing.latitude is not None and listing.longitude is not None:
            payload["distanceKm"] = round(
                _haversine_km(
                    params.lat, params.lng, float(listing.latitude), float(listing.longitude)
                ),
                2,
            )
        else:
            payload["distanceKm"] = None
        payload["location"] = (
            {
                "id": str(listing.location.id),
                "name": listing.location.name,
                "slug": listing.location.slug,
            }
            if listing.location is not None
            else None
        )
        items.append(payload)

    return {
        "items": items,
        "total": total,
        "page": params.page,
        "size": params.size,
        "nextPage": params.page + 1 if (params.page + 1) * params.size < total else None,
    }


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    import math

    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _college_location_id(db: AsyncSession, college_id: str) -> uuid.UUID | None:
    from app.models.college import College

    result = await db.get(College, college_id)
    return result.location_id if result is not None else None


async def _resolve_location(db, places: PlaceIndex, identifier: str) -> Location | None:
    try:
        return await db.get(Location, uuid.UUID(identifier))
    except (ValueError, AttributeError, TypeError):
        return places.by_slug(identifier)


async def _all_categories(db: AsyncSession) -> list[Category]:
    result = await db.execute(select(Category))
    return list(result.scalars().all())


async def _resolve_category(db, places: PlaceIndex, identifier: str) -> Category | None:
    from app.models.category import Category as CategoryModel

    try:
        return await db.get(CategoryModel, uuid.UUID(identifier))
    except (ValueError, AttributeError, TypeError):
        result = await db.execute(
            select(CategoryModel).where(CategoryModel.slug == identifier)
        )
        return result.scalar_one_or_none()
