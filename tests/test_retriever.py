from pathlib import Path

from conftest import FakeEmbeddings, make_listing

from backend.ragolx.indexer import ListingIndexer
from backend.ragolx.models import Listing, QueryPlan
from backend.ragolx.retriever import ListingRetriever
from backend.ragolx.store import ChromaListingStore


def _index(
    tmp_path: Path,
    embeddings: FakeEmbeddings,
    listings: list[Listing],
) -> ChromaListingStore:
    store = ChromaListingStore(tmp_path / "chroma", "listings")
    indexer = ListingIndexer(store, embeddings, tmp_path / "catalog.json")
    indexer.ingest(listings)
    return store


def test_retrieval_honors_availability_and_college(
    tmp_path: Path,
    fake_embeddings: FakeEmbeddings,
) -> None:
    store = _index(
        tmp_path,
        fake_embeddings,
        [
            make_listing(
                "macbook",
                title="MacBook Air Laptop",
                description="Laptop for coding, classes, and assignments.",
                college_id="college-a",
            ),
            make_listing(
                "sold-laptop",
                title="Sold Laptop",
                description="Laptop for coding and assignments.",
                college_id="college-a",
                status="sold",
                quantity_available=0,
            ),
            make_listing(
                "out-of-stock",
                title="Out of Stock Laptop",
                description="Laptop for coding and assignments.",
                college_id="college-a",
                quantity_available=0,
            ),
            make_listing(
                "other-college-laptop",
                title="Other College Laptop",
                description="Laptop for coding and assignments.",
                college_id="college-b",
            ),
        ],
    )
    retriever = ListingRetriever(store, fake_embeddings, candidate_k=10)

    outcome = retriever.retrieve(
        QueryPlan(query="laptop for coding"),
        college_id="college-a",
    )

    assert [result.listing_id for result in outcome.results] == ["macbook"]
    assert outcome.where == {
        "$and": [
            {"status": {"$eq": "available"}},
            {"quantity_available": {"$gt": 0}},
            {"college_id": {"$eq": "college-a"}},
        ]
    }


def test_retrieval_uses_hyde_without_duplicates(
    tmp_path: Path,
    fake_embeddings: FakeEmbeddings,
) -> None:
    store = _index(
        tmp_path,
        fake_embeddings,
        [
            make_listing(
                "macbook",
                title="MacBook Air Laptop",
                description="Laptop for coding and class assignments.",
            ),
            make_listing(
                "cycle",
                title="Hero Sprint Cycle",
                description="Hybrid cycle for commuting to class.",
            ),
        ],
    )
    retriever = ListingRetriever(store, fake_embeddings, candidate_k=10)

    outcome = retriever.retrieve(
        QueryPlan(
            query="laptop",
            hypothetical_listing="A used laptop for coding and class assignments.",
        )
    )

    ids = [result.listing_id for result in outcome.results]
    assert outcome.query_count == 2
    assert len(ids) == len(set(ids))
    assert "macbook" in ids
