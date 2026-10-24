from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    openrouter_api_key: SecretStr = Field(validation_alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias="OPENROUTER_BASE_URL",
    )
    openrouter_site_url: str = Field(
        default="http://localhost:3000",
        validation_alias="OPENROUTER_SITE_URL",
    )
    app_name: str = "Ragolx"

    chat_model: str = Field(
        default="google/gemini-2.5-flash",
        validation_alias="RAGOLX_CHAT_MODEL",
    )
    embedding_model: str = Field(
        default="google/gemini-embedding-001",
        validation_alias="RAGOLX_EMBEDDING_MODEL",
    )
    embedding_dimensions: int = Field(
        default=1536,
        ge=1,
        validation_alias="RAGOLX_EMBEDDING_DIMENSIONS",
    )
    embedding_batch_size: int = Field(
        default=32,
        ge=1,
        le=128,
        validation_alias="RAGOLX_EMBEDDING_BATCH_SIZE",
    )
    temperature: float = Field(
        default=0.0,
        ge=0,
        le=2,
        validation_alias="RAGOLX_TEMPERATURE",
    )

    chroma_path: Path = Field(
        default=Path("chroma_db"),
        validation_alias="RAGOLX_CHROMA_PATH",
    )
    chroma_collection: str = Field(
        default="listings",
        validation_alias="RAGOLX_CHROMA_COLLECTION",
    )
    top_k: int = Field(default=5, ge=1, le=50, validation_alias="RAGOLX_TOP_K")
    candidate_k: int = Field(
        default=50,
        ge=1,
        le=200,
        validation_alias="RAGOLX_CANDIDATE_K",
    )

    use_hyde: bool = Field(default=False, validation_alias="RAGOLX_USE_HYDE")
    generate_answer: bool = Field(default=True, validation_alias="RAGOLX_GENERATE_ANSWER")
    rerank_enabled: bool = Field(default=True, validation_alias="RAGOLX_RERANK_ENABLED")
    rerank_model: str = Field(
        default="Xenova/ms-marco-MiniLM-L-6-v2",
        validation_alias="RAGOLX_RERANK_MODEL",
    )

    @property
    def catalog_path(self) -> Path:
        return self.chroma_path / "catalog.json"
