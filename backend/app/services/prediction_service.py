"""Reliability prediction orchestration (fail-closed until a validated model exists)."""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache

from app.schemas.domain import TransitMode, UnavailableReason
from app.schemas.reliability import (
    ReliabilityPredictionUnsupported,
    ReliabilityPredictQuery,
)
from app.services.capability_service import (
    CapabilityNotFoundError,
    CapabilityService,
    get_capability_service,
)


class PredictionService:
    """Returns AI reliability estimates only when capability allows it.

    Current iteration has no operational ground truth / validated model, so every
    valid catalog query receives the AC 7.1.4 unsupported response. No delay or
    risk band is fabricated.
    """

    def __init__(
        self,
        capability_service: CapabilityService | None = None,
    ) -> None:
        self._capability_service = capability_service or get_capability_service()

    def predict(
        self,
        mode: TransitMode,
        line_id: str,
        stop_id: str,
        travel_datetime: datetime,
    ) -> ReliabilityPredictionUnsupported:
        # Validate selection exists in the static catalog (AC 7.1.1 inputs).
        capability = self._capability_service.get_capability(
            mode, line_id, stop_id=stop_id
        )
        # travel_datetime is accepted for contract stability; unused while unsupported.
        _ = travel_datetime

        if not capability.prediction_available:
            return ReliabilityPredictionUnsupported(
                reason=(
                    capability.unavailable_reason
                    or UnavailableReason.insufficient_historical_operational_data
                ),
            )

        # Future commits enable historical / live-adjusted models here.
        raise RuntimeError(
            "prediction_available is true but no model path is implemented yet"
        )

    def predict_from_query(
        self, query: ReliabilityPredictQuery
    ) -> ReliabilityPredictionUnsupported:
        return self.predict(
            mode=query.mode,
            line_id=query.line_id,
            stop_id=query.stop_id,
            travel_datetime=query.travel_datetime,
        )


@lru_cache
def get_prediction_service() -> PredictionService:
    return PredictionService()


__all__ = [
    "CapabilityNotFoundError",
    "PredictionService",
    "get_prediction_service",
]
