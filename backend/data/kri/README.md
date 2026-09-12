# KRI historical vehicle positions (bus pilot)

Provenance for bulky archives placed under this directory (not committed).

| Item | Value |
|------|--------|
| Upstream repo | https://github.com/KRI-Data/GKLMOB_BUSINDEX |
| Purpose | GTFS Static + high-frequency GTFS-RT vehicle positions for Rapid KL Bus and MRT Feeder |
| Upstream RT layout | `GTFS/GTFS_RT/{Rapid KL\|MRT Feeder}/<YYYY_MM>/{bus\|mrt}_positions_YYYY_MM-DD.csv` |
| Local operator ids | `rapid_kl`, `mrt_feeder` (rename or symlink from KRI folder names) |
| Licence (repo / tooling) | MIT (Khazanah Research Institute) |
| Underlying feed | data.gov.my / Prasarana GTFS — typically CC-BY-4.0; confirm on download |
| Download date | _(fill when you copy months here)_ |
| Months used | _(e.g. 2025_04)_ |

## Expected tree

```text
backend/data/kri/
  README.md          # this file (committed)
  GTFS_S/
    rapid_kl/
    mrt_feeder/
  GTFS_RT/
    rapid_kl/<YYYY_MM>/bus_positions_*.csv
    mrt_feeder/<YYYY_MM>/mrt_positions_*.csv
```

## Ingest

From `backend/` (with venv activated):

```bash
python -m data_pipeline.kri_vehicle_position_loader --operator rapid_kl --month 2025_04
python -m data_pipeline.kri_vehicle_position_loader --operator mrt_feeder --month 2025_04
```

Outputs land under `backend/data/processed/vehicle_positions/operator=…/date=…/` (gitignored).
