from typing import Any, TypedDict

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import END, START, StateGraph

from backend.ragolx.config import Settings
from backend.ragolx.generator import AnswerGenerator
from backend.ragolx.models import QueryPlan, RAGResponse, RetrievedListing
from backend.ragolx.planner import QueryPlanner
from backend.ragolx.providers import build_chat_model, build_embeddings
from backend.ragolx.reranker import CrossEncoderReranker, Reranker
from backend.ragolx.retriever import ListingRetriever
from backend.ragolx.store import ChromaListingStore


class RAGState(TypedDict, total=False):
    question: str
    college_id: str | None
    plan: QueryPlan
    candidates: list[RetrievedListing]
    results: list[RetrievedListing]
    where: dict[str, Any]
    answer: str
    reranked: bool


EMPTY_INDEX_ANSWER = (
    "The listing index is empty. Run `ragolx ingest --data data/listings.json` first."
)
NO_MATCH_ANSWER = "No available listings matched that request. Try a broader description."


class MarketplaceRAG:
    def __init__(
        self,
        *,
        chat_model: BaseChatModel,
        embeddings: Embeddings,
        store: ChromaListingStore,
        top_k: int = 5,
        candidate_k: int = 50,
        use_hyde: bool = False,
        generate_answer: bool = True,
        reranker: Reranker | None = None,
    ) -> None:
        self._store = store
        self._embeddings = embeddings
        self._top_k = top_k
        self._planner = QueryPlanner(chat_model, use_hyde=use_hyde)
        self._generator = AnswerGenerator(chat_model) if generate_answer else None
        self._retriever = ListingRetriever(
            store,
            embeddings,
            candidate_k=max(candidate_k, top_k),
        )
        self._reranker = reranker
        self._graph = self._build_graph()

    @classmethod
    def from_settings(cls, settings: Settings) -> "MarketplaceRAG":
        store = ChromaListingStore(settings.chroma_path, settings.chroma_collection)
        reranker = CrossEncoderReranker(settings.rerank_model) if settings.rerank_enabled else None
        return cls(
            chat_model=build_chat_model(settings),
            embeddings=build_embeddings(settings),
            store=store,
            top_k=settings.top_k,
            candidate_k=settings.candidate_k,
            use_hyde=settings.use_hyde,
            generate_answer=settings.generate_answer,
            reranker=reranker,
        )

    def _build_graph(self) -> Any:
        builder = StateGraph(RAGState)
        builder.add_node("plan", self._plan_node)
        builder.add_node("retrieve", self._retrieve_node)
        builder.add_node("rerank", self._rerank_node)
        builder.add_node("generate", self._generate_node)
        builder.add_node("no_results", self._no_results_node)
        builder.add_edge(START, "plan")
        builder.add_edge("plan", "retrieve")
        builder.add_edge("retrieve", "rerank")
        builder.add_conditional_edges(
            "rerank",
            self._route_after_rerank,
            {
                "generate": "generate",
                "no_results": "no_results",
            },
        )
        builder.add_edge("generate", END)
        builder.add_edge("no_results", END)
        return builder.compile()

    def _plan_node(self, state: RAGState) -> dict[str, Any]:
        return {"plan": self._planner.plan(state["question"])}

    def _retrieve_node(self, state: RAGState) -> dict[str, Any]:
        outcome = self._retriever.retrieve(
            state["plan"],
            college_id=state.get("college_id"),
        )
        return {"candidates": outcome.results, "where": outcome.where}

    def _rerank_node(self, state: RAGState) -> dict[str, Any]:
        candidates = state.get("candidates", [])
        if not candidates:
            return {"results": [], "reranked": False}
        if self._reranker is None:
            return {"results": candidates[: self._top_k], "reranked": False}
        return {
            "results": self._reranker.rerank(
                state["question"],
                candidates,
                top_k=self._top_k,
            ),
            "reranked": True,
        }

    @staticmethod
    def _route_after_rerank(state: RAGState) -> str:
        return "generate" if state.get("results") else "no_results"

    def _generate_node(self, state: RAGState) -> dict[str, Any]:
        results = state.get("results", [])
        if self._generator is None:
            return {"answer": f"Found {len(results)} matching listing(s)."}
        return {
            "answer": self._generator.generate(state["question"], results),
        }

    @staticmethod
    def _no_results_node(state: RAGState) -> dict[str, Any]:
        return {"answer": NO_MATCH_ANSWER}

    def query(self, question: str, *, college_id: str | None = None) -> RAGResponse:
        cleaned = question.strip()
        if not cleaned:
            raise ValueError("Question must not be empty.")

        if self._store.count() == 0:
            return RAGResponse(
                answer=EMPTY_INDEX_ANSWER,
                plan=QueryPlan(query=cleaned),
            )

        state = self._graph.invoke(
            {
                "question": cleaned,
                "college_id": college_id,
            }
        )
        return RAGResponse(
            answer=state["answer"],
            plan=state["plan"],
            results=state.get("results", []),
            where=state.get("where"),
            reranked=state.get("reranked", False),
        )

    def document_count(self) -> int:
        return self._store.count()

    def close(self) -> None:
        close = getattr(self._embeddings, "close", None)
        if callable(close):
            close()
