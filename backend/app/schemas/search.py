from app.schemas.base import CamelModel
from app.schemas.listing import Listing


class ParsedCriterion(CamelModel):
    id: str
    label: str
    key: str
    value: str
    display_value: str


class AIRankedListing(CamelModel):
    listing: Listing
    match_score: int
    match_reasons: list[str] = []
    unmatched_reasons: list[str] = []


class AISearchResult(CamelModel):
    query: str
    summary: str
    is_vague_or_greeting: bool = False
    parsed_criteria: list[ParsedCriterion] = []
    results: list[AIRankedListing] = []
    alternative_suggestions: list[str] = []
    close_matches: list[AIRankedListing] = []


class AISearchRequest(CamelModel):
    query: str
    criteria_overrides: list[ParsedCriterion] | None = None
    previous_criteria: list[ParsedCriterion] | None = None


class CampusBuddyResponse(CamelModel):
    answer: str
    matched_listings: list[Listing] = []
    college_spot_tip: str = ""
    suggested_prompts: list[str] = []
