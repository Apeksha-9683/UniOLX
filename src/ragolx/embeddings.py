import time

import httpx
from langchain_core.embeddings import Embeddings


def _batched(items: list[str], size: int) -> list[list[str]]:
    return [items[start : start + size] for start in range(0, len(items), size)]


class OpenRouterEmbeddings(Embeddings):
    """Task-aware embeddings through OpenRouter's OpenAI-compatible endpoint.

    Gemini embeddings are asymmetric: documents and queries should use different
    input types. OpenRouter exposes this as `input_type`, which the generic
    OpenAI embedding client does not send.
    """

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        dimensions: int,
        batch_size: int = 32,
        site_url: str = "http://localhost",
        app_name: str = "Ragolx",
        timeout: float = 60.0,
        max_retries: int = 3,
        client: httpx.Client | None = None,
    ) -> None:
        self._model = model
        self._dimensions = dimensions
        self._batch_size = batch_size
        self._max_retries = max_retries
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": site_url,
            "X-Title": app_name,
        }
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout)

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for batch in _batched(texts, self._batch_size):
            vectors.extend(self._embed(batch, input_type="search_document"))
        return vectors

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for batch in _batched(texts, self._batch_size):
            vectors.extend(self._embed(batch, input_type="search_query"))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self.embed_queries([text])[0]

    def _embed(self, texts: list[str], *, input_type: str) -> list[list[float]]:
        payload = {
            "model": self._model,
            "input": texts,
            "dimensions": self._dimensions,
            "encoding_format": "float",
            "input_type": input_type,
        }
        response = self._post(payload)
        body = response.json()
        data = body.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise RuntimeError(f"Unexpected embeddings response: {body!r}")

        ordered = sorted(data, key=lambda item: item.get("index", 0))
        vectors = [item["embedding"] for item in ordered]
        for vector in vectors:
            if len(vector) != self._dimensions:
                raise RuntimeError(
                    f"Embedding model returned {len(vector)} dimensions, "
                    f"expected {self._dimensions}. Update "
                    "RAGOLX_EMBEDDING_DIMENSIONS and rebuild the index."
                )
        return vectors

    def _post(self, payload: dict[str, object]) -> httpx.Response:
        for attempt in range(self._max_retries + 1):
            try:
                response = self._client.post(
                    "/embeddings",
                    json=payload,
                    headers=self._headers,
                )
            except httpx.TransportError:
                if attempt == self._max_retries:
                    raise
                time.sleep(1.5**attempt)
                continue

            if (
                response.status_code == 429 or response.status_code >= 500
            ) and attempt < self._max_retries:
                time.sleep(1.5**attempt)
                continue
            if response.is_error:
                raise RuntimeError(
                    f"OpenRouter embeddings request failed with "
                    f"{response.status_code}: {response.text}"
                )
            return response

        raise RuntimeError("OpenRouter embeddings request failed after retries")

    def close(self) -> None:
        self._client.close()
