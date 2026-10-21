"""Facet counts for the browse tree, the way OLX shows them.

OLX returns `offer_count` on every category and an `empty` flag on every
location, so a shopper can see where the stuff actually is before clicking.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.listing import Listing
from app.services.places import PlaceIndex

ACTIVE_STATUSES = ("Available", "Reserved")


async def counts_by_location(db: AsyncSession) -> dict[uuid.UUID, int]:
    """Live listings per location, rolled up into every ancestor."""
    result = await db.execute(
        select(Listing.location_id, func.count(Listing.id))
        .where(
            Listing.status.in_(ACTIVE_STATUSES),
            Listing.location_id.isnot(None),
        )
        .group_by(Listing.location_id)
    )
    direct = {row[0]: int(row[1]) for row in result.all()}

    places = await PlaceIndex.load(db)
    totals = dict(direct)
    for location in places.all():
        own = direct.get(location.id, 0)
        if not own:
            continue
        for ancestor_id in location.ancestors or []:
            totals[ancestor_id] = totals.get(ancestor_id, 0) + own
    return totals


async def counts_by_category(
    db: AsyncSession, location_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, int]:
    """Live listings per category, optionally restricted to a place subtree."""
    stmt = (
        select(Listing.category_id, func.count(Listing.id))
        .where(Listing.status.in_(ACTIVE_STATUSES), Listing.category_id.isnot(None))
    )
    if location_ids:
        stmt = stmt.where(Listing.location_id.in_(location_ids))

    result = await db.execute(stmt.group_by(Listing.category_id))
    direct = {row[0]: int(row[1]) for row in result.all()}

    # Roll the leaf counts up the category tree.
    result = await db.execute(select(Category).options(selectinload(Category.children)))
    categories = list(result.scalars().all())
    totals = dict(direct)
    for category in categories:
        own = direct.get(category.id, 0)
        if not own:
            continue
        for ancestor_id in category.ancestors or []:
            totals[ancestor_id] = totals.get(ancestor_id, 0) + own
    return totals
