import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from backend.app.auth import hash_password
from backend.app.config import get_settings
from backend.app.db import Database


def seed() -> None:
    settings = get_settings()
    database = Database.from_settings()
    database.initialize()
    raw = json.loads(settings.rag_data_path.read_text(encoding="utf-8"))
    listings = raw.get("listings", raw) if isinstance(raw, dict) else raw
    now = datetime.now(UTC).isoformat()
    with database.connection() as connection:
        seller_ids: set[str] = set()
        for listing in listings:
            seller_id = listing["seller_id"]
            seller_ids.add(seller_id)
            connection.execute(
                """INSERT INTO users
                   (id, name, email, password_hash, college_id, branch, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    seller_id,
                    f"Student {seller_id[-4:]}",
                    f"{seller_id[-4:]}@uniolx.local",
                    hash_password("password123"),
                    listing["college_id"],
                    "Engineering",
                    now,
                ),
            )
            connection.execute(
                """INSERT INTO listings
                   (id, seller_id, college_id, title, category, description, price, condition,
                    specs_json, pickup_location, quantity_total, quantity_available, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO UPDATE SET
                   title = EXCLUDED.title, description = EXCLUDED.description,
                   price = EXCLUDED.price, condition = EXCLUDED.condition,
                   specs_json = EXCLUDED.specs_json, status = EXCLUDED.status""",
                (
                    listing["id"],
                    seller_id,
                    listing["college_id"],
                    listing["title"],
                    listing["category"],
                    listing["description"],
                    listing["price"],
                    listing["condition"],
                    json.dumps(listing.get("specs", {})),
                    listing.get("pickup_location"),
                    listing.get("quantity_total", 1),
                    listing.get("quantity_available", 1),
                    listing.get("status", "available"),
                    listing.get("created_at", now),
                ),
            )
        connection.execute(
            """INSERT INTO users
               (id, name, email, password_hash, college_id, branch, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (id) DO NOTHING""",
            (
                str(uuid.uuid4()),
                "UniOLX Admin",
                "admin@uniolx.local",
                hash_password("admin-password-change-me"),
                "11111111-1111-4111-8111-111111111111",
                "Administration",
                now,
            ),
        )


if __name__ == "__main__":
    seed()
