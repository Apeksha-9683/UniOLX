"""ORM -> API schema mapping. Keeps the wire format identical to `src/types/index.ts`."""

from datetime import datetime, timezone

from app.models.chat import Conversation as ConversationModel
from app.models.chat import Message as MessageModel
from app.models.college import College as CollegeModel
from app.models.listing import Listing as ListingModel
from app.models.notification import Notification as NotificationModel
from app.models.trade import Trade as TradeModel
from app.models.user import User as UserModel
from app.schemas.chat import ChatMessage, Conversation, ConversationOtherUser
from app.schemas.college import College
from app.schemas.listing import Listing
from app.schemas.notification import NotificationItem
from app.schemas.trade import Trade
from app.schemas.user import SellerInfo, User
from app.services.places import PlaceIndex


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def joined_date(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.strftime("%B %Y")


def college_to_schema(
    college: CollegeModel, places: "PlaceIndex | None" = None
) -> College:
    """The frontend shape, unchanged.

    `name`, `city` and `state` are derived from the place tree and
    `campusSpots` comes from the pickup spots table.
    """
    location = college.location
    city = ""
    state = ""
    if places is not None and location is not None:
        city_location = places.city_of(location)
        state_location = places.state_of(location)
        city = city_location.name if city_location is not None else ""
        state = state_location.name if state_location is not None else ""

    return College(
        id=college.id,
        name=location.name if location is not None else college.id,
        short_name=college.short_name,
        city=city,
        state=state,
        domain=college.domain,
        status=college.status,
        campus_spots=[spot.name for spot in college.pickup_spots or []],
        popular_branches=list(college.popular_branches or []),
        is_verified=college.is_verified,
    )


def seller_info(user: UserModel) -> SellerInfo:
    college = user.college
    return SellerInfo(
        id=str(user.id),
        name=user.name,
        college_id=user.college_id,
        college_name=college.short_name if college else user.college_id,
        branch=f"{user.branch} {user.semester}th Sem",
        avatar=user.avatar,
        is_verified=user.is_verified,
        rating=float(user.rating),
        total_reviews=user.total_reviews,
        hostel_or_area=(user.hostel or "Hostel Campus"),
    )


def user_to_schema(user: UserModel) -> User:
    college = user.college
    college_name = ""
    college_short_name = user.college_id
    if college is not None:
        college_short_name = college.short_name
        college_name = college.location.name if college.location is not None else college.id
    return User(
        id=str(user.id),
        name=user.name,
        email=user.email,
        college_id=user.college_id,
        college_name=college_name,
        college_short_name=college_short_name,
        branch=user.branch,
        year=user.year,
        semester=user.semester,
        hostel=user.hostel,
        avatar=user.avatar,
        is_verified=user.is_verified,
        rating=float(user.rating),
        total_reviews=user.total_reviews,
        completed_trades=user.completed_trades,
        joined_date=joined_date(user.created_at),
    )


def listing_to_schema(listing: ListingModel, wishlisted: bool = False) -> Listing:
    college = listing.college
    college_name = ""
    if college is not None:
        college_name = (
            college.location.name if college.location is not None else college.id
        )
    return Listing(
        id=str(listing.id),
        title=listing.title,
        description=listing.description or "",
        price=float(listing.price),
        original_price=float(listing.original_price),
        category=listing.category,
        condition=listing.condition,
        status=listing.status,
        college_id=listing.college_id,
        college_name=college_name or listing.college_id,
        campus_pickup_spot=listing.campus_pickup_spot or "",
        seller=seller_info(listing.seller),
        images=[image.url for image in listing.images],
        specs=dict(listing.specs or {}),
        tags=list(listing.tags or []),
        posted_at=iso(listing.posted_at),
        is_wishlisted=wishlisted,
        views_count=listing.views_count,
        quantity=listing.quantity,
    )


def trade_to_schema(trade: TradeModel, viewer_id: str, pin_plaintext: str | None = None) -> Trade:
    is_buyer = str(trade.buyer_id) == viewer_id
    listing = trade.listing
    return Trade(
        id=str(trade.id),
        listing_id=str(trade.listing_id),
        listing_title=listing.title if listing else "",
        listing_image=(listing.images[0].url if listing and listing.images else ""),
        price=float(trade.price),
        quantity=trade.quantity,
        buyer_id=str(trade.buyer_id),
        buyer_name=trade.buyer.name if trade.buyer else "",
        buyer_college=(trade.buyer.college.short_name if trade.buyer and trade.buyer.college else ""),
        seller_id=str(trade.seller_id),
        seller_name=trade.seller.name if trade.seller else "",
        seller_college=(trade.seller.college.short_name if trade.seller and trade.seller.college else ""),
        pickup_spot=trade.pickup_spot or "",
        scheduled_time=trade.scheduled_time or "",
        status=trade.status,
        # The seller never receives the PIN, not even a masked copy.
        confirmation_pin=(pin_plaintext or "") if is_buyer else "",
        attempts_left=trade.attempts_left,
        is_locked=trade.is_locked,
        expires_at=int(trade.expires_at.timestamp() * 1000) if trade.expires_at else None,
        created_at=iso(trade.created_at) or "",
        completed_at=iso(trade.completed_at),
        cancelled_at=iso(trade.cancelled_at),
    )


def message_to_schema(message: MessageModel, viewer_id: str) -> ChatMessage:
    return ChatMessage(
        id=str(message.id),
        conversation_id=str(message.conversation_id),
        sender_id=str(message.sender_id),
        text=message.text or "",
        timestamp=iso(message.created_at) or "",
        is_mine=str(message.sender_id) == viewer_id,
        status=message.status,
        is_system_card=message.is_system_card,
        system_card_type=message.system_card_type,
        trade_id=str(message.trade_id) if message.trade_id else None,
    )


def conversation_to_schema(
    conversation: ConversationModel,
    viewer_id: str,
    last_message: str = "",
    last_message_at: datetime | None = None,
    unread_count: int = 0,
) -> Conversation:
    listing = conversation.listing
    is_buyer = str(conversation.buyer_id) == viewer_id
    other = conversation.seller if is_buyer else conversation.buyer
    other_college = other.college.short_name if other and other.college else ""
    other_branch = f"{other.branch}" if other else ""

    if is_buyer:
        college_label = f"{other_college} ({other_branch})" if other_branch else other_college
    else:
        college_label = f"{other_college} (Student Buyer)"

    return Conversation(
        id=str(conversation.id),
        listing_id=str(conversation.listing_id),
        listing_title=listing.title if listing else "",
        listing_price=float(listing.price) if listing else 0,
        listing_image=(listing.images[0].url if listing and listing.images else ""),
        listing_status=listing.status if listing else "Available",
        other_user=ConversationOtherUser(
            id=str(other.id) if other else "",
            name=other.name if other else "",
            avatar=other.avatar if other else "",
            college=college_label,
            is_verified=other.is_verified if other else False,
        ),
        last_message=last_message,
        last_message_time=iso(last_message_at) or "",
        unread_count=unread_count,
    )


def notification_to_schema(notification: NotificationModel) -> NotificationItem:
    return NotificationItem(
        id=str(notification.id),
        title=notification.title,
        message=notification.message or "",
        type=notification.type,
        read=notification.read,
        timestamp=iso(notification.created_at) or "",
        link=notification.link,
    )
