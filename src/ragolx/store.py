from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb

Metadata = dict[str, str | int | float | bool]


@dataclass(frozen=True)
class VectorRecord:
    id: str
    embedding: list[float]
    document: str
    metadata: Metadata


@dataclass(frozen=True)
class SearchHit:
    id: str
    document: str
    metadata: Metadata
    distance: float | None


class ChromaListingStore:
    def __init__(self, path: Path, collection_name: str) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self._collection_name = collection_name
        self._client = chromadb.PersistentClient(path=str(path))
        self._collection = self._get_or_create_collection()

    def _get_or_create_collection(self) -> Any:
        return self._client.get_or_create_collection(
            name=self._collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def count(self) -> int:
        return int(self._collection.count())

    def upsert(self, records: list[VectorRecord]) -> None:
        if not records:
            return
        self._collection.upsert(
            ids=[record.id for record in records],
            embeddings=[record.embedding for record in records],
            documents=[record.document for record in records],
            metadatas=[record.metadata for record in records],
        )

    def query(
        self,
        embedding: list[float],
        *,
        k: int,
        where: dict[str, Any] | None = None,
    ) -> list[SearchHit]:
        if k <= 0 or self.count() == 0:
            return []

        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        hits: list[SearchHit] = []
        for index, listing_id in enumerate(ids):
            metadata = metadatas[index] or {}
            distance = distances[index] if index < len(distances) else None
            hits.append(
                SearchHit(
                    id=str(listing_id),
                    document=str(documents[index]) if index < len(documents) else "",
                    metadata=dict(metadata),
                    distance=float(distance) if distance is not None else None,
                )
            )
        return hits

    def ids(self) -> list[str]:
        result = self._collection.get(include=[])
        return [str(item) for item in result.get("ids", [])]

    def all_metadata(self) -> list[Metadata]:
        result = self._collection.get(include=["metadatas"])
        return [dict(item) for item in result.get("metadatas", []) if item]

    def delete(self, ids: list[str]) -> None:
        if ids:
            self._collection.delete(ids=ids)

    def reset(self) -> None:
        self._client.delete_collection(self._collection_name)
        self._collection = self._get_or_create_collection()
