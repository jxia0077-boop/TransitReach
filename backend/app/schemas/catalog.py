"""Catalog types for GTFS-static-backed MRT / LRT / BRT selection (AC 7.1.1)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.domain import TransitMode


class CatalogLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: TransitMode
    line_id: str
    route_id: str
    short_name: str
    long_name: str
    color: Optional[str] = None
    stop_count: int = 0
    min_headway_seconds: Optional[int] = None
    max_headway_seconds: Optional[int] = None


class CatalogStop(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stop_id: str
    name: str
    lat: float
    lon: float
    line_ids: list[str] = Field(default_factory=list)
    platform_ids: list[str] = Field(default_factory=list)


class StaticTransitCatalog(BaseModel):
    """Normalised static catalog used by the reliability UI and capability layer.

    Built from the project's derived rail JSON and/or raw GTFS static tables.
    React components must not read raw GTFS files directly.
    """

    model_config = ConfigDict(extra="forbid")

    feed_id: str
    feed_name: str
    source: str
    lines: list[CatalogLine]
    stops: list[CatalogStop]

    def lines_for_mode(self, mode: TransitMode) -> list[CatalogLine]:
        return [line for line in self.lines if line.mode == mode]

    def stops_for_line(self, line_id: str) -> list[CatalogStop]:
        return [stop for stop in self.stops if line_id in stop.line_ids]

    def get_line(self, line_id: str) -> Optional[CatalogLine]:
        for line in self.lines:
            if line.line_id == line_id or line.route_id == line_id:
                return line
        return None

    def get_stop(self, stop_id: str) -> Optional[CatalogStop]:
        for stop in self.stops:
            if stop.stop_id == stop_id or stop_id in stop.platform_ids:
                return stop
        return None
