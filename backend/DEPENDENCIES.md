# Backend Libraries

This file explains the important Python libraries used by the UniOLX backend.
The backend has two parts:

- `backend/app/` — FastAPI API, authentication, and PostgreSQL access.
- `backend/ragolx/` — AI search, embeddings, retrieval, and reranking.

## Application libraries

| Library | Used in | What it does |
|---|---|---|
| **FastAPI** | `app/main.py`, `app/auth.py` | Creates the HTTP API, routes, request handling, dependency injection, and error responses. |
| **Uvicorn** | Development/server command | Runs the FastAPI application as an ASGI web server. |
| **Pydantic** | `app/schemas.py`, `ragolx/models.py` | Validates incoming API data and defines typed data models such as users, listings, query plans, and RAG responses. |
| **Pydantic Settings** | `app/config.py`, `ragolx/config.py` | Reads configuration and secrets from environment variables and `.env` files. |
| **Psycopg 3** | `app/db.py` | Connects Python directly to PostgreSQL and executes SQL queries. `DATABASE_URL` supplies the connection details. |
| **Alembic** | `backend/alembic/` | Provides database migration commands for evolving the PostgreSQL schema. |
| **SQLAlchemy** | `app/database.py`, `alembic/env.py` | Supplies the migration/ORM support scaffold. The main API database operations currently use Psycopg and raw SQL directly. |
| **python-dotenv** | `alembic/env.py` | Loads environment variables from `.env` when running migration commands. |

## AI and search libraries

| Library | Used in | What it does |
|---|---|---|
| **LangChain Core** | `ragolx/embeddings.py`, `planner.py`, `generator.py`, `graph.py` | Defines common interfaces for embeddings, chat models, prompts, messages, and output parsing. |
| **LangChain OpenAI** | `ragolx/providers.py` | Provides the chat-model adapter used to call OpenAI-compatible providers through OpenRouter. |
| **LangGraph** | `ragolx/graph.py` | Builds the RAG workflow: plan the query, retrieve listings, rerank results, and generate an answer. |
| **ChromaDB** | `ragolx/store.py` | Stores listing embeddings and performs vector similarity searches. Its local persistence may use an internal SQLite file; this is separate from the application PostgreSQL database. |
| **FastEmbed** | Reranking/provider configuration | Provides the embedding/reranking model dependency used by the RAG stack when configured. |
| **HTTPX** | `ragolx/embeddings.py` | Sends HTTP requests to the OpenRouter embeddings API and supports mock transports in tests. |
| **Rich** | `ragolx/cli.py` | Formats command-line output using tables, panels, Markdown, prompts, and colors. |

## Development libraries

| Library | Used in | What it does |
|---|---|---|
| **Pytest** | `tests/` | Runs automated tests for filters, retrieval, indexing, embeddings, planning, reranking, and the RAG graph. |
| **Ruff** | Development tooling | Checks Python formatting and common code-quality issues. |

## Python standard library

These are built into Python and do not need to be installed separately:

- `json` — reads and writes JSON listing data and token payloads.
- `hashlib`, `hmac`, `secrets`, and `base64` — password/token/PIN security helpers.
- `uuid` — creates user, listing, and trade identifiers.
- `datetime` and `time` — timestamps, expiry checks, and token timing.
- `pathlib` — portable file and directory paths.
- `functools.lru_cache` — caches application settings and the RAG service.
- `contextlib` — manages database connection lifetimes.
- `dataclasses`, `typing`, and `collections.abc` — typed internal data structures and interfaces.
- `argparse` — command-line argument parsing for the RAG CLI.
- `re` — SQL placeholder conversion for the PostgreSQL wrapper.

## Main request flow

```text
Browser
  -> FastAPI/Uvicorn
  -> Pydantic validation
  -> API route
  -> Psycopg 3 -> PostgreSQL
  -> RAG service
  -> LangGraph
  -> ChromaDB + embeddings + reranker
  -> JSON response
```

The application database is PostgreSQL-only. ChromaDB is the separate vector
index used for semantic listing search.
