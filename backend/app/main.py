import hashlib
import json
import sqlite3
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
    ListingUpdate,
    LoginRequest,
    MessageCreate,
    SearchRequest,
    TradeConfirm,
    TradeCreate,
    ProfileUpdate,
)
from backend.app.serializers import frontend_listing

app = FastAPI(title="UniOLX API", version="1.0.0")


@app.on_event("startup")
def initialize_database() -> None:
    settings = get_settings()
    database = Database(settings.database_path)
    database.initialize()
    with database.connection() as connection:
        connection.execute(
            """INSERT OR IGNORE INTO users
               (id, name, email, password_hash, college_id, branch, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                "demo-user-aarav",
                "Aarav Sharma",
                "aarav.sharma.cs22@rvce.edu.in",
                hash_password("campus2026!"),
                "11111111-1111-4111-8111-111111111111",
                "Computer Science",
                "2026-01-01T00:00:00+00:00",
            ),
        )


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
    result.update({
        "collegeId": result.pop("college_id", ""),
        "isVerified": result.pop("is_verified"),
        "joinedDate": result.pop("created_at", ""),
        "collegeName": result.get("collegeId", ""),
        "collegeShortName": result.get("collegeId", ""),
        "year": result.get("year", 1), "semester": result.get("semester", 1),
        "rating": result.get("rating", 5), "totalReviews": result.get("total_reviews", 0),
        "completedTrades": result.get("completed_trades", 0),
    })
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

@app.patch("/api/me")
def update_me(payload: ProfileUpdate, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    values = payload.model_dump(exclude_none=True)
    allowed = {k: v for k, v in values.items() if k in {"name", "branch", "avatar"}}
    if allowed:
        with database.connection() as connection:
            connection.execute(
                f"UPDATE users SET {', '.join(f'{k} = ?' for k in allowed)} WHERE id = ?",
                (*allowed.values(), user["id"]),
            )
            row = connection.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    else:
        row = user
    return _public_user(dict(row))

@app.get("/api/colleges")
def list_colleges(query: str | None = None, settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        rows = connection.execute("SELECT * FROM colleges ORDER BY name").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item.update({"shortName": item.pop("short_name"), "campusSpots": json.loads(item.pop("campus_spots_json")), "popularBranches": json.loads(item.pop("popular_branches_json")), "isVerified": item.pop("status") == "verified"})
        if not query or query.casefold() in f"{item['name']} {item['shortName']} {item['city']} {item['state']}".casefold():
            result.append(item)
    return result

@app.get("/api/colleges/{college_id}")
def get_college(college_id: str, settings: BackendSettings = Depends(get_settings)) -> dict:
    rows = list_colleges(settings=settings)
    return next((x for x in rows if x["id"].casefold() == college_id.casefold()), None) or (_ for _ in ()).throw(HTTPException(404, "College not found"))

@app.post("/api/colleges", status_code=201)
def request_college(payload: dict, settings: BackendSettings = Depends(get_settings)) -> dict:
    college_id = f"col_req_{uuid.uuid4().hex[:12]}"
    name = str(payload.get("name") or payload.get("collegeName") or "").strip()
    if not name: raise HTTPException(422, "College name is required")
    with Database(settings.database_path).connection() as connection:
        connection.execute("INSERT INTO colleges (id,name,short_name,city,state,domain,status) VALUES (?,?,?,?,?,?,?)",
                           (college_id, name, name.split()[0], str(payload.get("city", "")), str(payload.get("state", "India")), payload.get("domain"), "pending"))
    return next(x for x in list_colleges(settings=settings) if x["id"] == college_id)


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
            "SELECT * FROM listings WHERE college_id = ? AND status NOT IN ('archived') ORDER BY created_at DESC",
            (college,),
        ).fetchall()
    return [frontend_listing(row, database) for row in rows]

@app.get("/api/listings/{listing_id}")
def get_listing(listing_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        row = connection.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
    return frontend_listing(row, database) if row else (_ for _ in ()).throw(HTTPException(404, "Listing not found"))

@app.patch("/api/listings/{listing_id}")
def update_listing(listing_id: str, payload: ListingUpdate, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    values = payload.model_dump(exclude_none=True)
    if "specs" in values: values["specs_json"] = json.dumps(values.pop("specs"))
    with database.connection() as connection:
        row = connection.execute("SELECT * FROM listings WHERE id = ? AND seller_id = ?", (listing_id, user["id"])).fetchone()
        if not row: raise HTTPException(404, "Listing not found")
        if values:
            connection.execute(f"UPDATE listings SET {', '.join(f'{k} = ?' for k in values)} WHERE id = ?", (*values.values(), listing_id))
        row = connection.execute("SELECT * FROM listings WHERE id = ?", (listing_id,)).fetchone()
    return frontend_listing(row, database)

@app.delete("/api/listings/{listing_id}", status_code=204)
def archive_listing(listing_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> None:
    update_listing(listing_id, ListingUpdate(status="archived"), user, settings)


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
            "SELECT * FROM listings WHERE id = ? AND college_id = ? AND status = 'available' AND quantity_available > 0",
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
    return get_trade(trade_id, user, settings) | {"pin": pin}

def _trade_json(row: dict, listing: dict, connection: sqlite3.Connection) -> dict:
    buyer = connection.execute("SELECT * FROM users WHERE id = ?", (row["buyer_id"],)).fetchone()
    seller = connection.execute("SELECT * FROM users WHERE id = ?", (row["seller_id"],)).fetchone()
    return {"id": row["id"], "listingId": row["listing_id"], "listingTitle": listing["title"],
            "listingImage": "", "price": row["price"], "quantity": 1, "buyerId": row["buyer_id"],
            "buyerName": buyer["name"] if buyer else "", "buyerCollege": buyer["college_id"] if buyer else "",
            "sellerId": row["seller_id"], "sellerName": seller["name"] if seller else "",
            "sellerCollege": seller["college_id"] if seller else "", "pickupSpot": row["pickup_location"],
            "scheduledTime": row["created_at"], "status": row["status"].capitalize(),
            "confirmationPin": "", "attemptsLeft": row["attempts_left"], "isLocked": row["attempts_left"] <= 0,
            "createdAt": row["created_at"], "completedAt": row["completed_at"]}

@app.get("/api/trades")
def list_trades(user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        rows = connection.execute("SELECT t.*, l.title FROM trades t JOIN listings l ON l.id=t.listing_id WHERE t.buyer_id=? OR t.seller_id=? ORDER BY t.created_at DESC", (user["id"], user["id"])).fetchall()
        return [_trade_json(dict(row), dict(row), connection) for row in rows]

@app.get("/api/trades/{trade_id}")
def get_trade(trade_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        row = connection.execute("SELECT t.*, l.title FROM trades t JOIN listings l ON l.id=t.listing_id WHERE t.id=? AND (t.buyer_id=? OR t.seller_id=?)", (trade_id, user["id"], user["id"])).fetchone()
        if not row: raise HTTPException(404, "Trade not found")
        return _trade_json(dict(row), dict(row), connection)


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

@app.post("/api/trades/{trade_id}/cancel")
def cancel_trade(trade_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        row = connection.execute("SELECT * FROM trades WHERE id=? AND (buyer_id=? OR seller_id=?)", (trade_id, user["id"], user["id"])).fetchone()
        if not row: raise HTTPException(404, "Trade not found")
        connection.execute("UPDATE trades SET status='cancelled' WHERE id=?", (trade_id,))
        connection.execute("UPDATE listings SET status='available' WHERE id=? AND status='reserved'", (row["listing_id"],))
    return {"success": True, "message": "Campus trade has been cancelled."}

@app.post("/api/trades/{trade_id}/regenerate")
def regenerate_trade(trade_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path); pin = f"{secrets.randbelow(1_000_000):06d}"
    with database.connection() as connection:
        row = connection.execute("SELECT * FROM trades WHERE id=? AND buyer_id=?", (trade_id, user["id"])).fetchone()
        if not row: raise HTTPException(404, "Trade not found")
        connection.execute("UPDATE trades SET pin_hash=?, attempts_left=5 WHERE id=?", (hashlib.sha256(pin.encode()).hexdigest(), trade_id))
    return {"success": True, "newPin": pin, "message": "New 6-digit PIN generated! Valid for 15 minutes."}


def hmac_compare(left: str, right: str) -> bool:
    import hmac

    return hmac.compare_digest(left, right)

@app.post("/api/listings/{listing_id}/wishlist")
def wishlist_toggle(listing_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        exists = connection.execute("SELECT 1 FROM wishlist WHERE user_id=? AND listing_id=?", (user["id"], listing_id)).fetchone()
        if exists:
            connection.execute("DELETE FROM wishlist WHERE user_id=? AND listing_id=?", (user["id"], listing_id)); wished = False
        else:
            connection.execute("INSERT INTO wishlist VALUES (?, ?, ?)", (user["id"], listing_id, datetime.now(UTC).isoformat())); wished = True
    return {"wishlisted": wished}

@app.get("/api/wishlist")
def get_wishlist(user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        rows = connection.execute("SELECT l.* FROM listings l JOIN wishlist w ON w.listing_id=l.id WHERE w.user_id=? ORDER BY w.created_at DESC", (user["id"],)).fetchall()
    return [frontend_listing(row, database) for row in rows]


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
        conversation = connection.execute("SELECT * FROM conversations WHERE id=?", (conversation_id,)).fetchone()
        if conversation and user["id"] not in (conversation["buyer_id"], conversation["seller_id"]):
            raise HTTPException(403, "Not a conversation participant")
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
    return {"id": message_id, "conversationId": conversation_id, "senderId": user["id"], "text": payload.text, "timestamp": now if 'now' in locals() else datetime.now(UTC).isoformat(), "isMine": True, "status": "sent"}

@app.get("/api/conversations")
def conversations(user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        rows = connection.execute("SELECT c.*, l.title, l.price, l.status, l.seller_id FROM conversations c JOIN listings l ON l.id=c.listing_id WHERE c.buyer_id=? OR c.seller_id=? ORDER BY c.created_at DESC", (user["id"], user["id"])).fetchall()
        result = []
        for row in rows:
            peer_id = row["seller_id"] if row["buyer_id"] == user["id"] else row["buyer_id"]
            peer = connection.execute("SELECT * FROM users WHERE id=?", (peer_id,)).fetchone()
            last = connection.execute("SELECT text,created_at FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1", (row["id"],)).fetchone()
            if not last: continue
            result.append({"id": row["id"], "listingId": row["listing_id"], "listingTitle": row["title"], "listingPrice": row["price"], "listingImage": "", "listingStatus": row["status"].capitalize(), "otherUser": {"id": peer_id, "name": peer["name"] if peer else "", "avatar": "", "college": peer["college_id"] if peer else "", "isVerified": True}, "lastMessage": last["text"], "lastMessageTime": last["created_at"], "unreadCount": 0})
        return result

@app.post("/api/conversations")
def create_conversation(listing_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    database = Database(settings.database_path)
    with database.connection() as connection:
        listing = connection.execute("SELECT * FROM listings WHERE id=?", (listing_id,)).fetchone()
        if not listing: raise HTTPException(404, "Listing not found")
        if listing["seller_id"] == user["id"]: buyer = user["id"]
        else: buyer = user["id"]
        existing = connection.execute("SELECT * FROM conversations WHERE listing_id=? AND buyer_id=?", (listing_id, buyer)).fetchone()
        conversation_id = existing["id"] if existing else str(uuid.uuid4())
        if not existing: connection.execute("INSERT INTO conversations VALUES (?,?,?,?,?)", (conversation_id, listing_id, buyer, listing["seller_id"], datetime.now(UTC).isoformat()))
    return {"id": conversation_id, "listingId": listing_id, "listingTitle": listing["title"], "listingPrice": listing["price"], "listingImage": "", "listingStatus": listing["status"].capitalize(), "otherUser": {}, "lastMessage": "", "lastMessageTime": "", "unreadCount": 0}

@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    items = conversations(user, settings)
    return next((item for item in items if item["id"] == conversation_id), None) or (_ for _ in ()).throw(HTTPException(404, "Conversation not found"))

@app.get("/api/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        conv = connection.execute("SELECT * FROM conversations WHERE id=? AND (buyer_id=? OR seller_id=?)", (conversation_id, user["id"], user["id"])).fetchone()
        if not conv: raise HTTPException(404, "Conversation not found")
        rows = connection.execute("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at", (conversation_id,)).fetchall()
    return [{"id": r["id"], "conversationId": r["conversation_id"], "senderId": r["sender_id"], "text": r["text"], "timestamp": r["created_at"], "isMine": r["sender_id"] == user["id"], "status": "sent"} for r in rows]

@app.get("/api/notifications")
def notifications(user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> list[dict]:
    database = Database(settings.database_path)
    with database.connection() as connection:
        rows = connection.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
    return [{**dict(r), "read": bool(r["read"]), "timestamp": r["created_at"]} for r in rows]

@app.post("/api/notifications/{notification_id}/read")
def read_notification(notification_id: str, user: dict = Depends(current_user), settings: BackendSettings = Depends(get_settings)) -> dict:
    with Database(settings.database_path).connection() as connection:
        connection.execute("UPDATE notifications SET read=1 WHERE id=? AND user_id=?", (notification_id, user["id"]))
    return {"success": True}
