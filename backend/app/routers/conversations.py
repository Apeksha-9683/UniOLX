import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models.chat import Conversation
from app.models.listing import Listing
from app.models.user import User
from app.schemas.chat import ConversationCreate, MessageCreate
from app.schemas.mappers import conversation_to_schema, message_to_schema
from app.services import chat as chat_service
from app.ws.chat import CONVERSATIONS_UPDATED, MESSAGE, MESSAGE_STATUS, TYPING, manager

router = APIRouter(prefix="/api/conversations", tags=["chat"])


async def _load_conversation(db, conversation_id: str, user) -> Conversation:
    try:
        conversation_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.listing).selectinload(Listing.images),
            selectinload(Conversation.buyer).selectinload(User.college),
            selectinload(Conversation.seller).selectinload(User.college),
        )
        .where(Conversation.id == conversation_uuid)
    )
    conversation = result.unique().scalar_one_or_none()
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    if str(user.id) not in (str(conversation.buyer_id), str(conversation.seller_id)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    return conversation


@router.get("")
async def list_conversations(current_user: CurrentUser, db: DbSession):
    return await chat_service.list_conversations(db, current_user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation(payload: ConversationCreate, current_user: CurrentUser, db: DbSession):
    conversation, error = await chat_service.create_or_get_conversation(
        db, current_user, payload.listing_id
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    await db.commit()
    conversation = await _load_conversation(db, str(conversation.id), current_user)
    schema = conversation_to_schema(conversation, str(current_user.id))
    return schema.model_dump(by_alias=True)


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, current_user: CurrentUser, db: DbSession):
    conversation = await _load_conversation(db, conversation_id, current_user)
    schema = conversation_to_schema(conversation, str(current_user.id))
    return schema.model_dump(by_alias=True)


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, current_user: CurrentUser, db: DbSession):
    await _load_conversation(db, conversation_id, current_user)
    return await chat_service.get_messages(db, current_user, conversation_id)


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str, payload: MessageCreate, current_user: CurrentUser, db: DbSession
):
    conversation = await _load_conversation(db, conversation_id, current_user)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    message, conversation = await chat_service.send_message(
        db, current_user, conversation_id, text
    )
    await db.commit()

    payload_dict = message_to_schema(message, str(current_user.id)).model_dump(by_alias=True)
    peer_id = (
        str(conversation.seller_id)
        if str(conversation.buyer_id) == str(current_user.id)
        else str(conversation.buyer_id)
    )

    await manager.send_to_user(peer_id, MESSAGE, payload_dict)
    await manager.send_to_user(
        str(current_user.id),
        MESSAGE_STATUS,
        {
            "messageId": str(message.id),
            "conversationId": str(conversation.id),
            "status": "sent",
        },
    )
    await manager.send_to_users(
        [str(current_user.id), peer_id],
        CONVERSATIONS_UPDATED,
        {"conversationId": str(conversation.id)},
    )

    if settings.dev_mode and settings.demo_auto_reply and peer_id:
        await _maybe_auto_reply(db, conversation, current_user, text, peer_id)

    return payload_dict


async def _maybe_auto_reply(db, conversation, sender, text: str, peer_id: str) -> None:
    """Development-only rule-based reply so the chat demo is not silent."""
    import asyncio

    listing = conversation.listing
    is_user_seller = str(conversation.seller_id) == str(sender.id)
    peer = conversation.seller if is_user_seller else conversation.buyer
    seller_user = conversation.seller if not is_user_seller else sender

    reply_text = chat_service.generate_rule_based_reply(
        text,
        listing,
        is_user_seller=is_user_seller,
        seller_name=seller_user.name if seller_user else "Seller",
        other_name=peer.name if peer else "Student",
    )

    await asyncio.sleep(1.0)
    await manager.send_to_user(
        peer_id,
        TYPING,
        {
            "conversationId": str(conversation.id),
            "userId": str(peer.id),
            "userName": peer.name,
            "isTyping": True,
        },
    )
    await asyncio.sleep(1.2)
    await manager.send_to_user(
        peer_id,
        TYPING,
        {
            "conversationId": str(conversation.id),
            "userId": str(peer.id),
            "userName": peer.name,
            "isTyping": False,
        },
    )

    from app.models.chat import Message
    from datetime import datetime, timezone

    message = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        sender_id=peer.id,
        text=reply_text,
        status="sent",
    )
    db.add(message)
    conversation.last_message_at = datetime.now(timezone.utc)
    await db.commit()

    payload_dict = message_to_schema(message, str(peer_id)).model_dump(by_alias=True)
    await manager.send_to_user(peer_id, MESSAGE, payload_dict)
    await manager.send_to_users(
        [str(peer_id), str(sender.id)],
        CONVERSATIONS_UPDATED,
        {"conversationId": str(conversation.id)},
    )


@router.post("/{conversation_id}/read")
async def mark_read(conversation_id: str, current_user: CurrentUser, db: DbSession):
    await _load_conversation(db, conversation_id, current_user)
    count = await chat_service.mark_conversation_read(db, current_user, conversation_id)
    await db.commit()
    return {"success": True, "updated": count}
