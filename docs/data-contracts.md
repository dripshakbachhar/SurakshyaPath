# SurakshyaPath Data Contracts

## Incident contract

All dashboard incidents use the same normalized shape regardless of whether they came from the canonical synthetic dataset or a live report:

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
  "sourceType": "simulation | community-report",
  "dataStatus": "SYNTHETIC | LIVE"
}
```

The dashboard never treats synthetic records as real-world police records.

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
