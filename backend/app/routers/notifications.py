import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models.notification import Notification
from app.schemas.mappers import notification_to_schema

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    return [notification_to_schema(item).model_dump(by_alias=True) for item in result.scalars().all()]


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: CurrentUser, db: DbSession):
    try:
        notification_uuid = uuid.UUID(str(notification_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )

    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_uuid,
            Notification.user_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )

    notification.read = True
    await db.commit()
    return {"success": True}
