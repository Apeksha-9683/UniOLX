from app.schemas.base import CamelModel


class NotificationItem(CamelModel):
    id: str
    title: str
    message: str
    type: str
    read: bool
    timestamp: str
    link: str | None = None
