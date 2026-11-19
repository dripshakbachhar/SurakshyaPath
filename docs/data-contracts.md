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
