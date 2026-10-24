import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from backend.app.auth import (
    create_token,
    current_user,
    hash_password,
    verify_password,
)
from backend.app.config import BackendSettings, get_settings
from backend.app.db import Database
from backend.app.rag_service import get_rag_service
from backend.app.schemas import (
    AuthRequest,
    AuthResponse,
    HealthResponse,
    ListingCreate,
    LoginRequest,
    MessageCreate,
    SearchRequest,
    TradeConfirm,
    TradeCreate,
)
from backend.app.serializers import frontend_listing

app = FastAPI(title="UniOLX API", version="1.0.0")


@app.on_event("startup")
def initialize_database() -> None:
    get_settings()
    Database(get_settings().database_path).initialize()


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "UniOLX API is running",
        "docs": "/docs",
        "health": "/api/health",
    }


def _public_user(row: dict) -> dict:
    result = dict(row)
    result.pop("password_hash", None)
    result["is_verified"] = bool(result.get("is_verified"))
    return result


@app.get("/api/health", response_model=HealthResponse)
def health(settings: BackendSettings = Depends(get_settings)) -> HealthResponse:
    database = Database(settings.database_path)
    database.initialize()
    try:
        count = get_rag_service().rag.document_count()
    except Exception:
        count = 0
    return HealthResponse(status="ok", rag_indexed_listings=count)


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
def health_compatibility(settings: BackendSettings = Depends(get_settings)) -> HealthResponse:
    return health(settings)


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: AuthRequest, settings: BackendSettings = Depends(get_settings)) -> AuthResponse:
    database = Database(settings.database_path)
    user_id = str(uuid.uuid4())
    name = payload.name or payload.email.split("@", 1)[0]
    now = datetime.now(UTC).isoformat()
    with database.connection() as connection:
        try:
            connection.execute(
                """INSERT INTO users (id, name, email, password_hash, college_id, branch, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    name,
                    payload.email.casefold(),
                    hash_password(payload.password),
                    payload.college_id,
                    payload.branch,
                    now,
                ),
            )
        except Exception as exc:
            if "UNIQUE" in str(exc).upper():
                raise HTTPException(status_code=409, detail="Email is already registered") from exc
            raise
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return AuthResponse(token=create_token(user_id, settings), user=_public_user(dict(row)))


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, settings: BackendSettings = Depends(get_settings)) -> AuthResponse:
    database = Database(settings.database_path)
    with database.connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE email = ?", (payload.email.casefold(),)
        ).fetchone()
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return AuthResponse(token=create_token(row["id"], settings), user=_public_user(dict(row)))


@app.get("/api/me")
def me(user: dict = Depends(current_user)) -> dict:
    return _public_user(user)


@app.get("/api/listings")
def list_listings(
    college_id: str | None = Query(default=None),
    user: dict = Depends(current_user),
    settings: BackendSettings = Depends(get_settings),
) -> list[dict]:
    database = Database(settings.database_path)
    college = college_id or user["college_id"]
    with database.connection() as connection:
        rows = connection.execute(
            "SELECT * FROM listings WHERE college_id = ? AND status = 'available' ORDER BY created_at DESC",
            (college,),
        ).fetchall()
    return [frontend_listing(row, database) for row in rows]


@app.post("/api/listings", status_code=201)
def create_listing(
    payload: ListingCreate,
    user: dict = Depends(current_user),
    settings: BackendSettings = Depends(get_settings),
) -> dict:
    listing_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    database = Database(settings.database_path)
    with database.connection() as connection:
        connection.execute(
            """INSERT INTO listings
               (id, seller_id, college_id, title, category, description, price, condition,
                specs_json, pickup_location, quantity_total, quantity_available, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                listing_id,
                user["id"],
                user["college_id"],
                payload.title,
                payload.category,
                payload.description,
                payload.price,
                payload.condition,
                json.dumps(payload.specs),
                payload.pickup_location,
                payload.quantity_total,
                payload.quantity_total,
                now,
            ),
        )
        row = connection.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
    return frontend_listing(row, database)


@app.post("/api/rag/search")
def rag_search(payload: SearchRequest, user: dict = Depends(current_user)) -> dict:
    try:
        return get_rag_service().query(payload.query, payload.college_id or user["college_id"])
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"RAG search unavailable: {exc}") from exc


@app.post("/api/rag/ingest")
def rag_ingest(user: dict = Depends(current_user)) -> dict[str, int]:
    if user["email"] != "admin@uniolx.local":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        return {"indexed": get_rag_service().ingest()}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"RAG ingestion failed: {exc}") from exc


@app.post("/api/trades", status_code=201)
def create_trade(
    payload: TradeCreate,
    user: dict = Depends(current_user),
    settings: BackendSettings = Depends(get_settings),
) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        listing = connection.execute(
            "SELECT * FROM listings WHERE id = ? AND college_id = ? AND status = 'available'",
            (payload.listing_id, user["college_id"]),
        ).fetchone()
        if listing is None or listing["seller_id"] == user["id"]:
            raise HTTPException(status_code=404, detail="Listing unavailable")
        trade_id = str(uuid.uuid4())
        pin = f"{secrets.randbelow(10_000):04d}"
        pin_hash = hashlib.sha256(pin.encode()).hexdigest()
        connection.execute(
            """INSERT INTO trades
               (id, listing_id, buyer_id, seller_id, price, pickup_location, pin_hash, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trade_id,
                listing["id"],
                user["id"],
                listing["seller_id"],
                listing["price"],
                payload.pickup_location,
                pin_hash,
                datetime.now(UTC).isoformat(),
            ),
        )
        connection.execute("UPDATE listings SET status = 'reserved' WHERE id = ?", (listing["id"],))
    return {"id": trade_id, "listing_id": listing["id"], "pin": pin, "status": "reserved"}


@app.post("/api/trades/{trade_id}/confirm")
def confirm_trade(
    trade_id: str,
    payload: TradeConfirm,
    user: dict = Depends(current_user),
    settings: BackendSettings = Depends(get_settings),
) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        trade = connection.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
        if trade is None or trade["seller_id"] != user["id"]:
            raise HTTPException(status_code=404, detail="Trade not found")
        if trade["status"] != "reserved":
            raise HTTPException(status_code=409, detail="Trade is no longer active")
        if not hmac_compare(hashlib.sha256(payload.pin.encode()).hexdigest(), trade["pin_hash"]):
            connection.execute(
                "UPDATE trades SET attempts_left = attempts_left - 1 WHERE id = ?",
                (trade_id,),
            )
            raise HTTPException(status_code=400, detail="Invalid PIN")
        now = datetime.now(UTC).isoformat()
        connection.execute("UPDATE trades SET status = 'completed', completed_at = ? WHERE id = ?", (now, trade_id))
        connection.execute(
            "UPDATE listings SET status = 'sold', quantity_available = 0 WHERE id = ?",
            (trade["listing_id"],),
        )
    return {"id": trade_id, "status": "completed"}


def hmac_compare(left: str, right: str) -> bool:
    import hmac

    return hmac.compare_digest(left, right)


@app.post("/api/conversations/{conversation_id}/messages", status_code=201)
def send_message(
    conversation_id: str,
    payload: MessageCreate,
    user: dict = Depends(current_user),
    settings: BackendSettings = Depends(get_settings),
) -> dict:
    database = Database(settings.database_path)
    message_id = str(uuid.uuid4())
    with database.connection() as connection:
        connection.execute(
            """INSERT INTO messages (id, conversation_id, listing_id, sender_id, text, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                message_id,
                conversation_id,
                "",
                user["id"],
                payload.text,
                datetime.now(UTC).isoformat(),
            ),
        )
    return {"id": message_id, "conversation_id": conversation_id, "sender_id": user["id"], "text": payload.text}
