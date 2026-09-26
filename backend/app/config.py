import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_backend_env = Path(__file__).resolve().parent.parent / ".env"
_root_env = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/docusphere"
    openai_api_key: str = ""
    openrouter_api_key: str = ""
    openrouter_model: str = "nex-agi/nex-n2.5-mini:free"
    gemini_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    top_k: int = 8
    cors_origins: str = "http://localhost:3000"
    max_upload_mb: int = 20

    model_config = SettingsConfigDict(
        env_file=(".env", str(_backend_env), str(_root_env)),
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def clean_database_url(self) -> str:
        url = (self.database_url or "").strip().strip("'\"")
        # Ensure psycopg 3 driver prefix for SQLAlchemy
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)

        # Enforce SSL requirement for Neon serverless postgres
        if "neon.tech" in url and "sslmode" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}sslmode=require"

        return url


settings = Settings()

