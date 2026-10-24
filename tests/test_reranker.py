from collections.abc import Iterable

import pytest

from ragolx.models import RetrievedListing
from ragolx.reranker import CrossEncoderReranker


class StaticEncoder:
    def __init__(self, scores: list[float]) -> None:
        self._scores = scores
        self.queries: list[str] = []
        self.documents: list[str] = []

    def rerank(
        self,
        query: str,
        documents: Iterable[str],
        batch_size: int = 64,
        **kwargs: object,
    ) -> Iterable[float]:
        self.queries.append(query)
        self.documents = list(documents)
        return self._scores


def _listing(listing_id: str) -> RetrievedListing:
    return RetrievedListing(
        listing_id=listing_id,
        title=listing_id,
        category="Laptops",
        price=1000,
        condition="good",
        document=f"Title: {listing_id}\nDescription: A listing.",
    )


def test_reranker_sorts_by_cross_encoder_score_and_truncates() -> None:
    encoder = StaticEncoder([0.1, 2.0, 1.0])
    reranker = CrossEncoderReranker(encoder=encoder)

    reranked = reranker.rerank(
        "a cheap laptop",
        [_listing("a"), _listing("b"), _listing("c")],
        top_k=2,
    )

    assert [result.listing_id for result in reranked] == ["b", "c"]
    assert [result.rerank_score for result in reranked] == [2.0, 1.0]
    assert encoder.queries == ["a cheap laptop"]
    assert encoder.documents == [
        "Title: a\nDescription: A listing.",
        "Title: b\nDescription: A listing.",
        "Title: c\nDescription: A listing.",
    ]


def test_reranker_skips_model_for_empty_candidates() -> None:
    encoder = StaticEncoder([])
    reranker = CrossEncoderReranker(encoder=encoder)

    assert reranker.rerank("query", [], top_k=5) == []
    assert encoder.queries == []


def test_reranker_rejects_score_count_mismatch() -> None:
    reranker = CrossEncoderReranker(encoder=StaticEncoder([1.0]))

    with pytest.raises(RuntimeError, match="scores"):
        reranker.rerank("query", [_listing("a"), _listing("b")], top_k=2)
