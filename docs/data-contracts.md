# SurakshyaPath Data Contracts

## Incident contract

Dashboard and imported records use a normalized shape while retaining source
labels that distinguish canonical synthetic records, community reports, and
user imports:

```json
{
  "id": "string",
  "zone": "zone-id",
  "type": "theft | suspicious | harassment | infrastructure",
  "severity": 5,
  "ts": 0,
  "reporter": "string",
  "note": "string",
  "lat": 27.7,
  "lng": 85.3,
  "sourceType": "simulation | community-report | user-import",
  "dataStatus": "SYNTHETIC | LIVE | IMPORTED"
}
```

Canonical synthetic data is immutable through the web API. Community reports
are persisted separately and may be combined with the synthetic seed for the
local live dashboard. Imported datasets are separately identified and are not
stored over the canonical benchmark.

The active dataset summary includes an `id` and `provenance`; imported
summaries also expose the saved `importedDatasetId`. Dataset-specific research
responses include `sourceDataset.id` and the same id in their result dataset
metadata. The fixed research-summary response identifies
`canonical-synthetic-benchmark-v1`.

## Dataset import contract

The browser accepts CSV with a header row or a JSON array of records / object
with a `records` array. Required mapped fields are zone, category, latitude,
and longitude. Date/time and source identifier are optional; severity defaults
to `1` when absent and otherwise must be in `[0, 10]`. Coordinates must be
finite decimal degrees within latitude `[-90, 90]` and longitude `[-180, 180]`.
Imports are limited to 50,000 records, 100 zones, and 100 categories. When an
identifier column is selected, identifiers must be unique.

Validation is all-or-nothing. Parser structure errors or any invalid row or
dataset-level limit prevent persistence; accepted count is zero unless every
record passes. The summary contains counts and bounded, generic issue samples,
not source record values. Blank CSV lines are skipped and counted. Source
files and the serialized mapped JSON request are each limited to 4 MiB.

The normalized timestamp contract preserves precision:

- `YYYY-MM-DD` is a UTC date interval, never an exact event timestamp.
- ISO date-times are exact; a date-time without an offset is interpreted as
  UTC.
- A closed `start/end` value is an approximate range.
- Blank values and recognized unknown tokens are retained as unknown time.
- Malformed and future timestamps are rejected.

No event hour is inferred from date-only, range, or unknown values. Range and
unknown records are excluded from severity × recency analysis; date-only ages
use UTC calendar days. Temporal coverage and exclusions are returned with
dataset-specific research results.

An imported dataset retains an import-prefixed ID and name both as dataset
fields and in provenance, along with original filename (basename only), source
format, import time, record count, selected mapping, validation summary,
blank-line count when supplied, temporal precision counts, schema version, and
SHA-256 hash of normalized records. The API stores one
imported dataset at a time; successful replacement is distinct from the
canonical synthetic benchmark and community reports. Switching modes does not
discard the saved import. Local JSON persistence has no automatic expiration
or per-user access control.

Dataset-specific research responses identify `sourceDataset` by ID, name,
schema version, and content hash where available. Their result metadata
includes record/zone/category counts, temporal precision, exclusions and
warnings, and model configuration. The fixed `/api/research/summary` response
also identifies the canonical benchmark and reports its record/zone counts,
date-level synthetic precision, unavailable hourly analysis, and model
configuration. Analysis errors do not fall back to the canonical benchmark.
Routes and allocations are experimental comparisons, not validated
operational instructions.

## Dashboard snapshot

```json
{
  "incidents": [],
  "zones": [],
  "analytics": {},
  "stats": {},
  "intelligence": {},
  "dataQuality": {}
}
```

The storage status returned by health/dashboard/diagnostics distinguishes
`configured`, observed `readable` and `writable` outcomes, `available`, and a
`durability` description. For local JSON storage, `writable` remains unknown
until an actual successful write; the app does not probe by creating a file.
Atomic rename is not a managed durability guarantee.

## Intelligence contract

```json
{
  "status": "SUCCESS",
  "modelType": "STATISTICAL_HEURISTIC",
  "modelVersion": "heuristic-intelligence-v1",
  "generatedAt": "ISO-8601",
  "summary": "string",
  "patterns": [],
  "anomalies": [],
  "riskFactors": [],
  "recommendations": [],
  "confidence": 0,
  "dataCoverage": {},
  "trend": {},
  "limitations": []
}
```

## Data-quality contract

The data-quality response reports received, accepted and rejected records plus duplicate, future-date, missing-value and coordinate diagnostics. Rejected examples are capped to a small sample so diagnostics do not expose an unbounded payload.

Only quality-approved records are eligible for intelligence analysis.

## Compatibility rule

The backend is the source of truth for analytical values. Frontend code must render returned values rather than reimplementing risk or intelligence calculations.
