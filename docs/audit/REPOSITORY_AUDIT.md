# Phase 0 — Repository Forensic Audit

**Audit scope:** Remote repository snapshot on `feat/research-lab-foundation`  
**Audited commit:** `bf329c0aa1a4e708f73085e5efe2dc30a346accd`  
**Audit branch:** `audit/phase-0-forensic-review`  
**Method:** Static source and repository inspection through GitHub. No local checkout or runtime execution was available during this audit.

## Executive summary

SurakshyaPath is a Node.js application using Express and a vanilla HTML/CSS/JavaScript frontend. It contains a legacy interactive dashboard and a separate, read-only Research Lab backed by committed experiment artifacts. Research algorithms and the dashboard's live scoring/intelligence code are distinct modules and should remain distinct.

The repository has a meaningful baseline of automated tests and a GitHub Actions workflow. The codebase is not yet demonstrated to be production-ready. The most consequential confirmed design concern is temporal precision: the canonical synthetic CSV stores `age_days`, but the live data adapter turns age into a timestamp relative to the current snapshot time. Downstream modules calculate hour-of-day and night patterns from those generated timestamps. Those outputs are not supported by the source data's temporal precision.

A second confirmed architectural concern is that importing `server.js` loads and persists incident data. This couples module import to filesystem availability and makes tests and serverless initialization less predictable.

## Repository and delivery state

- Repository: `dripshakbachhar/SurakshyaPath`
- Audited source branch: `feat/research-lab-foundation`
- Audited source commit: `bf329c0aa1a4e708f73085e5efe2dc30a346accd`
- Pull request #11: open, draft, targeting `main`; not merged at inspection time.
- PR title: Research Lab foundation: read-only API and first UI slice.
- PR scope at inspection: 29 changed files, 1,843 additions, 297 deletions.
- A separate audit branch was created from the audited PR head. No application source, data, experiment outputs, or deployment configuration was changed by this audit.

**Visibility limitation:** GitHub inspection cannot reveal uncommitted files or unpushed commits in the user's local VS Code working tree. Local `git status` must be checked before integrating or switching branches.

## Technology inventory

| Area | Observed implementation |
|---|---|
| Runtime | Node.js; package engine declares Node >=18 |
| HTTP server | Express `^4.19.2` |
| Frontend | Static HTML, CSS, vanilla JavaScript |
| Tests | Node built-in test runner (`node --test`) |
| Research | Node scripts and committed JSON/CSV/SVG artifacts |
| CI | GitHub Actions workflow `.github/workflows/research-validation.yml` |
| Deployment adapter | `api/index.js` and `vercel.json` |
| Persistence | Local JSON file `data/incidents.json` |
| Canonical research data | `data/synthetic_incidents.csv` |

## Existing feature inventory

### Legacy application
- Static frontend served from `public/`.
- Health, configuration, incidents, risk, patrol, allocation, analytics, data-quality, intelligence, diagnostics, and dashboard API routes in `server.js`.
- Anonymous local incident-report submission endpoint.
- Synthetic incident loading from the canonical CSV.
- Risk, routing, allocation, and intelligence modules.

### Research Lab
- Static research interface at `/research-lab/`.
- Read-only endpoints: overview, models, allocation, routes, and robustness.
- Four scoring models represented in committed research artifacts.
- Canonical allocation, route-comparison, and robustness outputs.
- Figures served as static SVG assets.
- UI identifies the data as synthetic and disclaims crime prediction and operational recommendations.

### Research pipeline
- Experiment scripts under `experiments/`.
- Stored results under `experiments/results/`.
- Validation, figure-generation, smoke-test, and unit/API-test commands declared in `package.json`.

## Confirmed findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| SP-AUD-001 | High | Source records provide age in days, while the live adapter derives timestamps from the current snapshot clock; downstream hourly/night analyses use those timestamps. | `data/live-incidents.js`, `algorithms/risk.js`, `algorithms/intelligence.js`, `server.js` |
| SP-AUD-002 | High | Importing `server.js` loads incidents and calls `save(incidents)`, causing filesystem work during module initialization. | `server.js`: module-level `load()`, `seedIncidents()`, and `save()` |
| SP-AUD-003 | High | JSON persistence uses a fixed `data/incidents.json.tmp` path, so concurrent writers/processes can contend for the same temporary file. | `server.js`: `save(data)` |
| SP-AUD-004 | Medium | Hour calculations use local-time `Date#getHours()`; the test suite expects a UTC hour, making the result environment-timezone dependent. | `algorithms/risk.js`; `test/algorithms.test.js` |
| SP-AUD-005 | Unverified | Dependency vulnerability status cannot be determined from the declared manifest alone. A prior local report mentioned three vulnerabilities, but package-level audit output was not available in this remote inspection. | `package.json`; prior user-provided local result requires refreshed `npm audit` evidence |
| SP-AUD-006 | Medium / coverage gap | Unit/API tests and syntax checks exist, but full browser workflow and accessibility verification were not demonstrated by the inspected workflow. | `package.json`, `test/research-api.test.js`, CI workflow |

## Testing and CI inventory

Declared scripts include:
- `npm test`
- `npm run validate`
- `npm run research`
- `npm run figures`
- `npm run smoke`
- `npm run check:research-lab`

The workflow installs dependencies, checks selected JavaScript syntax, runs the research pipeline, generates figures, runs tests, validates deterministic outputs, and runs the application smoke test.

The commit-specific workflow lookup returned no workflow runs. Therefore CI status is **not verified** for the audited commit. No local tests were executed in this audit environment.

## Production-readiness snapshot

Not established as production-ready. The repository's own README and SECURITY.md describe the application as a local/research prototype and identify production hardening and durable external storage as outstanding.

## Phase 0 conclusion

**Status: PASSED_WITH_DOCUMENTED_LIMITATIONS**

The static forensic audit is complete and the audit documents record the observed evidence. Runtime verification, local working-tree inspection, current dependency audit, and hands-on browser/accessibility testing remain outstanding. These limitations must be carried into Phase 1 and must not be represented as passed tests.
