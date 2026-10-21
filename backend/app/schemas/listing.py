from app.schemas.base import CamelModel
from app.schemas.user import SellerInfo


class Listing(CamelModel):
    id: str
    title: str
    description: str
    price: float
    original_price: float
    category: str
    condition: str
    status: str
    college_id: str
    college_name: str
    campus_pickup_spot: str
    seller: SellerInfo
    images: list[str] = []
    specs: dict[str, str] = {}
    tags: list[str] = []
    posted_at: str
    is_wishlisted: bool = False
    views_count: int = 0
    quantity: int = 1


class ListingCreate(CamelModel):
    title: str
    description: str = ""
    price: float
    original_price: float | None = None
    category: str
    condition: str = "Good"
    campus_pickup_spot: str = ""
    images: list[str] = []
    specs: dict[str, str] = {}
    tags: list[str] = []
    quantity: int = 1


class ListingPatch(CamelModel):
    title: str | None = None
    description: str | None = None
    price: float | None = None
    original_price: float | None = None
    category: str | None = None
    condition: str | None = None
    status: str | None = None
    campus_pickup_spot: str | None = None
    images: list[str] | None = None
    specs: dict[str, str] | None = None
    tags: list[str] | None = None
    quantity: int | None = None


class ListingFilters(CamelModel):
    query: str | None = None
    college_id: str | None = None
    category: str | None = None
    condition: str | None = None
    min_price: float | None = None
    max_price: float | None = None
    sort_by: str | None = None
