# SurakshyaPath Data Contracts

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

## Compatibility rule

The backend is the source of truth for analytical values. Frontend code must render returned values rather than reimplementing risk or intelligence calculations.
