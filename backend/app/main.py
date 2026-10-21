import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.session import engine
from app.routers import (
    auth,
    colleges,
    conversations,
    listings,
    notifications,
    search,
    trades,
    uploads,
    ws,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("uniolx")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("UniOLX API starting (env=%s)", settings.environment)
    yield
    await engine.dispose()
    logger.info("UniOLX API stopped")


app = FastAPI(
    title="UniOLX API",
    description="Backend for the UniOLX campus marketplace",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(auth.users_router)
app.include_router(colleges.router)
app.include_router(listings.router)
app.include_router(listings.wishlist_router)
app.include_router(trades.router)
app.include_router(conversations.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(uploads.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/config")
async def public_config():
    return {
        "aiEnabled": bool(settings.gemini_api_key),
        "emailEnabled": bool(settings.email_api_key),
        "devMode": settings.dev_mode,
    }


_uploads = Path(settings.uploads_dir)
if not _uploads.is_absolute():
    _uploads = Path(__file__).resolve().parents[1] / _uploads
_uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads)), name="uploads")
