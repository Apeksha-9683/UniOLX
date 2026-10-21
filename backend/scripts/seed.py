"""Loads the mock data from `src/data` into Postgres.

Usage (from the `backend` folder):

    python scripts/seed.py            # colleges, users, listings
    python scripts/seed.py --reset    # wipe the app tables first
    python scripts/seed.py --embed    # also compute Gemini embeddings
"""

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import delete, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.models.chat import Conversation, Message  # noqa: E402
from app.models.college import College  # noqa: E402
from app.models.listing import Listing, ListingImage, WishlistEntry  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.trade import Trade  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import gemini  # noqa: E402

SEED_DIR = BACKEND_ROOT / "app" / "seed"
DEMO_PASSWORD = "password123"
NAMESPACE = uuid.UUID("6f1d2f2a-0e4b-4b0e-9b3a-9f6b1a2c3d4e")


def load(name: str):
    path = SEED_DIR / f"{name}.json"
    if not path.exists():
        raise SystemExit(
            f"Missing {path}. Run: node backend/scripts/export_seed_data.mjs"
        )
    return json.loads(path.read_text())


def stable_id(key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, key)


def seller_email(seller_id: str, college: dict) -> str:
    domain = college.get("domain") or f"{college['id']}.ac.in"
    return f"{seller_id.replace('usr_', '')}@{domain}"


async def reset(db) -> None:
    for model in (
        WishlistEntry,
        Trade,
        Message,
        Conversation,
        Notification,
        ListingImage,
        Listing,
        User,
        College,
    ):
        await db.execute(delete(model))
    await db.commit()
    print("cleared existing rows")


async def seed_colleges(db, colleges) -> dict[str, College]:
    mapping: dict[str, College] = {}
    for item in colleges:
        existing = await db.execute(
            select(College).where(College.id == item["id"])
        )
        college = existing.scalar_one_or_none()
        if college is None:
            college = College(id=item["id"])
            db.add(college)
        college.name = item["name"]
        college.short_name = item["shortName"]
        college.city = item.get("city", "")
        college.state = item.get("state", "")
        college.domain = item.get("domain")
        college.status = item.get("status", "verified")
        college.campus_spots = item.get("campusSpots") or []
        college.popular_branches = item.get("popularBranches") or []
        college.is_verified = item.get("status", "verified") == "verified"
        mapping[college.id] = college
    await db.flush()
    print(f"seeded {len(mapping)} colleges")
    return mapping


async def seed_users(db, colleges_by_id, listings, demo_user) -> dict[str, User]:
    users: dict[str, User] = {}
    password_hash = hash_password(DEMO_PASSWORD)

    async def ensure(
        user_id: str, name: str, college_id: str, avatar: str, **extra
    ) -> User:
        existing = await db.execute(select(User).where(User.id == stable_id(user_id)))
        user = existing.scalar_one_or_none()
        if user is None:
            user = User(id=stable_id(user_id), email=extra.get("email", f"{user_id}@uniolx.local"))
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
        users[user_id] = user
        return user

    def parse_branch(branch: str) -> tuple[str, int]:
        """'ECE 6th Sem' -> ('ECE', 6)."""
        import re

        match = re.search(r"(\d+)\s*(?:st|nd|rd|th)?\s*sem", branch or "", re.IGNORECASE)
        semester = int(match.group(1)) if match else 4
        name = re.sub(r"\s*\d+\s*(?:st|nd|rd|th)?\s*sem.*$", "", branch or "", flags=re.IGNORECASE)
        name = re.sub(r"\s*\(.*?\)\s*", " ", name).strip()
        return (name or "Engineering", semester)

    for listing in listings:
        seller = listing["seller"]
        college = colleges_by_id.get(seller["collegeId"])
        if college is None:
            continue
        branch_name, semester = parse_branch(seller.get("branch", ""))
        await ensure(
            seller["id"],
            seller["name"],
            college.id,
            seller.get("avatar", ""),
            email=seller_email(seller["id"], {
                "id": college.id,
                "domain": college.domain,
            }),
            branch=branch_name,
            semester=semester,
            hostel=seller.get("hostelOrArea"),
            rating=seller.get("rating", 5.0),
            total_reviews=seller.get("totalReviews", 0),
        )

    demo_college = colleges_by_id.get(demo_user.get("collegeId"))
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


async def seed_listings(db, listings, users, colleges_by_id) -> list[Listing]:
    seeded: list[Listing] = []
    for item in listings:
        listing_id = stable_id(item["id"])
        seller = users.get(item["seller"]["id"])
        if seller is None:
            continue

        existing = await db.execute(select(Listing).where(Listing.id == listing_id))
        listing = existing.scalar_one_or_none()
        if listing is None:
            listing = Listing(id=listing_id)
            db.add(listing)

        listing.seller_id = seller.id
        listing.college_id = item["collegeId"]
        listing.title = item["title"]
        listing.description = item.get("description", "")
        listing.price = item["price"]
        listing.original_price = item.get("originalPrice", item["price"])
        listing.category = item["category"]
        listing.condition = item.get("condition", "Good")
        listing.status = item.get("status", "Available")
        listing.campus_pickup_spot = item.get("campusPickupSpot", "")
        listing.quantity = item.get("quantity", 1)
        listing.specs = item.get("specs", {})
        listing.tags = item.get("tags", [])
        listing.views_count = item.get("viewsCount", 0)

        await db.flush()

        await db.execute(delete(ListingImage).where(ListingImage.listing_id == listing.id))
        for position, url in enumerate(item.get("images", [])):
            db.add(ListingImage(listing_id=listing.id, url=url, position=position))

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
            # Re-read the row in this session: the objects handed over by the
            # seeder are detached and would not be flushed.
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

    async with SessionLocal() as db:
        if args.reset:
            await reset(db)
        colleges_by_id = await seed_colleges(db, colleges)
        users = await seed_users(db, colleges_by_id, listings, demo_user)
        seeded = await seed_listings(db, listings, users, colleges_by_id)
        await db.commit()

    if args.embed:
        await embed_all(seeded)

    print(
        "\nseed complete. demo login -> "
        f"{demo_user.get('email')} / {DEMO_PASSWORD}"
    )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
