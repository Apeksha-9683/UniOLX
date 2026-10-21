import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.chat import Conversation
from app.models.user import User
from app.services import chat as chat_service
from app.ws.chat import MESSAGE_STATUS, TYPING, manager

logger = logging.getLogger("uniolx.ws")

router = APIRouter()


@router.websocket("/ws")
async def chat_socket(websocket: WebSocket, token: str = Query(default="")):
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4401)
        return

    async with SessionLocal() as db:
        user = await db.get(User, payload.get("sub"))
        if user is None:
            await websocket.close(code=4401)
            return
        user_id = str(user.id)

    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await _handle_event(websocket, user_id, data)
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception as exc:  # pragma: no cover
        logger.error("[ws] socket error: %s", exc)
        manager.disconnect(user_id, websocket)


async def _handle_event(websocket: WebSocket, user_id: str, data: dict) -> None:
    event = (data or {}).get("type")

    if event == "typing":
        conversation_id = (data or {}).get("conversationId")
        peer_id = await _peer_id(conversation_id, user_id)
        if peer_id:
            await manager.send_to_user(
                peer_id,
                TYPING,
                {
                    "conversationId": conversation_id,
                    "userId": user_id,
                    "userName": await _user_name(user_id),
                    "isTyping": True,
                },
            )
        return

    if event == "read":
        conversation_id = (data or {}).get("conversationId")
        peer_id = await _peer_id(conversation_id, user_id)
        updated: list[str] = []
        async with SessionLocal() as db:
            user = await db.get(User, user_id)
            if user is not None:
                updated = await chat_service.mark_conversation_read(db, user, conversation_id)
                await db.commit()
        if peer_id:
            for message_id in updated:
                await manager.send_to_user(
                    peer_id,
                    MESSAGE_STATUS,
                    {
                        "messageId": message_id,
                        "conversationId": conversation_id,
                        "status": "read",
                    },
                )
        return

    if event == "ping":
        await websocket.send_json({"event": "pong", "data": {}})
        return


async def _user_name(user_id: str) -> str:
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        return user.name if user else ""


async def _peer_id(conversation_id: str | None, user_id: str) -> str | None:
    if not conversation_id:
        return None
    async with SessionLocal() as db:
        result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
        conversation = result.scalar_one_or_none()
        if conversation is None:
            return None
        if str(conversation.buyer_id) == user_id:
            return str(conversation.seller_id)
        return str(conversation.buyer_id)
