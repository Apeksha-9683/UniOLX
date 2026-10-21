"""Query parsing for Campus Buddy.

Two paths:
  1. Gemini, with the criteria forced into a JSON schema.
  2. A local regex parser (a port of the mock in `src/api/index.ts`) that runs
     whenever Gemini is unavailable, so search never breaks.
"""

import re
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from app.services import gemini

CRITERION_KEYS = (
    "budget",
    "minPrice",
    "ram",
    "storage",
    "use",
    "category",
    "condition",
    "brand",
    "location",
)

GREETINGS = {
    "hello", "hi", "hey", "yo", "sup", "hola", "good morning",
    "good afternoon", "good evening", "help", "who are you",
    "what can you do", "test", "testing", "asdf", "xyz",
}


@dataclass
class Criterion:
    id: str
    label: str
    key: str
    value: str
    display_value: str


@dataclass
class ParsedQuery:
    criteria: list[Criterion] = field(default_factory=list)
    is_vague_or_greeting: bool = False
    raw: str = ""


CATEGORY_NAMES = {
    "textbooks": "textbooks",
    "textbook": "textbooks",
    "books": "textbooks",
    "engineering": "textbooks/engineering",
    "electronics": "electronics",
    "cycles & commute": "cycles-commute",
    "cycles": "cycles-commute",
    "bicycles": "cycles-commute/bicycles",
    "hostel essentials": "hostel-essentials",
    "hostel": "hostel-essentials",
    "furniture": "hostel-essentials/furniture",
    "lab & drafting": "lab-drafting",
    "lab": "lab-drafting",
    "audio & gadgets": "audio-gadgets",
    "audio": "audio-gadgets",
    "headphones": "audio-gadgets/headphones",
    "fashion & sports": "fashion-sports",
    "sports": "fashion-sports",
    "laptops": "electronics/laptops",
    "calculators": "electronics/calculators",
}


def normalize_category(value: str) -> str:
    """Bring a category from any source into a tree slug.

    The LLM is free to answer "laptop", "Laptops" or "Electronics > Laptops";
    the matcher only understands a slug such as "electronics/laptops".
    """
    raw = (value or "").strip()
    if not raw:
        return raw
    if "/" in raw:
        return raw.lower()

    lowered = raw.lower()

    for keywords, slug, _label in CATEGORY_SYNONYMS:
        if lowered in keywords:
            return slug

    if lowered in CATEGORY_NAMES:
        return CATEGORY_NAMES[lowered]

    return raw.lower()


def _criterion(key: str, value: str, display: str, label: str | None = None) -> Criterion:
    return Criterion(
        id=f"crit_{key}",
        label=label or display,
        key=key,
        value=value,
        display_value=display,
    )


# ---------------------------------------------------------------------------
# Regex fallback
# ---------------------------------------------------------------------------
# (keywords, category slug, label) - the slugs match the category tree.
CATEGORY_SYNONYMS: list[tuple[tuple[str, ...], str, str]] = [
    (("laptop", "macbook", "thinkpad", "notebook", "computer"), "electronics/laptops", "Category: Laptops"),
    (("calculator", "casio", "991", "classwiz"), "electronics/calculators", "Category: Calculators"),
    (("cycle", "bicycle", "bike", "firefox", "atlas", "sprint"), "cycles-commute/bicycles", "Category: Cycles"),
    (("textbook", "book", "notes", "grewal", "timoshenko", "chaurasia", "silberschatz"), "textbooks/engineering", "Category: Textbooks"),
    (("mattress", "bed", "bedding", "sleepwell"), "hostel-essentials/furniture", "Category: Furniture"),
    (("headphone", "headphones", "earphone", "audio", "anc", "sony wh"), "audio-gadgets/headphones", "Category: Headphones"),
    (("kettle", "lamp", "drying stand", "bottle", "flask"), "hostel-essentials/kitchen-appliances", "Category: Kitchen & Appliances"),
    (("lab coat", "goggles"), "lab-drafting/lab-coats-safety", "Category: Lab Coats & Safety"),
    (("drafter", "mini drafter", "drafting"), "lab-drafting/drafting-tools", "Category: Drafting Tools"),
    (("monitor", "screen", "keyboard"), "electronics/monitors-peripherals", "Category: Monitors & Peripherals"),
    (("arduino", "raspberry pi", "rpi", "diy"), "electronics/arduino-diy", "Category: Arduino & DIY"),
    (("mobile", "phone", "smartphone"), "electronics/mobiles-accessories", "Category: Mobiles & Accessories"),
    (("badminton", "racquet"), "fashion-sports/sports-gear", "Category: Sports Gear"),
    (("backpack", "bag"), "fashion-sports/clothing-footwear", "Category: Clothing & Footwear"),
]

BRANDS: list[tuple[str, tuple[str, ...]]] = [
    ("Apple", ("apple", "macbook")),
    ("Lenovo", ("lenovo", "thinkpad")),
    ("Casio", ("casio",)),
    ("Sony", ("sony",)),
    ("Hero", ("hero",)),
    ("Firefox", ("firefox",)),
    ("Atlas", ("atlas",)),
    ("LG", ("lg",)),
    ("Redragon", ("redragon",)),
    ("Wildcraft", ("wildcraft",)),
    ("Bajaj", ("bajaj",)),
    ("Wipro", ("wipro",)),
    ("Arduino", ("arduino",)),
    ("Raspberry Pi", ("raspberry pi", "rpi")),
    ("Sleepwell", ("sleepwell",)),
    ("Boat", ("boat",)),
    ("Yonex", ("yonex",)),
]

USE_CASES: list[tuple[tuple[str, ...], str, str]] = [
    (("coding", "programming", "developer", "software", "web dev", "dev"), "coding", "Coding & Dev"),
    (("gaming", "game"), "gaming", "Gaming"),
    (("design", "graphics", "cad"), "design", "Design & CAD"),
    (("studying", "study", "exam", "midterm", "vtu", "gate"), "study", "Studying & Exams"),
    (("commute", "metro", "travel"), "commute", "Campus Commute"),
]


def _inr(value: float) -> str:
    return f"₹{value:,.0f}"


def parse_with_regex(query: str, previous: list[Criterion] | None = None) -> ParsedQuery:
    raw = (query or "").strip()
    lower = raw.lower()

    if lower in GREETINGS or (len(lower) < 3 and not any(ch.isdigit() for ch in lower)):
        return ParsedQuery(criteria=[], is_vague_or_greeting=True, raw=raw)

    criteria: list[Criterion] = [Criterion(**c.__dict__) for c in (previous or [])]

    def replace(key: str, new: Criterion) -> None:
        nonlocal criteria
        criteria = [c for c in criteria if c.key != key]
        criteria.append(new)

    category_criterion: Criterion | None = None
    for keywords, slug, label in CATEGORY_SYNONYMS:
        if any(word in lower for word in keywords):
            category_criterion = _criterion(
                "category", slug, label.replace("Category: ", ""), label
            )
            break

    if category_criterion is not None:
        if not category_criterion.value.startswith("Electronics"):
            criteria = [c for c in criteria if c.key not in ("ram", "storage")]
        replace("category", category_criterion)
    budget_match = (
        re.search(r"(?:under|below|less than|within|up to|max|maximum|<=?)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)", lower)
        or re.search(r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)", lower)
        or re.search(r"\b(\d+(?:,\d+)*(?:\s*k)?)\s*(?:budget|or less|max)\b", lower)
        or re.search(r"\b(\d+)\s*k\b", lower)
    )
    if budget_match:
        value = _parse_amount(budget_match.group(1))
        if value:
            replace("budget", _criterion("budget", str(value), f"≤ {_inr(value)}", f"Budget ≤ {_inr(value)}"))

    min_match = re.search(
        r"(?:above|more than|greater than|at least|min|minimum|>=?|from)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)",
        lower,
    )
    if min_match:
        value = _parse_amount(min_match.group(1))
        if value:
            replace("minPrice", _criterion("minPrice", str(value), f"≥ {_inr(value)}", f"Min Price ≥ {_inr(value)}"))

    ram_match = re.search(r"\b(4|8|16|32)\s*(?:gb|gig)\s*(?:ram|memory)?\b", lower) or re.search(
        r"\b(\d+)\s*gb\s*ram\b", lower
    )
    if ram_match:
        amount = f"{ram_match.group(1)} GB"
        replace("ram", _criterion("ram", f"{ram_match.group(1)}GB", amount, f"RAM: {amount}"))

    storage_match = re.search(r"\b(128|256|512)\s*(?:gb|gig)\s*(?:ssd|storage|nvme|rom)?\b", lower) or re.search(
        r"\b(1|2)\s*tb\b", lower
    )
    if storage_match:
        value = storage_match.group(0).upper()
        replace("storage", _criterion("storage", value, value, f"Storage: {value}"))

    for name, keywords in BRANDS:
        if any(word in lower for word in keywords):
            replace("brand", _criterion("brand", name, name, f"Brand: {name}"))
            break

    if "like new" in lower or "mint" in lower or "brand new" in lower:
        replace("condition", _criterion("condition", "Like New", "Like New", "Condition: Like New"))
    elif "good condition" in lower or ("good" in lower and "morning" not in lower):
        replace("condition", _criterion("condition", "Good", "Good", "Condition: Good"))

    for keywords, value, display in USE_CASES:
        if any(word in lower for word in keywords):
            replace("use", _criterion("use", value, display, f"Purpose: {display}"))
            break

    return ParsedQuery(criteria=criteria, is_vague_or_greeting=False, raw=raw)


def _parse_amount(text: str) -> int:
    cleaned = text.replace(",", "").strip().lower()
    if cleaned.endswith("k"):
        return int(float(cleaned[:-1]) * 1000)
    try:
        return int(float(cleaned))
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Gemini parsing
# ---------------------------------------------------------------------------
class _CriterionOut(BaseModel):
    key: str = Field(description="One of: budget, minPrice, ram, storage, use, category, condition, brand, location")
    value: str = Field(description="Machine readable value, e.g. 25000 or 16GB")
    display_value: str = Field(description="Human readable value, e.g. ≤ ₹25,000")
    label: str = Field(description="Short chip label, e.g. Budget ≤ ₹25,000")


class _ParseOut(BaseModel):
    criteria: list[_CriterionOut] = Field(default_factory=list)
    is_vague_or_greeting: bool = False


SYSTEM_INSTRUCTION = (
    "You extract structured search filters from a college marketplace query. "
    "Only include a criterion when the user actually asked for it. "
    "Prices are numbers in rupees. Never invent a budget that was not mentioned. "
    "The category value must be one of the category slugs you are given, "
    "or empty when the query does not name a category."
)


async def parse_with_gemini(
    query: str, categories: list[tuple[str, str]] | None = None
) -> ParsedQuery | None:
    raw = (query or "").strip()
    if not raw:
        return None

    catalogue = ""
    if categories:
        catalogue = "\nCategories (use the slug as the value):\n" + "\n".join(
            f"- {slug} ({name})" for slug, name in categories
        )

    prompt = (
        f"Query from a student: {raw}\n\n"
        "Extract the filters. Available keys: budget (max price), minPrice, ram, storage, "
        "use (coding/gaming/design/study/commute), category, condition, brand, location."
        f"{catalogue}"
    )

    data = await gemini.generate_json(prompt, SYSTEM_INSTRUCTION, _ParseOut)
    if not data:
        return None

    criteria: list[Criterion] = []
    for item in data.get("criteria", []) or []:
        key = item.get("key")
        if key not in CRITERION_KEYS:
            continue
        value = str(item.get("value") or "").strip()
        if not value:
            continue
        if key == "category":
            value = normalize_category(value)
        display = str(item.get("display_value") or value).strip()
        label = str(item.get("label") or display).strip()
        criteria.append(
            Criterion(id=f"crit_{key}", label=label, key=key, value=value, display_value=display)
        )

    return ParsedQuery(
        criteria=criteria,
        is_vague_or_greeting=bool(data.get("is_vague_or_greeting")),
        raw=raw,
    )


async def parse_query(
    query: str,
    previous: list[Criterion] | None = None,
    categories: list[tuple[str, str]] | None = None,
) -> ParsedQuery:
    parsed = await parse_with_gemini(query, categories)
    if parsed is not None:
        return parsed
    return parse_with_regex(query, previous)
