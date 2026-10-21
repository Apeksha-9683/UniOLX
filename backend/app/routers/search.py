from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.search import (
    AISearchRequest,
    AISearchResult,
    CampusBuddyResponse,
)
from app.services import search as search_service
from app.services.ai_parser import Criterion

router = APIRouter(prefix="/api/search", tags=["search"])


def _to_criteria(items) -> list[Criterion]:
    return [
        Criterion(
            id=item.id,
            label=item.label,
            key=item.key,
            value=item.value,
            display_value=item.display_value,
        )
        for item in (items or [])
    ]


@router.post("/ai", response_model=AISearchResult)
async def ai_search(payload: AISearchRequest, current_user: CurrentUser, db: DbSession):
    return await search_service.ai_search(
        db,
        current_user,
        payload.query,
        criteria_overrides=_to_criteria(payload.criteria_overrides) or None,
        previous_criteria=_to_criteria(payload.previous_criteria) or None,
    )


@router.post("/campus-buddy", response_model=CampusBuddyResponse)
async def campus_buddy(payload: AISearchRequest, current_user: CurrentUser, db: DbSession):
    return await search_service.campus_buddy(db, current_user, payload.query)
