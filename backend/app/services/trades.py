"""Server-side PIN trade system.

Rules enforced here (never in the browser):
  * the PIN is generated server-side and never leaves the buyer's device
  * it is stored hashed (argon2id) for verification and encrypted (AES-GCM)
    so only the buyer can read their own PIN back
  * only the seller of that trade can submit a guess
  * 5 attempts, then the trade is locked
  * the PIN expires, and is single use
  * row locking on the listing stops two buyers claiming the same item
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    decrypt_pin,
    encrypt_pin,
    generate_pin,
    hash_pin,
    pin_expiry,
    verify_pin_hash,
)
from app.models.listing import Listing
from app.models.trade import Trade
from app.models.user import User
from app.services.notifications import create_notification

ACTIVE_TRADE_STATUSES = ("Pending",)


def buyer_pin(trade: Trade) -> str:
    """Decrypted PIN, only ever returned to the buyer."""
    return decrypt_pin(trade.pin_enc or "") or ""


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _reserved_quantity(db: AsyncSession, listing_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(Trade.quantity), 0)).where(
            Trade.listing_id == listing_id,
            Trade.status.in_(ACTIVE_TRADE_STATUSES),
        )
    )
    return int(result.scalar_one() or 0)


async def create_trade(
    db: AsyncSession,
    buyer: User,
    listing_id: str,
    pickup_spot: str = "",
    scheduled_time: str = "",
    quantity: int = 1,
) -> tuple[Trade | None, str]:
    """Returns (trade, error_message)."""
    try:
        listing_uuid = uuid.UUID(str(listing_id))
    except (ValueError, AttributeError):
        return None, "Listing not found"

    # Lock the listing row so two buyers cannot both pass the availability check.
    # `of=Listing` keeps the lock on the listings table only, which is required
    # because the ORM eager-joins sellers and colleges in the same statement.
    result = await db.execute(
        select(Listing).where(Listing.id == listing_uuid).with_for_update(of=Listing)
    )
    listing = result.scalar_one_or_none()
    if listing is None:
        return None, "Listing not found"

    if listing.seller_id == buyer.id:
        return None, "You cannot trade with your own listing."

    if listing.college_id != buyer.college_id:
        return None, "This listing belongs to another campus."

    if listing.status in ("Sold", "Archived", "Cancelled"):
        return None, "Item is no longer available."

    quantity = max(1, int(quantity or 1))
    reserved = await _reserved_quantity(db, listing.id)
    available = (listing.quantity or 1) - reserved
    if available < quantity:
        return None, "Item is no longer available."

    pin = generate_pin()
    trade = Trade(
        id=uuid.uuid4(),
        listing_id=listing.id,
        buyer_id=buyer.id,
        seller_id=listing.seller_id,
        price=listing.price * quantity,
        quantity=quantity,
        pickup_spot=pickup_spot or listing.campus_pickup_spot,
        scheduled_time=scheduled_time,
        status="Pending",
        pin_hash=hash_pin(pin),
        pin_enc=encrypt_pin(pin),
        attempts_left=settings.pin_max_attempts,
        is_locked=False,
        expires_at=pin_expiry(),
    )
    db.add(trade)
    await db.flush()

    if available - quantity <= 0:
        listing.status = "Reserved"

    await create_notification(
        db,
        listing.seller_id,
        title=f"Trade Started: {listing.title[:30]}",
        message=(
            f"{buyer.name} wants to trade for {listing.title}. "
            f"Scheduled pickup at {trade.pickup_spot}. "
            "Keep the PIN confidential until the in-person inspection."
        ),
        type="trade",
        link=f"/trades/{trade.id}",
    )
    await create_notification(
        db,
        buyer.id,
        title=f"Trade Started: {listing.title[:30]}",
        message=(
            f"Scheduled pickup at {trade.pickup_spot}. "
            "Keep your PIN confidential until the in-person inspection."
        ),
        type="trade",
        link=f"/trades/{trade.id}",
    )

    return trade, ""


async def confirm_trade_pin(
    db: AsyncSession, trade: Trade, actor: User, entered_pin: str
) -> dict:
    if str(trade.seller_id) != str(actor.id):
        return {
            "success": False,
            "message": "Only the seller can confirm the trade PIN.",
        }

    if trade.status == "Completed":
        return {"success": True, "message": "Trade completed, listing marked as sold!"}

    if trade.status in ("Cancelled",):
        return {"success": False, "message": "This trade was cancelled."}

    if trade.is_locked or trade.attempts_left <= 0:
        trade.is_locked = True
        await db.flush()
        return {
            "success": False,
            "message": (
                "Trade is locked due to too many failed attempts "
                f"({settings.pin_max_attempts}/{settings.pin_max_attempts}). "
                "Please contact campus support or cancel."
            ),
            "locked": True,
            "attempts_left": 0,
        }

    if trade.expires_at and trade.expires_at < _now():
        return {
            "success": False,
            "message": (
                "Trade PIN has expired. "
                "The buyer must regenerate a new PIN from their trade screen."
            ),
            "expired": True,
        }

    listing_result = await db.execute(
        select(Listing).where(Listing.id == trade.listing_id).with_for_update(of=Listing)
    )
    listing = listing_result.scalar_one_or_none()
    if listing is None or listing.status in ("Archived", "Cancelled"):
        return {"success": False, "message": "Item is no longer available.", "unavailable": True}

    if not verify_pin_hash(trade.pin_hash or "", (entered_pin or "").strip()):
        trade.attempts_left = max(0, trade.attempts_left - 1)
        if trade.attempts_left == 0:
            trade.is_locked = True
            await db.flush()
            return {
                "success": False,
                "message": (
                    f"Incorrect PIN! 0 attempts left. "
                    "Trade has been locked for security."
                ),
                "attempts_left": 0,
                "locked": True,
            }
        await db.flush()
        plural = "" if trade.attempts_left == 1 else "s"
        return {
            "success": False,
            "message": f"Incorrect PIN! {trade.attempts_left} attempt{plural} left.",
            "attempts_left": trade.attempts_left,
        }

    # Valid PIN: complete the trade.
    trade.status = "Completed"
    trade.completed_at = _now()
    # Single use: the PIN can never be replayed.
    trade.pin_hash = None
    trade.pin_enc = None
    trade.is_locked = False
    trade.attempts_left = 0
    # Flush so the pending-trade aggregate below sees the new status.
    await db.flush()

    remaining = max(0, (listing.quantity or 1) - (trade.quantity or 1))
    listing.quantity = remaining
    if remaining <= 0:
        listing.status = "Sold"
    else:
        other_pending = await _reserved_quantity(db, listing.id)
        listing.status = "Reserved" if other_pending > 0 else "Available"

    actor.completed_trades += 1
    buyer = await db.get(User, trade.buyer_id)
    if buyer is not None:
        buyer.completed_trades += 1

    await create_notification(
        db,
        trade.buyer_id,
        title=f"Trade Completed: {listing.title[:30]}",
        message="Your in-person trade was confirmed via PIN. Listing marked as sold!",
        type="trade",
        link=f"/trades/{trade.id}",
    )
    await create_notification(
        db,
        trade.seller_id,
        title=f"Trade Completed: {listing.title[:30]}",
        message="The buyer confirmed the handover. The item is marked as sold.",
        type="trade",
        link=f"/trades/{trade.id}",
    )

    return {"success": True, "message": "Trade completed, listing marked as sold!"}


async def cancel_trade(
    db: AsyncSession, trade: Trade, actor: User, reason: str | None = None
) -> dict:
    if str(actor.id) not in (str(trade.buyer_id), str(trade.seller_id)):
        return {"success": False, "message": "You are not part of this trade."}

    if trade.status == "Completed":
        return {"success": False, "message": "Completed trades cannot be cancelled."}

    trade.status = "Cancelled"
    trade.cancelled_at = _now()
    trade.pin_hash = None
    trade.pin_enc = None
    # Flush so the pending-trade aggregate below sees the new status.
    await db.flush()

    listing = await db.get(Listing, trade.listing_id)
    if listing is not None and listing.status == "Reserved":
        remaining_pending = await _reserved_quantity(db, listing.id)
        listing.status = "Reserved" if remaining_pending > 0 else "Available"

    suffix = f" ({reason})" if reason else ""
    for user_id in (trade.buyer_id, trade.seller_id):
        await create_notification(
            db,
            user_id,
            title=f"Trade Cancelled: {trade.listing.title[:30] if trade.listing else 'Item'}",
            message=f"The campus trade was cancelled{suffix}.",
            type="trade",
            link="/orders",
        )

    return {"success": True, "message": "Campus trade has been cancelled."}


async def regenerate_trade_pin(db: AsyncSession, trade: Trade, actor: User) -> dict:
    if str(actor.id) != str(trade.buyer_id):
        return {"success": False, "message": "Only the buyer can regenerate the PIN."}

    if trade.status in ("Completed", "Cancelled"):
        return {"success": False, "message": "This trade can no longer be used."}

    pin = generate_pin()
    trade.pin_hash = hash_pin(pin)
    trade.pin_enc = encrypt_pin(pin)
    trade.attempts_left = settings.pin_max_attempts
    trade.is_locked = False
    trade.expires_at = pin_expiry()
    await db.flush()

    return {
        "success": True,
        "new_pin": pin,
        "message": f"New 6-digit PIN generated! Valid for {settings.pin_ttl_minutes} minutes.",
    }
