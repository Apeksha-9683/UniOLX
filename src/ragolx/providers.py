from langchain_openai import ChatOpenAI

from ragolx.config import Settings
from ragolx.embeddings import OpenRouterEmbeddings


def build_embeddings(settings: Settings) -> OpenRouterEmbeddings:
    return OpenRouterEmbeddings(
        api_key=settings.openrouter_api_key.get_secret_value(),
        base_url=settings.openrouter_base_url,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
        batch_size=settings.embedding_batch_size,
        site_url=settings.openrouter_site_url,
        app_name=settings.app_name,
    )


def build_chat_model(settings: Settings) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.chat_model,
        api_key=settings.openrouter_api_key.get_secret_value(),
        base_url=settings.openrouter_base_url,
        temperature=settings.temperature,
        max_retries=3,
        timeout=60,
        use_responses_api=False,
        default_headers={
            "HTTP-Referer": settings.openrouter_site_url,
            "X-Title": settings.app_name,
        },
    )
