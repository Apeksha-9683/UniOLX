import json
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from langchain_core.embeddings import Embeddings
from pydantic import ValidationError

from ragolx.models import Catalog, Listing
from ragolx.store import ChromaListingStore, Metadata, VectorRecord


@dataclass(frozen=True)
class IngestReport:
    indexed: int
    pruned: int
    total: int
    catalog: Catalog


def load_listings(path: Path) -> list[Listing]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    items = raw.get("listings") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise ValueError(f"{path} must contain a JSON array or an object with a 'listings' array")
    return [Listing.model_validate(item) for item in items]


def listing_document(listing: Listing) -> str:
    description = " ".join(listing.description.split())
    return f"Title: {listing.title.strip()}\nDescription: {description}"


def listing_metadata(listing: Listing) -> Metadata:
    metadata: Metadata = {
        "listing_id": listing.id,
        "title": listing.title,
        "category": listing.category,
        "price": int(listing.price),
        "condition": listing.condition,
        "college_id": listing.college_id,
        "seller_id": listing.seller_id,
        "status": listing.status,
        "quantity_total": int(listing.quantity_total),
        "quantity_available": int(listing.quantity_available),
        "pickup_location": listing.pickup_location or "",
    }
    if listing.created_at is not None:
        metadata["created_at"] = listing.created_at.isoformat()
    return metadata


def read_catalog(path: Path) -> Catalog:
    if not path.exists():
        return Catalog()
    try:
        return Catalog.model_validate_json(path.read_text(encoding="utf-8"))
    except (ValidationError, OSError, ValueError):
        return Catalog()


class ListingIndexer:
    def __init__(
        self,
        store: ChromaListingStore,
        embeddings: Embeddings,
        catalog_path: Path,
    ) -> None:
        self._store = store
        self._embeddings = embeddings
        self._catalog_path = catalog_path

    def ingest(
        self,
        listings: list[Listing],
        *,
        prune: bool = False,
        reset: bool = False,
    ) -> IngestReport:
        by_id: dict[str, Listing] = {}
        for listing in listings:
            if listing.id in by_id:
                raise ValueError(f"Duplicate listing id: {listing.id}")
            by_id[listing.id] = listing

        documents = [listing_document(listing) for listing in listings]
        vectors = self._embeddings.embed_documents(documents) if documents else []
        records = [
            VectorRecord(
                id=listing.id,
                embedding=vector,
                document=document,
                metadata=listing_metadata(listing),
            )
            for listing, document, vector in zip(listings, documents, vectors, strict=True)
        ]

        existing_ids: set[str] = set()
        if reset:
            self._store.reset()
        elif prune:
            existing_ids = set(self._store.ids())

        try:
            self._store.upsert(records)
        except Exception as exc:
            message = str(exc).lower()
            if "dimension" in message:
                raise RuntimeError(
                    "The index was built with different embedding dimensions. "
                    "Re-run ingest with --reset after changing "
                    "RAGOLX_EMBEDDING_DIMENSIONS."
                ) from exc
            raise

        stale_ids = sorted(existing_ids - set(by_id))
        self._store.delete(stale_ids)

        catalog = self._build_catalog()
        self._catalog_path.parent.mkdir(parents=True, exist_ok=True)
        self._catalog_path.write_text(catalog.model_dump_json(indent=2), encoding="utf-8")

        return IngestReport(
            indexed=len(records),
            pruned=len(stale_ids),
            total=catalog.listing_count,
            catalog=catalog,
        )

    def _build_catalog(self) -> Catalog:
        metadatas = self._store.all_metadata()
        college_ids = sorted(
            {cast(str, item["college_id"]) for item in metadatas if item.get("college_id")}
        )
        return Catalog(
            college_ids=college_ids,
            listing_count=self._store.count(),
        )
