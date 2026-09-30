# SurakshyaPath Data Flow

## Canonical incident lifecycle

The dashboard and research experiments now share the same canonical synthetic dataset: `data/synthetic_incidents.csv`.

1. `data/synthetic_incidents.csv` provides 1,567 deterministic records.
2. `data/live-incidents.js` normalizes each research row into the live incident contract, assigns the nearest canonical zone, converts `age_days` into a runtime timestamp, and preserves the `SYNTHETIC` provenance label.
3. `server.js` loads persisted runtime reports when available; a missing/invalid store or legacy 180-record seed store is migrated to the canonical dataset.
4. An anonymous report enters through `POST /api/incidents`.
5. Boundary validation checks location, type, time-window and payload limits.
6. The report is assigned to the nearest canonical zone and receives the shared incident severity.
7. The report is persisted atomically when storage is available.
8. The next dashboard snapshot recomputes risk, analytics, data quality and intelligence from the same incident snapshot.
9. The intelligence layer consumes both validated observations and the resulting risk-zone model.
10. The browser replaces its application state with that snapshot; map, charts, statistics, patrol and intelligence views derive from it.

## Propagation invariant

A successfully persisted incident must appear in the next `/api/dashboard` response, pass the data-quality gate, influence the applicable analytical snapshot, and remain connected to the same risk model. The `npm run smoke` test verifies this path.

## Deployment note

Local hosting has writable JSON persistence. Serverless deployments may have ephemeral/read-only filesystems; the application can still serve the canonical synthetic dataset in memory, while live report persistence requires a durable external store for production deployment.
