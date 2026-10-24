from dataclasses import dataclass
from typing import Any

from langchain_core.embeddings import Embeddings

from ragolx.filters import build_where
from ragolx.models import QueryPlan, RetrievedListing
from ragolx.store import ChromaListingStore, SearchHit


@dataclass(frozen=True)
class RetrievalOutcome:
    results: list[RetrievedListing]
    where: dict[str, Any]
    query_count: int


def _query_vectors(
    embeddings: Embeddings,
    texts: list[str],
) -> list[list[float]]:
    embed_queries = getattr(embeddings, "embed_queries", None)
    if callable(embed_queries):
        return embed_queries(texts)
    return [embeddings.embed_query(text) for text in texts]


def _similarity(hit: SearchHit) -> float | None:
    if hit.distance is None:
        return None
    return round(max(0.0, min(1.0, 1.0 - hit.distance)), 4)


class ListingRetriever:
    def __init__(
        self,
        store: ChromaListingStore,
        embeddings: Embeddings,
        *,
        candidate_k: int,
    ) -> None:
        self._store = store
        self._embeddings = embeddings
        self._candidate_k = max(candidate_k, 1)

    def retrieve(
        self,
        plan: QueryPlan,
        *,
        college_id: str | None = None,
    ) -> RetrievalOutcome:
        where = build_where(college_id)
        query_texts = [plan.query]
        if plan.hypothetical_listing and (
            plan.hypothetical_listing.casefold() != plan.query.casefold()
        ):
            query_texts.append(plan.hypothetical_listing)

        vectors = _query_vectors(self._embeddings, query_texts)
        best_similarities: dict[str, float] = {}
        hits: dict[str, SearchHit] = {}
        for vector in vectors:
            for hit in self._store.query(vector, k=self._candidate_k, where=where):
                hits.setdefault(hit.id, hit)
                similarity = _similarity(hit)
                if similarity is None:
                    continue
                current = best_similarities.get(hit.id)
                if current is None or similarity > current:
                    best_similarities[hit.id] = similarity

        results: list[RetrievedListing] = []
        for listing_id, hit in hits.items():
            metadata = hit.metadata
            results.append(
                RetrievedListing(
                    listing_id=str(metadata.get("listing_id", listing_id)),
                    title=str(metadata.get("title", "")),
                    category=str(metadata.get("category", "")),
                    price=int(metadata.get("price", 0)),
                    condition=str(metadata.get("condition", "")),
                    pickup_location=(
                        str(metadata["pickup_location"])
                        if metadata.get("pickup_location")
                        else None
                    ),
                    quantity_available=int(metadata.get("quantity_available", 1)),
                    similarity=best_similarities.get(listing_id),
                    document=hit.document,
                )
            )

        results.sort(key=lambda item: (-(item.similarity or 0.0), item.listing_id))
        return RetrievalOutcome(
            results=results,
            where=where,
            query_count=len(query_texts),
        )
