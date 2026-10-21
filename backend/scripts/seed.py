"""Loads the seed data into Postgres.

The place tree and the category tree are built first, then the campuses and
the listings are hung off them.

Usage (from the `backend` folder):

    python scripts/seed.py            # build the trees and the listings
    python scripts/seed.py --reset    # wipe the app tables first
    python scripts/seed.py --embed    # also compute Gemini embeddings
"""

import argparse
import asyncio
import json
import re
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.category import Category, CategoryAttribute, ListingAttribute  # noqa: E402
from app.models.chat import Conversation, Message  # noqa: E402
from app.models.college import College  # noqa: E402
from app.models.listing import Listing, ListingImage, WishlistEntry  # noqa: E402
from app.models.location import Location, PickupSpot  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import gemini  # noqa: E402
from app.services.listings import sync_listing_attributes  # noqa: E402
from app.services.places import ensure_place_chain  # noqa: E402

SEED_DIR = BACKEND_ROOT / "app" / "seed"
DEMO_PASSWORD = "password123"
NAMESPACE = uuid.UUID("6f1d2f2a-0e4b-4b0e-9b3a-9f6b1a2c3d4e")


def load(name: str):
    path = SEED_DIR / f"{name}.json"
    if not path.exists():
        raise SystemExit(f"Missing {path}. Run: node backend/scripts/export_seed_data.mjs")
    return json.loads(path.read_text())


def stable_id(key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, key)


async def reset(db) -> None:
    for model in (
        ListingAttribute,
        WishlistEntry,
        Trade,
        Message,
        Conversation,
        Notification,
        ListingImage,
        Listing,
        User,
        College,
        CategoryAttribute,
        Category,
        PickupSpot,
        Location,
    ):
        await db.execute(delete(model))
    await db.commit()
    print("cleared existing rows")


# ---------------------------------------------------------------------------
# The place tree
# ---------------------------------------------------------------------------
async def seed_locations(db, geo, city_states) -> dict[str, Location]:
    """India -> states -> cities, with the coordinates from geo.json."""
    by_key: dict[str, Location] = {}

    country = Location(
        id=stable_id("loc:country:India"),
        slug="india",
        name=geo["country"]["name"],
        type="country",
        parent_id=None,
        ancestors=[],
        latitude=geo["country"]["latitude"],
        longitude=geo["country"]["longitude"],
        sort_order=1,
        is_active=True,
    )
    db.add(country)
    await db.flush()
    by_key[("country", "India")] = country

    states = geo.get("states", {})
    cities = geo.get("cities", {})

    for order, (state_name, coords) in enumerate(states.items(), start=1):
        state = Location(
            id=stable_id(f"loc:state:{state_name}"),
            slug=f"india/{state_name.lower().replace(' ', '-')}",
            name=state_name,
            type="state",
            parent_id=country.id,
            ancestors=[country.id],
            latitude=coords["latitude"],
            longitude=coords["longitude"],
            sort_order=order,
            is_active=True,
        )
        db.add(state)
        await db.flush()
        by_key[("state", state_name)] = state

    for order, (city_name, coords) in enumerate(cities.items(), start=1):
        # A city sits under the state its colleges are in. A city whose state
        # is unknown still gets a chain, so no listing is ever orphaned.
        state_name = city_states.get(city_name)
        state = by_key.get(("state", state_name)) if state_name else None
        if state is None:
            state = country

        city = Location(
            id=stable_id(f"loc:city:{city_name}"),
            slug=f"{state.slug}/{city_name.lower().replace(' ', '-')}",
            name=city_name,
            type="city",
            parent_id=state.id,
            ancestors=[*state.ancestors, state.id],
            latitude=coords["latitude"],
            longitude=coords["longitude"],
            sort_order=order,
            is_active=True,
        )
        db.add(city)
        await db.flush()
        by_key[("city", city_name)] = city

    print(f"seeded {len(by_key)} locations")
    return by_key


async def seed_categories(db, catalogue) -> dict[str, Category]:
    """The category tree with its per-category field schema."""
    by_slug: dict[str, Category] = {}

    async def add(node, parent, ancestors, level, path):
        category = Category(
            id=stable_id(f"cat:{path}"),
            slug=node["slug"],
            name=node["name"],
            alias=node.get("alias") or node["slug"].split("/")[-1],
            parent_id=parent.id if parent is not None else None,
            ancestors=ancestors,
            level=level,
            position=node.get("position", 0),
            path=path,
            view_type=node.get("viewType", "list"),
            photos_max=node.get("photosMax", 5),
            is_active=True,
        )
        db.add(category)
        await db.flush()
        by_slug[node["slug"]] = category

        for order, attribute in enumerate(node.get("attributes", []), start=1):
            db.add(
                CategoryAttribute(
                    id=stable_id(f"catattr:{path}:{attribute['key']}"),
                    category_id=category.id,
                    key=attribute["key"],
                    label=attribute.get("label", attribute["key"]),
                    data_type=attribute.get("dataType", "text"),
                    options=attribute.get("options", []),
                    min_value=attribute.get("minValue"),
                    max_value=attribute.get("maxValue"),
                    unit=attribute.get("unit"),
                    is_filterable=attribute.get("isFilterable", True),
                    is_required=attribute.get("isRequired", False),
                    sort_order=order,
                )
            )

        for child in node.get("children", []):
            child_path = f"{path}/{child['slug'].split('/')[-1]}"
            await add(
                child,
                category,
                ancestors + [category.id],
                level + 1,
                child_path,
            )

    for node in catalogue["categories"]:
        await add(node, None, [], 1, node["slug"])

    await db.flush()
    print(f"seeded {len(by_slug)} categories")
    return by_slug


# ---------------------------------------------------------------------------
# Colleges, spots, users and listings
# ---------------------------------------------------------------------------
def parse_branch(branch: str) -> tuple[str, int]:
    """'ECE 6th Sem' -> ('ECE', 6)."""
    match = re.search(r"(\d+)\s*(?:st|nd|rd|th)?\s*sem", branch or "", re.IGNORECASE)
    semester = int(match.group(1)) if match else 4
    name = re.sub(
        r"\s*\d+\s*(?:st|nd|rd|th)?\s*sem.*$", "", branch or "", flags=re.IGNORECASE
    )
    name = re.sub(r"\s*\(.*?\)\s*", " ", name).strip()
    return (name or "Engineering", semester)


def _spot_offset(name: str) -> tuple[float, float]:
    """A deterministic offset (about +/-400 m) so each landmark has a point."""
    digest = sum(ord(char) for char in name or "")
    lat = ((digest % 17) - 8) * 0.0009
    lng = (((digest // 7) % 17) - 8) * 0.0009
    return round(lat, 6), round(lng, 6)


def seller_email(seller_id: str, domain: str | None, college_id: str) -> str:
    domain = domain or f"{college_id}.ac.in"
    return f"{seller_id.replace('usr_', '')}@{domain}"


async def seed_colleges(db, colleges, locations, geo):
    """A campus profile on top of a location of type 'campus'."""
    created: dict[str, College] = {}

    for order, item in enumerate(colleges, start=1):
        city_name = item.get("city") or "Bengaluru"
        state_name = item.get("state") or "Karnataka"

        _state_location, city_location = await ensure_place_chain(
            db, city_name, state_name
        )
        city_coords = geo.get("cities", {}).get(city_name, {})
        if city_location.latitude is None and city_coords:
            city_location.latitude = city_coords["latitude"]
            city_location.longitude = city_coords["longitude"]

        campus_slug = f"{city_location.slug}/{item['id']}"
        campus = Location(
            id=stable_id(f"loc:campus:{item['id']}"),
            slug=campus_slug,
            name=item["name"],
            type="campus",
            parent_id=city_location.id,
            ancestors=[*city_location.ancestors, city_location.id],
            latitude=city_location.latitude,
            longitude=city_location.longitude,
            address_line=f"{item['name']}, {city_name}, {state_name}",
            sort_order=order,
            is_active=True,
        )
        db.add(campus)
        await db.flush()

        college = College(
            id=item["id"],
            location_id=campus.id,
            short_name=item["shortName"],
            domain=item.get("domain"),
            status=item.get("status", "verified"),
            popular_branches=item.get("popularBranches") or [],
            is_verified=item.get("status", "verified") == "verified",
        )
        db.add(college)
        await db.flush()
        created[college.id] = college

        # The campus landmarks become real, geocodable rows. Each one gets a
        # small deterministic offset from the campus centre, so the distance
        # search has something to sort by.
        for spot_order, spot_name in enumerate(item.get("campusSpots") or [], start=1):
            offset_lat, offset_lng = _spot_offset(spot_name)
            db.add(
                PickupSpot(
                    id=stable_id(f"spot:{item['id']}:{spot_name}"),
                    college_id=college.id,
                    name=spot_name,
                    latitude=(
                        float(campus.latitude) + offset_lat
                        if campus.latitude is not None
                        else None
                    ),
                    longitude=(
                        float(campus.longitude) + offset_lng
                        if campus.longitude is not None
                        else None
                    ),
                    sort_order=spot_order,
                    is_active=True,
                )
            )

    await db.flush()
    print(f"seeded {len(created)} colleges")
    return created


async def seed_users(db, colleges, listings, demo_user, college_rows):
    users: dict[str, User] = {}
    password_hash = hash_password(DEMO_PASSWORD)

    async def ensure(
        user_id: str, name: str, college_id: str, avatar: str, **extra
    ) -> User:
        existing = await db.execute(select(User).where(User.id == stable_id(user_id)))
        user = existing.scalar_one_or_none()
        if user is None:
            user = User(
                id=stable_id(user_id),
                email=extra.get("email", f"{user_id}@uniolx.local"),
            )
            db.add(user)
        user.name = name
        user.college_id = college_id
        user.avatar = avatar
        user.password_hash = password_hash
        user.is_verified = True
        user.branch = extra.get("branch", "Engineering & Technology")
        user.year = extra.get("year", 2)
        user.semester = extra.get("semester", 4)
        user.hostel = extra.get("hostel", "Cauvery Hostel Block A")
        user.rating = extra.get("rating", 5.0)
        user.total_reviews = extra.get("totalReviews", 0)
        user.location_id = (
            college_rows[college_id].location_id if college_id in college_rows else None
        )
        users[user_id] = user
        return user

    for listing in listings:
        seller = listing["seller"]
        college = college_rows.get(seller["collegeId"])
        if college is None:
            continue
        branch_name, semester = parse_branch(seller.get("branch", ""))
        await ensure(
            seller["id"],
            seller["name"],
            college.id,
            seller.get("avatar", ""),
            email=seller_email(seller["id"], college.domain, college.id),
            branch=branch_name,
            semester=semester,
            hostel=seller.get("hostelOrArea"),
            rating=seller.get("rating", 5.0),
            total_reviews=seller.get("totalReviews", 0),
        )

    demo_college = college_rows.get(demo_user.get("collegeId"))
    if demo_college is not None:
        await ensure(
            demo_user["id"],
            demo_user["name"],
            demo_college.id,
            demo_user.get("avatar", ""),
            email=demo_user.get("email", "student@rvce.edu.in"),
            branch=demo_user.get("branch", "Computer Science"),
            year=demo_user.get("year", 3),
            semester=demo_user.get("semester", 6),
            hostel=demo_user.get("hostel", "Cauvery Hostel Block B"),
        )

    await db.flush()
    print(f"seeded {len(users)} users")
    return users


def _category_keywords(category: Category) -> set[str]:
    """The words that identify a category, singular and plural."""
    words = {category.name.lower(), (category.alias or "").lower()}
    expanded = set(words)
    for word in words:
        if not word:
            continue
        expanded.add(word + "s")
        if word.endswith("s"):
            expanded.add(word[:-1])
    return {word for word in expanded if word}


def best_category_for(listing, categories) -> Category | None:
    """The most specific category a listing belongs to.

    The mock data only knows the top-level category, so the leaf is worked
    out from the title and the tags.
    """
    title = (listing.get("title") or "").lower()
    tags = {tag.lower() for tag in listing.get("tags") or []}

    leaves = [category for category in categories.values() if category.level > 1]
    for category in sorted(leaves, key=lambda item: -item.level):
        for keyword in _category_keywords(category):
            if keyword in tags or keyword in title:
                return category

    # Fall back to the top-level category the mock data names.
    wanted = (listing.get("category") or "").lower()
    for category in categories.values():
        if category.level == 1 and category.name.lower() == wanted:
            return category
    return None


async def seed_listings(db, listings, users, college_rows, categories, spots):
    seeded: list[Listing] = []

    spot_by_name = {(spot.college_id, spot.name.lower()): spot for spot in spots.values()}

    for item in listings:
        seller = users.get(item["seller"]["id"])
        college = college_rows.get(item["collegeId"])
        if seller is None or college is None:
            continue

        category = best_category_for(item, categories)

        listing = Listing(
            id=stable_id(item["id"]),
            seller_id=seller.id,
            college_id=college.id,
            category_id=category.id if category is not None else None,
            location_id=college.location_id,
            title=item["title"],
            description=item.get("description", ""),
            price=item["price"],
            original_price=item.get("originalPrice", item["price"]),
            category=item["category"],
            condition=item.get("condition", "Good"),
            status=item.get("status", "Available"),
            campus_pickup_spot=item.get("campusPickupSpot", ""),
            quantity=item.get("quantity", 1),
            specs=item.get("specs", {}),
            tags=item.get("tags", []),
            views_count=item.get("viewsCount", 0),
        )
        db.add(listing)
        await db.flush()

        for position, url in enumerate(item.get("images", [])):
            db.add(ListingImage(listing_id=listing.id, url=url, position=position))

        spot = spot_by_name.get((college.id, (item.get("campusPickupSpot") or "").lower()))
        if spot is not None:
            listing.pickup_spot_id = spot.id
            listing.latitude = spot.latitude
            listing.longitude = spot.longitude
        else:
            listing.latitude = college.location.latitude
            listing.longitude = college.location.longitude

        await sync_listing_attributes(db, listing, listing.specs)
        seeded.append(listing)

    await db.flush()
    print(f"seeded {len(seeded)} listings")
    return seeded


async def embed_all(listings) -> None:
    if not gemini.is_available():
        print("GEMINI_API_KEY not set, skipping embeddings")
        return

    from sqlalchemy import select

    async with SessionLocal() as db:
        done = 0
        for listing in listings:
            row = (
                await db.execute(select(Listing).where(Listing.id == listing.id))
            ).scalar_one_or_none()
            if row is None:
                continue
            vector = await gemini.embed_text(f"{row.title}\n{row.description}")
            if vector is None:
                continue
            row.embedding = vector
            await db.flush()
            done += 1
        await db.commit()
    print(f"embedded {done} listings")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="delete existing rows first")
    parser.add_argument("--embed", action="store_true", help="compute Gemini embeddings")
    args = parser.parse_args()

    colleges = load("colleges")
    listings = load("listings")
    demo_user = load("users")
    geo = load("geo")
    catalogue = load("categories")

    async with SessionLocal() as db:
        if args.reset:
            await reset(db)

        city_states = {c.get("city"): c.get("state") for c in colleges if c.get("city")}
        locations = await seed_locations(db, geo, city_states)
        categories = await seed_categories(db, catalogue)
        college_rows = await seed_colleges(db, colleges, locations, geo)
        users = await seed_users(db, colleges, listings, demo_user, college_rows)

        spots_result = await db.execute(select(PickupSpot))
        spots = {spot.id: spot for spot in spots_result.scalars().all()}

        seeded = await seed_listings(db, listings, users, college_rows, categories, spots)
        await db.commit()

    if args.embed:
        await embed_all(seeded)

    print(
        f"\nseed complete. demo login -> {demo_user.get('email')} / {DEMO_PASSWORD}"
    )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
