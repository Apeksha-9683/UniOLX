"""Conversation + message handling, including the demo auto-reply.

The auto-reply is a port of `src/api/chatEngine.ts` so the chat demo still
feels alive in development. It never asks for or reveals a trade PIN.
"""

import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import Conversation, Message
from app.models.listing import Listing
from app.models.user import User
from app.schemas.mappers import conversation_to_schema, message_to_schema
from app.ws.chat import CONVERSATIONS_UPDATED, MESSAGE, MESSAGE_STATUS, TYPING, manager


async def _load_listing(db: AsyncSession, listing_id: str) -> Listing | None:
    try:
        listing_uuid = uuid.UUID(str(listing_id))
    except (ValueError, AttributeError, TypeError):
        return None
    return await db.get(Listing, listing_uuid)


async def create_or_get_conversation(
    db: AsyncSession, user: User, listing_id: str
) -> tuple[Conversation | None, str]:
    listing = await _load_listing(db, listing_id)
    if listing is None:
        return None, "Listing not found"

    # Campus scoping: a student can only open a conversation about a listing
    # from their own college.
    if listing.college_id != user.college_id:
        return None, "This listing belongs to another campus."

    is_seller = str(listing.seller_id) == str(user.id)
    if is_seller:
        buyer = await _pick_peer_buyer(db, listing)
        seller_id = listing.seller_id
    else:
        buyer = user
        seller_id = listing.seller_id

    result = await db.execute(
        select(Conversation).where(
            Conversation.listing_id == listing.id,
            Conversation.buyer_id == buyer.id,
            Conversation.seller_id == seller_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing, ""

    conversation = Conversation(
        id=uuid.uuid4(),
        listing_id=listing.id,
        buyer_id=buyer.id,
        seller_id=seller_id,
    )
    db.add(conversation)
    await db.flush()
    return conversation, ""


async def _pick_peer_buyer(db: AsyncSession, listing: Listing) -> User:
    """For the seller's own listing, pick a real student to talk to."""
    result = await db.execute(
        select(User)
        .where(User.college_id == listing.college_id, User.id != listing.seller_id)
        .order_by(User.created_at)
        .limit(1)
    )
    peer = result.scalar_one_or_none()
    if peer is not None:
        return peer

    peer = User(
        id=uuid.uuid4(),
        email=f"campus-buddy-{listing.id}@uniolx.local",
        password_hash="!",
        name="Campus Buddy",
        college_id=listing.college_id,
        branch="Student Buyer",
        year=1,
        semester=1,
        avatar="https://api.dicebear.com/7.x/bottts/svg?seed=Arjun&backgroundColor=ffc72c",
        is_verified=True,
    )
    db.add(peer)
    await db.flush()
    return peer


async def list_conversations(db: AsyncSession, user: User) -> list[dict]:
    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.listing).selectinload(Listing.images),
            selectinload(Conversation.buyer).selectinload(User.college),
            selectinload(Conversation.seller).selectinload(User.college),
        )
        .where(
            (Conversation.buyer_id == user.id) | (Conversation.seller_id == user.id)
        )
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
    )
    conversations = list(result.unique().scalars().all())

    output: list[dict] = []
    for conversation in conversations:
        last = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_message = last.scalar_one_or_none()

        unread = await db.execute(
            select(func.count(Message.id)).where(
                Message.conversation_id == conversation.id,
                Message.sender_id != user.id,
                Message.status != "read",
            )
        )

        schema = conversation_to_schema(
            conversation,
            str(user.id),
            last_message=(last_message.text if last_message else ""),
            last_message_at=(last_message.created_at if last_message else None),
            unread_count=int(unread.scalar_one() or 0),
        )
        output.append(schema.model_dump(by_alias=True))
    return output


async def get_messages(db: AsyncSession, user: User, conversation_id: str) -> list[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [message_to_schema(message, str(user.id)).model_dump(by_alias=True) for message in messages]


async def mark_conversation_read(db: AsyncSession, user: User, conversation_id: str) -> list[str]:
    result = await db.execute(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.sender_id != user.id,
            Message.status != "read",
        )
    )
    messages = result.scalars().all()
    now = datetime.now(timezone.utc)
    updated: list[str] = []
    for message in messages:
        message.status = "read"
        updated.append(str(message.id))
    if messages:
        await db.flush()
    return updated


async def send_message(
    db: AsyncSession, user: User, conversation_id: str, text: str
) -> tuple[Message, Conversation]:
    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.listing).selectinload(Listing.images),
            selectinload(Conversation.buyer).selectinload(User.college),
            selectinload(Conversation.seller).selectinload(User.college),
        )
        .where(Conversation.id == conversation_id)
    )
    conversation = result.unique().scalar_one_or_none()
    if conversation is None:
        raise ValueError("Conversation not found")
    if str(user.id) not in (str(conversation.buyer_id), str(conversation.seller_id)):
        raise PermissionError("You are not part of this conversation")

    message = Message(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        sender_id=user.id,
        text=text,
        status="sent",
    )
    db.add(message)
    conversation.last_message_at = datetime.now(timezone.utc)
    await db.flush()
    return message, conversation


# ---------------------------------------------------------------------------
# Demo auto-reply (port of src/api/chatEngine.ts)
# ---------------------------------------------------------------------------
def _extract_offer_amount(text: str) -> int | None:
    import re

    clean = (text or "").lower().replace(",", "")
    match = re.search(r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*k\b", clean)
    if match:
        value = float(match.group(1))
        if value > 0:
            return int(round(value * 1000))

    match = re.search(r"(?:₹|rs\.?|inr)\s*(\d{2,7})", clean)
    if match:
        value = int(match.group(1))
        if value > 0:
            return value

    for raw in re.findall(r"\b\d{2,7}\b", clean):
        value = int(raw)
        if value == 2026:
            continue
        if "pin" in clean and 1000 <= value <= 9999 and "₹" not in clean:
            continue
        if value > 0:
            return value
    return None


def _pickup_spot(listing: Listing | None) -> str:
    if listing is None:
        return "the campus library"
    if listing.campus_pickup_spot:
        return listing.campus_pickup_spot
    if listing.seller and listing.seller.hostel:
        return f"{listing.seller.hostel} gate"
    return "the campus library"


def generate_rule_based_reply(
    user_text: str,
    listing: Listing | None,
    is_user_seller: bool,
    seller_name: str,
    other_name: str,
    last_reply: str = "",
) -> str:
    lower = (user_text or "").strip().lower()
    title = listing.title if listing else "item"
    price = float(listing.price) if listing else 1000.0
    status = listing.status if listing else "Available"
    condition = listing.condition if listing else "Good"
    spot = _pickup_spot(listing)
    first = seller_name.split(" ")[0] if seller_name else "Seller"

    replies: list[str] = []

    if any(
        word in lower
        for word in ("pin", "payment", "pay", "cash", "upi", "handover", "confirm trade")
    ):
        if is_user_seller:
            replies = [
                "Understood! When we meet, I'll inspect the item first and enter the PIN in Campus Mart to confirm the handover. I won't share the PIN in chat.",
                "Sounds good! We can complete the payment in person after I verify the item and enter the PIN.",
            ]
        else:
            replies = [
                f"For safety, we do the handover in person! You inspect the {title[:24]} first, then tap Confirm Trading in Campus Mart. Enter the PIN only after receiving the item - never share your PIN in chat!",
                "Payment and trade confirmation happen in person. Please inspect the item thoroughly before releasing the PIN. Never share your PIN here in chat!",
            ]

    elif any(
        word in lower
        for word in (
            "available", "still there", "still have", "sold yet", "in stock", "anyone taken", "is it there",
        )
    ):
        if is_user_seller:
            replies = [
                f"Great! I'm definitely interested in purchasing your {title[:24]}. When and where on campus can we meet?",
                "Glad it's still available! Could we meet today after classes for the handover?",
            ]
        elif status == "Available":
            replies = [
                "Yes, it is still available! Are you free to meet on campus today?",
                f"Hi! Yes, the {title[:25]} is available. Would you like to inspect it on campus today?",
                f"Yes, still available! Let me know if you want to test it out around {spot}.",
            ]
        elif status == "Reserved":
            replies = [
                "It is currently reserved for another student meetup, but if that trade doesn't go through, you'll be next in line!",
                "Someone has reserved it for this evening. If they don't confirm the trade, I'll message you right away.",
            ]
        else:
            replies = [
                "Sorry, this item was already sold and handed over. Feel free to browse other campus listings!",
                "Ah, this has already been sold. Thanks for checking though!",
            ]

    elif (
        any(
            word in lower
            for word in (
                "price", "discount", "negotiable", "offer", "do for", "can you do", "less", "cost", "final", "₹", "rs",
            )
        )
        or _extract_offer_amount(user_text) is not None
    ):
        offer = _extract_offer_amount(user_text)
        if is_user_seller:
            if offer is not None and offer < price:
                replies = [
                    f"Would ₹{offer:,} work for an immediate pickup today near your hostel?",
                    f"I can do ₹{offer:,} and come directly to your pickup spot right after my class!",
                ]
            else:
                replies = [
                    "Could you do a small student discount if I pick it up today?",
                    f"The price of ₹{price:,.0f} works for me if the condition is as described!",
                ]
        else:
            if offer is not None:
                ratio = offer / price if price else 0
                if ratio >= 0.9:
                    if offer >= price:
                        replies = [
                            f"Deal! ₹{offer:,} works for me. Where on campus should we meet?",
                            f"Done! ₹{offer:,} is agreed. Let's meet at {spot}!",
                        ]
                    else:
                        replies = [
                            f"₹{offer:,} sounds fair for a fellow campus student! Deal. When can we meet?",
                            f"I can do ₹{offer:,} if we can complete the handover today at {spot}. Does that work?",
                            f"Accepted! ₹{offer:,} is fine. Let me know what time works best for you.",
                        ]
                else:
                    counter = int(round((price * 0.94) / 10) * 10)
                    replies = [
                        f"₹{offer:,} is a bit too low since this is in {condition} condition. The lowest I can do is ₹{counter:,}. Would that work?",
                        f"Sorry, I can't let it go for ₹{offer:,}. I can bring it down to ₹{counter:,} if you can pick it up today!",
                        f"That's too low for me, but I can offer ₹{counter:,} as my best student price.",
                    ]
            else:
                discount = max(10, min(200, int(round(price * 0.05))))
                replies = [
                    f"The listed price is ₹{price:,.0f}, but I can do ₹{price - discount:,.0f} if you pick it up today on campus.",
                    f"Price is ₹{price:,.0f}. I can give a small ₹{discount} discount if you can meet near {spot} today!",
                ]

    elif any(
        word in lower
        for word in (
            "meet", "where", "location", "pickup", "hostel", "gate", "library", "canteen", "time", "today", "tomorrow", "evening", "afternoon",
        )
    ):
        if is_user_seller:
            replies = [
                f"Does around 5:00 PM near {spot} work for you? I can be there right after my lab.",
                f"I can come to {spot} around 4:30 PM today. Let me know if that time suits you!",
            ]
        else:
            replies = [
                f"We can meet near {spot}! What time works best for you between classes?",
                f"I'm free today after 4:30 PM near {spot}. Let me know if that time works!",
                f"How about meeting at {spot} around 5 PM? You can inspect the item there.",
            ]

    elif any(
        word in lower
        for word in (
            "condition", "working", "scratch", "dent", "damage", "specs", "ram", "storage", "battery", "bill", "box", "warranty", "charger", "original", "how old",
        )
    ):
        if is_user_seller:
            replies = [
                "Could you confirm if all the accessories and original cords are included?",
                "Are there any scratches or issues I should know about before we meet?",
            ]
        else:
            description = (listing.description[:90] if listing else "Used carefully during semester")
            replies = [
                f"It is in {condition} condition! {description}. You can test and inspect it completely when we meet.",
                "Everything is in proper working condition with no issues. You are welcome to test it thoroughly before confirming the trade!",
                f"Condition is {condition}. All original accessories shown in the photos are included.",
            ]

    elif lower.startswith(("hi", "hello", "hey", "namaste")) or any(
        word in lower for word in ("good morning", "good evening", "good afternoon")
    ):
        if is_user_seller:
            replies = [
                f"Hey! I'm interested in your {title[:24]}. Is it still available?",
                f"Hi! Saw your listing on Campus Mart. Could we discuss the pickup details?",
            ]
        else:
            replies = [
                f"Hey there! Thanks for reaching out about the {title[:24]}. How can I help you?",
                f"Hello! Yes, happy to answer any questions about the {title[:24]}. Are you looking to buy today?",
                "Hi! Thanks for messaging. Let me know if you want to inspect it on campus!",
            ]

    else:
        if is_user_seller:
            replies = [
                "Sounds good! Let me know when you'd be free to hand it over on campus.",
                "Got it! Feel free to let me know the best time and spot to meet.",
            ]
        else:
            replies = [
                f"Could you clarify what you mean? Let me know if you'd like to check out the {title[:20]} on campus or have questions about price and condition!",
                f"Got it! Let me know if you want to schedule a meetup at {spot} or need more details.",
                f"Sounds good! Feel free to ask about the price or suggest a campus meeting spot.",
            ]

    pool = [reply for reply in replies if reply != last_reply] or replies
    chosen = random.choice(pool)

    # Belt and braces: never leak a PIN-shaped number into the chat.
    import re

    def _scrub(match: re.Match) -> str:
        digits = match.group(0)
        if digits in user_text or digits == f"{int(price)}":
            return digits
        return "[Protected PIN]"

    return re.sub(r"\b\d{4,6}\b", _scrub, chosen)
