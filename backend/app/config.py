"""Application settings for the Epic 7 reliability backend."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "TransitReach Reliability API"
    app_version: str = "0.1.0"
    environment: str = "development"
    api_prefix: str = "/api"
    # Seconds; used later when realtime adjustment is implemented (AC 7.2.4).
    realtime_freshness_seconds: int = 180
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
