"""Load and normalise GTFS Static into the Epic 7 transit catalog.

Two sources are supported:

1. Derived rail JSON already committed for the frontend
   (`src/shared/data/rail/{feeds,stops}.json`) — default, always available.
2. Raw GTFS Static tables (`routes`, `trips`, `stops`, `stop_times`, `calendar`)
   from a directory or ZIP — for pipeline work when `data/gtfs/` is present.

React must not read raw GTFS; this module is the backend abstraction.
"""

from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

from app.schemas.catalog import CatalogLine, CatalogStop, StaticTransitCatalog
from app.schemas.domain import TransitMode

# Feed uses "MRT" on some stop rows where routes.txt uses "KGL".
STOP_ROUTE_ID_FIXES = {"MRT": "KGL"}

GTFS_TABLES = (
    "routes.txt",
    "trips.txt",
    "stops.txt",
    "stop_times.txt",
    "calendar.txt",
)


def normalize_mode(raw_mode: str, short_name: str = "", long_name: str = "") -> TransitMode:
    """Map feed mode / line names onto TransitMode."""
    blob = f"{raw_mode} {short_name} {long_name}".upper()
    if "BRT" in blob:
        return TransitMode.brt
    if "MRT" in blob:
        return TransitMode.mrt
    if "LRT" in blob:
        return TransitMode.lrt
    if "MONORAIL" in blob or raw_mode.upper() in {"MRL", "MONORAIL"}:
        return TransitMode.mrl
    try:
        return TransitMode(raw_mode.lower())
    except ValueError as exc:
        raise ValueError(f"Unsupported transit mode label: {raw_mode!r}") from exc


def _read_csv_text(text: str) -> list[dict[str, str]]:
    cleaned = text.lstrip("\ufeff").replace("\r\n", "\n")
    reader = csv.DictReader(io.StringIO(cleaned))
    rows: list[dict[str, str]] = []
    for row in reader:
        normalised = {
            (key or "").strip(): (value or "").strip()
            for key, value in row.items()
            if key is not None
        }
        if any(normalised.values()):
            rows.append(normalised)
    return rows


def read_gtfs_table(source: Path, filename: str) -> list[dict[str, str]]:
    """Read one GTFS table from a directory or a .zip archive."""
    if source.is_dir():
        path = source / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing GTFS table: {path}")
        return _read_csv_text(path.read_text(encoding="utf-8"))

    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as archive:
            # Tables may sit at the zip root or one folder deep.
            members = {name.split("/")[-1]: name for name in archive.namelist()}
            if filename not in members:
                raise FileNotFoundError(f"Missing GTFS table {filename} in {source}")
            with archive.open(members[filename]) as handle:
                return _read_csv_text(handle.read().decode("utf-8"))

    raise FileNotFoundError(f"GTFS source not found: {source}")


def load_gtfs_static_tables(source: Path) -> dict[str, list[dict[str, str]]]:
    """Load the core GTFS Static tables used by the reliability pipeline."""
    return {name: read_gtfs_table(source, name) for name in GTFS_TABLES}


def catalog_from_gtfs_tables(
    tables: Mapping[str, list[dict[str, str]]],
    *,
    feed_id: str = "prasarana-rapid-rail-kl",
    feed_name: str = "Prasarana Rapid Rail KL",
    source: str = "gtfs-static",
) -> StaticTransitCatalog:
    """Normalise raw GTFS route/stop rows into the selection catalog.

    `stop_times` and `calendar` are loaded for later pipeline stages; the catalog
    surface for AC 7.1.1 needs routes + stops (+ trip linkage for stop counts).
    """
    routes = tables.get("routes.txt", [])
    trips = tables.get("trips.txt", [])
    stops = tables.get("stops.txt", [])

    trip_counts: dict[str, int] = {}
    for trip in trips:
        route_id = trip.get("route_id", "")
        if route_id:
            trip_counts[route_id] = trip_counts.get(route_id, 0) + 1

    lines: list[CatalogLine] = []
    for route in routes:
        route_id = route.get("route_id", "")
        if not route_id:
            continue
        short_name = route.get("route_short_name", "") or route_id
        long_name = route.get("route_long_name", "")
        route_type = route.get("route_type", "")
        # Numeric GTFS route_type is not our product mode label; prefer names.
        mode_seed = short_name if route_type.isdigit() else (
            route.get("route_desc") or short_name or long_name
        )
        mode = normalize_mode(mode_seed, short_name=short_name, long_name=long_name)
        lines.append(
            CatalogLine(
                mode=mode,
                line_id=route_id,
                route_id=route_id,
                short_name=short_name,
                long_name=long_name,
                color=_optional_color(route.get("route_color")),
                stop_count=0,
            )
        )

    line_ids = {line.line_id for line in lines}
    stops_by_id: dict[str, CatalogStop] = {}
    line_stop_ids: dict[str, set[str]] = {line_id: set() for line_id in line_ids}

    for stop in stops:
        stop_id = stop.get("stop_id", "")
        if not stop_id:
            continue
        lat = float(stop["stop_lat"])
        lon = float(stop["stop_lon"])
        # Some feeds stamp a route on stop rows; otherwise stops are linked later.
        raw_route = stop.get("route_id") or stop.get("parent_station") or ""
        fixed_route = STOP_ROUTE_ID_FIXES.get(raw_route, raw_route)
        line_ids_for_stop = [fixed_route] if fixed_route in line_ids else []
        catalog_stop = CatalogStop(
            stop_id=stop_id,
            name=stop.get("stop_name", stop_id),
            lat=lat,
            lon=lon,
            line_ids=line_ids_for_stop,
            platform_ids=[stop_id],
        )
        stops_by_id[stop_id] = catalog_stop
        for line_id in line_ids_for_stop:
            line_stop_ids[line_id].add(stop_id)

    # Prefer stop_times → trips → route for stop/line membership when available.
    trip_to_route = {
        trip["trip_id"]: trip["route_id"]
        for trip in trips
        if trip.get("trip_id") and trip.get("route_id")
    }
    for row in tables.get("stop_times.txt", []):
        trip_id = row.get("trip_id", "")
        stop_id = row.get("stop_id", "")
        route_id = trip_to_route.get(trip_id)
        if not route_id or stop_id not in stops_by_id:
            continue
        stop = stops_by_id[stop_id]
        if route_id not in stop.line_ids:
            stop.line_ids.append(route_id)
        line_stop_ids.setdefault(route_id, set()).add(stop_id)

    for line in lines:
        line.stop_count = len(line_stop_ids.get(line.line_id, set()))

    return StaticTransitCatalog(
        feed_id=feed_id,
        feed_name=feed_name,
        source=source,
        lines=lines,
        stops=list(stops_by_id.values()),
    )


def load_catalog_from_gtfs(source: Path, **kwargs: Any) -> StaticTransitCatalog:
    return catalog_from_gtfs_tables(load_gtfs_static_tables(source), **kwargs)


def load_catalog_from_derived_rail_json(
    feeds_path: Path,
    stops_path: Path,
) -> StaticTransitCatalog:
    """Build the selection catalog from the committed derived rail JSON."""
    import json

    feeds_doc = json.loads(feeds_path.read_text(encoding="utf-8"))
    stops_doc = json.loads(stops_path.read_text(encoding="utf-8"))

    feeds = feeds_doc.get("feeds") or []
    if not feeds:
        raise ValueError(f"No feeds listed in {feeds_path}")
    feed = feeds[0]

    lines: list[CatalogLine] = []
    for raw in feed.get("lines") or []:
        route_id = raw["routeId"]
        short_name = raw.get("shortName") or route_id
        long_name = raw.get("longName") or ""
        mode = normalize_mode(raw.get("mode") or "", short_name=short_name, long_name=long_name)
        frequency = raw.get("frequency") or {}
        lines.append(
            CatalogLine(
                mode=mode,
                line_id=route_id,
                route_id=route_id,
                short_name=short_name,
                long_name=long_name,
                color=_optional_color(raw.get("color")),
                stop_count=int(raw.get("stopCount") or 0),
                min_headway_seconds=_optional_int(frequency.get("minHeadwaySeconds")),
                max_headway_seconds=_optional_int(frequency.get("maxHeadwaySeconds")),
            )
        )

    stops: list[CatalogStop] = []
    for raw in stops_doc.get("stations") or []:
        stops.append(
            CatalogStop(
                stop_id=raw["stopId"],
                name=raw["name"],
                lat=float(raw["lat"]),
                lon=float(raw["lon"]),
                line_ids=list(raw.get("lines") or []),
                platform_ids=list(raw.get("platforms") or [raw["stopId"]]),
            )
        )

    return StaticTransitCatalog(
        feed_id=feed.get("feedId") or stops_doc.get("feedId") or "unknown",
        feed_name=feed.get("feedName") or "Rapid Rail KL",
        source=feed.get("source") or str(feeds_path),
        lines=lines,
        stops=stops,
    )


def _optional_color(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value if value.startswith("#") else f"#{value}"


def _optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    return int(value)


def epic_selection_modes() -> Iterable[TransitMode]:
    """Modes AC 7.1.1 requires to be selectable when loaded."""
    return (TransitMode.mrt, TransitMode.lrt, TransitMode.brt)
