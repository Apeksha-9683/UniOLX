"""
main.py
-------
The FastAPI application entry point.

This file:
  1. Creates the FastAPI app instance
  2. Adds CORS middleware (so the browser lets the frontend talk to this API)
  3. Defines the /health endpoint
  4. Is the file uvicorn is told to run
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import check_database_connection


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="UniOLX API",
    description="Backend API for the UniOLX platform.",
    version="0.1.0",
    # In production you may want to disable the interactive docs:
    # docs_url=None, redoc_url=None
)


# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
# CORS (Cross-Origin Resource Sharing) controls which websites can send
# requests to this API from a browser.
# Without this, your React frontend on localhost:5173 would be blocked.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # e.g. ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PUT, DELETE, PATCH, OPTIONS
    allow_headers=["*"],   # Authorization, Content-Type, etc.
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    """Quick sanity check that the server is running."""
    return {"message": "UniOLX API is running", "env": settings.APP_ENV}


@app.get("/health", tags=["health"])
def health_check():
    """
    Health check endpoint.

    Returns the status of:
      - The API itself (always "ok" if this endpoint responds)
      - The database connection (queries the DB with SELECT 1)

    Your frontend or a monitoring tool can poll this to know if the backend
    is healthy. HTTP 200 = healthy, HTTP 503 = something is wrong.
    """
    db_status = check_database_connection()

    # Determine overall health
    all_healthy = db_status["status"] == "ok"

    response_body = {
        "status": "ok" if all_healthy else "degraded",
        "checks": {
            "api": "ok",
            "database": db_status,
        },
    }

    if not all_healthy:
        from fastapi import Response
        # Return 503 Service Unavailable so load balancers / monitors know
        # We import Response here to avoid polluting the top-level namespace
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=response_body)

    return response_body
