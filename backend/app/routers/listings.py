import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models.listing import Listing, ListingImage, WishlistEntry
from app.models.location import Location, PickupSpot
from app.models.user import User
from app.schemas.listing import ListingCreate, ListingPatch
from app.schemas.mappers import listing_to_schema
from app.services.embeddings import schedule_embedding
from app.services.listings import (
    ListingSearchParams,
    category_for_listing,
    resolve_pickup_spot,
    search_listings,
    sync_listing_attributes,
)

router = APIRouter(prefix="/api/listings", tags=["listings"])
wishlist_router = APIRouter(prefix="/api/wishlist", tags=["wishlist"])

HIDDEN_STATUSES = ("Archived", "Cancelled")


def _apply_coordinates(listing, spot) -> None:
    """A listing sits where its pickup spot sits, unless it has its own point."""
    if spot is None:
        return
    if spot.latitude is not None:
        listing.latitude = float(spot.latitude)
    if spot.longitude is not None:
        listing.longitude = float(spot.longitude)


async def _college_location_id(db, college_id: str):
    from app.models.college import College

    college = await db.get(College, college_id)
    return college.location_id if college is not None else None


async def _category_of_listing(db, listing):
    from app.models.category import Category

    if listing.category_id is None:
        return None
    return await db.get(Category, listing.category_id)


def _visible_college_ids(user: User, scope: str | None) -> list[str]:
    """Listings are scoped to the user's own campus. Partner campuses are opt-in."""
    if scope == "partners":
        return [user.college_id, "rvce"]
    return [user.college_id]


async def _wishlisted_ids(db, user_id) -> set[str]:
    result = await db.execute(
        select(WishlistEntry.listing_id).where(WishlistEntry.user_id == user_id)
    )
    return {str(row) for row in result.scalars().all()}


@router.get("")
async def list_listings(
    current_user: CurrentUser,
    db: DbSession,
    query: str | None = None,
    category: str | None = None,
    condition: str | None = None,
    min_price: float | None = Query(None, alias="minPrice"),
    max_price: float | None = Query(None, alias="maxPrice"),
    sort_by: str | None = Query(None, alias="sortBy"),
    scope: str | None = None,
):
    college_ids = _visible_college_ids(current_user, scope)

    stmt = (
        select(Listing)
        .options(
            selectinload(Listing.seller).selectinload(User.college),
            selectinload(Listing.college),
            selectinload(Listing.images),
        )
        .where(
            Listing.college_id.in_(college_ids),
            Listing.status.notin_(HIDDEN_STATUSES),
        )
    )

    if category and category != "All":
        stmt = stmt.where(Listing.category == category)
    if condition and condition != "All":
        stmt = stmt.where(Listing.condition == condition)
    if min_price is not None:
        stmt = stmt.where(Listing.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Listing.price <= max_price)
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                Listing.title.ilike(like),
                Listing.description.ilike(like),
                Listing.category.ilike(like),
                Listing.campus_pickup_spot.ilike(like),
            )
        )

    if sort_by == "price_low":
        stmt = stmt.order_by(Listing.price.asc())
    elif sort_by == "price_high":
        stmt = stmt.order_by(Listing.price.desc())
    elif sort_by == "discount":
        stmt = stmt.order_by(
            (Listing.original_price - Listing.price).desc() / Listing.original_price.desc()
        )
    else:
        stmt = stmt.order_by(Listing.posted_at.desc())

    result = await db.execute(stmt)
    listings = list(result.unique().scalars().all())
    wishlisted = await _wishlisted_ids(db, current_user.id)

    return [listing_to_schema(item, str(item.id) in wishlisted) for item in listings]


@router.get("/featured")
async def featured_listings(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Listing)
        .options(
            selectinload(Listing.seller).selectinload(User.college),
            selectinload(Listing.college),
            selectinload(Listing.images),
        )
        .where(
            Listing.college_id == current_user.college_id,
            Listing.status == "Available",
        )
        .order_by(Listing.posted_at.desc())
        .limit(6)
    )
    listings = list(result.unique().scalars().all())
    wishlisted = await _wishlisted_ids(db, current_user.id)
    return [listing_to_schema(item, str(item.id) in wishlisted) for item in listings]


@router.get("/search")
async def search_listings_endpoint(
    current_user: CurrentUser,
    db: DbSession,
    query: str | None = None,
    category_id: str | None = Query(None, alias="categoryId"),
    location_id: str | None = Query(None, alias="locationId"),
    condition: str | None = None,
    min_price: float | None = Query(None, alias="minPrice"),
    max_price: float | None = Query(None, alias="maxPrice"),
    page: int = 0,
    size: int = 20,
    sort_by: str = Query("newest", alias="sortBy"),
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = Query(None, alias="radiusKm"),
):
    """The OLX search envelope: items, total, page, size, nextPage."""
    params = ListingSearchParams(
        query=query,
        category_id=category_id,
        location_id=location_id,
        college_id=current_user.college_id,
        condition=condition,
        min_price=min_price,
        max_price=max_price,
        page=page,
        size=size,
        sort_by=sort_by,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
    )
    return await search_listings(db, params)


@router.get("/{listing_id}")
async def get_listing(listing_id: str, current_user: CurrentUser, db: DbSession):
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if listing.college_id != current_user.college_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    listing.views_count += 1
    await db.commit()

    wishlisted = await _wishlisted_ids(db, current_user.id)
    return listing_to_schema(listing, str(listing.id) in wishlisted)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_listing(payload: ListingCreate, current_user: CurrentUser, db: DbSession):
    if current_user.college_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No college selected")

    category = await category_for_listing(db, payload.category)
    images = payload.images or [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"
    ]
    if category is not None and len(images) > category.photos_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {category.name} listing can have at most {category.photos_max} photos.",
        )

    spot = await resolve_pickup_spot(
        db, current_user.college_id, payload.campus_pickup_spot
    )
    college_location_id = await _college_location_id(db, current_user.college_id)

    listing = Listing(
        id=uuid.uuid4(),
        seller_id=current_user.id,
        college_id=current_user.college_id,
        category_id=category.id if category is not None else None,
        location_id=college_location_id,
        pickup_spot_id=spot.id if spot is not None else None,
        title=payload.title.strip(),
        description=payload.description or "",
        price=payload.price,
        original_price=(
            payload.original_price if payload.original_price is not None else payload.price
        ),
        category=payload.category,
        condition=payload.condition,
        status="Available",
        campus_pickup_spot=spot.name if spot is not None else (payload.campus_pickup_spot or ""),
        quantity=max(1, payload.quantity or 1),
        specs=payload.specs or {},
        tags=payload.tags or [payload.category.lower()],
    )
    db.add(listing)
    await db.flush()

    for position, url in enumerate(images):
        db.add(ListingImage(listing_id=listing.id, url=url, position=position))

    _apply_coordinates(listing, spot)
    await sync_listing_attributes(db, listing, listing.specs)

    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])

    schedule_embedding(listing.id, f"{listing.title}\n{listing.description}")
    return listing_to_schema(listing)


@router.patch("/{listing_id}")
async def update_listing(
    listing_id: str, payload: ListingPatch, current_user: CurrentUser, db: DbSession
):
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    data = payload.model_dump(exclude_unset=True)
    images = data.pop("images", None)
    specs = data.pop("specs", None)

    for field, value in data.items():
        if value is not None:
            setattr(listing, field, value)

    if "category" in data and data["category"]:
        category = await category_for_listing(db, data["category"])
        if category is not None:
            listing.category_id = category.id

    if "campus_pickup_spot" in data:
        spot = await resolve_pickup_spot(
            db, listing.college_id, data["campus_pickup_spot"]
        )
        if spot is not None:
            listing.pickup_spot_id = spot.id
            listing.campus_pickup_spot = spot.name
            _apply_coordinates(listing, spot)

    if images is not None:
        category = await _category_of_listing(db, listing)
        if category is not None and len(images) > category.photos_max:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A {category.name} listing can have at most {category.photos_max} photos.",
            )
        await db.execute(delete(ListingImage).where(ListingImage.listing_id == listing.id))
        for position, url in enumerate(images):
            db.add(ListingImage(listing_id=listing.id, url=url, position=position))

    if specs is not None:
        listing.specs = specs
    await sync_listing_attributes(db, listing, listing.specs)

    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])

    schedule_embedding(listing.id, f"{listing.title}\n{listing.description}")
    return listing_to_schema(listing)


@router.patch("/{listing_id}/location")
async def update_listing_location(
    listing_id: str, payload: dict, current_user: CurrentUser, db: DbSession
):
    """Set where the item is: the place, the campus landmark and the point."""
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    body = payload or {}

    location_id = body.get("locationId")
    if location_id:
        location = await db.get(Location, uuid.UUID(str(location_id)))
        if location is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown location"
            )
        listing.location_id = location.id

    pickup_spot_id = body.get("pickupSpotId")
    if pickup_spot_id:
        spot = await db.get(PickupSpot, uuid.UUID(str(pickup_spot_id)))
        if spot is None or spot.college_id != listing.college_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown pickup spot"
            )
        listing.pickup_spot_id = spot.id
        listing.campus_pickup_spot = spot.name
        _apply_coordinates(listing, spot)

    if body.get("lat") is not None and body.get("lng") is not None:
        listing.latitude = body["lat"]
        listing.longitude = body["lng"]

    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])
    return listing_to_schema(listing)


@router.post("/{listing_id}/status")
async def update_listing_status(
    listing_id: str, payload: dict, current_user: CurrentUser, db: DbSession
):
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    new_status = (payload or {}).get("status")
    allowed = {"Available", "Reserved", "Sold", "Pending", "Completed", "Cancelled", "Archived"}
    if new_status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    listing.status = new_status
    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])
    return listing_to_schema(listing)


@router.post("/{listing_id}/deactivate")
async def deactivate_listing(listing_id: str, current_user: CurrentUser, db: DbSession):
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    listing.status = "Reserved" if listing.status == "Available" else "Available"
    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])
    return listing_to_schema(listing)


@router.delete("/{listing_id}")
async def archive_listing(listing_id: str, current_user: CurrentUser, db: DbSession):
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.seller_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    listing.status = "Archived"
    await db.commit()
    return {"success": True}


@wishlist_router.get("")
async def get_wishlist(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Listing)
        .join(WishlistEntry, WishlistEntry.listing_id == Listing.id)
        .options(
            selectinload(Listing.seller).selectinload(User.college),
            selectinload(Listing.college),
            selectinload(Listing.images),
        )
        .where(
            WishlistEntry.user_id == current_user.id,
            Listing.college_id == current_user.college_id,
            Listing.status.notin_(HIDDEN_STATUSES),
        )
        .order_by(WishlistEntry.created_at.desc())
    )
    listings = list(result.unique().scalars().all())
    return [listing_to_schema(item, True) for item in listings]


@wishlist_router.post("/{listing_id}/toggle")
async def toggle_wishlist(listing_id: str, current_user: CurrentUser, db: DbSession):
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.college_id != current_user.college_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")

    existing = await db.execute(
        select(WishlistEntry).where(
            and_(
                WishlistEntry.user_id == current_user.id,
                WishlistEntry.listing_id == listing.id,
            )
        )
    )
    entry = existing.scalar_one_or_none()

    if entry is not None:
        await db.delete(entry)
        await db.commit()
        return {"success": True, "isWishlisted": False}

    db.add(WishlistEntry(user_id=current_user.id, listing_id=listing.id))
    await db.commit()
    return {"success": True, "isWishlisted": True}
