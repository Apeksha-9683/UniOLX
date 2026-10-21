# UniOLX API

FastAPI backend for the UniOLX campus marketplace: real auth, real persistence,
server-enforced PIN trades, real-time chat and AI search.

## Stack

| Layer | Technology |
|---|---|
| API | FastAPI, Python 3.11 |
| ORM / migrations | SQLAlchemy 2.0 (async), Alembic |
| Database | PostgreSQL 17 + pgvector |
| Auth | JWT access + refresh tokens, argon2id password hashing, 6-digit email OTP |
| Real-time | WebSockets (FastAPI) |
| AI | Gemini (`gemini-3.5-flash` parsing, `gemini-embedding-001` embeddings) |
| Email | Resend HTTP API |
| Tests | pytest, pytest-asyncio, httpx |

## Database structure

17 tables. The OLX browsing core is the place tree, the category tree and the
filterable attributes.

```mermaid
erDiagram
    locations ||--o{ locations : "parent"
    locations ||--o{ colleges : "campus"
    locations ||--o{ users : "area"
    locations ||--o{ listings : "place"
    colleges ||--o{ pickup_spots : "landmarks"
    colleges ||--o{ users : "students"
    colleges ||--o{ listings : "scopes"
    categories ||--o{ categories : "parent"
    categories ||--o{ category_attributes : "fields"
    categories ||--o{ listings : "files"
    listings ||--o{ listing_attributes : "parameters"
    listings ||--o{ listing_images : "photos"
    listings ||--o{ trades : "traded in"
    listings ||--o{ conversations : "discussed in"
    listings ||--o{ wishlists : "saved as"
    trades }o--|| users : "buyer / seller"
    conversations ||--o{ messages : "contains"
    users ||--o{ messages : "sends"
    users ||--o{ notifications : "receives"
    users ||--o{ otp_codes : "verifies with"
    users ||--o{ refresh_tokens : "holds"

    locations {
        uuid id PK
        varchar slug UK "india/karnataka/bengaluru"
        varchar name
        varchar type "country|state|city|district|campus"
        uuid parent_id FK
        uuid_array ancestors "materialised path, GIN"
        numeric latitude
        numeric longitude
        text address_line
        integer sort_order
    }
    categories {
        uuid id PK
        varchar slug UK "electronics/laptops"
        varchar name
        varchar alias
        uuid parent_id FK
        uuid_array ancestors
        integer level
        integer position
        varchar path
        varchar view_type "gallery|list"
        integer photos_max
    }
    category_attributes {
        uuid id PK
        uuid category_id FK
        varchar key "ram"
        varchar label "RAM"
        varchar data_type "enum|range|text|number|boolean"
        jsonb options
        numeric min_value
        numeric max_value
        varchar unit
    }
    listing_attributes {
        uuid listing_id PK,FK
        uuid category_id FK
        varchar key PK
        text value
        numeric value_num
        boolean value_bool
    }
    pickup_spots {
        uuid id PK
        varchar college_id FK
        varchar name
        numeric latitude
        numeric longitude
        integer sort_order
    }
    colleges {
        varchar id PK "rvce"
        uuid location_id FK
        varchar short_name
        varchar domain
        varchar status
        jsonb popular_branches
    }
    listings {
        uuid id PK
        uuid seller_id FK
        varchar college_id FK
        uuid category_id FK
        uuid location_id FK
        uuid pickup_spot_id FK
        varchar title
        numeric price
        numeric original_price
        varchar category "mirror of the category name"
        varchar condition
        varchar status
        varchar campus_pickup_spot "mirror of the spot name"
        integer quantity
        jsonb specs "mirror of listing_attributes"
        varchar_array tags
        numeric latitude
        numeric longitude
        vector embedding "768 dims, pgvector"
        tsvector search_vector "generated"
    }
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar college_id FK
        uuid location_id FK
        boolean is_verified
        float rating
    }
    trades {
        uuid id PK
        uuid listing_id FK
        uuid buyer_id FK
        uuid seller_id FK
        numeric price
        varchar status
        varchar pin_hash "argon2id"
        varchar pin_enc "AES-GCM, buyer only"
        integer attempts_left
        boolean is_locked
        timestamptz expires_at
    }
```

Inspect it yourself:

```bash
psql postgresql://uniolx:uniolx@localhost:5432/uniolx -c "\d listings"
psql postgresql://uniolx:uniolx@localhost:5432/uniolx -c "\dt"
```

### How it behaves like OLX

| OLX behaviour | How it works here |
|---|---|
| Locations are a tree with coordinates at every level | `locations.ancestors` is the materialised path, so "everything in Bengaluru" is `WHERE :id = ANY(ancestors)` |
| A location carries its live listing count | `GET /api/locations/tree` returns `offerCount` per node, rolled up through the ancestors |
| Categories are a tree with depth, position, path, live counts and a photo limit | `categories` plus `GET /api/categories/tree` (`offerCount`, `photosMax`, `childIds`, `level`, `path`) |
| Per-category filter fields | `category_attributes` declares the fields; `listing_attributes` stores the typed values, so `ram = 16` is a real SQL predicate |
| Search combines keyword + category + location + page + size | `GET /api/listings/search` returns `{items, total, page, size, nextPage}` |
| Distance search and "near me" | `?lat=&lng=&radiusKm=` and `?sortBy=distance`, using a bounding box then a haversine |
| Category-scoped photo limits | `photos_max` is enforced on create and patch |

## Setup

### 1. Database

```bash
brew install postgresql@17 pgvector
brew services start postgresql@17

PG=/opt/homebrew/opt/postgresql@17/bin
$PG/psql -d postgres -c "CREATE ROLE uniolx LOGIN PASSWORD 'uniolx' CREATEDB;"
$PG/createdb -O uniolx uniolx
$PG/createdb -O uniolx uniolx_test
$PG/psql -d uniolx -c "CREATE EXTENSION IF NOT EXISTS vector;"
$PG/psql -d uniolx_test -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> pgvector's Homebrew bottle ships extensions for PostgreSQL 17 and 18, so use
> `postgresql@17`. On PostgreSQL 16 you would have to build pgvector from source.

### 2. Python environment

```bash
cd backend
python3 -m venv .venv          # or: uv venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # then fill in the values
```

### 3. Schema and seed data

```bash
alembic upgrade head
python scripts/seed.py --reset
```

The seed loads the colleges and listings from `src/data` (exported to
`app/seed/*.json` by `node backend/scripts/export_seed_data.mjs`) and creates a
demo account:

```
aarav.sharma.cs22@rvce.edu.in / password123
```

Every seeded seller uses the same password and the address
`seller_<id>@<college domain>`.

### 4. Run

```bash
uvicorn app.main:app --reload --port 8000
```

- API docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

The frontend dev server proxies `/api`, `/ws` and `/uploads` to
`http://127.0.0.1:8000`, so `npm run dev` on port 3000 talks to the API
without any CORS setup.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://uniolx:uniolx@localhost:5432/uniolx` |
| `JWT_SECRET` | Signs access tokens (use 32+ random bytes) |
| `PIN_SECRET` | Derives the AES key that encrypts trade PINs |
| `PIN_TTL_MINUTES` | PIN lifetime, default 15 |
| `PIN_MAX_ATTEMPTS` | Wrong guesses before the trade locks, default 5 |
| `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` | OTP policy |
| `EMAIL_API_KEY` | Resend key. Blank in development: the OTP is logged and returned as `devOtp` |
| `GEMINI_API_KEY` | Blank disables AI parsing and embeddings; the local keyword parser takes over |
| `LLM_MODEL` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | Gemini models, default `gemini-3.5-flash` / `gemini-embedding-001` / 768 |
| `CORS_ORIGINS` | JSON list of allowed frontend origins |
| `DEMO_AUTO_REPLY` | Set to `false` to disable the rule-based chat reply |

## The PIN trade system

Everything below is enforced on the server. The browser only renders it.

1. `POST /api/trades` generates a 6-digit PIN with `secrets`, and stores it
   twice: `pin_hash` (argon2id, used to verify) and `pin_enc` (AES-256-GCM, so
   the buyer can read their own PIN back).
2. The listing row is locked with `SELECT ... FOR UPDATE` while the trade is
   created, so two buyers can never claim the same item.
3. Only the **seller** of the trade can submit a guess. The buyer's own
   request is rejected.
4. Five wrong guesses lock the trade. The PIN also expires after 15 minutes.
5. A correct PIN completes the trade, decrements the listing quantity, marks it
   `Sold` when nothing is left, and **clears both PIN columns** so it can never
   be replayed.
6. The seller's API responses never contain the PIN, not even a masked copy.

## API surface

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account and send the OTP |
| `POST` | `/api/auth/verify-otp` | Verify the OTP, return the tokens |
| `POST` | `/api/auth/resend-otp` | Resend the OTP (60s cooldown) |
| `POST` | `/api/auth/login` | Email + password, return the tokens |
| `POST` | `/api/auth/refresh` | Rotate the refresh token |
| `POST` | `/api/auth/logout` | Revoke the refresh tokens |
| `GET` | `/api/auth/me` | The signed-in user |
| `PATCH` | `/api/users/me` | Update the profile |
| `GET` | `/api/colleges` | Every college |
| `GET` | `/api/locations` | The place tree, flat |
| `GET` | `/api/locations/tree` | The place tree with live listing counts |
| `GET` | `/api/locations/{slug}` | One place, by id or slug |
| `GET` | `/api/locations/search?q=` | Place typeahead for the header picker |
| `GET` | `/api/locations/popular` | The busiest places |
| `GET` | `/api/locations/{id}/listings` | Listings in a place and everything under it |
| `GET` | `/api/categories` | The category tree, flat |
| `GET` | `/api/categories/tree` | The category tree with counts and photo limits |
| `GET` | `/api/categories/{slug}` | One category |
| `GET` | `/api/categories/{id}/attributes` | The filter fields for a category |
| `GET` | `/api/pickup-spots?collegeId=` | The campus landmarks |
| `GET` | `/api/colleges/search?q=` | College search |
| `POST` | `/api/colleges/requests` | Request a new campus |
| `GET` | `/api/listings` | Campus-scoped listings with filters |
| `GET` | `/api/listings/featured` | Six latest available listings |
| `GET` | `/api/listings/{id}` | Listing detail (campus scoped) |
| `POST` | `/api/listings` | Create a listing |
| `GET` | `/api/listings/search` | OLX envelope: items, total, page, size, nextPage |
| `PATCH` | `/api/listings/{id}/location` | Set the place, the pickup spot and the point |
| `PATCH` | `/api/listings/{id}` | Edit a listing (seller only) |
| `POST` | `/api/listings/{id}/status` | Set the status (seller only) |
| `POST` | `/api/listings/{id}/deactivate` | Toggle Available / Reserved |
| `DELETE` | `/api/listings/{id}` | Archive a listing |
| `GET` | `/api/wishlist` | Wishlisted listings |
| `POST` | `/api/wishlist/{id}/toggle` | Toggle the wishlist |
| `GET` | `/api/trades` | Trades the user is part of |
| `POST` | `/api/trades` | Start a trade (issues the PIN) |
| `POST` | `/api/trades/{id}/confirm-pin` | Seller submits the PIN |
| `POST` | `/api/trades/{id}/regenerate-pin` | Buyer issues a new PIN |
| `POST` | `/api/trades/{id}/cancel` | Cancel a trade |
| `GET` | `/api/conversations` | Conversation list with unread counts |
| `POST` | `/api/conversations` | Open or reuse a conversation |
| `GET` | `/api/conversations/{id}/messages` | Message history |
| `POST` | `/api/conversations/{id}/messages` | Send a message |
| `POST` | `/api/conversations/{id}/read` | Mark the conversation read |
| `GET` | `/api/notifications` | Notification list |
| `POST` | `/api/notifications/{id}/read` | Mark one notification read |
| `POST` | `/api/search/ai` | Campus Buddy: LLM parsing + pgvector ranking |
| `POST` | `/api/search/campus-buddy` | Keyword assistant |
| `POST` | `/api/uploads` | Upload a listing photo |
| `WS` | `/ws?token=<jwt>` | Chat socket |

### Socket events

Server to client: `message`, `message:status`, `typing`,
`conversations_updated`.
Client to server: `typing`, `read`, `ping`.

## College scoping

Every listing, trade, conversation and search query is scoped to the signed-in
user's own college on the server. A `collegeId` sent by the client is never
trusted, so no query can leak another campus's data. `scope=partners` opts into
the partner-campus list.

## Tests

```bash
pytest                       # 85 tests against the uniolx_test database
python scripts/smoke_test.py # end-to-end run against a live server
```

The suite covers college scoping (including a cross-campus conversation leak
that this backend blocks), the OTP policy, every PIN rule, a concurrency test
that fires two simultaneous trade requests at the same listing to prove only one
can win, the place and category tree integrity, the facet counts, the filterable
attributes, the distance filter (including the bounding-box edge case) and the
response shapes the frontend consumes.
