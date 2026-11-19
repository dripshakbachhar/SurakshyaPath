# SurakshyaPath Data Flow

## Canonical incident lifecycle

The dashboard and research experiments now share the same canonical synthetic dataset: `data/synthetic_incidents.csv`.

1. `data/synthetic_incidents.csv` provides 1,567 deterministic records with integer `age_days`.
2. `data/live-incidents.js` assigns the nearest canonical zone and converts each age into a UTC calendar-date interval. The legacy `ts` field is a date anchor, not an observed event time; each record carries `time.precision: "date"` and `time.origin: "synthetic"`.
3. `server.js` restores local incidents, imported data, and the active dataset through the storage interface. Missing incident data starts from the canonical synthetic dataset without a startup write; invalid stored state is reported and blocks further writes rather than being silently overwritten.
4. An anonymous report enters through `POST /api/incidents`.
5. Boundary validation checks location, type, approximate time-window and payload limits.
6. The report is assigned to the nearest canonical zone and receives a bounded approximate time interval plus a separate submission timestamp.
7. Local reports are written through the atomic JSON adapter before becoming part of the in-memory snapshot. When persistent storage is unavailable, the endpoint returns `503` without changing the snapshot.
8. The next dashboard snapshot recomputes risk, analytics, data quality and intelligence from the same incident snapshot.
9. The intelligence layer consumes both validated observations and the resulting risk-zone model.
10. The browser replaces its application state with that snapshot; map, charts, statistics, patrol and intelligence views derive from it.

## Propagation invariant

A successfully persisted incident must appear in the next `/api/dashboard` response, pass the data-quality gate, influence the applicable analytical snapshot, and remain connected to the same risk model. The `npm run smoke` test verifies this path.

## Deployment note

Local hosting has writable JSON persistence. Vercel uses a read-only adapter when no durable provider is configured: the canonical synthetic dataset and fixed research results remain available, while community reports, dataset imports, and dataset switching return an explicit `503`. No writes are made to project files or `/tmp`. A durable external store is required before enabling persistent production writes.

Dataset uploads are limited to 4 MiB both at the browser and Express request-body boundaries. The limit is below [Vercel's 4.5 MB function request-body ceiling](https://vercel.com/docs/functions/limitations#request-body-size); the browser additionally checks the serialized, mapped JSON payload because it can be larger than its source file.

## Temporal contract

All event-time bounds, date buckets, and hourly metrics use UTC. Exact timestamps, date-only observations, approximate report windows, synthetic dates, and unknown legacy timestamps remain distinct in the `time` object. `ts` is retained for compatibility but is not authoritative when precision metadata is present. Hour-of-day metrics require exact, non-synthetic timestamps; counts that cannot be determined from the recorded interval are returned as unavailable and accompanied by exclusion counts.

The record shape is `time: { precision, origin, start, end, window }`. `precision` is `instant`, `date`, `range`, or `unknown`; `origin` identifies `imported`, `synthetic`, `community-report`, `legacy`, `missing`, `unknown`, or invalid metadata. `start` and `end` are inclusive UTC epoch milliseconds (both `null` for unknown time); an instant has equal bounds, a date spans its UTC calendar day (clipped at the import/simulation time for the current date), and a range has the chosen window's explicit bounds. `window` names a community-report option when applicable. The compatibility `ts` equals the interval start for newly normalized records.

Community-report windows are defined as: `now` = the preceding 60 minutes; `today` = UTC midnight through submission; `week` = the preceding 7 × 24 hours; `month` = the preceding 30 × 24 hours. Every interval ends at the server's report-submission time.
