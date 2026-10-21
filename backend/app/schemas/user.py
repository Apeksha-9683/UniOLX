from app.schemas.base import CamelModel


class User(CamelModel):
    id: str
    name: str
    email: str
    college_id: str
    college_name: str
    college_short_name: str
    branch: str
    year: int
    semester: int
    hostel: str | None = None
    avatar: str
    is_verified: bool
    rating: float
    total_reviews: int
    completed_trades: int
    joined_date: str


class SellerInfo(CamelModel):
    id: str
    name: str
    college_id: str
    college_name: str
    branch: str
    avatar: str
    is_verified: bool
    rating: float
    total_reviews: int
    hostel_or_area: str


class UserPatch(CamelModel):
    name: str | None = None
    branch: str | None = None
    year: int | None = None
    semester: int | None = None
    hostel: str | None = None
    avatar: str | None = None
