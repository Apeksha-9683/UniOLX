import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID | str,
    title: str,
    message: str,
    type: str = "message",
    link: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id)),
        title=title,
        message=message,
        type=type,
        link=link,
        read=False,
    )
    db.add(notification)
    await db.flush()
    return notification
