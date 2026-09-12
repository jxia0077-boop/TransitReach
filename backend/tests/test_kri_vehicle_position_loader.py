"""Tests for KRI vehicle-position ingest (no network)."""

from pathlib import Path

import pandas as pd

from data_pipeline.kri_layout import (
    KriOperator,
    list_position_csvs,
    partition_dir,
    service_date_from_position_filename,
)
from data_pipeline.kri_vehicle_position_loader import (
    ingest_month,
    load_position_csv,
    normalise_vehicle_positions,
)

FIXTURE_KRI = Path(__file__).resolve().parent / "fixtures" / "kri"


def test_service_date_from_filename() -> None:
    assert (
        service_date_from_position_filename(Path("bus_positions_2025_04-02.csv"))
        == "2025-04-02"
    )
    assert (
        service_date_from_position_filename(Path("mrt_positions_2025_04-02.csv"))
        == "2025-04-02"
    )
    assert service_date_from_position_filename(Path("notes.csv")) is None


def test_list_position_csvs_filters_by_operator() -> None:
    month = FIXTURE_KRI / "GTFS_RT" / "rapid_kl" / "2025_04"
    files = list_position_csvs(month, KriOperator.rapid_kl)
    assert len(files) == 1
    assert files[0].name == "bus_positions_2025_04-02.csv"


def test_normalise_drops_invalid_coords() -> None:
    path = (
        FIXTURE_KRI
        / "GTFS_RT"
        / "rapid_kl"
        / "2025_04"
        / "bus_positions_2025_04-02.csv"
    )
    frame = load_position_csv(
        path,
        operator=KriOperator.rapid_kl,
        ingest_batch_id="test-batch",
    )
    # Fixture has 5 rows; keep only 2 valid coords (drop 0,0 / empty / lat>90).
    assert len(frame) == 2
    assert set(frame["latitude"]) == {3.243067, 3.244100}
    assert (frame["operator"] == "rapid_kl").all()
    assert (frame["ingest_batch_id"] == "test-batch").all()
    assert frame["source_file"].iloc[0].endswith("bus_positions_2025_04-02.csv")
    assert frame["timestamp"].dt.tz is not None
    assert str(frame["timestamp"].dt.tz) in {"Asia/Kuala_Lumpur", "UTC+08:00"}


def test_alias_columns_accepted() -> None:
    raw = pd.DataFrame(
        [
            {
                "lat": 3.1,
                "lng": 101.6,
                "tripId": "t1",
                "routeId": "r1",
                "vehicleId": "v1",
                "malaysia_time": "2025-04-02 06:00:00",
            }
        ]
    )
    out = normalise_vehicle_positions(
        raw,
        operator=KriOperator.mrt_feeder,
        source_file="alias.csv",
        ingest_batch_id="alias-batch",
    )
    assert len(out) == 1
    assert out.iloc[0]["trip_id"] == "t1"
    assert out.iloc[0]["route_id"] == "r1"
    assert out.iloc[0]["vehicle_id"] == "v1"


def test_ingest_month_partitions_by_operator_and_date(tmp_path: Path) -> None:
    summary = ingest_month(
        operator=KriOperator.mrt_feeder,
        month="2025_04",
        kri_root=FIXTURE_KRI,
        processed_root=tmp_path,
        ingest_batch_id="fixture-ingest",
    )
    assert summary["csv_files"] == 1
    assert summary["rows_raw"] == 3
    assert summary["rows_kept"] == 2
    assert len(summary["partitions_written"]) == 1

    part = partition_dir(tmp_path, KriOperator.mrt_feeder, "2025-04-02")
    parquet_path = part / "positions.parquet"
    assert parquet_path.is_file()

    loaded = pd.read_parquet(parquet_path)
    assert len(loaded) == 2
    assert (loaded["operator"] == "mrt_feeder").all()
    assert set(loaded["vehicle_id"]) == {"VG6514"}


def test_ingest_rapid_kl_fixture(tmp_path: Path) -> None:
    summary = ingest_month(
        operator=KriOperator.rapid_kl,
        month="2025_04",
        kri_root=FIXTURE_KRI,
        processed_root=tmp_path,
        ingest_batch_id="rapid-fixture",
    )
    assert summary["rows_kept"] == 2
    part = tmp_path / "vehicle_positions" / "operator=rapid_kl" / "date=2025-04-02"
    assert (part / "positions.parquet").is_file()
