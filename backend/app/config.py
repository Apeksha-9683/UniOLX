"""
config.py
---------
Reads all settings from environment variables (loaded from a .env file).
Never put real passwords or database URLs directly in this file.
Put them in your .env file only (which is never committed to git).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All settings come from environment variables.
    If a required variable is missing, the app will refuse to start.
    """

    # --- Database ---
    # Full PostgreSQL connection string.
    # Format: postgresql+psycopg2://user:password@host:5432/dbname
    # For Supabase, find this in: Project Settings > Database > Connection string
    DATABASE_URL: str

    # --- App ---
    # Set to "development" while coding, "production" when deployed.
    APP_ENV: str = "development"

    # Secret key for signing tokens in the future.
    # Generate a safe one with:
    #   python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str

    # --- CORS ---
    # Which browser addresses are allowed to call this API.
    # "http://localhost:5173" is where your Vite/React frontend runs locally.
    CORS_ORIGINS: str = "http://localhost:5173"

    # Pydantic automatically reads from a .env file in the current directory
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Silently ignore extra keys (e.g. frontend-only vars)
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Converts the comma-separated CORS_ORIGINS string into a Python list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# Single shared instance — import this everywhere instead of creating new ones
settings = Settings()
