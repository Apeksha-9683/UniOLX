import json

import httpx
import pytest

from backend.ragolx.embeddings import OpenRouterEmbeddings


def test_embedding_adapter_sends_task_types_and_batches() -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        requests.append(payload)
        texts = payload["input"]
        data = [
            {
                "object": "embedding",
                "index": index,
                "embedding": [float(index + 1), 0.5, 0.25],
            }
            for index in reversed(range(len(texts)))
        ]
        return httpx.Response(200, json={"object": "list", "data": data})

    client = httpx.Client(
        base_url="https://openrouter.ai/api/v1",
        transport=httpx.MockTransport(handler),
    )
    embeddings = OpenRouterEmbeddings(
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
        model="google/gemini-embedding-001",
        dimensions=3,
        batch_size=2,
        client=client,
    )

    documents = embeddings.embed_documents(["one", "two", "three"])
    query = embeddings.embed_query("find a laptop")

    assert len(documents) == 3
    assert documents[0] == [1.0, 0.5, 0.25]
    assert documents[1] == [2.0, 0.5, 0.25]
    assert query == [1.0, 0.5, 0.25]
    assert [request["input_type"] for request in requests] == [
        "search_document",
        "search_document",
        "search_query",
    ]
    assert all(request["dimensions"] == 3 for request in requests)


def test_embedding_adapter_rejects_wrong_dimensions() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"data": [{"object": "embedding", "index": 0, "embedding": [1.0, 2.0]}]},
        )

    client = httpx.Client(
        base_url="https://openrouter.ai/api/v1",
        transport=httpx.MockTransport(handler),
    )
    embeddings = OpenRouterEmbeddings(
        api_key="test-key",
        base_url="https://openrouter.ai/api/v1",
        model="google/gemini-embedding-001",
        dimensions=3,
        client=client,
    )

    with pytest.raises(RuntimeError, match="dimensions"):
        embeddings.embed_query("hello")
