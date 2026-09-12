"""Request / response schemas for GET /api/reliability/predict."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.schemas.domain import (
    PREDICTION_UNAVAILABLE_MESSAGE,
    PredictionType,
    RiskLevel,
    TransitMode,
    UnavailableReason,
)


class TrainingPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: date
    end: date


class MethodologyInfo(BaseModel):
    """AC 7.3.3 — model and data transparency shown to the user."""

    model_config = ConfigDict(extra="forbid")

    model_type: str
    data_sources: list[str]
    training_period: Optional[TrainingPeriod] = None
    realtime_contributed: bool = False


class ReliabilityPredictQuery(BaseModel):
    """Query parameters for a reliability prediction request."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    mode: TransitMode
    line_id: str = Field(..., min_length=1)
    stop_id: str = Field(..., min_length=1)
    # API query key remains `datetime`; Python attribute cannot reuse that name.
    travel_datetime: datetime = Field(
        ...,
        alias="datetime",
        description="Travel datetime; interpret in Asia/Kuala_Lumpur unless offset given.",
    )


class ReliabilityPredictionSupported(BaseModel):
    """Successful AI reliability estimate (not a guaranteed arrival time)."""

    model_config = ConfigDict(extra="forbid")

    supported: Literal[True] = True
    prediction_type: PredictionType
    expected_delay_min: float
    risk_level: RiskLevel
    historical_percentile: Optional[float] = None
    prediction_lower_min: Optional[float] = None
    prediction_upper_min: Optional[float] = None
    scheduled_headway_min: Optional[float] = None
    observed_headway_min: Optional[float] = None
    realtime_used: bool = False
    realtime_timestamp: Optional[datetime] = None
    model_version: str
    explanations: list[str] = Field(default_factory=list)
    methodology: Optional[MethodologyInfo] = None


class ReliabilityPredictionUnsupported(BaseModel):
    """Fail-closed response when ground truth / model are insufficient (AC 7.1.4)."""

    model_config = ConfigDict(extra="forbid")

    supported: Literal[False] = False
    reason: UnavailableReason = (
        UnavailableReason.insufficient_historical_operational_data
    )
    message: str = PREDICTION_UNAVAILABLE_MESSAGE


ReliabilityPredictionResponse = Annotated[
    Union[ReliabilityPredictionSupported, ReliabilityPredictionUnsupported],
    Field(discriminator="supported"),
]

reliability_prediction_adapter: TypeAdapter[ReliabilityPredictionResponse] = TypeAdapter(
    ReliabilityPredictionResponse
)
