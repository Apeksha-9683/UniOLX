import os

# Point the app at the test database before anything imports the settings.
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://uniolx:uniolx@localhost:5432/uniolx_test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-long-enough-for-sha256")
os.environ.setdefault("PIN_SECRET", "test-pin-secret-that-is-long-enough-for-aes")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("DEMO_AUTO_REPLY", "false")
# The tests must not depend on a live Gemini quota, so the local
# keyword parser is used instead.
os.environ["GEMINI_API_KEY"] = ""
# Cross-encoder reranking would download an ONNX model on first use; the
# rerank tests inject a fake encoder instead.
os.environ["RERANK_ENABLED"] = "false"

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
                "TRUNCATE listing_attributes, pickup_spots, category_attributes, "
                "categories, locations, listings, listing_images, wishlists, trades, "
                "conversations, messages, notifications, otp_codes, refresh_tokens, "
                "users, colleges RESTART IDENTITY CASCADE"
            )
        )
        await session.commit()
    yield


@pytest_asyncio.fixture
async def category_tree(db):
    """A small category tree so the category resolution path is exercised."""
    from app.models.category import Category, CategoryAttribute

    electronics = Category(
        id=uuid.uuid4(),
        slug="electronics",
        name="Electronics",
        alias="electronics",
        parent_id=None,
        ancestors=[],
        level=1,
        position=1,
        path="electronics",
        view_type="gallery",
        photos_max=8,
    )
    db.add(electronics)
    await db.flush()

    laptops = Category(
        id=uuid.uuid4(),
        slug="electronics/laptops",
        name="Laptops",
        alias="laptops",
        parent_id=electronics.id,
        ancestors=[electronics.id],
        level=2,
        position=1,
        path="electronics/laptops",
        view_type="gallery",
        photos_max=8,
    )
    db.add(laptops)
    await db.flush()

    db.add(
        CategoryAttribute(
            id=uuid.uuid4(),
            category_id=laptops.id,
            key="ram",
            label="RAM",
            data_type="range",
            options=[],
            min_value=2,
            max_value=128,
            unit="GB",
            is_filterable=True,
            sort_order=1,
        )
    )
    db.add(
        CategoryAttribute(
            id=uuid.uuid4(),
            category_id=laptops.id,
            key="brand",
            label="Brand",
            data_type="enum",
            options=["Apple", "Lenovo", "Dell"],
            is_filterable=True,
            sort_order=2,
        )
    )
    await db.commit()
    return {"electronics": electronics, "laptops": laptops}


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
    from app.models.location import PickupSpot
    from app.services.places import create_campus_location, ensure_place_chain

    state_location, city_location = await ensure_place_chain(db, "Bengaluru", "Karnataka")
    city_location.latitude = 12.9716
    city_location.longitude = 77.5946

    campus_location = await create_campus_location(
        db, "RV College of Engineering", city_location, slug_hint="rvce"
    )
    campus_location.latitude = 12.9700
    campus_location.longitude = 77.5900

    college = College(
        id="rvce",
        location_id=campus_location.id,
        short_name="RVCE",
        domain="rvce.edu.in",
        status="verified",
        popular_branches=["CSE"],
        is_verified=True,
    )
    db.add(college)

    other_city = await ensure_place_chain(db, "Bengaluru", "Karnataka")
    other_campus = await create_campus_location(
        db, "BMS College of Engineering", other_city[1], slug_hint="bmsce"
    )
    other_campus.latitude = 12.9800
    other_campus.longitude = 77.6000
    db.add(
        College(
            id="bmsce",
            location_id=other_campus.id,
            short_name="BMSCE",
            domain="bmsce.ac.in",
            status="verified",
            is_verified=True,
        )
    )
    await db.commit()
    return college


@pytest_asyncio.fixture
async def pickup_spot(db, college):
    """A campus landmark with its own coordinates."""
    from app.models.location import PickupSpot

    spot = PickupSpot(
        id=uuid.uuid4(),
        college_id="rvce",
        name="Central Library Lawns",
        latitude=12.9750,
        longitude=77.5950,
        sort_order=1,
        is_active=True,
    )
    db.add(spot)
    await db.commit()
    return spot


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
