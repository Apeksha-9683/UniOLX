from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.models.college import College
from app.schemas.college import CollegeRequest, CollegeRequestResponse
from app.schemas.mappers import college_to_schema
from sqlalchemy import or_, select

router = APIRouter(prefix="/api/colleges", tags=["colleges"])


@router.get("")
async def list_colleges(db: DbSession):
    result = await db.execute(select(College).order_by(College.name))
    return [college_to_schema(college) for college in result.scalars().all()]


@router.get("/search")
async def search_colleges(db: DbSession, q: str = Query("", description="Search text")):
    query = (q or "").strip().lower()
    if len(query) < 2:
        return []

    result = await db.execute(select(College))
    colleges = result.scalars().all()

    matches = [
        college
        for college in colleges
        if query in college.name.lower()
        or query in college.short_name.lower()
        or query in college.city.lower()
        or query in college.state.lower()
        or (college.domain and query in college.domain.lower())
    ]
    return [college_to_schema(college) for college in matches[:8]]


@router.get("/{college_id}")
async def get_college(college_id: str, db: DbSession):
    college = await db.get(College, college_id)
    if college is None:
        return None
    return college_to_schema(college)


@router.post("/requests", response_model=CollegeRequestResponse)
async def request_college(payload: CollegeRequest, db: DbSession):
    name = (payload.name or "").strip()
    if not name:
        return CollegeRequestResponse(success=False, message="Please enter a college name.")

    existing = await db.execute(
        select(College).where(or_(College.name.ilike(name), College.short_name.ilike(name)))
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        return CollegeRequestResponse(
            success=True,
            message=f"{found.name} is already on the list.",
            college=college_to_schema(found),
        )

    slug = "-".join(part for part in name.lower().split() if part.isalnum())[:48] or "college"
    college = College(
        id=f"col_req_{slug}",
        name=name,
        short_name=name.split(" ")[0][:64],
        city=payload.city or "",
        state=payload.state or "India",
        domain=(payload.domain or "").strip().lower() or None,
        status="pending",
        campus_spots=[],
        popular_branches=["General Academics", "Technology", "Science"],
        is_verified=False,
    )
    db.add(college)
    await db.commit()
    await db.refresh(college)

    return CollegeRequestResponse(
        success=True,
        message=f"Thank you! {college.name} has been added as a pending review campus.",
        college=college_to_schema(college),
    )
