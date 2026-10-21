from app.schemas.base import CamelModel


class Category(CamelModel):
    id: str
    slug: str
    name: str
    alias: str = ""
    parent_id: str | None = None
    level: int = 1
    position: int = 0
    path: str = ""
    view_type: str = "list"
    photos_max: int = 5
    is_active: bool = True
    child_ids: list[str] = []
    offer_count: int = 0


class CategoryAttribute(CamelModel):
    id: str
    category_id: str
    key: str
    label: str
    data_type: str = "text"
    options: list = []
    min_value: float | None = None
    max_value: float | None = None
    unit: str | None = None
    is_filterable: bool = True
    is_required: bool = False
    sort_order: int = 0
