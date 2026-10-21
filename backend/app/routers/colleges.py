from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.deps import DbSession
from app.models.college import College
from app.schemas.college import CollegeRequest, CollegeRequestResponse
from app.schemas.mappers import college_to_schema
from app.services.places import (
    PlaceIndex,
    create_campus_location,
    ensure_place_chain,
)

router = APIRouter(prefix="/api/colleges", tags=["colleges"])


@router.get("")
async def list_colleges(db: DbSession):
    result = await db.execute(select(College).order_by(College.short_name))
    colleges = list(result.scalars().all())
    places = await PlaceIndex.load(db)
    return [college_to_schema(college, places) for college in colleges]


@router.get("/search")
async def search_colleges(db: DbSession, q: str = Query("", description="Search text")):
    query = (q or "").strip().lower()
    if len(query) < 2:
        return []

    result = await db.execute(select(College))
    colleges = list(result.scalars().all())
    places = await PlaceIndex.load(db)

    matches = []
    for college in colleges:
        location = college.location
        haystack = [college.short_name, college.id]
        if location is not None:
            haystack.append(location.name)
            city = places.city_of(location)
            state = places.state_of(location)
            if city is not None:
                haystack.append(city.name)
            if state is not None:
                haystack.append(state.name)
        if college.domain:
            haystack.append(college.domain)

        if any(query in value.lower() for value in haystack if value):
            matches.append(college)
            if len(matches) >= 8:
                break

    return [college_to_schema(college, places) for college in matches]


@router.get("/{college_id}")
async def get_college(college_id: str, db: DbSession):
    college = await db.get(College, college_id)
    if college is None:
        return None
    places = await PlaceIndex.load(db)
    return college_to_schema(college, places)


@router.post("/requests", response_model=CollegeRequestResponse)
async def request_college(payload: CollegeRequest, db: DbSession):
    name = (payload.name or "").strip()
    if not name:
        return CollegeRequestResponse(success=False, message="Please enter a college name.")

    existing = await db.execute(
        select(College).where(College.short_name.ilike(name) | College.id.ilike(name))
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        places = await PlaceIndex.load(db)
        return CollegeRequestResponse(
            success=True,
            message=f"{found.location.name if found.location else found.id} is already on the list.",
            college=college_to_schema(found, places),
        )

    _state_location, city_location = await ensure_place_chain(
        db, payload.city or "", payload.state or "India"
    )
    campus_location = await create_campus_location(
        db, name, city_location, slug_hint=(payload.domain or "").split(".")[0] or None
    )

    college = College(
        id=f"col_req_{campus_location.slug.replace('/', '-')}"[:64],
        location_id=campus_location.id,
        short_name=name.split(" ")[0][:64],
        domain=(payload.domain or "").strip().lower() or None,
        status="pending",
        popular_branches=["General Academics", "Technology", "Science"],
        is_verified=False,
    )
    db.add(college)
    await db.commit()
    await db.refresh(college)

    places = await PlaceIndex.load(db)
    return CollegeRequestResponse(
        success=True,
        message=f"Thank you! {name} has been added as a pending review campus.",
        college=college_to_schema(college, places),
    )
