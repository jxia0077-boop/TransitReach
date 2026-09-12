"""Capability matrix for Epic 7 reliability predictions (AC 7.1.4).

Loaded MRT/LRT/BRT lines remain selectable. Rail/BRT predictions stay fail-closed
until a public realtime operational history exists. Bus / MRT Feeder may later
become prediction-enabled via the KRI historical vehicle-position pilot.
"""

from __future__ import annotations

from functools import lru_cache

from app.schemas.domain import Capability, TransitMode, UnavailableReason
from app.services.static_catalog_service import (
    StaticCatalogService,
    get_static_catalog_service,
)

# Modes currently served from rapid-rail-kl static catalog (no public RT history).
_RAIL_CATALOG_MODES = {
    TransitMode.mrt,
    TransitMode.lrt,
    TransitMode.brt,
    TransitMode.mrl,
}


class CapabilityNotFoundError(LookupError):
    """Raised when the requested mode/line/stop is not in the static catalog."""


class CapabilityService:
    """Derives per-line (optional per-stop) prediction capability flags."""

    def __init__(
        self,
        catalog_service: StaticCatalogService | None = None,
    ) -> None:
        self._catalog_service = catalog_service or get_static_catalog_service()

    def list_line_capabilities(
        self,
        mode: TransitMode | None = None,
    ) -> list[Capability]:
        lines = self._catalog_service.lines(mode=mode)
        return [self._capability_for_line(line.mode, line.line_id) for line in lines]

    def get_capability(
        self,
        mode: TransitMode,
        line_id: str,
        stop_id: str | None = None,
    ) -> Capability:
        catalog = self._catalog_service.load_catalog()
        line = catalog.get_line(line_id)
        if line is None or line.mode != mode:
            raise CapabilityNotFoundError(
                f"Unknown line for mode={mode.value}: {line_id}"
            )

        if stop_id is not None:
            stop = catalog.get_stop(stop_id)
            if stop is None or line_id not in stop.line_ids:
                raise CapabilityNotFoundError(
                    f"Stop {stop_id} is not on line {line_id}"
                )

        return self._capability_for_line(mode, line_id, stop_id=stop_id)

    def is_prediction_available(
        self,
        mode: TransitMode,
        line_id: str,
        stop_id: str | None = None,
    ) -> bool:
        return self.get_capability(mode, line_id, stop_id=stop_id).prediction_available

    def _capability_for_line(
        self,
        mode: TransitMode,
        line_id: str,
        stop_id: str | None = None,
    ) -> Capability:
        static_available = True
        # Rail catalog: no public historical vehicle-position archive yet.
        # Bus pilot (KRI / live RT) will flip these flags per line when validated.
        historical_operational_data_available = False
        realtime_available = False
        model_available = False

        prediction_available = (
            static_available
            and historical_operational_data_available
            and model_available
        )

        unavailable_reason: UnavailableReason | None = None
        if not prediction_available:
            if mode in _RAIL_CATALOG_MODES:
                unavailable_reason = (
                    UnavailableReason.realtime_operational_history_unavailable
                )
            else:
                unavailable_reason = (
                    UnavailableReason.insufficient_historical_operational_data
                )

        return Capability(
            mode=mode,
            line_id=line_id,
            stop_id=stop_id,
            static_available=static_available,
            historical_operational_data_available=historical_operational_data_available,
            realtime_available=realtime_available,
            model_available=model_available,
            prediction_available=prediction_available,
            unavailable_reason=unavailable_reason,
        )


@lru_cache
def get_capability_service() -> CapabilityService:
    return CapabilityService()
