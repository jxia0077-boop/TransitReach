"""KRI GKLMOB bus archive layout helpers for the Epic 7 bus pilot.

Canonical local layout (bulky CSVs stay out of git)::

    backend/data/kri/
      GTFS_S/{rapid_kl,mrt_feeder}/
      GTFS_RT/{rapid_kl,mrt_feeder}/<YYYY_MM>/{bus|mrt}_positions_*.csv

Operator ids match the normalised vehicle-position schema
(``rapid_kl`` | ``mrt_feeder``). Upstream KRI folder names are
``Rapid KL`` / ``MRT Feeder`` — symlink or rename when copying.
"""

from __future__ import annotations

import re
from enum import Enum
from pathlib import Path

# Filename: bus_positions_2025_04-02.csv or mrt_positions_2025_04-02.csv
_POSITION_FILE_RE = re.compile(
    r"^(?:bus|mrt)_positions_(?P<year>\d{4})_(?P<month>\d{2})-(?P<day>\d{2})\.csv$",
    re.IGNORECASE,
)


class KriOperator(str, Enum):
    rapid_kl = "rapid_kl"
    mrt_feeder = "mrt_feeder"


# Upstream KRI-Data/GKLMOB_BUSINDEX directory names under GTFS_S / GTFS_RT.
KRI_UPSTREAM_OPERATOR_DIRS: dict[KriOperator, str] = {
    KriOperator.rapid_kl: "Rapid KL",
    KriOperator.mrt_feeder: "MRT Feeder",
}

POSITION_FILE_PREFIX: dict[KriOperator, str] = {
    KriOperator.rapid_kl: "bus_positions_",
    KriOperator.mrt_feeder: "mrt_positions_",
}


def parse_operator(value: str) -> KriOperator:
    try:
        return KriOperator(value.strip().lower())
    except ValueError as exc:
        allowed = ", ".join(op.value for op in KriOperator)
        raise ValueError(f"Unknown operator {value!r}; expected one of: {allowed}") from exc


def default_kri_root() -> Path:
    """``backend/data/kri`` relative to this package."""
    return Path(__file__).resolve().parents[1] / "data" / "kri"


def default_processed_root() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "processed"


def gtfs_static_dir(kri_root: Path, operator: KriOperator) -> Path:
    return Path(kri_root) / "GTFS_S" / operator.value


def gtfs_rt_operator_dir(kri_root: Path, operator: KriOperator) -> Path:
    return Path(kri_root) / "GTFS_RT" / operator.value


def gtfs_rt_month_dir(kri_root: Path, operator: KriOperator, month: str) -> Path:
    """``month`` is ``YYYY_MM`` as in the KRI archive (e.g. ``2025_04``)."""
    return gtfs_rt_operator_dir(kri_root, operator) / month


def vehicle_positions_root(processed_root: Path | None = None) -> Path:
    root = Path(processed_root) if processed_root is not None else default_processed_root()
    return root / "vehicle_positions"


def partition_dir(
    processed_root: Path,
    operator: KriOperator,
    service_date: str,
) -> Path:
    """Hive-style partition: ``vehicle_positions/operator=…/date=YYYY-MM-DD/``."""
    return (
        vehicle_positions_root(processed_root)
        / f"operator={operator.value}"
        / f"date={service_date}"
    )


def service_date_from_position_filename(path: Path) -> str | None:
    match = _POSITION_FILE_RE.match(path.name)
    if not match:
        return None
    return f"{match.group('year')}-{match.group('month')}-{match.group('day')}"


def list_position_csvs(month_dir: Path, operator: KriOperator | None = None) -> list[Path]:
    """List daily position CSVs in a month directory, sorted by filename."""
    if not month_dir.is_dir():
        return []
    prefix = None if operator is None else POSITION_FILE_PREFIX[operator]
    files: list[Path] = []
    for path in sorted(month_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".csv":
            continue
        if prefix is not None and not path.name.lower().startswith(prefix.lower()):
            continue
        if service_date_from_position_filename(path) is None:
            continue
        files.append(path)
    return files
