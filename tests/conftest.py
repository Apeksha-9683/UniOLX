import hashlib
import math
import re
from collections.abc import Sequence
from typing import Any

import pytest
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

from ragolx.models import Listing, RetrievedListing

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "with",
}


class FakeEmbeddings(Embeddings):
    def __init__(self, dimensions: int = 64) -> None:
        self._dimensions = dimensions

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self._dimensions
        for token in re.findall(r"[a-z0-9]+", text.casefold()):
            if token in STOPWORDS:
                continue
            digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
            vector[int.from_bytes(digest[:4], "big") % self._dimensions] += 1.0
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            vector[0] = 1.0
            return vector
        return [value / norm for value in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


class ScriptedChatModel(BaseChatModel):
    responses: list[str]
    calls: list[str] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = "\n".join(str(message.content) for message in messages)
        self.calls.append(prompt)
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=self.responses[index]))]
        )


class FakeReranker:
    def __init__(self, order: list[str] | None = None) -> None:
        self._order = order

    def rerank(
        self,
        query: str,
        results: Sequence[RetrievedListing],
        *,
        top_k: int,
    ) -> list[RetrievedListing]:
        ordered = list(results)
        if self._order is None:
            ordered.sort(key=lambda item: (-(item.similarity or 0.0), item.listing_id))
        else:
            rank = {listing_id: index for index, listing_id in enumerate(self._order)}
            ordered.sort(key=lambda item: (rank.get(item.listing_id, len(rank)), item.listing_id))
        scored = [
            result.model_copy(update={"rerank_score": float(len(ordered) - index)})
            for index, result in enumerate(ordered)
        ]
        return scored[:top_k]


@pytest.fixture
def fake_embeddings() -> FakeEmbeddings:
    return FakeEmbeddings()


def make_listing(
    listing_id: str,
    *,
    title: str = "Test listing",
    category: str = "Laptops",
    description: str = "A useful item in good condition.",
    price: int = 1000,
    condition: str = "good",
    college_id: str = "college-a",
    status: str = "available",
    quantity_available: int = 1,
    specs: dict[str, Any] | None = None,
) -> Listing:
    return Listing(
        id=listing_id,
        seller_id="seller-a",
        college_id=college_id,
        title=title,
        category=category,
        description=description,
        price=price,
        condition=condition,
        specs=specs or {},
        pickup_location="Hostel gate",
        quantity_total=max(quantity_available, 1),
        quantity_available=quantity_available,
        status=status,
    )
