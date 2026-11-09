# Bug and Risk Register — Phase 0

This register distinguishes confirmed design defects from risks requiring runtime reproduction.

| ID | Severity | Status | Location | Finding / expected behavior | Evidence and reproduction | Recommended verification |
|---|---|---|---|---|---|---|
| SP-AUD-001 | High | CONFIRMED DATA-LIMITATION DEFECT | `data/live-incidents.js`; `algorithms/risk.js`; `algorithms/intelligence.js`; `server.js` | Hour-of-day and night patterns are calculated from timestamps generated using current snapshot time plus `age_days`. The source CSV does not provide event-hour precision. Such patterns should be unavailable or explicitly marked synthetic artifacts, not described as observed event times. | Load canonical CSV through `loadSyntheticIncidents(now)`; inspect generated `ts`; inspect `getHours()`/night-hour aggregations in downstream modules. | Add tests proving that age-only records cannot generate observed-hour metrics. Verify all UI/API claims and allocation time-window outputs. |
| SP-AUD-002 | High | CONFIRMED DESIGN DEFECT | `server.js` module initialization | Importing the application triggers data loading/seeding and `save(incidents)`. App import should not perform persistence writes. | Require `server.js` and observe module-level `persistenceAvailable = save(incidents)`. | Add import-side-effect test using isolated temp storage or injected repository; separate explicit initialization from app construction. |
| SP-AUD-003 | High | CONFIRMED CONCURRENCY RISK | `server.js` `save(data)` | Multiple writes use the same `data/incidents.json.tmp` path. Concurrent writes may overwrite, remove, or rename one another's temporary file. | Inspect fixed temporary path and cleanup behavior in catch block. | Add concurrent-write tests; verify atomic replacement behavior under supported runtime and storage. |
| SP-AUD-004 | Medium | CONFIRMED PORTABILITY DEFECT | `algorithms/risk.js`; `test/algorithms.test.js` | `Date#getHours()` uses host-local timezone, while test timestamps are created with UTC constructors and expected hour is UTC. Results can vary by environment timezone. | Run the peak-hour test under at least UTC and Asia/Kathmandu. | Decide whether to remove unsupported hour metrics or define an explicit timezone for valid event-time data; test in multiple TZ settings. |
| SP-AUD-005 | High pending evidence | UNVERIFIED | `package.json`, lockfile | Prior local install reported three dependency vulnerabilities, but the audit details are unavailable here. No package-specific remediation can be responsibly proposed yet. | Run `npm.cmd audit --json` locally and preserve the report. | Identify direct/transitive packages, vulnerable ranges, patched versions, compatibility, and regression tests before changing dependencies. |
| SP-AUD-006 | Medium | COVERAGE GAP | `public/research-lab/`, tests, CI | Existing automated checks do not demonstrate real browser interactions, responsive behavior, or accessibility conformance. | Inspect workflow: syntax check, research generation, Node tests, validation, smoke. | Add a small browser test suite only after identifying core workflows and supported browsers. Run keyboard and accessibility checks. |
| SP-AUD-007 | Medium | NEEDS VALIDATION | `routes/research.js`; `data/live-incidents.js`; experiment scripts | CSV parsing splits each line on commas and does not implement quoted-field escaping. This is safe only while the controlled schema guarantees fields cannot contain commas/quoted delimiters. | Inspect `parseCsv` implementations. | Validate schema constraints; adopt a proper CSV parser only if the format or future inputs require it. |
| SP-AUD-008 | High for production | KNOWN DEPLOYMENT LIMITATION | `server.js`; `api/index.js`; `vercel.json`; README | File-backed incident persistence is not a durable multi-instance/serverless persistence strategy. | README explicitly says durable persistence requires an external data store on serverless infrastructure. | Define deployment scope and persistence requirement before production release. |

## Severity definitions

- **Critical:** exploitable or data-loss condition requiring immediate containment.
- **High:** material correctness, integrity, persistence, or production-readiness risk.
- **Medium:** portability, maintainability, or meaningful coverage issue.
- **Low:** limited impact or polish.

## Audit note

No application code was changed and no local runtime reproduction was performed during Phase 0. “Confirmed” refers to directly established source behavior/design, not a claim that every race or downstream consequence was reproduced in production.
