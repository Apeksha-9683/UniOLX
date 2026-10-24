import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    college_id TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'Undergraduate',
    is_verified INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS colleges (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL,
    city TEXT NOT NULL, state TEXT NOT NULL, domain TEXT, status TEXT DEFAULT 'verified',
    campus_spots_json TEXT NOT NULL DEFAULT '[]', popular_branches_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    college_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL,
    condition TEXT NOT NULL,
    specs_json TEXT NOT NULL,
    pickup_location TEXT,
    quantity_total INTEGER NOT NULL DEFAULT 1,
    quantity_available INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL,
    FOREIGN KEY (seller_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    price INTEGER NOT NULL,
    pickup_location TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    attempts_left INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (listing_id) REFERENCES listings(id)
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wishlist (
    user_id TEXT NOT NULL, listing_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id), FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(listing_id, buyer_id), FOREIGN KEY (listing_id) REFERENCES listings(id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    type TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, link TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_college_status ON listings(college_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.executescript(SCHEMA)
            connection.execute(
                """INSERT OR IGNORE INTO colleges
                   (id, name, short_name, city, state, domain, status,
                    campus_spots_json, popular_branches_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    "11111111-1111-4111-8111-111111111111",
                    "R.V. College of Engineering",
                    "RVCE",
                    "Bengaluru",
                    "Karnataka",
                    "rvce.edu.in",
                    "verified",
                    '["Hostel Gate", "Central Library", "Food Court"]',
                    '["Engineering", "Technology", "Science"]',
                ),
            )

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def decode_listing(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["specs"] = json.loads(result.pop("specs_json"))
        return result
