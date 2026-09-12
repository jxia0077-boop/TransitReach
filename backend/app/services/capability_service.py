"""Capability matrix for Epic 7 reliability predictions (AC 7.1.4).

All loaded MRT/LRT/BRT lines may appear in the UI. AI predictions are enabled
only when static catalog + historical operational data + a validated model are
all available. Until operational ground truth exists, every rail capability is
fail-closed with insufficient_historical_operational_data.
"""

from __future__ import annotations

from functools import lru_cache

from app.schemas.domain import Capability, TransitMode, UnavailableReason
from app.services.static_catalog_service import (
    StaticCatalogService,
    get_static_catalog_service,
)


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
        # No historical operational archive or validated model is registered yet.
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
