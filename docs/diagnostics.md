# Diagnostics

## Endpoints

### `GET /api/health`

Basic service liveness.

### `GET /api/data-quality`

Reports received, accepted and rejected records plus duplicate, future-date, missing-value and coordinate diagnostics.

### `GET /api/intelligence`

Returns the explainable intelligence contract, including risk-model factors and evidence coverage.

### `GET /api/diagnostics`

Combines data, pipeline, model and persistence state.

Example shape:

```json
{
  "status": "SUCCESS",
  "data": {
    "records": 1567,
    "validRecords": 1567,
    "qualityScore": 1
  },
  "pipeline": {
    "storage": true,
    "risk": true,
    "analytics": true,
    "intelligence": true
  },
  "model": {
    "type": "STATISTICAL_HEURISTIC",
    "version": "heuristic-intelligence-v1"
  }
}
```

A storage value of `false` means the application is currently operating in memory and a restart may discard new reports. This can occur on serverless filesystems and is not equivalent to durable production persistence.
