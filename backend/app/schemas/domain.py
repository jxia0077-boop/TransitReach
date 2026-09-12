"""Shared enums and domain records for Epic 7 reliability."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TransitMode(str, Enum):
    """Modes in the Epic 7 reliability catalog.

    MRT / LRT / BRT are the Epic 7 product scope. MRL is present in the loaded
    rapid-rail-kl feed so the catalog can list it; it is not a prediction target
    until capability says otherwise.
    """

    mrt = "mrt"
    lrt = "lrt"
    brt = "brt"
    mrl = "mrl"


class RiskLevel(str, Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    very_high = "very_high"


class PredictionType(str, Enum):
    historical = "historical"
    live_adjusted = "live_adjusted"


class UnavailableReason(str, Enum):
    insufficient_historical_operational_data = (
        "insufficient_historical_operational_data"
    )
    # Rail / BRT: no public historical vehicle-position archive yet.
    realtime_operational_history_unavailable = (
        "realtime_operational_history_unavailable"
    )


PREDICTION_UNAVAILABLE_MESSAGE = (
    "Prediction unavailable — insufficient historical operational data"
)

RAIL_PREDICTION_UNAVAILABLE_MESSAGE = (
    "Prediction unavailable — realtime operational history is currently "
    "unavailable for this service"
)


def message_for_unavailable_reason(reason: UnavailableReason) -> str:
    if reason == UnavailableReason.realtime_operational_history_unavailable:
        return RAIL_PREDICTION_UNAVAILABLE_MESSAGE
    return PREDICTION_UNAVAILABLE_MESSAGE


class ServiceIdentity(BaseModel):
    """Stable identity for a scheduled stop event on a line."""

    model_config = ConfigDict(extra="forbid")

    mode: TransitMode
    line_id: str = Field(..., description="Product line id, e.g. KJ, KGL, BRT")
    route_id: str
    trip_id: Optional[str] = None
    stop_id: str
    stop_sequence: Optional[int] = None
    service_date: Optional[date] = None


class Capability(BaseModel):
    """Whether a line (or line+stop) can produce an AI reliability prediction."""

    model_config = ConfigDict(extra="forbid")

    mode: TransitMode
    line_id: str
    stop_id: Optional[str] = None
    static_available: bool = False
    historical_operational_data_available: bool = False
    realtime_available: bool = False
    model_available: bool = False
    prediction_available: bool = False
    unavailable_reason: Optional[UnavailableReason] = None


class OperationalObservation(BaseModel):
    """Unified schedule + observation record for MRT / LRT / BRT pipelines.

    `actual_arrival` must never be copied from GTFS Static scheduled times.
    """

    model_config = ConfigDict(extra="forbid")

    mode: TransitMode
    line_id: str
    route_id: str
    trip_id: Optional[str] = None
    stop_id: str
    stop_sequence: Optional[int] = None
    service_date: Optional[date] = None

    scheduled_arrival: Optional[datetime] = None
    actual_arrival: Optional[datetime] = None

    scheduled_headway_min: Optional[float] = None
    observed_headway_min: Optional[float] = None
    previous_stop_delay_min: Optional[float] = None
    current_delay_min: Optional[float] = None
    headway_ratio: Optional[float] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None
    vehicle_id: Optional[str] = None
    timestamp: Optional[datetime] = None

    actual_delay_minutes: Optional[float] = None
    match_quality_ok: bool = False
    data_quality_flags: list[str] = Field(default_factory=list)
