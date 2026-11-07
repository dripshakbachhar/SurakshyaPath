# MVP Backlog — Research Lab

Build this as small vertical slices. Do not change the synthetic dataset, model definitions, or stored values merely to make the interface easier.

## Slice 0 — Research integrity and baseline

- [x] Verify the manuscript's canonical tables against committed CSV/JSON outputs.
- [x] Add automated checks for dataset row count, model keys, canonical top zones, allocation totals, and route comparison metrics.
- [x] Keep research severity configuration separate from the legacy dashboard severity configuration.
- [x] Record a baseline test/CI result before frontend changes.

**Acceptance:** `npm test`, `npm run validate`, `npm run smoke`, and `npm run research` pass; any generated result diff is understood and intentionally reviewed.

## Slice 1 — Read-only research API (complete)

Implemented read-only contracts:

- `GET /api/research/overview` — dataset metadata, provenance, canonical seed, and caveats.
- `GET /api/research/models` — all four raw/normalized scores and rankings by zone.
- `GET /api/research/allocation` — stored allocation comparisons for budgets 6, 12, and 20.
- `GET /api/research/routes` — stored nearest-neighbour and 2-opt route details and distances.
- `GET /api/research/robustness` — stored five-seed summary.

**Acceptance:** the endpoints are read-only, schema-checked, deterministic, and sourced only from the research pipeline or its committed result artifacts. They never call the legacy live-report scoring pipeline.

## Slice 2 — Frontend foundation

- [x] Add a dedicated research-lab frontend without replacing the existing site until the new slice is validated.
- [x] Establish a consistent type scale, spacing system, color tokens, reusable cards, tabs, and chart containers.
- [x] Create the Overview and Scoring Models views first.
- [x] Add responsive behavior for narrow screens and keyboard/focus states.
- [x] Place the synthetic-data and research-only disclosure in a persistent, visible location.
- [x] Add an interactive all-zone model explorer and stored-budget allocation comparison.
- [x] Generate and integrate four figures from canonical research outputs.

**Acceptance:** a reader can see the research question, dataset metadata, and four-model comparison on desktop and mobile; no number is hard-coded if it exists in the API contract.

## Slice 3 — Allocation, routing, and robustness views

- [x] Add allocation comparison with only the stored budgets.
- [x] Add a static/geometric route comparison view showing the paper's distance basis and route heuristic.
- [x] Add route-order comparisons for nearest-neighbour and 2-opt.
- [x] Add the five-seed robustness view with an explicit "designed scenarios, not independent samples" explanation.
- [x] Link each panel to its method and limitations explanation.

**Acceptance:** rendered values match committed result files exactly at their declared precision; no UI wording implies live guidance or real-world effectiveness.

## Slice 4 — Quality and release

- [x] Add API contract tests; browser-script syntax is checked. Full interactive browser/component tests remain open.
- [ ] Add an end-to-end test for the research navigation and key data views.
- [x] Check loading, API-error, no-data fallback, and narrow-screen layout in implementation; full manual browser review remains open.
- [x] Add CI syntax, generated-figure, API, deterministic, and smoke checks for the frontend.
- [ ] Review accessibility, dependency footprint, secrets, deployment assumptions, and data handling.
- [ ] Keep the legacy reporting endpoints disabled from the new user experience; separately decide whether they should be deprecated.

**Acceptance:** the full CI pipeline passes and a release checklist records what was—and was not—validated.

## First implementation target

Do **Slice 0 + the Overview/Scoring Models read-only vertical slice**. That is the smallest end-to-end delivery that proves the app is actually representing the IEEE study.
