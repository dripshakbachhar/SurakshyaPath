# SurakshyaPath — Data Flow and Provenance

**Phase:** 1 — Architecture and Development Baseline  
**Status:** Source-inspected baseline; implementation changes deferred

## 1. Data-flow principles

SurakshyaPath has two distinct data paths:

1. **Research path:** canonical synthetic input → deterministic research computation → committed experiment artifacts → read-only API → Research Lab.
2. **Legacy application path:** synthetic seed and/or local community reports → runtime incident state → legacy heuristics and dashboard endpoints → legacy UI.

These paths share a repository and Express process today, but they do not share the same scientific purpose or interpretation. The Research Lab must not consume mutable report storage or legacy heuristic outputs.

## 2. Research pipeline

```text
data/synthetic_incidents.csv
       |
       v
CSV parsing + field conversion
       |
       v
Coordinate validation
       |
       v
Nearest configured zone-centre assignment
       |
       v
Research scoring models
  | frequency-only
  | severity-only
  | frequency × severity
  | severity × recency
       |
       +---------------------------+
       |                           |
       v                           v
Zone scores/ranks             Experiment inputs
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
             Allocation experiment          Route experiment
             largest remainder              nearest neighbour
             budgets 6/12/20                open-route 2-opt
                    |                             |
                    +--------------+--------------+
                                   |
                                   v
                         Robustness scenarios
                         seeds 208304–208308
                                   |
                                   v
                         JSON / CSV / SVG outputs
                         experiments/results/
                                   |
                                   v
                         Read-only Research API
                                   |
                                   v
                         Research Lab presentation
```

### 2.1 Canonical input

The canonical file is `data/synthetic_incidents.csv`. The current project documentation and API tests identify:
- 1,567 synthetic records;
- canonical seed 208304;
- ten configured spatial units;
- age in days rather than observed event-hour precision.

The CSV parser currently splits rows and fields on commas. This assumes a controlled simple CSV format without quoted commas/newlines. Validate the actual schema and either enforce that restricted format or adopt a standards-compliant parser if the input contract expands.

### 2.2 Spatial assignment

The runtime adapter maps latitude/longitude records to the nearest configured zone centre using squared coordinate differences. The research experiment documentation also describes nearest-centre spatial assignment.

This is a deterministic assignment rule. It is not a boundary polygon, administrative geocoder, or evidence that an event occurred at the zone centre. Any future spatial method change requires a documented experiment change and regenerated outputs.

### 2.3 Scoring

The research suite compares four distinct assumptions:
- frequency-only;
- severity-only;
- frequency × severity;
- severity × recency.

The model implementation normalizes scores relative to the maximum raw score. A normalized value of 100 is the maximum within that model's comparison set; it is not a probability, forecast, or absolute risk scale.

Research severity values are configured separately from legacy incident taxonomy weights. Preserve this separation.

### 2.4 Allocation

The stored allocation experiment applies largest-remainder apportionment to model-derived zone scores at budgets 6, 12, and 20. The resulting vectors are algorithmic allocations used to compare how scoring assumptions propagate.

Do not interpret the word “officer” in an artifact field as an actual staffing recommendation. The API/UI must describe these as fixed-budget mathematical outputs.

### 2.5 Route experiment

The stored route experiment compares nearest-neighbour and open-route 2-opt orderings for five selected zones per model. The current route helper computes haversine great-circle distance.

A separate legacy route helper also estimates duration using an assumed average speed and stop duration. That estimate is not the manuscript route metric and must not be mixed into Research Lab route comparisons.

Do not describe geometric distance as road-network distance, travel time, safety, or operational efficiency.

### 2.6 Robustness scenarios

The five seeds 208304–208308 are generated scenarios under the same synthetic process. They support a bounded comparison of algorithm outputs under designed seed variation.

They do not establish statistical confidence, population variability, external validity, or independent real-world replication.

## 3. Temporal precision and derived-field hazard

### 3.1 Observed source limitation

The canonical CSV supplies `age_days`, not a genuine event timestamp with hour and timezone. In `data/live-incidents.js`, the current adapter calculates:

```js
ts = snapshotNow - ageDays * DAY_MS
```

Because `snapshotNow` is rounded to the current minute, each derived timestamp inherits the current snapshot hour/minute. It preserves an age offset but invents a clock time.

### 3.2 Downstream consequences

Legacy consumers use timestamps to calculate:
- per-hour counts;
- peak hour;
- night share;
- time-window labels for allocation.

Those results can vary with the time the dataset is loaded and the host timezone. They are not event-hour observations. This is a data provenance defect, not merely a timezone formatting bug.

### 3.3 Required flow control

Until the source provides valid event timestamps and a timezone policy:
- represent event-hour precision as unavailable for age-only records;
- do not derive peak-hour or night-share claims from those records;
- do not use fabricated peak hours to produce allocation windows;
- keep valid timestamped community reports in a separately identified stream if legacy behavior needs them;
- label synthetic timestamps only as internal age-ordering values, never as observed event time;
- add tests that prove age-only records cannot enter event-hour aggregation.

Do not repair this by converting local time to UTC or by assigning a fixed hour. Both would still invent precision.

## 4. Research API read path

```text
GET /api/research/{overview|models|allocation|routes|robustness}
       |
       v
Express research router
       |
       +--> read canonical CSV metadata (overview)
       +--> read JSON summaries
       +--> read model CSVs
       |
       v
Assemble JSON response
       |
       v
Browser Research Lab
```

Current implementation reads files synchronously in `routes/research.js`. It returns a generic 503 when a required artifact cannot be read or parsed. Formal artifact schema validation has not yet been demonstrated.

Target sequence:
1. Resolve artifact using a known allow-listed relative path.
2. Read file through a small artifact repository boundary.
3. Parse according to declared format.
4. Validate schema version and invariants.
5. Assemble the response without changing scientific values.
6. Return a stable JSON contract.
7. Record safe internal diagnostics without exposing filesystem details.

## 5. Legacy runtime data path

```text
Application startup / module import (current behavior)
       |
       +--> read data/incidents.json if present
       +--> otherwise seed from canonical synthetic CSV
       +--> save current state to data/incidents.json
       |
       v
In-memory incidents array
       |
       +--> legacy risk / analytics / intelligence
       +--> legacy patrol / allocation
       +--> GET /api/incidents and /api/dashboard
       |
       +--> POST /api/incidents
                 |
                 v
          validate and append
                 |
                 v
          write fixed incidents.json.tmp
                 |
                 v
          rename to incidents.json
```

Current limitations:
- application import performs file I/O and a save;
- state is process-local;
- a fixed temporary path can contend across writers;
- local file storage is not durable shared storage across serverless instances;
- the process-local rate limiter is not shared across instances.

These limitations are acceptable only within an explicitly scoped prototype/development context. The app lifecycle and storage boundary are Phase 3 work; production persistence design is Phase 8.

## 6. Provenance metadata to preserve

Every future artifact manifest or API response should identify, where applicable:
- dataset filename and content hash;
- record count;
- synthetic status and provenance note;
- canonical seed and scenario seed list;
- generator/version or source commit;
- model IDs and configuration version;
- experiment parameters;
- output schema version;
- generation timestamp (for provenance only, not event time);
- units and rounding/precision conventions.

A generation timestamp must never be confused with incident occurrence time.

## 7. Data quality and validation boundaries

Validation should occur at multiple layers:

| Layer | Checks |
|---|---|
| CSV ingestion | Required headers, row width, finite coordinates, finite nonnegative age, allowed categories, finite severity |
| Spatial assignment | Known zone mapping, deterministic tie behavior |
| Research models | Exact model IDs, finite outputs, normalization invariants |
| Allocation | Valid nonnegative budget, vector dimensions, conservation |
| Route outputs | Unique selected zones, matching route membership, explicit distance unit |
| Robustness | Seed/result correspondence, deterministic ordering |
| Artifact repository | Known path, parse success, schema version, required fields |
| API response | Stable shape, safe error, synthetic disclosure |
| Frontend | No invented defaults, no false precision, accessible fallback states |

Invalid records or artifacts should not be silently dropped or coerced without a recorded policy and test.

## 8. Data retention and privacy

The Research Lab's intended path is read-only and does not require user identity, geolocation, or incident submissions. Keep that narrow data surface.

The legacy report endpoint is separate and currently stores report-like data locally. It should not be expanded as part of the Research Lab rebuild. Any future public intake would require a separate privacy, legal, security, retention, abuse-prevention, and durable-storage design review.

## 9. Data-flow acceptance criteria

- Every Research Lab value has a traceable artifact or tested computation.
- Synthetic status and provenance remain visible.
- Research and legacy data paths remain isolated.
- Age-only source data cannot create event-hour claims.
- Geometric route distance remains clearly labeled.
- Seed scenarios are not presented as independent samples.
- Missing or invalid artifacts fail safely.
- No real-world operational action is triggered by research outputs.
