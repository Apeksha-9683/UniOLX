"""
alembic/env.py
--------------
Alembic's environment script — runs every time you use the 'alembic' command.

Key things this file does:
  1. Reads DATABASE_URL from your .env file (never from alembic.ini)
  2. Points Alembic at your SQLAlchemy Base so it can auto-detect table changes
  3. Supports both offline mode (generates SQL files) and online mode (applies changes live)
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# ---------------------------------------------------------------------------
# Make sure 'app' is importable when running alembic from the backend/ folder
# ---------------------------------------------------------------------------
# Add the backend/ directory to Python's search path.
# Without this, 'from app.database import Base' would fail.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# ---------------------------------------------------------------------------
# Load .env BEFORE importing app modules (which read env vars at import time)
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---------------------------------------------------------------------------
# Import your app's Base (the parent class of all your database models)
# ---------------------------------------------------------------------------
# When you add new models, import them here so Alembic can see them.
# Example after creating User model:
#   from app.models.user import User  # noqa: F401  (the import itself registers it)
from app.database import Base  # noqa: F401

# ---------------------------------------------------------------------------
# Alembic Config object (gives access to alembic.ini values)
# ---------------------------------------------------------------------------
config = context.config

# Set the database URL from the environment variable (keeps it out of alembic.ini)
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set.\n"
        "Create a .env file in the backend/ folder (see .env.example)."
    )
config.set_main_option("sqlalchemy.url", database_url)

# Set up Python logging from alembic.ini's [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Tell Alembic which tables to track (all tables defined on Base)
target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Migration functions — you don't need to edit these
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    """
    Offline mode: generates a .sql file with the migration SQL.
    Useful if you want to review SQL before running it.
    Run with: alembic upgrade head --sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Online mode: connects to the database and runs migrations directly.
    This is the default mode used by: alembic upgrade head
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # Don't keep connections open after migrating
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
