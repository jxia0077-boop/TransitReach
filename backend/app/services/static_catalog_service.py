"""Static transit catalog service — abstraction between GTFS data and API/UI."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.config import Settings, get_settings
from app.schemas.catalog import CatalogLine, CatalogStop, StaticTransitCatalog
from app.schemas.domain import TransitMode
from data_pipeline.gtfs_static_loader import (
    epic_selection_modes,
    load_catalog_from_derived_rail_json,
    load_catalog_from_gtfs,
)


class StaticCatalogService:
    """Loads the normalised MRT/LRT/BRT(+MRL) catalog once per process."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def load_catalog(self) -> StaticTransitCatalog:
        gtfs_source = self._settings.resolved_gtfs_static_path()
        if gtfs_source is not None:
            return load_catalog_from_gtfs(
                gtfs_source,
                feed_id="prasarana-rapid-rail-kl",
                feed_name="Prasarana Rapid Rail KL",
                source=str(gtfs_source),
            )
        return load_catalog_from_derived_rail_json(
            self._settings.resolved_rail_feeds_path(),
            self._settings.resolved_rail_stops_path(),
        )

    def selectable_modes(self) -> list[TransitMode]:
        catalog = self.load_catalog()
        present = {line.mode for line in catalog.lines}
        return [mode for mode in epic_selection_modes() if mode in present]

    def lines(self, mode: TransitMode | None = None) -> list[CatalogLine]:
        catalog = self.load_catalog()
        if mode is None:
            return list(catalog.lines)
        return catalog.lines_for_mode(mode)

    def stops(self, line_id: str | None = None) -> list[CatalogStop]:
        catalog = self.load_catalog()
        if line_id is None:
            return list(catalog.stops)
        return catalog.stops_for_line(line_id)


@lru_cache
def get_static_catalog_service() -> StaticCatalogService:
    return StaticCatalogService()
