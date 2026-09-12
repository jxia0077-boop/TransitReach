"""Contract tests for Epic 7 domain and reliability schemas."""

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas import (
    PREDICTION_UNAVAILABLE_MESSAGE,
    Capability,
    OperationalObservation,
    ReliabilityPredictionSupported,
    ReliabilityPredictionUnsupported,
    ReliabilityPredictQuery,
    RiskLevel,
    TransitMode,
    UnavailableReason,
    reliability_prediction_adapter,
)


def test_capability_defaults_to_unavailable() -> None:
    capability = Capability(mode=TransitMode.lrt, line_id="KJ")
    assert capability.prediction_available is False
    assert capability.historical_operational_data_available is False
    assert capability.model_available is False


def test_unsupported_prediction_message_matches_ac() -> None:
    body = ReliabilityPredictionUnsupported()
    assert body.supported is False
    assert (
        body.reason
        == UnavailableReason.insufficient_historical_operational_data
    )
    assert body.message == PREDICTION_UNAVAILABLE_MESSAGE


def test_supported_prediction_requires_core_fields() -> None:
    body = ReliabilityPredictionSupported(
        prediction_type="historical",
        expected_delay_min=6.4,
        risk_level=RiskLevel.high,
        historical_percentile=84,
        realtime_used=False,
        model_version="reliability-v1",
        explanations=["Associated with higher delay at this hour historically"],
    )
    assert body.supported is True
    assert body.expected_delay_min == 6.4


def test_prediction_response_discriminator() -> None:
    unsupported = reliability_prediction_adapter.validate_python(
        {
            "supported": False,
            "reason": "insufficient_historical_operational_data",
            "message": PREDICTION_UNAVAILABLE_MESSAGE,
        }
    )
    assert isinstance(unsupported, ReliabilityPredictionUnsupported)

    supported = reliability_prediction_adapter.validate_python(
        {
            "supported": True,
            "prediction_type": "historical",
            "expected_delay_min": 3.2,
            "risk_level": "moderate",
            "realtime_used": False,
            "model_version": "reliability-v1",
            "explanations": [],
        }
    )
    assert isinstance(supported, ReliabilityPredictionSupported)


def test_predict_query_accepts_datetime_alias() -> None:
    query = ReliabilityPredictQuery.model_validate(
        {
            "mode": "mrt",
            "line_id": "KGL",
            "stop_id": "ST1",
            "datetime": "2026-09-12T18:00:00+08:00",
        }
    )
    assert query.line_id == "KGL"
    assert query.travel_datetime.year == 2026


def test_predict_query_rejects_empty_ids() -> None:
    with pytest.raises(ValidationError):
        ReliabilityPredictQuery.model_validate(
            {
                "mode": "mrt",
                "line_id": "",
                "stop_id": "ST1",
                "datetime": "2026-09-12T18:00:00+08:00",
            }
        )


def test_operational_observation_does_not_require_actual_arrival() -> None:
    """Records without reliable actual arrival must remain valid but unusable for labels."""
    row = OperationalObservation(
        mode=TransitMode.brt,
        line_id="BRT",
        route_id="BRT",
        stop_id="BRT1",
        scheduled_arrival=datetime(2026, 9, 12, 10, 0, tzinfo=timezone.utc),
        match_quality_ok=False,
        data_quality_flags=["no_geofence_hit"],
        service_date=date(2026, 9, 12),
    )
    assert row.actual_arrival is None
    assert row.actual_delay_minutes is None
    assert row.match_quality_ok is False
