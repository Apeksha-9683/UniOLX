import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("uniolx.ws")

MESSAGE = "message"
MESSAGE_STATUS = "message:status"
TYPING = "typing"
CONVERSATIONS_UPDATED = "conversations_updated"


class ConnectionManager:
    """Tracks live sockets per user so the API can push events."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        self._connections.get(user_id, set()).discard(websocket)
        if not self._connections.get(user_id):
            self._connections.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))

    async def send_to_user(self, user_id: str, event: str, data: object) -> None:
        await self._send_many([user_id], event, data)

    async def send_to_users(self, user_ids: list[str], event: str, data: object) -> None:
        await self._send_many(user_ids, event, data)

    async def _send_many(self, user_ids: list[str], event: str, data: object) -> None:
        payload = json.dumps({"event": event, "data": data}, default=str)
        for user_id in user_ids:
            for websocket in list(self._connections.get(user_id, set())):
                try:
                    await websocket.send_text(payload)
                except Exception:  # socket died mid-send
                    self.disconnect(user_id, websocket)


manager = ConnectionManager()
