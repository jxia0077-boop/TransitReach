"""Contract tests for GET /api/reliability/predict (fail-closed)."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.domain import (
    PREDICTION_UNAVAILABLE_MESSAGE,
    TransitMode,
)
from app.services.prediction_service import PredictionService
from app.services.capability_service import CapabilityService
from app.services.static_catalog_service import StaticCatalogService


def test_predict_service_returns_unsupported_for_valid_selection() -> None:
    service = PredictionService(
        capability_service=CapabilityService(
            catalog_service=StaticCatalogService()
        )
    )
    result = service.predict(
        mode=TransitMode.lrt,
        line_id="KJ",
        stop_id="KJ17",
        travel_datetime=datetime(2026, 9, 12, 18, 0, tzinfo=timezone.utc),
    )
    assert result.supported is False
    assert result.message == PREDICTION_UNAVAILABLE_MESSAGE
    assert result.reason.value == "insufficient_historical_operational_data"
    assert not hasattr(result, "expected_delay_min") or not getattr(
        result, "expected_delay_min", None
    )


def test_predict_http_unsupported_contract() -> None:
    client = TestClient(create_app())
    response = client.get(
        "/api/reliability/predict",
        params={
            "mode": "lrt",
            "line_id": "KJ",
            "stop_id": "KJ17",
            "datetime": "2026-09-12T18:00:00+08:00",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "supported": False,
        "reason": "insufficient_historical_operational_data",
        "message": PREDICTION_UNAVAILABLE_MESSAGE,
    }
    assert "expected_delay_min" not in body
    assert "risk_level" not in body


def test_predict_http_mrt_and_brt_also_unavailable() -> None:
    client = TestClient(create_app())
    cases = [
        ("mrt", "KGL", "KG16"),
        ("brt", "BRT", "SB1"),
    ]
    # Resolve real stop ids from catalog to avoid brittle fixtures.
    catalog = client.get("/api/reliability/catalog").json()
    stops_by_line = {}
    for stop in catalog["stops"]:
        for line_id in stop["line_ids"]:
            stops_by_line.setdefault(line_id, stop["stop_id"])

    for mode, line_id, _ in cases:
        stop_id = stops_by_line[line_id]
        response = client.get(
            "/api/reliability/predict",
            params={
                "mode": mode,
                "line_id": line_id,
                "stop_id": stop_id,
                "datetime": "2026-09-12T09:00:00+08:00",
            },
        )
        assert response.status_code == 200
        assert response.json()["supported"] is False


def test_predict_unknown_line_404() -> None:
    client = TestClient(create_app())
    response = client.get(
        "/api/reliability/predict",
        params={
            "mode": "lrt",
            "line_id": "NOPE",
            "stop_id": "KJ17",
            "datetime": "2026-09-12T18:00:00+08:00",
        },
    )
    assert response.status_code == 404


def test_predict_missing_query_422() -> None:
    client = TestClient(create_app())
    response = client.get("/api/reliability/predict", params={"mode": "lrt"})
    assert response.status_code == 422
