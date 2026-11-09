# SurakshyaPath — API Contracts Baseline

**Phase:** 1 — Architecture and Development Baseline  
**Contract status:** Observed current contract plus proposed hardening requirements  
**Implementation status:** Documentation only; no API code changed

## 1. Contract principles

- The Research Lab API is read-only.
- All research responses describe deterministic synthetic experiments, not observed incident data.
- Research API results are sourced from committed artifacts and the canonical dataset metadata; they are not live operational calculations.
- Research model outputs must remain separate from legacy dashboard endpoints.
- Response values must be traceable to committed artifacts or tested research functions.
- Errors must be controlled and must not expose filesystem paths or stack traces.
- The exact response schema should be versioned and validated before artifact formats evolve.

This document distinguishes **observed behavior** from **target requirements**. It does not claim runtime validation has already been implemented.

## 2. Base paths and transport

| Item | Current behavior |
|---|---|
| Local base | `http://localhost:3000` (local workflow) |
| Research prefix | `/api/research` |
| Format | JSON |
| Methods | GET only |
| Cache behavior | Express middleware sets `Cache-Control: no-store` for `/api/*` |
| Missing artifacts | Research routes return HTTP 503 with a generic error |
| Unknown API route | HTTP 404 with `{"error":"API endpoint not found."}` |
| Unsupported research method | Currently falls through to API 404; POST overview is tested as 404 |

No authentication contract is defined for the local read-only Research Lab. Do not infer that the legacy write endpoints are safe for public exposure.

## 3. Endpoint inventory

| Method and path | Purpose | Current source |
|---|---|---|
| `GET /api/research/overview` | Research question, dataset provenance/metadata, canonical summary, interpretation boundaries | CSV row count and summary/robustness JSON |
| `GET /api/research/models` | Four model identities and per-zone score/rank values | Model CSV files and research summary JSON |
| `GET /api/research/allocation` | Stored model allocation vectors for budgets 6, 12, 20 | `allocation/allocation-summary.json` |
| `GET /api/research/routes` | Stored nearest-neighbour and optimized route comparison | `patrol/route-comparison.json` |
| `GET /api/research/robustness` | Five-seed designed-scenario results | `robustness/robustness-summary.json` |

## 4. Current response shapes

The shapes below describe fields observed in the current source and tests. They are not a replacement for machine-validated JSON Schema files.

### 4.1 Overview

`GET /api/research/overview`

Observed top-level fields:
- `schemaVersion`: currently `"1.0.0"`.
- `project`: currently `"SurakshyaPath Research Lab"`.
- `researchQuestion`: explanatory research question string.
- `dataset`: metadata object.
- `canonicalSummary`: stored research summary object.
- `interpretation`: allowed interpretation and claims not established.

Observed dataset fields:
- `recordCount`: 1,567 in the current baseline.
- `canonicalSeed`: 208304.
- `robustnessSeeds`: values supplied by robustness summary.
- `spatialUnits`: 10 in the current baseline.
- `dataStatus`: `"SYNTHETIC"`.
- `sourceFile`: `"data/synthetic_incidents.csv"`.
- `provenanceNote`: synthetic-data disclosure.

The API calculates row count from the canonical CSV and reads summary/robustness JSON. The current implementation does not formally validate these artifacts against a schema before responding.

### 4.2 Models

`GET /api/research/models`

Observed top-level fields:
- `models`: array of four model records.
- `baselineModel`: currently `"frequency-only"`.
- `normalization`: explanatory normalization string.

Each model includes:
- `id`
- `label`
- `topZone`
- `meanAbsoluteRankShift`
- `zonesWithRankChange`
- `zones`: array of ten zone records.

Each zone record includes:
- `zone`
- `score` (number)
- `rank` (number)
- `incidentCount` (number)

Stable model IDs in the current test contract:
1. `frequency-only`
2. `severity-only`
3. `frequency-severity`
4. `current-severity-recency`

The current test expects ranks 1–10 exactly once per model and maximum normalized score 100. Scores are not probabilities.

### 4.3 Allocation

`GET /api/research/allocation`

The route returns the stored allocation summary JSON directly. The current regression test establishes:
- `officerCounts` contains 6, 12, and 20.
- `models` contains all four model IDs.
- Each model contains vectors under string budget keys `"6"`, `"12"`, and `"20"`.
- Each vector contains ten zone keys.
- The sum of each vector equals its declared budget.

The field name `officerCounts` and current object structure reflect the stored artifact. It must not be interpreted as staffing advice or a deployment recommendation.

### 4.4 Routes

`GET /api/research/routes`

The route returns the stored route comparison JSON directly. The current test establishes:
- `models` contains all four model IDs.
- Each model includes `nearestNeighbourKm`, `optimizedKm`, `savingsPercent`, `nearestNeighbourOrder`, and `optimizedOrder`.
- Both route orders contain five zones.
- Both route orders contain the same zone membership, with sequence differences allowed.
- Current frequency-only nearest-neighbour distance is 23.62 km and optimized distance is 22.31 km.
- Current severity-only savings percentage is 0.

Distances are geometric experiment outputs, not road-network distance, driving distance, travel time, or route guidance. The API artifact must not be relabeled as an operational route.

### 4.5 Robustness

`GET /api/research/robustness`

The route returns the stored robustness summary JSON directly. The current test establishes:
- `seeds` is `[208304, 208305, 208306, 208307, 208308]`.
- `results` contains five entries.

These are deterministic designed scenarios generated under the same synthetic mechanism. They are not independent samples, confidence intervals, or evidence of external validity.

## 5. Error behavior

### Current behavior

When a required artifact is missing, unreadable, or JSON parsing fails, the route logs an internal message and responds:

```json
{
  "error": "Research artifacts are unavailable. Run the reproducible research pipeline and try again."
}
```

with HTTP 503.

Unknown API paths currently return:

```json
{
  "error": "API endpoint not found."
}
```

with HTTP 404.

Malformed JSON request bodies on the Express app receive HTTP 400, although the research endpoints do not accept request bodies.

### Target requirements

- Validate each artifact before assembling a response.
- Distinguish missing artifacts, invalid artifacts, and unsupported schema versions internally; keep external error messages safe and stable.
- Never expose absolute paths, raw exception messages, stack traces, or secret values.
- Preserve a predictable JSON error envelope.
- Add tests for missing, malformed, truncated, and unsupported-version artifacts.
- Keep error behavior deterministic and document status-code choices.

## 6. Proposed artifact contract hardening

Introduce versioned schema definitions or equivalent validators for:
- overview metadata and provenance;
- model summaries and zone score rows;
- allocation budget vectors;
- route comparison summaries and route membership;
- robustness seed and result arrays.

Validation invariants should include:
1. Exact allowed model IDs and no duplicate IDs.
2. Expected zone cardinality and unique zone names.
3. Numeric values finite and within documented ranges.
4. Rank values form the expected complete rank sequence.
5. Allocation vectors conserve the stated budget.
6. Route order membership is consistent between algorithms for each model.
7. Robustness result count agrees with seed count.
8. Provenance identifies synthetic data and canonical configuration.
9. Schema version is recognized.
10. No event-hour field is inferred from `age_days`.

A schema version change requires an explicit compatibility decision. Do not silently coerce malformed values into zeros or empty arrays.

## 7. Legacy API separation

The following routes belong to the legacy application and are not part of the Research Lab API contract:

- `GET /api/health`
- `GET /api/config`
- `GET /api/incidents`
- `POST /api/incidents`
- `GET /api/risk`
- `GET /api/patrol`
- `GET /api/allocation`
- `GET /api/analytics`
- `GET /api/data-quality`
- `GET /api/intelligence`
- `GET /api/diagnostics`
- `GET /api/dashboard`

They use legacy runtime state and heuristic modules. They must not be substituted for manuscript experiment data or presented as equivalent to the four research models.

## 8. Contract testing matrix

| Case | Expected assertion |
|---|---|
| Overview success | schema version, synthetic status, count, seed, zones, claim boundaries |
| Models success | exact model IDs, ten unique zones, complete ranks, finite scores |
| Allocation success | supported budgets, all models, ten zones, exact conservation |
| Routes success | all models, five unique stops, matching membership, distance units/limits |
| Robustness success | five seeds and matching result count |
| POST to research route | not accepted; current API returns 404 |
| Unknown research endpoint | controlled API 404 |
| Missing artifact | controlled 503 |
| Malformed JSON artifact | controlled 503 without leaking parse details |
| Unsupported schema version | controlled failure; never silently accept |
| Synthetic time precision | no observed hour/night result derived from `age_days` |

## 9. Change control

A change to a response field, model ID, artifact path, units, precision, or interpretation boundary is a contract change. Update:
- this document;
- artifact schema/version;
- API implementation;
- contract tests;
- Research Lab rendering;
- relevant methods/limitations documentation.

Do not change stored research outputs to satisfy presentation-only requirements.
