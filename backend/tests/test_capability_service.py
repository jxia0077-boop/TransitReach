"""Tests for the Epic 7 capability layer (fail-closed until operational data exists)."""

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.domain import TransitMode, UnavailableReason
from app.services.capability_service import CapabilityService
from app.services.static_catalog_service import StaticCatalogService


def test_all_loaded_lines_are_not_prediction_enabled() -> None:
    service = CapabilityService(catalog_service=StaticCatalogService())
    capabilities = service.list_line_capabilities()
    assert len(capabilities) >= 7
    assert all(cap.static_available for cap in capabilities)
    assert all(not cap.historical_operational_data_available for cap in capabilities)
    assert all(not cap.realtime_available for cap in capabilities)
    assert all(not cap.model_available for cap in capabilities)
    assert all(not cap.prediction_available for cap in capabilities)
    assert all(
        cap.unavailable_reason
        == UnavailableReason.realtime_operational_history_unavailable
        for cap in capabilities
    )


def test_mrt_lrt_brt_capabilities_exist() -> None:
    service = CapabilityService(catalog_service=StaticCatalogService())
    by_mode = {
        mode: service.list_line_capabilities(mode=mode)
        for mode in (TransitMode.mrt, TransitMode.lrt, TransitMode.brt)
    }
    assert by_mode[TransitMode.mrt]
    assert by_mode[TransitMode.lrt]
    assert by_mode[TransitMode.brt]


def test_stop_level_capability_still_unavailable() -> None:
    service = CapabilityService(catalog_service=StaticCatalogService())
    capability = service.get_capability(TransitMode.lrt, "KJ", stop_id="KJ17")
    assert capability.stop_id == "KJ17"
    assert capability.prediction_available is False
    assert service.is_prediction_available(TransitMode.lrt, "KJ", "KJ17") is False


def test_unknown_line_returns_404() -> None:
    client = TestClient(create_app())
    response = client.get("/api/reliability/capabilities/lrt/NOT_A_LINE")
    assert response.status_code == 404


def test_capabilities_http_endpoints() -> None:
    client = TestClient(create_app())
    listing = client.get("/api/reliability/capabilities")
    assert listing.status_code == 200
    body = listing.json()
    assert len(body) >= 7
    assert all(item["prediction_available"] is False for item in body)

    one = client.get("/api/reliability/capabilities/brt/BRT")
    assert one.status_code == 200
    assert one.json()["line_id"] == "BRT"
    assert one.json()["prediction_available"] is False
    assert (
        one.json()["unavailable_reason"]
        == "realtime_operational_history_unavailable"
    )
