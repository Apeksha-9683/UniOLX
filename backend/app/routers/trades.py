import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.models.listing import Listing
from app.models.user import User
from app.models.trade import Trade
from app.schemas.trade import (
    CancelTradeRequest,
    PinConfirmRequest,
    PinConfirmResponse,
    RegeneratePinResponse,
    TradeCreate,
)
from app.schemas.mappers import trade_to_schema
from app.services import trades as trade_service

router = APIRouter(prefix="/api/trades", tags=["trades"])


async def _load_trade(db, trade_id: str, user) -> Trade:
    try:
        trade_uuid = uuid.UUID(str(trade_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")

    result = await db.execute(
        select(Trade)
        .options(
            selectinload(Trade.listing).selectinload(Listing.images),
            selectinload(Trade.buyer).selectinload(User.college),
            selectinload(Trade.seller).selectinload(User.college),
        )
        .where(Trade.id == trade_uuid)
    )
    trade = result.unique().scalar_one_or_none()
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    if str(user.id) not in (str(trade.buyer_id), str(trade.seller_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


def _to_schema(trade: Trade, viewer_id: str) -> dict:
    pin = trade_service.buyer_pin(trade) if str(trade.buyer_id) == viewer_id else None
    return trade_to_schema(trade, viewer_id, pin).model_dump(by_alias=True)


@router.get("")
async def list_trades(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Trade)
        .options(
            selectinload(Trade.listing).selectinload(Listing.images),
            selectinload(Trade.buyer).selectinload(User.college),
            selectinload(Trade.seller).selectinload(User.college),
        )
        .where(
            or_(Trade.buyer_id == current_user.id, Trade.seller_id == current_user.id)
        )
        .order_by(Trade.created_at.desc())
    )
    trades = list(result.unique().scalars().all())
    return [_to_schema(trade, str(current_user.id)) for trade in trades]


@router.get("/{trade_id}")
async def get_trade(trade_id: str, current_user: CurrentUser, db: DbSession):
    trade = await _load_trade(db, trade_id, current_user)
    return _to_schema(trade, str(current_user.id))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_trade(payload: TradeCreate, current_user: CurrentUser, db: DbSession):
    trade, error = await trade_service.create_trade(
        db,
        buyer=current_user,
        listing_id=payload.listing_id,
        pickup_spot=payload.pickup_spot,
        scheduled_time=payload.scheduled_time,
        quantity=payload.quantity,
    )
    if trade is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    await db.commit()
    trade = await _load_trade(db, str(trade.id), current_user)
    return _to_schema(trade, str(current_user.id))


@router.post("/{trade_id}/confirm-pin", response_model=PinConfirmResponse)
async def confirm_pin(
    trade_id: str, payload: PinConfirmRequest, current_user: CurrentUser, db: DbSession
):
    trade = await _load_trade(db, trade_id, current_user)
    result = await trade_service.confirm_trade_pin(db, trade, current_user, payload.pin)
    await db.commit()
    return PinConfirmResponse(**result)


@router.post("/{trade_id}/regenerate-pin", response_model=RegeneratePinResponse)
async def regenerate_pin(
    trade_id: str, current_user: CurrentUser, db: DbSession
):
    trade = await _load_trade(db, trade_id, current_user)
    result = await trade_service.regenerate_trade_pin(db, trade, current_user)
    await db.commit()
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("message", "Failed")
        )
    return RegeneratePinResponse(**result)


@router.post("/{trade_id}/cancel")
async def cancel_trade(
    trade_id: str, payload: CancelTradeRequest, current_user: CurrentUser, db: DbSession
):
    trade = await _load_trade(db, trade_id, current_user)
    result = await trade_service.cancel_trade(db, trade, current_user, payload.reason)
    await db.commit()
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("message", "Failed")
        )
    return result
