import json
import re
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from backend.app.config import get_settings


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
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (college_id) REFERENCES colleges(id),
    CHECK (price >= 0),
    CHECK (quantity_total > 0),
    CHECK (quantity_available >= 0 AND quantity_available <= quantity_total),
    CHECK (status IN ('available', 'reserved', 'sold', 'archived'))
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
    FOREIGN KEY (listing_id) REFERENCES listings(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id),
    CHECK (price >= 0),
    CHECK (attempts_left BETWEEN 0 AND 5),
    CHECK (status IN ('reserved', 'completed', 'cancelled'))
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (listing_id) REFERENCES listings(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS wishlist (
    user_id TEXT NOT NULL, listing_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, listing_id), FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(listing_id, buyer_id), FOREIGN KEY (listing_id) REFERENCES listings(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    type TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, link TEXT, created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    CHECK (read IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_listings_college_status ON listings(college_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_college ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
"""

POSTGRES_HARDENING = """
DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_college_fk
        FOREIGN KEY (college_id) REFERENCES colleges(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE listings ADD CONSTRAINT listings_college_fk
        FOREIGN KEY (college_id) REFERENCES colleges(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_buyer_fk
        FOREIGN KEY (buyer_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_seller_fk
        FOREIGN KEY (seller_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE conversations ADD CONSTRAINT conversations_buyer_fk
        FOREIGN KEY (buyer_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE conversations ADD CONSTRAINT conversations_seller_fk
        FOREIGN KEY (seller_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE messages ADD CONSTRAINT messages_conversation_fk
        FOREIGN KEY (conversation_id) REFERENCES conversations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE messages ADD CONSTRAINT messages_listing_fk
        FOREIGN KEY (listing_id) REFERENCES listings(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE messages ADD CONSTRAINT messages_sender_fk
        FOREIGN KEY (sender_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE notifications ADD CONSTRAINT notifications_user_fk
        FOREIGN KEY (user_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE listings ADD CONSTRAINT listings_price_check CHECK (price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE listings ADD CONSTRAINT listings_quantity_check
        CHECK (quantity_total > 0 AND quantity_available BETWEEN 0 AND quantity_total);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE listings ADD CONSTRAINT listings_status_check
        CHECK (status IN ('available', 'reserved', 'sold', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_price_check CHECK (price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_attempts_check CHECK (attempts_left BETWEEN 0 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE trades ADD CONSTRAINT trades_status_check
        CHECK (status IN ('reserved', 'completed', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_users_college ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
"""


class Database:
    def __init__(self, url: str) -> None:
        self.url = url

    @classmethod
    def from_settings(cls) -> "Database":
        return cls(url=get_settings().database_url)

    def initialize(self) -> None:
        with self.connection() as connection:
            for statement in SCHEMA.split(";"):
                if statement.strip():
                    connection.execute(statement)
            connection.execute(
                """INSERT INTO colleges
                   (id, name, short_name, city, state, domain, status,
                    campus_spots_json, popular_branches_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO NOTHING""",
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
            connection.execute(POSTGRES_HARDENING)
            connection.execute(
                """INSERT INTO colleges
                   (id, name, short_name, city, state, domain, status,
                    campus_spots_json, popular_branches_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    "22222222-2222-4222-8222-222222222222",
                    "BMS College of Engineering",
                    "BMSCE",
                    "Bengaluru",
                    "Karnataka",
                    "bmsce.ac.in",
                    "verified",
                    '["Main Gate", "Central Library", "Student Activity Centre"]',
                    '["Engineering", "Technology", "Science"]',
                ),
            )

    @contextmanager
    def connection(self) -> Iterator[Any]:
        connection = psycopg.connect(self.url, row_factory=dict_row)
        wrapped = _Connection(connection)
        try:
            yield wrapped
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def decode_listing(row: Any) -> dict[str, Any]:
        result = dict(row)
        specs = result.pop("specs_json")
        result["specs"] = specs if isinstance(specs, dict) else json.loads(specs)
        return result


class _Connection:
    def __init__(self, connection: Any) -> None:
        self._connection = connection

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        sql = sql.replace("INSERT OR IGNORE", "INSERT")
        sql = re.sub(r"\?", "%s", sql)
        return self._connection.execute(sql, params)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._connection, name)
