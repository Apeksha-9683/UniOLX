import asyncio
import logging
import uuid

from app.db.session import SessionLocal
from app.services import gemini

logger = logging.getLogger("uniolx.embeddings")

_background_tasks: set[asyncio.Task] = set()


async def _write_embedding(listing_id: uuid.UUID, text: str) -> None:
    vector = await gemini.embed_text(text)
    if vector is None:
        return

    from sqlalchemy import select

    from app.models.listing import Listing

    async with SessionLocal() as db:
        listing = await db.execute(
            select(Listing).where(Listing.id == listing_id)
        )
        row = listing.scalar_one_or_none()
        if row is None:
            return
        row.embedding = vector
        await db.commit()


def schedule_embedding(listing_id: uuid.UUID | str, text: str) -> None:
    """Fire-and-forget embedding write. Silently does nothing without a key."""
    if not gemini.is_available():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    task = loop.create_task(_write_embedding(uuid.UUID(str(listing_id)), text))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
