# SurakshyaPath Data Flow

## Canonical incident lifecycle

The dashboard and research experiments now share the same canonical synthetic dataset: `data/synthetic_incidents.csv`.

1. `data/synthetic_incidents.csv` provides 1,567 deterministic records with integer `age_days`.
2. `data/live-incidents.js` assigns the nearest canonical zone and converts each age into a UTC calendar-date interval. The legacy `ts` field is a date anchor, not an observed event time; each record carries `time.precision: "date"` and `time.origin: "synthetic"`.
3. `server.js` loads the canonical seed independently from local community reports, imported data, and the active dataset pointer. Missing community-report data starts empty without a startup write; invalid stored state is reported and blocks further writes rather than being silently overwritten.
4. An anonymous report enters through `POST /api/incidents`.
5. Boundary validation checks location, type, approximate time-window and payload limits.
6. The report is assigned to the nearest canonical zone and receives a bounded approximate time interval plus a separate submission timestamp.
7. In local research mode, reports are written to `community-reports.json` through the atomic JSON adapter before being combined with the synthetic demo snapshot. They never overwrite the canonical seed. Public read-only mode rejects the request before changing data.
8. The next dashboard snapshot recomputes risk, analytics, data quality and intelligence from the same incident snapshot.
9. The intelligence layer consumes both validated observations and the resulting risk-zone model.
10. The browser replaces its application state with that snapshot; map, charts, statistics, patrol and intelligence views derive from it.

## Propagation invariant

A successfully persisted incident must appear in the next `/api/dashboard` response, pass the data-quality gate, influence the applicable analytical snapshot, and remain connected to the same risk model. The `npm run smoke` test verifies this path.

## Deployment note

Ordinary non-production local hosting defaults to local research mode; local JSON persistence is best-effort filesystem storage and is shared by the process. `SURAKSHYA_MODE=public-read-only`, production mode, and recognized deployment environments use a read-only adapter on any provider. The canonical synthetic dataset and fixed research results remain available, while community reports, dataset imports, and dataset switching return an explicit `503`. A durable external store and authorization design are required before public writes can be enabled.

Dataset source files and mapped JSON requests are limited to 4 MiB in the browser, and JSON request bodies are limited to 4 MiB by Express. The browser checks the serialized, mapped request because it can be larger than its source file. The browser parses the file; the mapped records are transmitted to this application server when import is submitted.

## Import and research lifecycle

1. The browser reads CSV/JSON locally, displays the selected file and a preview, and records the selected field mapping.
2. Structural parsing and mapped-row validation report accepted/rejected counts and generic reasons. The policy is all-or-nothing; invalid rows or dataset limits stop the request. Blank CSV lines are explicitly counted and skipped.
3. Time values are normalized through the shared UTC temporal utilities. Exact, date-only, range, and unknown values retain separate precision; no date-only or synthetic hour is inferred.
4. The browser transmits mapped records plus source filename/format, mapping, and blank-line count to `POST /api/dataset/import`. The server validates and normalizes again, assigns an import ID, computes the normalized-content SHA-256, and preserves provenance.
5. The server persists one imported dataset separately from the canonical benchmark and community reports, then persists the active-mode pointer. Only after successful activation does it update process-wide active dataset references and return success. If persistence fails, an explicit error is returned; a pointer-write failure can leave a newly saved import inactive and reports that state rather than claiming activation succeeded.
6. Switching to the synthetic demo leaves the saved import and its provenance intact. The Research workspace analyzes only the active imported dataset; responses contain its identity, temporal coverage/exclusions, warnings, and model configuration. Invalid or unavailable imports produce an error rather than falling back to the canonical results.

## Temporal contract

All event-time bounds, date buckets, and hourly metrics use UTC. Exact timestamps, date-only observations, approximate report windows, synthetic dates, and unknown legacy timestamps remain distinct in the `time` object. `ts` is retained for compatibility but is not authoritative when precision metadata is present. Hour-of-day metrics require exact, non-synthetic timestamps; counts that cannot be determined from the recorded interval are returned as unavailable and accompanied by exclusion counts.

The record shape is `time: { precision, origin, start, end, window }`. `precision` is `instant`, `date`, `range`, or `unknown`; `origin` identifies `imported`, `synthetic`, `community-report`, `legacy`, `missing`, `unknown`, or invalid metadata. `start` and `end` are inclusive UTC epoch milliseconds (both `null` for unknown time); an instant has equal bounds, a date spans its UTC calendar day (clipped at the import/simulation time for the current date), and a range has the chosen window's explicit bounds. `window` names a community-report option when applicable. The compatibility `ts` equals the interval start for newly normalized records.

Community-report windows are defined as: `now` = the preceding 60 minutes; `today` = UTC midnight through submission; `week` = the preceding 7 × 24 hours; `month` = the preceding 30 × 24 hours. Every interval ends at the server's report-submission time.
