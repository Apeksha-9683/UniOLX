"""Resolving places: the location tree, and building new branches of it."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.location import Location

COUNTRY = "India"


class PlaceIndex:
    """Resolves a location's ancestors without an N+1 query.

    `Location.ancestors` holds the materialised path, so a single load of the
    whole tree is enough to answer "which city is this campus in" for every
    college at once.
    """

    def __init__(self, locations: dict[uuid.UUID, Location]) -> None:
        self._locations = locations

    @classmethod
    async def load(cls, db: AsyncSession) -> "PlaceIndex":
        # The children are loaded explicitly: the implicit selectin loader does
        # not fire for this self-referential relationship.
        result = await db.execute(
            select(Location).options(selectinload(Location.children))
        )
        return cls({location.id: location for location in result.scalars().all()})

    def get(self, location_id: uuid.UUID | None) -> Location | None:
        if location_id is None:
            return None
        return self._locations.get(location_id)

    def by_slug(self, slug: str) -> Location | None:
        for location in self._locations.values():
            if location.slug == slug:
                return location
        return None

    def chain(self, location: Location | None) -> list[Location]:
        """Root first: country, state, city, campus."""
        if location is None:
            return []
        chain: list[Location] = []
        for ancestor_id in location.ancestors or []:
            ancestor = self._locations.get(ancestor_id)
            if ancestor is not None:
                chain.append(ancestor)
        chain.append(location)
        return chain

    def of_type(self, location: Location | None, location_type: str) -> Location | None:
        """The closest ancestor of the given type, the location itself included."""
        for item in reversed(self.chain(location)):
            if item.type == location_type:
                return item
        return None

    def city_of(self, location: Location | None) -> Location | None:
        return self.of_type(location, "city")

    def state_of(self, location: Location | None) -> Location | None:
        return self.of_type(location, "state")

    def descendants_of(self, location: Location | None) -> list[uuid.UUID]:
        """The location itself plus everything under it."""
        if location is None:
            return []
        return [location.id] + [
            other.id
            for other in self._locations.values()
            if location.id in (other.ancestors or [])
        ]

    def all(self) -> list[Location]:
        return list(self._locations.values())

    def names(self) -> list[str]:
        return [location.name for location in self._locations.values()]


def _slugify(value: str) -> str:
    out = []
    for char in (value or "").lower():
        if char.isalnum():
            out.append(char)
        elif char in " -_/&.":
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


async def find_or_create(
    db: AsyncSession,
    name: str,
    location_type: str,
    parent: Location | None,
    slug_hint: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> Location:
    """Find a location by slug under the given parent, or create it."""
    slug = slug_hint or _slugify(name)
    if parent is not None and not slug.startswith(parent.slug):
        slug = f"{parent.slug}/{slug}"

    existing = await db.execute(select(Location).where(Location.slug == slug))
    found = existing.scalar_one_or_none()
    if found is not None:
        return found

    ancestors = (list(parent.ancestors or []) + [parent.id]) if parent is not None else []
    location = Location(
        id=uuid.uuid4(),
        slug=slug,
        name=name,
        type=location_type,
        parent_id=parent.id if parent is not None else None,
        ancestors=ancestors,
        latitude=latitude,
        longitude=longitude,
        sort_order=0,
        is_active=True,
    )
    db.add(location)
    await db.flush()
    return location


async def ensure_place_chain(
    db: AsyncSession,
    city: str,
    state: str,
    country: str = COUNTRY,
) -> tuple[Location, Location]:
    """Make sure country -> state -> city exist, and return (state, city)."""
    country_location = await find_or_create(db, country, "country", None)
    state_location = await find_or_create(db, state, "state", country_location)
    city_location = await find_or_create(db, city, "city", state_location)
    return state_location, city_location


async def create_campus_location(
    db: AsyncSession,
    name: str,
    city_location: Location,
    slug_hint: str | None = None,
) -> Location:
    return await find_or_create(
        db,
        name,
        "campus",
        city_location,
        slug_hint=slug_hint,
        latitude=float(city_location.latitude) if city_location.latitude is not None else None,
        longitude=float(city_location.longitude) if city_location.longitude is not None else None,
    )
