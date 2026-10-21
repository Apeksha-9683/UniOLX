import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models.listing import Listing, ListingImage, WishlistEntry
from app.models.user import User
from app.schemas.listing import ListingCreate, ListingPatch
from app.schemas.mappers import listing_to_schema
from app.services.embeddings import schedule_embedding

router = APIRouter(prefix="/api/listings", tags=["listings"])
wishlist_router = APIRouter(prefix="/api/wishlist", tags=["wishlist"])

HIDDEN_STATUSES = ("Archived", "Cancelled")


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

    listing = Listing(
        id=uuid.uuid4(),
        seller_id=current_user.id,
        college_id=current_user.college_id,
        title=payload.title.strip(),
        description=payload.description or "",
        price=payload.price,
        original_price=(
            payload.original_price if payload.original_price is not None else payload.price
        ),
        category=payload.category,
        condition=payload.condition,
        status="Available",
        campus_pickup_spot=payload.campus_pickup_spot or "",
        quantity=max(1, payload.quantity or 1),
        specs=payload.specs or {},
        tags=payload.tags or [payload.category.lower()],
    )
    db.add(listing)
    await db.flush()

    images = payload.images or [
        "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"
    ]
    for position, url in enumerate(images):
        db.add(ListingImage(listing_id=listing.id, url=url, position=position))

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

    for field, value in data.items():
        if value is not None:
            setattr(listing, field, value)

    if images is not None:
        await db.execute(delete(ListingImage).where(ListingImage.listing_id == listing.id))
        for position, url in enumerate(images):
            db.add(ListingImage(listing_id=listing.id, url=url, position=position))

    await db.commit()
    await db.refresh(listing, attribute_names=["seller", "college", "images"])

    schedule_embedding(listing.id, f"{listing.title}\n{listing.description}")
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
