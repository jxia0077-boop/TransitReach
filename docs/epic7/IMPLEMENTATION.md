# Epic 7 — AI-Driven Transit Reliability and Delay Risk

**Implementation specification for Iteration 2**  
**Branch:** `epic7`  
**Status:** Spec committed first. Training / live prediction **blocked** until historical operational ground truth exists (see §2).

This document is the single source of business logic and implementation order. Implement one section at a time; each section maps to a git commit named `epic7-<feature>`.

---

## 0. Goals and non-goals

### Goal

Let a resident select a **supported** MRT / LRT / BRT mode, line, stop/station, and travel date/time, then receive:

- **expected delay (minutes)** from a trained model, and  
- a **reliability risk** band: Low / Moderate / High / Very High,

so they can budget uncertainty for waiting, delay, or missed connections.

### Non-goals

- Passenger **occupancy / crowding** (not this epic).  
- Guaranteed arrival times.  
- Fabricating delays from GTFS Static alone.  
- Rewriting Epic 1 / 3 / 5 behaviour (only minimal integration hooks).

### Product one-liner for UI

> AI estimate of operational reliability — not a guaranteed arrival time.

---

## 1. Repository context (Stage 1 audit summary)

| Area | Current state | Epic 7 approach |
|------|---------------|-----------------|
| Frontend | Vite + React 18 + TS; `src/app`, `pages`, `features`, `shared` | New `src/features/transit-reliability/` |
| Routing | OTP via `routingAdapter` + `/otp` proxy | **Do not** use OTP isochrone as delay ground truth |
| GTFS in app | Derived JSON: `rail/stops.json`, `feeds.json`; bus stops JSON | Add **backend** GTFS Static loader for schedule features; keep React off raw `.txt` |
| Realtime | `liveTransitService` → `/gtfs-rt/rapid-bus-kl` (bus vehicle positions) | Reuse proxy pattern; rail RT currently **not** stable on data.gov.my |
| Backend | **None** (SPA only) | New `backend/` FastAPI for predict + pipelines |
| DB | None / unused Supabase | Local Parquet or SQLite for operational history |
| Tests | Frontend ESLint / tsc; no formal FE test harness assumed | Python `pytest` + fixtures; FE tests if/as project already supports |

**Do not break:** Map reachability (Epic 1), first-mile (Epic 3), essential services (Epic 5).

---

## 2. HARD GATE — Missing data dependency (read before coding ML)

### What the model needs as ground truth

```
actual_delay_minutes = actual_arrival − scheduled_arrival
```

- `scheduled_arrival` ← GTFS Static `stop_times` (+ calendar).  
- `actual_arrival` ← **observed** vehicle at/near stop (geofence on vehicle-position history), **never** copied from schedule.

### What exists today

| Mode | GTFS Static | Public GTFS-RT vehicle positions | Historical RT archive in repo |
|------|-------------|----------------------------------|-------------------------------|
| MRT / LRT | Yes (`rapid-rail-kl`) | **No stable feed** (docs: rail RT not provided) | **None** |
| BRT Sunway | Yes (as TRAM in same rail feed) | Same as rail — **no stable RT** | **None** |
| Rapid Bus KL | Yes (`rapid-bus-kl`) | **Yes** | **None** (only live fetch) |

### Implication

1. **You must not invent** historical `actual_arrival` rows.  
2. **You must not** train CatBoost on synthetic delays.  
3. Until a **collection job** has stored enough matched trip–stop arrivals, every MRT/LRT/BRT query returns:

   `Prediction unavailable — insufficient historical operational data`

4. UI may still list all loaded MRT/LRT/BRT lines (AC 7.1.1); capability flags mark `prediction_available: false`.  
5. Optional later: if product expands to **bus**, the same pipeline can become prediction-enabled sooner because RT exists — **out of current epic wording**, note as next step only.

### Minimum collection plan (unblock Stages 3–5)

1. Poll vehicle positions on a fixed interval (e.g. 15–30s) for any feed that later supports rail/BRT RT **or** agree with mentors to scope bus as pilot.  
2. Persist raw observations (Parquet/SQLite) with timestamp.  
3. Offline: match → geofence → `actual_delay_minutes` + quality flags.  
4. Only rows with adequate match confidence enter training.  
5. Document coverage: lines, stops, date range, sample counts.

**Until that exists: implement Stages 1–2 and 6–7 UI/API with capability = unavailable; Stages 3–5 produce empty datasets and fail closed.**

---

## 3. Domain model (business objects)

### 3.1 Service identity

| Field | Meaning |
|-------|---------|
| `mode` | `mrt` \| `lrt` \| `brt` (normalize from GTFS `route_type` / project line metadata) |
| `line_id` | Stable product id (e.g. KGL, KJ, BRT) |
| `route_id` | GTFS `route_id` |
| `trip_id` | GTFS `trip_id` |
| `stop_id` | GTFS `stop_id` |
| `stop_sequence` | Order on trip |
| `service_date` | Local calendar date of the scheduled trip |

### 3.2 Schedule vs observation

| Field | Source | Rule |
|-------|--------|------|
| `scheduled_arrival` | GTFS `stop_times.arrival_time` + service_date | OK for features |
| `actual_arrival` | Derived from RT geofence | **Only** if quality OK |
| `scheduled_headway` | Diff of consecutive scheduled departures at stop | |
| `observed_headway` | Diff of consecutive observed arrivals | Live / history |
| `previous_stop_delay` | Delay at previous stop on same trip | Live features |
| `current_delay` | Now − scheduled (or last observed − scheduled) | Live |
| `headway_ratio` | `observed_headway / scheduled_headway` | Live |
| `vehicle_id`, `lat`, `lon`, `timestamp` | RT | |

### 3.3 Target

```
actual_delay_minutes = (actual_arrival − scheduled_arrival) in minutes
```

Exclude from training if:

- no reliable geofence hit,  
- match confidence low,  
- schedule ambiguous (multiple trips),  
- clock skew / future-leakage features present.

### 3.4 Capability record (per line or per stop+line)

```json
{
  "mode": "lrt",
  "line_id": "KJ",
  "static_available": true,
  "historical_operational_data_available": false,
  "realtime_available": false,
  "model_available": false,
  "prediction_available": false,
  "unavailable_reason": "insufficient_historical_operational_data"
}
```

**Business rule:** UI can select any loaded MRT/LRT/BRT; AI output only if `prediction_available === true`.

---

## 4. User Story 7.1 — AI Transit Delay Prediction

### Business flow

```
User opens Reliability
  → select mode, line, stop, datetime
  → POST/GET predict
  → if !capability.prediction_available
       → show unavailable message (no delay, no risk band)
  → else run Historical Forecast model (or Live if §5 applies)
  → return expected_delay_min + risk_level + metadata
```

### AC 7.1.1 — Service and time selection

**Logic**

1. Load lines/stops from GTFS-backed domain service (MRT/LRT/BRT only).  
2. Form fields: mode → line → stop → date/time.  
3. All **loaded** services appear even if not prediction-enabled.  
4. Disable or allow submit always; result card handles unsupported.

**Commit:** `epic7-selection-form-and-static-catalog`

### AC 7.1.2 — Expected delay

**Logic**

1. Resolve capability for `(mode, line_id, stop_id)` (or line-level policy).  
2. If no validated model / insufficient history → 7.1.4.  
3. Else build **historical** feature vector for selected datetime (no live features for future dates).  
4. Model outputs `expected_delay_min` (float minutes).  
5. Never round to “exact arrival clock time” as a promise.

**Commit:** `epic7-historical-predict-api` (after model exists)

### AC 7.1.3 — Reliability risk level

**Logic**

1. Take `expected_delay_min`.  
2. Look up historical delay distribution for **comparable** slice:  
   same `line_id` + same `stop_id` + similar time bucket (e.g. hour-of-week or hour + weekday).  
3. Compute percentile of prediction within that distribution.  
4. Map percentiles (configurable):

| Percentile | Risk |
|------------|------|
| 0–25 | Low |
| 25–50 | Moderate |
| 50–75 | High |
| 75–100 | Very High |

5. **Do not** use global fixed minute cutoffs (e.g. 0–3 = Low) unless documented exception.

**Commit:** `epic7-risk-bands-from-distribution`

### AC 7.1.4 — Insufficient data

**Logic**

```
supported: false
reason: insufficient_historical_operational_data
user message: "Prediction unavailable — insufficient historical operational data"
```

No `expected_delay_min`, no `risk_level`.

**Commit:** covered by capability layer `epic7-capability-layer`

---

## 5. User Story 7.2 — Realtime-adjusted reliability

### Business flow

```
If query datetime is "now" / within live window
  AND fresh RT observations exist for matched trip
  → Live-Adjusted model
Else if historical model available
  → Historical Forecast + "realtime adjustment unavailable"
Else
  → unavailable
```

### AC 7.2.1 — Realtime trip matching

**Logic**

1. Ingest vehicle entity: `trip_id`, `route_id`, `vehicle_id`, position, timestamp.  
2. Join to GTFS Static trip/route/stop_times.  
3. If IDs need normalization (prefixes), document mapping rules.  
4. Unmatched observations: flag `match_failed`, **exclude** from training; do not invent trip.

**Commit:** `epic7-realtime-trip-matching`

### AC 7.2.2 — Realtime operational features (MVP)

**Minimum for live-adjusted:**

| Feature | Definition |
|---------|------------|
| `current_delay` | Derived delay at last reliable stop or vs schedule at now |
| `scheduled_headway` | From static |
| `observed_headway` | From recent observed arrivals at stop |
| `headway_deviation` or `headway_ratio` | `observed / scheduled` or difference |

Optional later: `previous_stop_delay`, `vehicle_speed`, bunching, active vehicle count — only if reliable.

**Leakage rule:** never use future stops’ actuals to predict earlier events.

**Commit:** `epic7-live-features`

### AC 7.2.3 — Live-adjusted status

**Logic**

- `prediction_type: "live_adjusted"`  
- `realtime_used: true`  
- `realtime_timestamp: <ISO of latest observation used>`  
- UI label: **Live-adjusted** + “Realtime data updated: …”

**Commit:** `epic7-live-predict-api` + FE status

### AC 7.2.4 — Missing / stale realtime

**Logic**

1. Configure `REALTIME_FRESHNESS_SECONDS` (e.g. 120–300).  
2. If no RT or stale → **fall back to historical** if `model_available`.  
3. UI: clearly state realtime adjustment unavailable; `prediction_type: "historical"`.  
4. Do **not** hard-fail the epic when RT is down.

**Commit:** `epic7-realtime-fallback`

---

## 6. User Story 7.3 — Explainable and trustworthy AI

### AC 7.3.1 — Why this prediction?

**Logic**

1. Compute SHAP (or documented feature contributions) for the prediction.  
2. Map top factors to **plain language**, association wording only:  
   - “Current headway is longer than scheduled”  
   - “Associated with higher predicted delay at this hour historically”  
3. Forbidden: “X caused the delay” without causal evidence.  
4. FE: “Why this prediction?” section; no raw SHAP numbers required.

**Commit:** `epic7-shap-explanations`

### AC 7.3.2 — Uncertainty

**Logic**

1. Document method (e.g. quantile regression, residual percentiles, conformal interval).  
2. Return `prediction_lower_min` / `prediction_upper_min` when available.  
3. UI: “Expected delay: 6.4 min · Typical range: 4–9 min”.  
4. Never present as exact guaranteed arrival.

**Commit:** `epic7-prediction-uncertainty`

### AC 7.3.3 — Methodology transparency

**Logic** — expose:

| Field | Example |
|-------|---------|
| `model_version` | `reliability-v1` |
| `model_type` | `CatBoostRegressor` |
| Data sources | GTFS Static; historical operational observations |
| Realtime contributed | yes/no |
| Training period | e.g. Jan–Aug 2026 |

**Commit:** `epic7-model-registry-metadata`

### AC 7.3.4 — Validation gate (mandatory before enable)

**Logic**

1. Chronological split (e.g. 70% train / 15% val / 15% test **by time**).  
2. Baseline: historical **median** delay for comparable line+stop+time bucket.  
3. AI vs baseline: **MAE**, **RMSE** on hold-out.  
4. Persist metrics in registry; **do not** set `prediction_available` until recorded.  
5. Random shuffle split is forbidden.

**Commit:** `epic7-train-evaluate-registry`

---

## 7. Pipelines (business rules)

### 7.1 GTFS Static pipeline

**Inputs:** `routes`, `trips`, `stops`, `stop_times`, `calendar` (+ `shapes` if needed).  

**Rules:**

- Normalize into domain types in backend.  
- React **never** reads raw GTFS files.  
- Abstraction: `StaticTransitCatalog` / `GtfsStaticRepository`.

**Commit:** `epic7-gtfs-static-loader`

### 7.2 Historical / realtime operational pipeline

**Inputs:** high-frequency vehicle positions.  

**Steps:**

1. Match observation → scheduled trip.  
2. Map to stop via **documented geofence** (radius + optional bearing/sequence).  
3. Prefer multiple samples to reduce GPS noise.  
4. Compute `actual_arrival`, then `actual_delay_minutes`.  
5. Attach data-quality flags; drop bad rows from training.

**Forbidden:** using `scheduled_arrival` as `actual_arrival`.

**Commit:** `epic7-arrival-detection` then `epic7-build-training-dataset`

### 7.3 Feature engineering (MVP historical)

| Feature | Notes |
|---------|--------|
| mode, line_id, stop_id, stop_sequence | Categorical |
| hour, day_of_week, is_weekend | From query/service time |
| scheduled_headway | Static |
| historical_median_delay | Comparable slice, **past only** |
| historical_mean_delay | Comparable slice, **past only** |

Live adds: previous_stop_delay, current_delay, observed_headway, headway_ratio, speed if reliable.

**Commit:** `epic7-feature-engineering`

### 7.4 Models

1. **Baseline:** median delay for line + stop + time period.  
2. **AI:** CatBoostRegressor preferred (categoricals); XGBoost allowed if stack already justified — document choice.  
3. **Historical Forecast** — schedule + historical features; for future / non-live queries.  
4. **Live-Adjusted** — only when query is near-now and RT fresh; **never** use live RT to score arbitrary future dates.

**Commit:** `epic7-baseline-and-catboost`

---

## 8. API contract

`GET /api/reliability/predict`

**Query:** `mode`, `line_id`, `stop_id`, `datetime` (ISO, Asia/Kuala_Lumpur semantics documented).

**Success (supported):**

```json
{
  "supported": true,
  "prediction_type": "historical",
  "expected_delay_min": 6.4,
  "risk_level": "high",
  "historical_percentile": 84,
  "prediction_lower_min": 4.0,
  "prediction_upper_min": 9.0,
  "scheduled_headway_min": 5.0,
  "observed_headway_min": null,
  "realtime_used": false,
  "realtime_timestamp": null,
  "model_version": "reliability-v1",
  "explanations": [
    "This hour has historically higher delay on this line and stop",
    "Scheduled headway is associated with higher predicted delay in similar cases"
  ],
  "methodology": {
    "model_type": "CatBoostRegressor",
    "data_sources": ["gtfs_static", "historical_operational_observations"],
    "training_period": { "start": "2026-01-01", "end": "2026-08-31" },
    "realtime_contributed": false
  }
}
```

**Unsupported:**

```json
{
  "supported": false,
  "reason": "insufficient_historical_operational_data",
  "message": "Prediction unavailable — insufficient historical operational data"
}
```

**Commit:** `epic7-reliability-api`

---

## 9. Frontend business UI

### Location

```
src/features/transit-reliability/
  components/
    ReliabilityQueryForm.tsx
    ReliabilityResultCard.tsx
    ReliabilityRiskBadge.tsx
    PredictionExplanation.tsx
    PredictionDataStatus.tsx
  hooks/useReliabilityPrediction.ts
  services/reliabilityApi.ts
  types.ts
  index.ts
```

Page entry: wire from `App` / nav **without** removing existing pages (new page or Map panel tab). Prefer new route/page id e.g. `reliability` with `hidden` false only when ready.

### Must display

- Mode, line, stop, selected datetime  
- Expected delay  
- Risk badge  
- Historical vs Live-adjusted  
- Realtime timestamp if used  
- Uncertainty range if available  
- Why this prediction?  
- Methodology / sources  
- Disclaimer: AI estimate, not guaranteed arrival  
- Unsupported copy exactly as AC  

### States

loading / error / unsupported / success — all tested.

**Commit:** `epic7-reliability-ui`

---

## 10. Suggested commit sequence (implement in order)

Use these exact commit message prefixes on branch `epic7`:

| # | Commit message | Delivers |
|---|----------------|----------|
| 0 | `epic7-implementation-spec` | This document |
| 1 | `epic7-backend-scaffold` | `backend/` FastAPI skeleton, config, health |
| 2 | `epic7-domain-types` | Shared schemas (Pydantic + FE types) |
| 3 | `epic7-gtfs-static-loader` | Static catalog abstraction |
| 4 | `epic7-capability-layer` | Capability matrix; all rail prediction_available=false until data |
| 5 | `epic7-reliability-api-unavailable` | Predict endpoint always fail-closed + contract tests |
| 6 | `epic7-reliability-ui` | Form + unsupported/loading/error cards; no fake numbers |
| 7 | `epic7-realtime-ingestion` | Poll + store RT (when feed exists); bus optional pilot |
| 8 | `epic7-realtime-trip-matching` | Match RT ↔ static |
| 9 | `epic7-arrival-detection` | Geofence → actual_arrival + quality flags |
| 10 | `epic7-build-training-dataset` | Training table Parquet/SQLite |
| 11 | `epic7-feature-engineering` | Historical (+ live) features |
| 12 | `epic7-baseline-and-catboost` | Baseline + CatBoost train scripts |
| 13 | `epic7-train-evaluate-registry` | Chrono split, MAE/RMSE, gate |
| 14 | `epic7-risk-bands-from-distribution` | Percentile risk |
| 15 | `epic7-historical-predict-api` | Enable historical when registry says OK |
| 16 | `epic7-live-features` | Live feature assembly |
| 17 | `epic7-live-predict-api` | Live-adjusted + timestamp |
| 18 | `epic7-realtime-fallback` | Stale RT → historical |
| 19 | `epic7-shap-explanations` | Plain-language factors |
| 20 | `epic7-prediction-uncertainty` | Range / confidence |
| 21 | `epic7-acceptance-tests-docs` | AC map, runbooks, limitations |

**Rule:** After each commit, `npm run typecheck`, frontend build, and Python tests must pass. Epic 1/3/5 smoke still OK.

---

## 11. AC → implementation map

| AC | Primary modules | Tests |
|----|-----------------|-------|
| 7.1.1 | FE form + static catalog | Catalog lists MRT/LRT/BRT |
| 7.1.2 | predict service + model | Supported fixture → delay number |
| 7.1.3 | risk band service | Percentile → band |
| 7.1.4 | capability | Unsupported → message, no delay |
| 7.2.1 | trip matcher | Match fixture / fail unclean |
| 7.2.2 | live features | Features present when RT OK |
| 7.2.3 | API + FE | `live_adjusted` + timestamp |
| 7.2.4 | fallback | Stale → historical + flag |
| 7.3.1 | explain | Explanations array non-empty |
| 7.3.2 | uncertainty | lower/upper or documented skip |
| 7.3.3 | registry meta | Methodology fields |
| 7.3.4 | evaluate.py | Metrics file required before enable |

---

## 12. Testing rules

- Fixtures = **test only**; never served as production predictions.  
- Cases: supported, unsupported, stale RT fallback, live_adjusted, risk bands, GTFS matching, delay math, invalid ground truth skipped, FE loading/error/unsupported/success.  
- No prediction when actual-arrival quality invalid.

---

## 13. Runbooks (fill when code exists)

### Ingest static

```bash
# download rapid-rail-kl GTFS → backend data dir
# python -m data_pipeline.gtfs_static_loader
```

### Collect RT (when available)

```bash
# python -m data_pipeline.realtime_loader --interval 20
```

### Build training set / train / evaluate

```bash
# python -m data_pipeline.build_training_dataset
# python -m models.train_historical
# python -m models.evaluate   # must write metrics before enabling
```

### Backend / frontend

```bash
# uvicorn app.main:app --reload --port 8000
# npm run dev   # proxy /api → backend if configured
```

---

## 14. Prediction-enabled services (initial truth)

| Service | Visible in UI | prediction_available | Reason |
|---------|---------------|----------------------|--------|
| All loaded MRT/LRT/BRT lines from rapid-rail-kl | Yes (after catalog) | **No** | No historical operational ground truth in repo; no stable public rail RT to derive actual arrivals |
| Rapid Bus (not in epic scope) | N/A | Potentially later | RT exists but epic scope is MRT/LRT/BRT |

Update this table when collection + evaluation gate pass.

---

## 15. Known limitations

1. Public **rail** GTFS-RT gap blocks real delay labels for MRT/LRT/BRT.  
2. Live-adjusted mode requires fresh RT; otherwise historical only.  
3. Geofence arrivals are approximate; quality flags mandatory.  
4. Risk bands are **relative** to history, not absolute comfort.  
5. Predictions are not journey planners / OTP replacements.

---

## 16. Recommended next steps after this spec

1. Confirm with mentors: **collect RT archive** vs **narrow epic** vs **bus pilot** under same pipeline.  
2. Implement commits `epic7-backend-scaffold` → `epic7-reliability-ui` (fail-closed).  
3. Start collectors early — ML needs calendar time.  
4. Only then train CatBoost and flip capability flags per line.

---

## 17. Deliverable checklist (end of epic)

- [ ] Files added/changed summary  
- [ ] Architecture explanation  
- [ ] Data-source and quality assumptions  
- [ ] Ingest / train / evaluate / run backend / run frontend instructions  
- [ ] Baseline vs AI MAE/RMSE  
- [ ] Enabled vs visible-not-enabled service lists  
- [ ] AC 7.1.1–7.3.4 ↔ code/tests map  
- [ ] Known limitations and next steps  

---

*End of Epic 7 implementation specification.*
