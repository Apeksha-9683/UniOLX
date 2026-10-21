import os

# Point the app at the test database before anything imports the settings.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://uniolx:uniolx@localhost:5432/uniolx_test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-long-enough-for-sha256")
os.environ.setdefault("PIN_SECRET", "test-pin-secret-that-is-long-enough-for-aes")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("DEMO_AUTO_REPLY", "false")

import uuid  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import app  # noqa: E402
from app.models.college import College  # noqa: E402
from app.models.user import User  # noqa: E402
from app.core.security import hash_password  # noqa: E402

TEST_ENGINE = create_async_engine(settings.database_url, echo=False)
TestSession = async_sessionmaker(bind=TEST_ENGINE, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_schema():
    async with TEST_ENGINE.begin() as connection:
        try:
            await connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        except Exception:
            # The extension is usually created by a superuser during setup.
            pass
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    await TEST_ENGINE.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables(create_schema):
    """Truncate the app tables between tests, keeping the schema in place."""
    async with TestSession() as session:
        await session.execute(
            text(
                "TRUNCATE listings, listing_images, wishlists, trades, conversations, "
                "messages, notifications, otp_codes, refresh_tokens, users, colleges "
                "RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield


@pytest_asyncio.fixture
async def db():
    async with TestSession() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


@pytest_asyncio.fixture
async def college(db) -> College:
    college = College(
        id="rvce",
        name="RV College of Engineering",
        short_name="RVCE",
        city="Bengaluru",
        state="Karnataka",
        domain="rvce.edu.in",
        status="verified",
        campus_spots=["Central Library Lawns"],
        popular_branches=["CSE"],
    )
    db.add(college)

    other = College(
        id="bmsce",
        name="BMS College of Engineering",
        short_name="BMSCE",
        city="Bengaluru",
        state="Karnataka",
        domain="bmsce.ac.in",
        status="verified",
    )
    db.add(other)
    await db.commit()
    return college


@pytest_asyncio.fixture
async def other_college(db, college) -> College:
    return await db.get(College, "bmsce")


async def make_user(
    db,
    college: College,
    email: str,
    name: str = "Test Student",
    password: str = "password123",
    verified: bool = True,
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        name=name,
        college_id=college.id,
        branch="CSE",
        year=3,
        semester=6,
        hostel="Cauvery Hostel Block A",
        avatar="https://api.dicebear.com/7.x/bottts/svg?seed=Test",
        is_verified=verified,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def buyer(db, college) -> User:
    return await make_user(db, college, "buyer@rvce.edu.in")


@pytest_asyncio.fixture
async def seller(db, college) -> User:
    return await make_user(db, college, "seller@rvce.edu.in", name="Seller Student")


@pytest_asyncio.fixture
async def outsider(db, other_college) -> User:
    return await make_user(db, other_college, "outsider@bmsce.ac.in")


async def auth_headers(client: AsyncClient, email: str, password: str = "password123") -> dict:
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    body = response.json()
    assert body.get("success"), body
    return {"Authorization": f"Bearer {body['accessToken']}"}
