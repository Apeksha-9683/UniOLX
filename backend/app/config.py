from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BackendSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = Field(..., min_length=1, validation_alias="DATABASE_URL")
    jwt_secret: str = Field(default="change-this-development-secret", validation_alias="UNIOLX_JWT_SECRET")
    jwt_expiry_minutes: int = Field(default=60 * 24, ge=5, le=60 * 24 * 30)
    cors_origins: str = Field(
        default=(
            "http://localhost:3000,http://localhost:3001,http://localhost:3002,"
            "http://localhost:3003,http://localhost:5173"
        )
    )
    rag_data_path: Path = Field(default=Path("data/listings.json"), validation_alias="RAGOLX_DATA_PATH")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> BackendSettings:
    return BackendSettings()
