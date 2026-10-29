from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ListingStatus = Literal["available", "reserved", "sold", "archived"]


class Listing(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    seller_id: str
    college_id: str
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    description: str = Field(min_length=1)
    price: int = Field(ge=0)
    condition: str = Field(min_length=1)
    specs: dict[str, Any] = Field(default_factory=dict)
    pickup_location: str | None = None
    quantity_total: int = Field(default=1, ge=0)
    quantity_available: int = Field(default=1, ge=0)
    status: ListingStatus = "available"
    created_at: datetime | None = None


class QueryPlan(BaseModel):
    query: str = Field(min_length=1)
    hypothetical_listing: str | None = None

    @field_validator("hypothetical_listing", mode="before")
    @classmethod
    def _clean_hypothetical(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class Catalog(BaseModel):
    college_ids: list[str] = Field(default_factory=list)
    listing_count: int = 0


class RetrievedListing(BaseModel):
    listing_id: str
    title: str
    category: str
    price: int
    condition: str
    pickup_location: str | None = None
    quantity_available: int = 1
    similarity: float | None = None
    rerank_score: float | None = None
    document: str


class RAGResponse(BaseModel):
    answer: str
    plan: QueryPlan
    results: list[RetrievedListing] = Field(default_factory=list)
    where: dict[str, Any] | None = None
    reranked: bool = False
