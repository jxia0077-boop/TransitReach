"""Tests for GTFS static loading and catalog abstraction."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.domain import TransitMode
from data_pipeline.gtfs_static_loader import (
    catalog_from_gtfs_tables,
    load_catalog_from_derived_rail_json,
    load_gtfs_static_tables,
    normalize_mode,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
RAIL_FEEDS = REPO_ROOT / "src" / "shared" / "data" / "rail" / "feeds.json"
RAIL_STOPS = REPO_ROOT / "src" / "shared" / "data" / "rail" / "stops.json"
FIXTURE_GTFS = Path(__file__).resolve().parent / "fixtures" / "gtfs_static"


def test_normalize_mode_from_line_names() -> None:
    assert normalize_mode("LRT", long_name="LRT Kelana Jaya Line") == TransitMode.lrt
    assert normalize_mode("MRT", long_name="MRT Kajang Line") == TransitMode.mrt
    assert normalize_mode("BRT", long_name="BRT Sunway Line") == TransitMode.brt
    assert normalize_mode("MRL", long_name="KL Monorail Line") == TransitMode.mrl


def test_load_derived_rail_catalog_contains_mrt_lrt_brt() -> None:
    catalog = load_catalog_from_derived_rail_json(RAIL_FEEDS, RAIL_STOPS)
    modes = {line.mode for line in catalog.lines}
    assert TransitMode.mrt in modes
    assert TransitMode.lrt in modes
    assert TransitMode.brt in modes
    assert catalog.get_line("KJ") is not None
    assert catalog.get_stop("KJ17") is not None
    assert len(catalog.stops_for_line("BRT")) == 7
    assert len(catalog.lines) >= 7
    assert len(catalog.stops) >= 100


def test_load_fixture_gtfs_tables() -> None:
    tables = load_gtfs_static_tables(FIXTURE_GTFS)
    assert "routes.txt" in tables
    assert "stop_times.txt" in tables
    catalog = catalog_from_gtfs_tables(
        tables,
        feed_id="fixture-rail",
        feed_name="Fixture",
        source=str(FIXTURE_GTFS),
    )
    assert catalog.get_line("KJ") is not None
    assert catalog.get_stop("KJ01") is not None
    kj_stops = catalog.stops_for_line("KJ")
    assert {stop.stop_id for stop in kj_stops} == {"KJ01", "KJ02"}


def test_catalog_http_endpoints() -> None:
    client = TestClient(create_app())
    catalog = client.get("/api/reliability/catalog")
    assert catalog.status_code == 200
    body = catalog.json()
    assert body["feed_id"]
    assert len(body["lines"]) >= 7
    assert len(body["stops"]) >= 100

    modes = client.get("/api/reliability/catalog/modes")
    assert modes.status_code == 200
    assert set(modes.json()) == {"mrt", "lrt", "brt"}

    lines = client.get("/api/reliability/catalog/lines", params={"mode": "lrt"})
    assert lines.status_code == 200
    assert all(item["mode"] == "lrt" for item in lines.json())

    stops = client.get("/api/reliability/catalog/stops", params={"line_id": "BRT"})
    assert stops.status_code == 200
    assert len(stops.json()) == 7
