"""Ingest KRI historical vehicle-position CSVs into normalised Parquet.

Column mapping (KRI GKLMOB daily CSVs → normalised schema)
----------------------------------------------------------
Observed headers (identical for Rapid KL Bus and MRT Feeder core fields;
Rapid KL also emits ``start_time`` / ``start_date`` which are ignored here):

| KRI column        | Normalised field | Notes |
|-------------------|------------------|--------|
| ``malaysia_time`` | ``timestamp``    | Preferred; parsed as Asia/Kuala_Lumpur wall clock |
| ``timestamp``     | ``timestamp``    | Fallback when ``malaysia_time`` missing/unparseable (unix seconds, UTC→KL) |
| ``latitude``      | ``latitude``     | Drop null / (0,0) / out of [-90, 90] |
| ``longitude``     | ``longitude``    | Drop null / (0,0) / out of [-180, 180] |
| ``trip_id``       | ``trip_id``      | Preferred match key |
| ``route_id``      | ``route_id``     | Fallback match key |
| ``vehicle_id``    | ``vehicle_id``   | Continuity |
| ``speed``         | ``speed``        | Optional |
| ``bearing``       | ``bearing``      | Optional |
| (file path)       | ``source_file``  | Provenance |
| (CLI / call)      | ``ingest_batch_id`` | Reproducibility |
| (argument)        | ``operator``     | ``rapid_kl`` \\| ``mrt_feeder`` |

Aliases accepted (case-insensitive): ``lat``→latitude, ``lon``/``lng``→longitude,
``vehicleId``→vehicle_id, ``routeId``→route_id, ``tripId``→trip_id,
``gps_timestamp`` / ``observation_time``→timestamp source.

Usage::

    python -m data_pipeline.kri_vehicle_position_loader \\
        --operator rapid_kl --month 2025_04

    python -m data_pipeline.kri_vehicle_position_loader \\
        --operator mrt_feeder --month 2025_04 \\
        --kri-root backend/data/kri \\
        --output-root backend/data/processed
"""

from __future__ import annotations

import argparse
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo

import pandas as pd

from data_pipeline.kri_layout import (
    KriOperator,
    default_kri_root,
    default_processed_root,
    gtfs_rt_month_dir,
    list_position_csvs,
    parse_operator,
    partition_dir,
    service_date_from_position_filename,
)

KL_TZ = ZoneInfo("Asia/Kuala_Lumpur")

NORMALISED_COLUMNS = (
    "operator",
    "timestamp",
    "latitude",
    "longitude",
    "trip_id",
    "route_id",
    "vehicle_id",
    "speed",
    "bearing",
    "source_file",
    "ingest_batch_id",
)

# Canonical name → accepted CSV header aliases (lowercase).
_COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon", "lng", "long"),
    "trip_id": ("trip_id", "tripid"),
    "route_id": ("route_id", "routeid"),
    "vehicle_id": ("vehicle_id", "vehicleid", "vehicle"),
    "speed": ("speed",),
    "bearing": ("bearing", "course"),
    "malaysia_time": ("malaysia_time", "malaysia time", "local_time"),
    "unix_timestamp": (
        "timestamp",
        "gps_timestamp",
        "observation_time",
        "time",
    ),
}


def _resolve_column(columns: Iterable[str], canonical: str) -> str | None:
    lower_map = {str(name).strip().lower(): name for name in columns}
    for alias in _COLUMN_ALIASES[canonical]:
        if alias in lower_map:
            return lower_map[alias]
    return None


def _parse_malaysia_time(value: Any) -> datetime | pd.NaT:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return pd.NaT
    text = str(value).strip()
    if not text:
        return pd.NaT
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=KL_TZ)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return pd.NaT
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=KL_TZ)
    return parsed.astimezone(KL_TZ)


def _parse_unix_timestamp(value: Any) -> datetime | pd.NaT:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return pd.NaT
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return pd.NaT
    if seconds <= 0:
        return pd.NaT
    # Heuristic: milliseconds if clearly too large for seconds.
    if seconds > 1e12:
        seconds /= 1000.0
    return datetime.fromtimestamp(seconds, tz=timezone.utc).astimezone(KL_TZ)


def _coords_valid(lat: float, lon: float) -> bool:
    if lat == 0.0 and lon == 0.0:
        return False
    if not (-90.0 <= lat <= 90.0):
        return False
    if not (-180.0 <= lon <= 180.0):
        return False
    return True


def normalise_vehicle_positions(
    frame: pd.DataFrame,
    *,
    operator: KriOperator,
    source_file: str,
    ingest_batch_id: str,
) -> pd.DataFrame:
    """Map a raw KRI (or alias) CSV frame onto the normalised schema."""
    if frame.empty:
        return pd.DataFrame(columns=list(NORMALISED_COLUMNS))

    lat_col = _resolve_column(frame.columns, "latitude")
    lon_col = _resolve_column(frame.columns, "longitude")
    if lat_col is None or lon_col is None:
        raise ValueError(
            f"CSV missing latitude/longitude columns (got: {list(frame.columns)})"
        )

    my_col = _resolve_column(frame.columns, "malaysia_time")
    unix_col = _resolve_column(frame.columns, "unix_timestamp")

    trip_col = _resolve_column(frame.columns, "trip_id")
    route_col = _resolve_column(frame.columns, "route_id")
    vehicle_col = _resolve_column(frame.columns, "vehicle_id")
    speed_col = _resolve_column(frame.columns, "speed")
    bearing_col = _resolve_column(frame.columns, "bearing")

    rows: list[dict[str, Any]] = []
    for record in frame.to_dict(orient="records"):
        try:
            lat = float(record[lat_col])
            lon = float(record[lon_col])
        except (TypeError, ValueError, KeyError):
            continue
        if not _coords_valid(lat, lon):
            continue

        ts: datetime | pd.NaT = pd.NaT
        if my_col is not None:
            ts = _parse_malaysia_time(record.get(my_col))
        if pd.isna(ts) and unix_col is not None and unix_col != my_col:
            # ``timestamp`` is unix seconds in KRI CSVs; prefer malaysia_time when present.
            ts = _parse_unix_timestamp(record.get(unix_col))
        if pd.isna(ts):
            continue

        def _str_field(col: str | None) -> str | None:
            if col is None:
                return None
            raw = record.get(col)
            if raw is None or (isinstance(raw, float) and pd.isna(raw)):
                return None
            text = str(raw).strip()
            return text or None

        def _float_field(col: str | None) -> float | None:
            if col is None:
                return None
            raw = record.get(col)
            if raw is None or (isinstance(raw, float) and pd.isna(raw)):
                return None
            try:
                return float(raw)
            except (TypeError, ValueError):
                return None

        rows.append(
            {
                "operator": operator.value,
                "timestamp": ts,
                "latitude": lat,
                "longitude": lon,
                "trip_id": _str_field(trip_col),
                "route_id": _str_field(route_col),
                "vehicle_id": _str_field(vehicle_col),
                "speed": _float_field(speed_col),
                "bearing": _float_field(bearing_col),
                "source_file": source_file,
                "ingest_batch_id": ingest_batch_id,
            }
        )

    out = pd.DataFrame(rows, columns=list(NORMALISED_COLUMNS))
    if not out.empty:
        out["timestamp"] = pd.to_datetime(out["timestamp"], utc=False)
    return out


def load_position_csv(
    path: Path,
    *,
    operator: KriOperator,
    ingest_batch_id: str | None = None,
) -> pd.DataFrame:
    """Read one daily CSV and return normalised rows (no Parquet write)."""
    batch_id = ingest_batch_id or str(uuid.uuid4())
    frame = pd.read_csv(path)
    return normalise_vehicle_positions(
        frame,
        operator=operator,
        source_file=str(path),
        ingest_batch_id=batch_id,
    )


def write_day_partition(
    frame: pd.DataFrame,
    *,
    processed_root: Path,
    operator: KriOperator,
    service_date: str,
) -> Path | None:
    """Write (or skip empty) a single-day Parquet partition. Returns path or None."""
    if frame.empty:
        return None
    out_dir = partition_dir(processed_root, operator, service_date)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "positions.parquet"
    # Drop partition-key duplicates from the file body? Keep operator for self-describing rows.
    frame.to_parquet(out_path, index=False)
    return out_path


def ingest_month(
    *,
    operator: KriOperator,
    month: str,
    kri_root: Path | None = None,
    processed_root: Path | None = None,
    ingest_batch_id: str | None = None,
) -> Mapping[str, Any]:
    """Ingest all daily position CSVs for one operator/month into Parquet partitions."""
    root = Path(kri_root) if kri_root is not None else default_kri_root()
    out_root = Path(processed_root) if processed_root is not None else default_processed_root()
    batch_id = ingest_batch_id or str(uuid.uuid4())
    month_dir = gtfs_rt_month_dir(root, operator, month)
    csv_paths = list_position_csvs(month_dir, operator)

    written: list[str] = []
    rows_kept = 0
    rows_raw = 0
    for csv_path in csv_paths:
        service_date = service_date_from_position_filename(csv_path)
        if service_date is None:
            continue
        raw = pd.read_csv(csv_path)
        rows_raw += len(raw)
        normalised = normalise_vehicle_positions(
            raw,
            operator=operator,
            source_file=str(csv_path),
            ingest_batch_id=batch_id,
        )
        rows_kept += len(normalised)
        out_path = write_day_partition(
            normalised,
            processed_root=out_root,
            operator=operator,
            service_date=service_date,
        )
        if out_path is not None:
            written.append(str(out_path))

    return {
        "operator": operator.value,
        "month": month,
        "kri_root": str(root),
        "processed_root": str(out_root),
        "ingest_batch_id": batch_id,
        "csv_files": len(csv_paths),
        "rows_raw": rows_raw,
        "rows_kept": rows_kept,
        "partitions_written": written,
    }


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Ingest KRI vehicle-position CSVs into normalised Parquet.",
    )
    parser.add_argument(
        "--operator",
        required=True,
        choices=[op.value for op in KriOperator],
        help="Bus pilot operator id",
    )
    parser.add_argument(
        "--month",
        required=True,
        help="Archive month folder name, e.g. 2025_04",
    )
    parser.add_argument(
        "--kri-root",
        type=Path,
        default=None,
        help="Root containing GTFS_RT/… (default: backend/data/kri)",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=None,
        help="Processed data root (default: backend/data/processed)",
    )
    parser.add_argument(
        "--ingest-batch-id",
        default=None,
        help="Optional reproducibility id (default: random UUID)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    summary = ingest_month(
        operator=parse_operator(args.operator),
        month=args.month,
        kri_root=args.kri_root,
        processed_root=args.output_root,
        ingest_batch_id=args.ingest_batch_id,
    )
    print(
        f"operator={summary['operator']} month={summary['month']} "
        f"csv_files={summary['csv_files']} rows_raw={summary['rows_raw']} "
        f"rows_kept={summary['rows_kept']} partitions={len(summary['partitions_written'])} "
        f"batch={summary['ingest_batch_id']}"
    )
    for path in summary["partitions_written"]:
        print(f"  wrote {path}")
    if summary["csv_files"] == 0:
        print(
            f"No position CSVs under "
            f"{gtfs_rt_month_dir(Path(summary['kri_root']), parse_operator(summary['operator']), summary['month'])}"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
