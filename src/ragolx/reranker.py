from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Protocol

from ragolx.models import RetrievedListing


class SupportsRerank(Protocol):
    def rerank(
        self,
        query: str,
        documents: Iterable[str],
        batch_size: int = 64,
        **kwargs: object,
    ) -> Iterable[float]: ...


class Reranker(Protocol):
    def rerank(
        self,
        query: str,
        results: Sequence[RetrievedListing],
        *,
        top_k: int,
    ) -> list[RetrievedListing]: ...


class CrossEncoderReranker:
    def __init__(
        self,
        model_name: str = "Xenova/ms-marco-MiniLM-L-6-v2",
        *,
        cache_dir: Path | None = None,
        threads: int | None = None,
        batch_size: int = 32,
        encoder: SupportsRerank | None = None,
    ) -> None:
        self._model_name = model_name
        self._cache_dir = str(cache_dir) if cache_dir is not None else None
        self._threads = threads
        self._batch_size = batch_size
        self._encoder = encoder

    def _get_encoder(self) -> SupportsRerank:
        if self._encoder is None:
            try:
                from fastembed.rerank.cross_encoder import TextCrossEncoder
            except ImportError as exc:
                raise RuntimeError(
                    "Cross-encoder reranking requires fastembed. Install it with "
                    "`pip install fastembed` or set RAGOLX_RERANK_ENABLED=false."
                ) from exc

            self._encoder = TextCrossEncoder(
                model_name=self._model_name,
                cache_dir=self._cache_dir,
                threads=self._threads,
                lazy_load=True,
            )
        return self._encoder

    def rerank(
        self,
        query: str,
        results: Sequence[RetrievedListing],
        *,
        top_k: int,
    ) -> list[RetrievedListing]:
        if not results or top_k <= 0:
            return []

        documents = [result.document or result.title for result in results]
        scores = list(self._get_encoder().rerank(query, documents, batch_size=self._batch_size))
        if len(scores) != len(results):
            raise RuntimeError(
                f"Reranker returned {len(scores)} scores for {len(results)} documents"
            )

        scored = [
            result.model_copy(update={"rerank_score": float(score)})
            for result, score in zip(results, scores, strict=True)
        ]
        scored.sort(key=lambda item: (-(item.rerank_score or 0.0), item.listing_id))
        return scored[:top_k]
