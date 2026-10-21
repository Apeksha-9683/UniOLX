"""Thin wrapper around the Gemini SDK.

Everything degrades gracefully: with no API key (or on any SDK error) the
callers fall back to the local keyword parser, so search never breaks.
"""

import asyncio
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger("uniolx.gemini")

_client_cache: Any = None


def _client():
    global _client_cache
    if _client_cache is not None:
        return _client_cache
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai
        from google.genai import types

        _client_cache = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=settings.gemini_timeout_seconds * 1000),
        )
        return _client_cache
    except Exception as exc:  # pragma: no cover - import/runtime failure
        logger.error("[gemini] could not create client: %s", exc)
        return None


def is_available() -> bool:
    return bool(settings.gemini_api_key) and _client() is not None


async def embed_text(text: str) -> list[float] | None:
    client = _client()
    if client is None or not text.strip():
        return None

    def _call() -> list[float] | None:
        from google.genai import types

        response = client.models.embed_content(
            model=settings.embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                output_dimensionality=settings.embedding_dimensions
            ),
        )
        embeddings = getattr(response, "embeddings", None)
        if not embeddings:
            return None
        values = list(embeddings[0].values)
        if len(values) != settings.embedding_dimensions:
            logger.warning(
                "[gemini] expected %s dims, got %s", settings.embedding_dimensions, len(values)
            )
            return None
        return values

    try:
        return await asyncio.wait_for(asyncio.to_thread(_call), timeout=settings.gemini_timeout_seconds + 10)
    except asyncio.TimeoutError:
        logger.error("[gemini] embed timed out")
        return None
    except Exception as exc:
        logger.error("[gemini] embed failed: %s", str(exc).replace("\n", " ")[:200])
        return None


async def generate_json(prompt: str, system_instruction: str, schema: Any) -> dict | None:
    client = _client()
    if client is None:
        return None

    def _call() -> dict | None:
        response = client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config={
                "system_instruction": system_instruction,
                "response_mime_type": "application/json",
                "response_schema": schema,
            },
        )
        text = getattr(response, "text", None)
        if not text:
            return None
        import json

        return json.loads(text)

    try:
        return await asyncio.wait_for(asyncio.to_thread(_call), timeout=settings.gemini_timeout_seconds + 10)
    except asyncio.TimeoutError:
        logger.error("[gemini] generate timed out")
        return None
    except Exception as exc:
        logger.error("[gemini] generate failed: %s", str(exc).replace("\n", " ")[:200])
        return None
