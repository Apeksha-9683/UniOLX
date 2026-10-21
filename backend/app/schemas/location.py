from app.schemas.base import CamelModel


class Location(CamelModel):
    id: str
    slug: str
    name: str
    type: str
    parent_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_line: str = ""
    sort_order: int = 0
    is_active: bool = True
    child_ids: list[str] = []
    offer_count: int = 0
    distance_km: float | None = None


class PickupSpot(CamelModel):
    id: str
    college_id: str
    name: str
    description: str = ""
    latitude: float | None = None
    longitude: float | None = None
    sort_order: int = 0
    is_active: bool = True
