# Diagnostics

## Endpoints

### `GET /api/health`

Basic service liveness.

### `GET /api/data-quality`

Reports:

- records received
- records accepted
- records rejected
- duplicate count
- future-date count
- coordinate validation count
- quality score
- sampled rejection reasons

### `GET /api/intelligence`

Returns the current explainable intelligence contract.

### `GET /api/diagnostics`

Combines data, pipeline, model and persistence state.

Example shape:

```json
{
  "status": "SUCCESS",
  "data": {
    "records": 180,
    "validRecords": 180,
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

A storage value of `false` means the application is currently operating in memory and a restart may discard new reports.
