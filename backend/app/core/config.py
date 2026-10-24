from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "UniOLX API"
    environment: str = "development"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://uniolx:uniolx@localhost:5432/uniolx"
    db_echo: bool = False

    jwt_secret: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    pin_secret: str = "dev-only-change-me"
    pin_ttl_minutes: int = 15
    pin_max_attempts: int = 5

    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60

    email_provider: str = "resend"
    email_api_key: str = ""
    email_from: str = "UniOLX <no-reply@uniolx.app>"

    gemini_api_key: str = ""
    # gemini-2.5-flash and text-embedding-004 are retired for new API keys.
    llm_model: str = "gemini-3.5-flash"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768
    gemini_timeout_seconds: int = 20

    rerank_enabled: bool = True
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    candidate_k: int = 50
    rerank_timeout_seconds: int = 30
    use_hyde: bool = False
    generate_answer: bool = True

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]

    uploads_dir: str = "uploads"
    max_upload_bytes: int = 5 * 1024 * 1024

    seed_demo_data: bool = True
    # Sends a rule-based reply in the chat so the demo is not silent.
    demo_auto_reply: bool = True

    @property
    def dev_mode(self) -> bool:
        return self.environment != "production" and self.debug


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
