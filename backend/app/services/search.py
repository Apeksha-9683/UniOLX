"""Campus Buddy search: LLM parsing + SQL filtering + pgvector ranking."""

import logging

from sqlalchemy import Float, cast, func, literal, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.listing import Listing
from app.models.user import User
from app.schemas.listing import Listing as ListingSchema
from app.schemas.mappers import listing_to_schema
from app.schemas.search import (
    AIRankedListing,
    AISearchResult,
    CampusBuddyResponse,
    ParsedCriterion,
)
from app.services import gemini
from app.services.ai_parser import Criterion, parse_query

logger = logging.getLogger("uniolx.search")

GREETING_SUGGESTIONS = [
    "Laptop under ₹25,000 for coding",
    "Engineering Mechanics textbook",
    "Hero cycle under ₹4,000",
    "Casio scientific calculator",
    "Single bed mattress for hostel",
]


def _to_schema(criteria: list[Criterion]) -> list[ParsedCriterion]:
    return [
        ParsedCriterion(
            id=c.id,
            label=c.label,
            key=c.key,
            value=c.value,
            display_value=c.display_value,
        )
        for c in criteria
    ]


def _criterion_value(criteria: list[Criterion], key: str) -> str | None:
    for criterion in criteria:
        if criterion.key == key:
            return criterion.value
    return None


async def _load_candidates(
    db: AsyncSession,
    college_ids: list[str],
    query_vector: list[float] | None,
    query_text: str,
) -> list[tuple[Listing, float, float]]:
    """Returns (listing, semantic_score, keyword_score) for every candidate."""
    keyword_score = func.coalesce(
        func.ts_rank_cd(
            Listing.__table__.c.search_vector,
            func.plainto_tsquery("english", query_text or ""),
        ),
        literal(0.0),
    )

    stmt = (
        select(Listing, keyword_score.label("keyword_score"))
        .options(
            selectinload(Listing.seller).selectinload(User.college),
            selectinload(Listing.college),
            selectinload(Listing.images),
        )
        .where(
            Listing.college_id.in_(college_ids),
            Listing.status.not_in(("Archived", "Cancelled")),
        )
    )

    if query_vector:
        vector_literal = "[" + ",".join(str(value) for value in query_vector) + "]"
        stmt = stmt.add_columns(
            (1.0 - Listing.embedding.op("<=>")(text("CAST(:vec AS vector)"))).label("cosine_score")
        )
        stmt = stmt.params(vec=vector_literal)
    else:
        stmt = stmt.add_columns(literal(0.0).label("cosine_score"))

    result = await db.execute(stmt.order_by(Listing.posted_at.desc()))
    rows = result.unique().all()

    output: list[tuple[Listing, float, float]] = []
    for row in rows:
        listing = row[0]
        keyword = float(row[1] or 0.0)
        semantic = float(row[2] or 0.0)
        output.append((listing, semantic, keyword))
    return output


def _matches_category(listing: Listing, target: str) -> bool:
    if ":" in target:
        category, sub = target.split(":", 1)
        if sub == "laptop":
            return (
                "laptop" in listing.tags
                or "thinkpad" in listing.title.lower()
                or "macbook" in listing.title.lower()
                or "laptop" in listing.title.lower()
            )
        if sub == "calculator":
            return (
                "calculator" in listing.tags
                or "casio" in listing.title.lower()
                or "calculator" in listing.title.lower()
            )
        if sub == "cycle":
            return (
                listing.category == "Cycles & Commute"
                or "cycle" in listing.tags
                or "bicycle" in listing.tags
            )
        if sub == "book":
            return listing.category == "Textbooks" or "textbook" in listing.tags or "book" in listing.tags
        if sub == "mattress":
            return "mattress" in listing.tags or "mattress" in listing.title.lower()
        if sub == "audio":
            return (
                listing.category == "Audio & Gadgets"
                or "headphones" in listing.tags
                or "speaker" in listing.tags
            )
        return listing.category == category
    return listing.category == target or any(target.lower() in tag.lower() for tag in listing.tags)


def _inr(value: float) -> str:
    return f"₹{value:,.0f}"


def _score(
    listing: Listing,
    criteria: list[Criterion],
    semantic: float,
    keyword: float,
) -> tuple[int, list[str], list[str]]:
    reasons: list[str] = []
    unmatched: list[str] = []
    matched = 0
    total = 0
    hard_mismatch = False

    category = _criterion_value(criteria, "category")
    if category:
        total += 1
        if _matches_category(listing, category):
            matched += 1
            display = next((c.display_value for c in criteria if c.key == "category"), category)
            reasons.append(f"{display} category ✓")
        else:
            hard_mismatch = True
            display = next((c.display_value for c in criteria if c.key == "category"), category)
            unmatched.append(f"Not in {display} (not matched)")

    budget = _criterion_value(criteria, "budget")
    if budget is not None:
        total += 1
        limit = float(budget)
        if float(listing.price) <= limit:
            matched += 1
            reasons.append(f"{_inr(float(listing.price))} is under your budget ✓")
        else:
            unmatched.append(
                f"{_inr(float(listing.price))} exceeds {_inr(limit)} budget (not matched)"
            )
            if float(listing.price) > limit * 1.35:
                hard_mismatch = True
    else:
        reasons.append(f"Priced at {_inr(float(listing.price))} ✓")

    min_price = _criterion_value(criteria, "minPrice")
    if min_price is not None:
        total += 1
        floor = float(min_price)
        if float(listing.price) >= floor:
            matched += 1
            reasons.append(f"{_inr(float(listing.price))} meets min {_inr(floor)} ✓")
        else:
            unmatched.append(f"Below {_inr(floor)} min price (not matched)")

    ram = _criterion_value(criteria, "ram")
    if ram is not None:
        total += 1
        specs = listing.specs or {}
        item_ram = str(specs.get("RAM") or specs.get("Memory") or "").upper()
        if ram.upper() in item_ram or ram.upper() in listing.title.upper():
            matched += 1
            reasons.append(f"{ram.upper()} RAM confirmed ✓")
        else:
            unmatched.append(f"{ram.upper()} requested (has {item_ram or 'unspecified'}) (not matched)")

    storage = _criterion_value(criteria, "storage")
    if storage is not None:
        total += 1
        specs = listing.specs or {}
        item_storage = str(specs.get("Storage") or specs.get("ROM") or "").upper()
        if storage.upper() in item_storage or storage.upper() in listing.title.upper():
            matched += 1
            reasons.append(f"{storage.upper()} storage ✓")
        else:
            unmatched.append(
                f"{storage.upper()} requested (has {item_storage or 'unspecified'}) (not matched)"
            )

    brand = _criterion_value(criteria, "brand")
    if brand is not None:
        total += 1
        specs = listing.specs or {}
        item_brand = str(specs.get("Brand") or specs.get("Author") or "").lower()
        if (
            brand.lower() in listing.title.lower()
            or brand.lower() in item_brand
            or any(brand.lower() in tag.lower() for tag in listing.tags)
        ):
            matched += 1
            reasons.append(f"{brand} brand ✓")
        else:
            unmatched.append(f"Brand {brand} not matched")

    condition = _criterion_value(criteria, "condition")
    if condition is not None:
        total += 1
        if listing.condition == condition or (
            condition == "Good" and listing.condition == "Like New"
        ):
            matched += 1
            reasons.append(f"{listing.condition} condition ✓")
        else:
            unmatched.append(
                f"Condition is {listing.condition} (requested {condition}) (not matched)"
            )

    use = _criterion_value(criteria, "use")
    if use is not None:
        total += 1
        display = next((c.display_value for c in criteria if c.key == "use"), use)
        if any(use.lower() in tag.lower() for tag in listing.tags) or use.lower() in (
            listing.description or ""
        ).lower():
            matched += 1
            reasons.append(f"Tailored for {display} ✓")
        else:
            unmatched.append(f"Not explicitly optimized for {display}")

    query_words = [
        word
        for word in "".join(
            ch if ch.isalnum() or ch.isspace() else " " for ch in (listing.title or "")
        ).split()
        if len(word) > 2
    ]
    keyword_hits = 0
    lower_query = " ".join(query_words).lower()
    if lower_query:
        for word in lower_query.split():
            if word in (listing.title or "").lower() or any(
                word in tag.lower() for tag in listing.tags
            ):
                keyword_hits += 1

    if listing.campus_pickup_spot and len(reasons) < 3:
        reasons.append(f"In-person pickup at {listing.campus_pickup_spot} ✓")

    score = 75
    if total > 0:
        score = round(65 + (matched / total) * 32)
    score = min(score + min(keyword_hits * 2, 4), 98)
    # A small semantic bonus keeps the LLM-driven ordering meaningful.
    score = min(int(score + max(0.0, semantic) * 3), 99)

    return score, reasons[:3], unmatched[:2]


async def ai_search(
    db: AsyncSession,
    user: User,
    query: str,
    criteria_overrides: list[Criterion] | None = None,
    previous_criteria: list[Criterion] | None = None,
) -> AISearchResult:
    raw = (query or "").strip()

    if criteria_overrides:
        criteria = criteria_overrides
        is_vague = False
    else:
        parsed = await parse_query(raw, previous_criteria)
        criteria = parsed.criteria
        is_vague = parsed.is_vague_or_greeting

    if is_vague and not criteria:
        return AISearchResult(
            query=raw,
            is_vague_or_greeting=True,
            summary=(
                "Hey there! What campus gear are you looking for, and do you have a target budget? "
                "(For example: 'Laptop under ₹25k for coding' or 'Hero cycle under ₹4,000')"
            ),
            parsed_criteria=[],
            results=[],
            alternative_suggestions=GREETING_SUGGESTIONS,
            close_matches=[],
        )

    college_ids = [user.college_id]
    query_vector = await gemini.embed_text(raw) if raw else None
    candidates = await _load_candidates(db, college_ids, query_vector, raw or "")

    budget = _criterion_value(criteria, "budget")
    max_budget = float(budget) if budget is not None else None

    ranked: list[AIRankedListing] = []
    close: list[AIRankedListing] = []

    for listing, semantic, keyword in candidates:
        score, reasons, unmatched = _score(listing, criteria, semantic, keyword)
        entry = AIRankedListing(
            listing=listing_to_schema(listing),
            match_score=score,
            match_reasons=reasons,
            unmatched_reasons=unmatched,
        )

        is_available = listing.status == "Available"
        over_budget = max_budget is not None and float(listing.price) > max_budget
        if is_available and not over_budget and not _is_hard_mismatch(listing, criteria):
            ranked.append(entry)
        else:
            close.append(entry)

    ranked.sort(key=lambda item: item.match_score, reverse=True)
    close.sort(key=lambda item: item.match_score, reverse=True)

    if ranked:
        summary = (
            f"Campus Buddy found {len(ranked)} verified available item"
            f"{'s' if len(ranked) > 1 else ''} on campus matching your request!"
        )
    else:
        summary = (
            "No exact campus listings matched every requirement right now. "
            "Here are targeted suggestions to find what you need:"
        )

    alternatives = _suggestions(criteria, max_budget)

    return AISearchResult(
        query=raw,
        summary=summary,
        parsed_criteria=_to_schema(criteria),
        results=ranked,
        alternative_suggestions=alternatives,
        close_matches=close[:3],
    )


def _is_hard_mismatch(listing: Listing, criteria: list[Criterion]) -> bool:
    category = _criterion_value(criteria, "category")
    if category and not _matches_category(listing, category):
        return True

    ram = _criterion_value(criteria, "ram")
    if ram and "laptop" in (category or ""):
        specs = listing.specs or {}
        item_ram = str(specs.get("RAM") or specs.get("Memory") or "").upper()
        if ram.upper() not in item_ram and ram.upper() not in listing.title.upper():
            return True
    return False


def _suggestions(criteria: list[Criterion], max_budget: float | None) -> list[str]:
    alternatives: list[str] = []
    category = _criterion_value(criteria, "category") or ""
    ram = _criterion_value(criteria, "ram") or ""
    condition = _criterion_value(criteria, "condition") or ""

    if max_budget:
        if "laptop" in category and max_budget < 21500:
            alternatives.append("Raise budget to ₹21,500 to match Lenovo ThinkPad T480 (16GB RAM)")
        elif "cycle" in category and max_budget < 2600:
            alternatives.append("Raise budget to ₹2,600 to match Atlas 26T Commuter Bicycle")
        else:
            alternatives.append(f"Raise budget to ₹{round(max_budget * 1.25):,}")
    if ram.upper().startswith("16"):
        alternatives.append("Relax spec to 8 GB RAM models (e.g. Apple MacBook Air M1)")
    if condition == "Like New":
        alternatives.append("Include items in 'Good' condition for more options")
    if not alternatives:
        alternatives.append("Check items from nearby partner campuses in Bangalore")
    return alternatives


# ---------------------------------------------------------------------------
# Classic Campus Buddy (keyword assistant)
# ---------------------------------------------------------------------------
CAMPUS_BUDDY_RULES: list[tuple[tuple[str, ...], str, str, list[str]]] = [
    (
        ("cycle", "bicycle", "commute", "metro"),
        "Cycles & Commute",
        (
            "Found {count} great campus bicycles! Cycles with Shimano gears are top picks for "
            "traveling between your campus, the metro station, and hostels. All sellers offer a "
            "test ride before you confirm the trade!"
        ),
        (
            "Pro-tip: Test ride bicycles near the campus football ground or the hostel quadrangle "
            "during daylight hours."
        ),
        [
            "Cycles under ₹4,000 with gear and lock",
            "Single bed mattresses near the hostel",
            "Engineering Maths B.S. Grewal textbook",
        ],
    ),
    (
        ("calc", "casio", "991"),
        "Electronics",
        (
            "Found {count} scientific calculator for your engineering exams! The Casio fx-991CW is "
            "VTU-compliant and allowed in midterms and finals."
        ),
        (
            "Check that the battery cover and solar strip work properly before confirming the trade "
            "PIN with the seller at the canteen."
        ),
        [
            "Lab coat size L for Chemistry",
            "Mini drafter for CAED graphics",
            "GATE CSE study books",
        ],
    ),
    (
        ("hostel", "room", "mattress", "kettle", "lamp", "maggi"),
        "Hostel Essentials",
        (
            "Here are essential hostel room items available right now! Hostellers are offering clean "
            "mattresses, fast electric kettles, and rechargeable desk lamps."
        ),
        (
            "Most hostel sellers prefer meeting at the hostel gate or mess entrance during evening "
            "hours (5:00 PM - 8:00 PM)."
        ),
        [
            "Electric kettle under ₹600 for Maggi",
            "Study lamp with rechargeable battery",
            "B.S. Grewal Higher Engineering Maths",
        ],
    ),
    (
        ("book", "math", "grewal", "gate", "notes"),
        "Textbooks",
        (
            "Found {count} verified course textbooks and GATE materials from senior students! "
            "Save up to 60-70% compared to new editions."
        ),
        (
            "Pickup near the central library lawns is the most convenient spot for book handovers "
            "between classes."
        ),
        [
            "Engineering Mini Drafter for Graphics",
            "Apple MacBook Air M1 for coding",
            "Sony WH-1000XM4 noise cancelling headphones",
        ],
    ),
    (
        ("laptop", "macbook", "coding", "arduino", "pi", "monitor"),
        "Electronics",
        (
            "Here are electronics and coding gear listed by verified students! Every electronic item "
            "can be inspected on the spot before entering your trade PIN."
        ),
        (
            "You can test electronics at the food court or library foyer where charging outlets are "
            "readily available."
        ),
        [
            "MacBook Air M1 under ₹45,000",
            "Arduino Uno starter kit with sensors",
            "LG 24-inch IPS monitor",
        ],
    ),
]


async def campus_buddy(
    db: AsyncSession, user: User, query: str
) -> CampusBuddyResponse:
    lower = (query or "").strip().lower()
    college_ids = [user.college_id]

    result = await db.execute(
        select(Listing)
        .options(
            selectinload(Listing.seller).selectinload(User.college),
            selectinload(Listing.college),
            selectinload(Listing.images),
        )
        .where(
            Listing.college_id.in_(college_ids),
            Listing.status.not_in(("Archived", "Cancelled")),
        )
    )
    listings = list(result.unique().scalars().all())

    for keywords, category, answer_template, tip, prompts in CAMPUS_BUDDY_RULES:
        if any(word in lower for word in keywords):
            matched = [item for item in listings if item.category == category]
            if not matched:
                matched = listings[:4]
            return CampusBuddyResponse(
                answer=answer_template.format(count=len(matched)),
                matched_listings=[listing_to_schema(item) for item in matched],
                college_spot_tip=tip,
                suggested_prompts=prompts,
            )

    generic = [
        item
        for item in listings
        if lower
        and (
            lower in item.title.lower()
            or lower in (item.description or "").lower()
            or lower in item.category.lower()
            or any(lower in tag.lower() for tag in item.tags)
        )
    ]
    final = generic or listings[:4]

    return CampusBuddyResponse(
        answer=(
            f"Campus Buddy found {len(final)} matching items across campus for \"{query}\". "
            "Only verified students can sell or trade."
        ),
        matched_listings=[listing_to_schema(item) for item in final],
        college_spot_tip=(
            "Always inspect the condition thoroughly and exchange the PIN in person at designated "
            "campus pickup spots!"
        ),
        suggested_prompts=[
            "Casio fx-991CW scientific calculator",
            "Hero gear cycle under ₹4,000",
            "Sleepwell mattress for hostel",
            "Lab coat size L for Chemistry lab",
        ],
    )
