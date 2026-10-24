"""Cross-encoder rerank wiring: fake encoder, no ONNX model download."""

import pytest

from app.core.config import settings
from app.services import gemini, rag, reranker
from tests.conftest import auth_headers
from tests.test_search import make_listing


class FakeEncoder:
    """Scores any document mentioning a lamp highly, everything else badly."""

    def __init__(self):
        self.calls = 0

    def rerank(self, query, documents, batch_size=32):
        self.calls += 1
        return [5.0 if "lamp" in doc.lower() else -5.0 for doc in documents]


class BrokenEncoder:
    def rerank(self, query, documents, batch_size=32):
        raise RuntimeError("model exploded")


@pytest.fixture
def fake_encoder(monkeypatch):
    encoder = FakeEncoder()
    monkeypatch.setattr(reranker, "_encoder", encoder, raising=False)
    monkeypatch.setattr(reranker, "_disabled", False, raising=False)
    monkeypatch.setattr(settings, "rerank_enabled", True)
    return encoder


def _search_payload():
    # An inert criterion keeps the local parser out of the way so both
    # listings stay in the result bucket and only rerank decides order.
    return {
        "query": "lamp",
        "criteriaOverrides": [
            {
                "id": "crit_brand",
                "label": "Brand",
                "key": "brand",
                "value": "Any",
                "displayValue": "Any",
            }
        ],
    }


async def test_rerank_reorders_and_boosts_results(
    client, buyer, seller, db, fake_encoder
):
    await make_listing(db, seller, "Cozy study mattress", 3000)
    await make_listing(db, seller, "Rechargeable desk lamp", 900)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (await client.post("/api/search/ai", headers=headers, json=_search_payload())).json()

    assert fake_encoder.calls == 1
    titles = [entry["listing"]["title"] for entry in body["results"]]
    assert titles == ["Rechargeable desk lamp", "Cozy study mattress"]
    scores = [entry["matchScore"] for entry in body["results"]]
    assert scores[0] > scores[1]
    assert body["results"][0]["matchReasons"]
    assert 1 <= scores[1] <= 99


async def test_rerank_disabled_keeps_stage_one_behaviour(
    client, buyer, seller, db, monkeypatch
):
    encoder = FakeEncoder()
    monkeypatch.setattr(reranker, "_encoder", encoder, raising=False)
    monkeypatch.setattr(reranker, "_disabled", False, raising=False)
    monkeypatch.setattr(settings, "rerank_enabled", False)

    await make_listing(db, seller, "Cozy study mattress", 3000)
    await make_listing(db, seller, "Rechargeable desk lamp", 900)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    body = (await client.post("/api/search/ai", headers=headers, json=_search_payload())).json()

    assert encoder.calls == 0
    assert len(body["results"]) == 2
    assert body["summary"]


async def test_search_survives_a_broken_reranker(
    client, buyer, seller, db, monkeypatch
):
    monkeypatch.setattr(reranker, "_encoder", BrokenEncoder(), raising=False)
    monkeypatch.setattr(reranker, "_disabled", False, raising=False)
    monkeypatch.setattr(settings, "rerank_enabled", True)

    await make_listing(db, seller, "Rechargeable desk lamp", 900)

    headers = await auth_headers(client, "buyer@rvce.edu.in")
    response = await client.post("/api/search/ai", headers=headers, json=_search_payload())

    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["matchScore"] >= 1


async def test_rerank_documents_returns_normalised_scores(monkeypatch):
    monkeypatch.setattr(reranker, "_encoder", FakeEncoder(), raising=False)
    monkeypatch.setattr(reranker, "_disabled", False, raising=False)
    monkeypatch.setattr(settings, "rerank_enabled", True)

    scores = await reranker.rerank_documents(
        "lamp", ["desk lamp for hostel", "old mattress"]
    )

    assert scores is not None
    assert all(0.0 < score < 1.0 for score in scores)
    assert scores[0] > scores[1]


async def test_rerank_documents_is_skipped_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "rerank_enabled", False)
    assert await reranker.rerank_documents("lamp", ["desk lamp"]) is None


async def test_hyde_is_off_by_default(monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("HyDE must not call the LLM while disabled")

    monkeypatch.setattr(gemini, "generate_text", boom)
    monkeypatch.setattr(settings, "use_hyde", False)
    assert await rag.hyde_vector("laptop under 25000") is None


async def test_summarise_is_skipped_when_disabled(monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("summary must not call the LLM while disabled")

    monkeypatch.setattr(gemini, "generate_text", boom)
    monkeypatch.setattr(settings, "generate_answer", False)

    headers_free_entries = []
    assert await rag.summarise("query", headers_free_entries) is None
