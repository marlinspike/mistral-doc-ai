from __future__ import annotations

from pathlib import Path
from typing import List, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    azure_ocr_endpoint: str
    azure_api_key: str
    mistral_model: str = "mistral-document-ai-2505"
    max_file_size_mb: int = 5
    max_files: int = 10
    max_concurrency: int = 3
    request_timeout_s: int = 60
    cors_origins: str = "http://localhost:5173"
    auth_header_style: Literal["both", "bearer", "api-key"] = "both"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def max_file_size_bytes(self) -> int:
        """Max file size in bytes."""
        return self.max_file_size_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> List[str]:
        """CORS origins parsed into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
