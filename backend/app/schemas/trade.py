from app.schemas.base import CamelModel


class Trade(CamelModel):
    id: str
    listing_id: str
    listing_title: str
    listing_image: str
    price: float
    quantity: int
    buyer_id: str
    buyer_name: str
    buyer_college: str
    seller_id: str
    seller_name: str
    seller_college: str
    pickup_spot: str
    scheduled_time: str
    status: str
    # Only the buyer ever receives the real PIN. The seller gets an empty string.
    confirmation_pin: str = ""
    attempts_left: int
    is_locked: bool
    expires_at: int | None = None
    created_at: str
    completed_at: str | None = None
    cancelled_at: str | None = None


class TradeCreate(CamelModel):
    listing_id: str
    pickup_spot: str = ""
    scheduled_time: str = ""
    quantity: int = 1


class PinConfirmRequest(CamelModel):
    pin: str


class PinConfirmResponse(CamelModel):
    success: bool
    message: str
    attempts_left: int | None = None
    locked: bool | None = None
    expired: bool | None = None
    unavailable: bool | None = None


class RegeneratePinResponse(CamelModel):
    success: bool
    new_pin: str
    message: str


class CancelTradeRequest(CamelModel):
    reason: str | None = None


class TradeActionResponse(CamelModel):
    success: bool
    message: str
