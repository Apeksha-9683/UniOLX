from pathlib import Path

from conftest import FakeEmbeddings, FakeReranker, ScriptedChatModel, make_listing

from backend.ragolx.graph import EMPTY_INDEX_ANSWER, NO_MATCH_ANSWER, MarketplaceRAG
from backend.ragolx.indexer import ListingIndexer
from backend.ragolx.models import RetrievedListing
from backend.ragolx.store import ChromaListingStore


class EmptyReranker:
    def rerank(
        self,
        query: str,
        results: list[RetrievedListing],
        *,
        top_k: int,
    ) -> list[RetrievedListing]:
        return []


def _build_rag(
    tmp_path: Path,
    chat_model: ScriptedChatModel,
    *,
    top_k: int = 3,
    candidate_k: int = 3,
    use_hyde: bool = False,
    generate_answer: bool = True,
    reranker: FakeReranker | EmptyReranker | None = None,
) -> MarketplaceRAG:
    embeddings = FakeEmbeddings()
    store = ChromaListingStore(tmp_path / "chroma", "listings")
    indexer = ListingIndexer(store, embeddings, tmp_path / "catalog.json")
    indexer.ingest(
        [
            make_listing(
                "macbook",
                title="MacBook Air M1 Laptop",
                category="Laptops",
                description="Laptop for coding, class assignments, and projects.",
                price=42000,
            ),
            make_listing(
                "thinkpad",
                title="ThinkPad T480 Laptop",
                category="Laptops",
                description="Durable laptop for coding and note taking.",
                price=22000,
            ),
            make_listing(
                "cycle",
                title="Hero Sprint Cycle",
                category="Cycles",
                description="21 speed hybrid cycle for commuting to class.",
                price=6500,
            ),
        ]
    )
    return MarketplaceRAG(
        chat_model=chat_model,
        embeddings=embeddings,
        store=store,
        top_k=top_k,
        candidate_k=candidate_k,
        use_hyde=use_hyde,
        generate_answer=generate_answer,
        reranker=reranker,
    )


def test_query_filters_reranks_and_generates(tmp_path: Path) -> None:
    chat_model = ScriptedChatModel(
        responses=["The MacBook Air is the best fit because it is a laptop built for coding."]
    )
    rag = _build_rag(
        tmp_path,
        chat_model,
        top_k=2,
        reranker=FakeReranker(["macbook", "thinkpad", "cycle"]),
    )

    response = rag.query("I need something for coding classes", college_id="college-a")

    assert len(chat_model.calls) == 1
    assert response.plan.query == "I need something for coding classes"
    assert response.plan.hypothetical_listing is None
    assert response.reranked is True
    assert [result.listing_id for result in response.results] == ["macbook", "thinkpad"]
    assert all(result.rerank_score is not None for result in response.results)
    assert response.where == {
        "$and": [
            {"status": {"$eq": "available"}},
            {"quantity_available": {"$gt": 0}},
            {"college_id": {"$eq": "college-a"}},
        ]
    }
    assert "MacBook" in response.answer


def test_query_with_hyde_adds_a_planner_call(tmp_path: Path) -> None:
    hyde = "A used MacBook Air laptop with 8GB RAM for coding and class assignments."
    chat_model = ScriptedChatModel(responses=[hyde, "The MacBook Air is the best fit."])
    rag = _build_rag(
        tmp_path,
        chat_model,
        use_hyde=True,
        reranker=FakeReranker(),
    )

    response = rag.query("I need something for coding classes")

    assert len(chat_model.calls) == 2
    assert "hypothetical marketplace listing" in chat_model.calls[0]
    assert response.plan.hypothetical_listing == hyde
    assert response.results


def test_query_can_skip_the_generation_call(tmp_path: Path) -> None:
    chat_model = ScriptedChatModel(responses=["unused"])
    rag = _build_rag(
        tmp_path,
        chat_model,
        top_k=1,
        generate_answer=False,
        reranker=FakeReranker(["cycle"]),
    )

    response = rag.query("cycle for commuting")

    assert chat_model.calls == []
    assert response.answer == "Found 1 matching listing(s)."
    assert response.results[0].listing_id == "cycle"


def test_query_without_reranker_uses_similarity_order(tmp_path: Path) -> None:
    chat_model = ScriptedChatModel(responses=["Closest laptop matches."])
    rag = _build_rag(tmp_path, chat_model, top_k=2)

    response = rag.query("coding laptop")

    assert response.reranked is False
    assert len(response.results) == 2
    assert all(result.rerank_score is None for result in response.results)


def test_query_reports_no_matches_after_rerank(tmp_path: Path) -> None:
    chat_model = ScriptedChatModel(responses=["unused"])
    rag = _build_rag(tmp_path, chat_model, reranker=EmptyReranker())

    response = rag.query("coding laptop")

    assert response.answer == NO_MATCH_ANSWER
    assert response.results == []


def test_empty_index_returns_ingest_hint_without_llm_call(
    tmp_path: Path,
    fake_embeddings: FakeEmbeddings,
) -> None:
    chat_model = ScriptedChatModel(responses=["unused"])
    store = ChromaListingStore(tmp_path / "chroma", "listings")
    rag = MarketplaceRAG(
        chat_model=chat_model,
        embeddings=fake_embeddings,
        store=store,
    )

    response = rag.query("a laptop")

    assert response.answer == EMPTY_INDEX_ANSWER
    assert response.results == []
    assert chat_model.calls == []
