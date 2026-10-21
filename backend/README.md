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
| AI | Gemini (`gemini-2.5-flash` parsing, `text-embedding-004` embeddings) |
| Email | Resend HTTP API |
| Tests | pytest, pytest-asyncio, httpx |

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
| `LLM_MODEL` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | Gemini models, default `gemini-2.5-flash` / `text-embedding-004` / 768 |
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
| `GET` | `/api/colleges/search?q=` | College search |
| `POST` | `/api/colleges/requests` | Request a new campus |
| `GET` | `/api/listings` | Campus-scoped listings with filters |
| `GET` | `/api/listings/featured` | Six latest available listings |
| `GET` | `/api/listings/{id}` | Listing detail (campus scoped) |
| `POST` | `/api/listings` | Create a listing |
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
pytest                       # 52 tests against the uniolx_test database
python scripts/smoke_test.py # end-to-end run against a live server
```

The suite covers college scoping (including a cross-campus conversation leak
that this backend blocks), the OTP policy, every PIN rule, and a concurrency
test that fires two simultaneous trade requests at the same listing to prove
only one can win.
