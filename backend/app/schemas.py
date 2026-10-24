from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str
    password: str = Field(min_length=6, max_length=200)
    college_id: str = Field(min_length=1, max_length=120)
    branch: str = Field(default="Undergraduate", max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=200)


class AuthResponse(BaseModel):
    token: str
    user: dict[str, Any]


class ListingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=5000)
    price: int = Field(ge=0)
    condition: str = Field(min_length=1, max_length=50)
    specs: dict[str, Any] = Field(default_factory=dict)
    pickup_location: str | None = Field(default=None, max_length=200)
    quantity_total: int = Field(default=1, ge=1, le=100)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    college_id: str | None = None


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class TradeCreate(BaseModel):
    listing_id: str
    pickup_location: str = Field(min_length=1, max_length=200)


class TradeConfirm(BaseModel):
    pin: str = Field(min_length=4, max_length=32)


class HealthResponse(BaseModel):
    status: str
    rag_indexed_listings: int
