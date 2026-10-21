from app.schemas.base import CamelModel


class ChatMessage(CamelModel):
    id: str
    conversation_id: str
    sender_id: str
    text: str
    timestamp: str
    is_mine: bool = False
    status: str | None = None
    is_system_card: bool = False
    system_card_type: str | None = None
    trade_id: str | None = None
    trade_title: str | None = None
    trade_amount: float | None = None
    trade_pickup_spot: str | None = None
    is_trade_action: bool = False
    trade_details: dict | None = None


class ConversationOtherUser(CamelModel):
    id: str
    name: str
    avatar: str
    college: str
    is_verified: bool


class Conversation(CamelModel):
    id: str
    listing_id: str
    listing_title: str
    listing_price: float
    listing_image: str
    listing_status: str
    other_user: ConversationOtherUser
    last_message: str
    last_message_time: str
    unread_count: int


class ConversationCreate(CamelModel):
    listing_id: str


class MessageCreate(CamelModel):
    text: str
