"""
database.py
-----------
Sets up the SQLAlchemy 2 database engine and session factory.

- Import `get_db` in your route handlers to get a database session.
- Import `Base` in your model files to define database tables.
- Import `check_database_connection` for the /health endpoint.
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


# The engine manages the connection pool to PostgreSQL.
# pool_pre_ping=True: tests each connection before use, avoiding stale-connection errors
#   (Supabase pauses idle connections, so this is especially useful here).
# echo=True in development: prints every SQL query to the terminal for debugging.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=(settings.APP_ENV == "development"),
)

# SessionLocal creates individual database sessions (one per HTTP request).
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


class Base(DeclarativeBase):
    """
    Base class for all database models (tables).

    Example usage in a models file:
        from app.database import Base

        class User(Base):
            __tablename__ = "users"
            id: Mapped[int] = mapped_column(primary_key=True)
            email: Mapped[str] = mapped_column(String(255), unique=True)
    """
    pass


def get_db():
    """
    FastAPI dependency that provides a database session for one request.
    The session is automatically closed when the request finishes.

    Usage in any route:
        from sqlalchemy.orm import Session
        from fastapi import Depends
        from app.database import get_db

        @app.get("/items")
        def list_items(db: Session = Depends(get_db)):
            items = db.execute(select(Item)).scalars().all()
            return items
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """
    Runs a minimal SQL query (SELECT 1) to verify the DB is reachable.
    Used by the /health endpoint.

    Returns {"status": "ok"} on success.
    Returns {"status": "error", "error": "<ExceptionTypeName>"} on failure.

    IMPORTANT: Only the exception class name is returned — never the connection
    string or any other sensitive detail.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        # Return only the error type name — the connection URL is never exposed.
        return {"status": "error", "error": type(exc).__name__}
