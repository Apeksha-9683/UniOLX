from functools import lru_cache
from typing import Any

from ragolx.config import Settings
from ragolx.graph import MarketplaceRAG
from ragolx.indexer import ListingIndexer, load_listings
from ragolx.models import Listing
from ragolx.providers import build_embeddings
from ragolx.store import ChromaListingStore

from backend.app.config import get_settings
from backend.app.db import Database
from backend.app.serializers import frontend_listing


class RAGService:
    def __init__(self) -> None:
        backend_settings = get_settings()
        self.settings = Settings()
        self.backend_settings = backend_settings
        self.rag = MarketplaceRAG.from_settings(self.settings)

    def close(self) -> None:
        self.rag.close()

    def ingest(self) -> int:
        listings = load_listings(self.backend_settings.rag_data_path)
        embeddings = build_embeddings(self.settings)
        try:
            report = ListingIndexer(
                ChromaListingStore(self.settings.chroma_path, self.settings.chroma_collection),
                embeddings,
                self.settings.catalog_path,
            ).ingest(listings, prune=True)
        finally:
            close = getattr(embeddings, "close", None)
            if callable(close):
                close()
        return report.total

    def query(self, question: str, college_id: str | None) -> dict[str, Any]:
        response = self.rag.query(question, college_id=college_id)
        database = Database(self.backend_settings.database_path)
        result_rows: list[dict[str, Any]] = []
        with database.connection() as connection:
            for result in response.results:
                row = connection.execute(
                    "SELECT * FROM listings WHERE id = ?", (result.listing_id,)
                ).fetchone()
                if row is not None:
                    result_rows.append(
                        {
                            "listing": frontend_listing(row, database),
                            "matchScore": round(
                                max(result.rerank_score or result.similarity or 0.0, 0.0) * 100,
                                1,
                            ),
                            "matchReasons": [f"Semantic match: {result.title}"],
                            "unmatchedReasons": [],
                        }
                    )
        return {
            "query": question,
            "summary": response.answer,
            "parsedCriteria": [],
            "results": result_rows,
            "closeMatches": [],
            "alternativeSuggestions": [],
        }


@lru_cache
def get_rag_service() -> RAGService:
    return RAGService()
