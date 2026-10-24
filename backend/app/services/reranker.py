"""Cross-encoder reranking of retrieved listing candidates.

The dense/BM25 retrieval step in `search.py` casts a wide net; this module
re-scores that candidate set with a small ONNX cross-encoder (fastembed, no
PyTorch) so the final ordering reflects real query/listing relevance.

Everything degrades gracefully: with RERANK_ENABLED=false, a missing model or
any runtime failure the callers keep the pre-rerank ordering, so search never
breaks.
"""

import asyncio
import logging
import math
from collections.abc import Sequence

from app.core.config import settings

logger = logging.getLogger("uniolx.reranker")

_encoder: object | None = None
_disabled = False


def _get_encoder():
    global _encoder, _disabled
    if _encoder is not None:
        return _encoder
    if _disabled:
        return None
    try:
        from fastembed.rerank.cross_encoder import TextCrossEncoder

        _encoder = TextCrossEncoder(
            model_name=settings.rerank_model,
            lazy_load=True,
        )
        return _encoder
    except Exception as exc:
        _disabled = True
        logger.error(
            "[rerank] could not load %s, reranking disabled: %s",
            settings.rerank_model,
            str(exc).replace("\n", " ")[:200],
        )
        return None


def score_documents(query: str, documents: Sequence[str]) -> list[float] | None:
    """Raw cross-encoder logits, or None when reranking is unavailable."""
    if not settings.rerank_enabled or not query or not documents:
        return None

    encoder = _get_encoder()
    if encoder is None:
        return None

    try:
        scores = encoder.rerank(query, list(documents), batch_size=32)
        raw = [float(score) for score in scores]
    except Exception as exc:
        logger.error("[rerank] scoring failed: %s", str(exc).replace("\n", " ")[:200])
        return None

    if len(raw) != len(documents):
        logger.error("[rerank] got %s scores for %s documents", len(raw), len(documents))
        return None
    return raw


def sigmoid_scores(raw: Sequence[float]) -> list[float]:
    """Logits -> (0, 1) so callers can blend them into a display score."""
    return [1.0 / (1.0 + math.exp(-score)) for score in raw]


async def rerank_documents(query: str, documents: Sequence[str]) -> list[float] | None:
    """Normalised (0, 1) relevance scores, or None when reranking is skipped."""
    if not settings.rerank_enabled or not documents:
        return None

    try:
        raw = await asyncio.wait_for(
            asyncio.to_thread(score_documents, query, documents),
            timeout=settings.rerank_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.error("[rerank] timed out after %ss", settings.rerank_timeout_seconds)
        return None
    except Exception as exc:
        logger.error("[rerank] failed: %s", str(exc).replace("\n", " ")[:200])
        return None

    if raw is None:
        return None
    return sigmoid_scores(raw)
