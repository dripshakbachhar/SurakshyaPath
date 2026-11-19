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
    "configured": true,
    "available": true,
    "readable": true,
    "writable": null,
    "durable": false,
    "durability": "Best-effort local filesystem with atomic rename; not a managed database or guaranteed against machine/storage loss.",
    "reason": null
  },
  "model": {
    "type": "STATISTICAL_HEURISTIC",
    "version": "heuristic-intelligence-v1"
  }
}
```

The health endpoint also reports `operatingMode` and `mutationPolicy`.
`pipeline.storage` remains a compatibility boolean. The `storage` object
reports whether storage is configured, whether reads/writes have actually
succeeded, availability, and a durability description. Local JSON storage is
best-effort and is not a managed production database. Before any local write,
`writable` is `null` (unknown), not verified true; diagnostics do not create
probe files. If there are no persisted files yet, `readable` and `available`
can also remain `null` until an operation succeeds. Public-read-only mode reports `configured`, `available`,
`readable`, and `writable` as false; research reads from the canonical
synthetic dataset remain available and mutation endpoints return `503`.

The mode applies to deployments beyond Vercel. An unsupported mode setting
fails closed. Malformed or unreadable local state is reported in `reason` and
disables persistent writes for that process. The application does not replace
corrupt state with a success-shaped in-memory fallback.
