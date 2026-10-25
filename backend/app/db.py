import json
import sqlite3
import re
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
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
    def __init__(self, path: Path | None = None, url: str | None = None) -> None:
        self.path = path
        self.url = url

    @classmethod
    def from_settings(cls) -> "Database":
        settings = get_settings()
        if settings.database_url:
            return cls(url=settings.database_url)
        return cls(path=settings.database_path)

    @property
    def is_postgres(self) -> bool:
        return bool(self.url)

    def initialize(self) -> None:
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            if self.is_postgres:
                for statement in SCHEMA.split(";"):
                    if statement.strip():
                        connection.execute(statement)
            else:
                connection.executescript(SCHEMA)
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

    @contextmanager
    def connection(self) -> Iterator[Any]:
        if self.is_postgres:
            connection = psycopg.connect(self.url, row_factory=dict_row)
            wrapped = _Connection(connection)
        else:
            connection = sqlite3.connect(self.path)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
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
        if isinstance(self._connection, psycopg.Connection):
            sql = sql.replace("INSERT OR IGNORE", "INSERT")
            sql = re.sub(r"\?", "%s", sql)
        return self._connection.execute(sql, params)

    def executescript(self, sql: str) -> None:
        for statement in sql.split(";"):
            if statement.strip():
                self.execute(statement)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._connection, name)
