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
  "storage": {
    "mode": "local-json",
    "available": true,
    "writable": true,
    "durable": true,
    "reason": null
  },
  "model": {
    "type": "STATISTICAL_HEURISTIC",
    "version": "heuristic-intelligence-v1"
  }
}
```

`pipeline.storage` remains a compatibility boolean. The `storage` object reports
the adapter mode, availability, write support, durability classification, and
any failure reason. Local JSON storage is available for development but is not
a managed production data service. On Vercel without a configured durable
provider, the status is `mode: "read-only"` with `available` and `writable`
false; research reads remain available and write endpoints return `503`.

Malformed or unreadable local state is reported in `reason` and disables
persistent writes for that process. The application does not replace corrupt
state with a success-shaped in-memory fallback.
