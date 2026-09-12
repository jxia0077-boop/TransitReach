"""Application settings for the Epic 7 reliability backend."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _repo_root() -> Path:
    # backend/app/config.py → repo root
    return Path(__file__).resolve().parents[2]


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

    # Derived rail catalog (default: committed frontend data).
    rail_feeds_path: str = ""
    rail_stops_path: str = ""
    # Optional raw GTFS Static directory or ZIP. Empty → use derived JSON.
    gtfs_static_path: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def resolved_rail_feeds_path(self) -> Path:
        if self.rail_feeds_path:
            return Path(self.rail_feeds_path).expanduser().resolve()
        return _repo_root() / "src" / "shared" / "data" / "rail" / "feeds.json"

    def resolved_rail_stops_path(self) -> Path:
        if self.rail_stops_path:
            return Path(self.rail_stops_path).expanduser().resolve()
        return _repo_root() / "src" / "shared" / "data" / "rail" / "stops.json"

    def resolved_gtfs_static_path(self) -> Path | None:
        if not self.gtfs_static_path:
            return None
        path = Path(self.gtfs_static_path).expanduser().resolve()
        return path if path.exists() else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
