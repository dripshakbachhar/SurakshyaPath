# Implementation Log

## 2026-11-07 — Initial audit

### Research implementation

- [x] Located repository: `dripshakbachhar/SurakshyaPath`, default branch `main`.
- [x] Confirmed the 1,567-row canonical synthetic dataset and seed 208304 generator.
- [x] Confirmed research severity values are isolated in `config/severity.js`.
- [x] Confirmed four research formulas and max-normalization in `algorithms/research-models.js`.
- [x] Confirmed nearest-centre Euclidean assignment in the research experiment scripts.
- [x] Confirmed largest-remainder allocation in `algorithms/allocation.js`.
- [x] Confirmed the manuscript's open-route 2-opt implementation is in `experiments/run-patrol-experiments.js`.
- [x] Checked the committed research summary, allocation outputs, route CSV, and five-seed robustness CSV against the manuscript's reported canonical results.

### Product mismatch findings

1. The legacy site is not a visual front-end for the manuscript's four-model experiment. It primarily calls `/api/dashboard`, `/api/patrol`, and `/api/allocation`.
2. The legacy live risk pipeline uses `config/incident-types.js` severity weights (5, 3, 7, 2), while the paper's research models use `config/severity.js` values (2, 1, 3, 1). The distinction exists in code but is not sufficiently clear in the interface.
3. The legacy patrol view uses a nearest-neighbour route and displays a travel-time estimate; the paper reports an open-route nearest-neighbour versus 2-opt distance comparison and explicitly does not claim road distance, travel time, safety, or operational efficiency.
4. The legacy site exposes an anonymous report form and `POST /api/incidents`. Local JSON persistence is not a durable serverless storage design; the repository README already notes that durable storage requires an external datastore.
5. The existing frontend is plain HTML/CSS/JavaScript. It has responsive CSS, but the information architecture and visual density are prototype-level and do not surface the paper's experiment as the central user journey.
6. The manuscript contains six figure-placeholder paragraphs despite the repository having generated SVG figures. It also includes an author quality-control audit/table after the references; that material should not be in a submitted paper.
7. The manuscript is visually two-column for the main body, but its page geometry and styles are manually set. It should be reflowed from the actual IEEE Word template required by the target conference rather than described as template-compliant based on appearance alone.

### Current development branch

- `feat/research-lab-foundation` — product workspace and MVP scope.
- Initial change is documentation only. No research data, algorithms, legacy endpoints, or existing UI files have been changed.

### Manuscript cross-check follow-up — allocation budget sweep

- [x] Confirmed Table VII allocation vectors against `experiments/results/allocation/allocation-summary.json` and `allocation-comparison.csv`.
- [x] Identified one prose inconsistency in the manuscript: paragraph before Table VII says frequency-only, frequency×severity, and severity×recency share vectors at every budget.
- [x] Repository evidence shows recency matches frequency at budgets 6 and 12, but at budget 20 differs at exactly two zones: Chabahil (1 vs. 0) and Bouddha (5 vs. 6). Table VII itself gives the correct vectors.
- [x] Added a regression assertion for this exact budget-20 difference to `test/research-api.test.js`.

**Manuscript correction required:** revise the paragraph before Table VII so it states that the recency-weighted model matches frequency-only at budgets 6 and 12, but differs at budget 20 at Chabahil and Bouddha. Do not change the experiment outputs to fit the prose.

## 2026-11-07 — Research Lab interactive experience

### Completed slices

- [x] Added and tested `GET /api/research/{overview,models,allocation,routes,robustness}`.
- [x] Added an all-zone scoring explorer for all four models.
- [x] Added per-zone allocation comparison for the stored 6, 12, and 20 unit budgets.
- [x] Added per-model nearest-neighbour and 2-opt route sequences alongside the canonical distance comparison.
- [x] Added per-seed robustness comparison, with explicit synthetic-scenario caveats.
- [x] Reworked the four research figures to be generated from canonical model and experiment outputs.
- [x] Published the same figure assets to `research/figures/` and `public/research-lab/assets/`.
- [x] Promoted the Research Lab to the primary `/` entry point; preserved the previous dashboard at `/legacy/`.
- [x] Added `product/WORKFLOW.md` and a repeatable quality workflow in GitHub Actions.
- [x] Added tests for model completeness, allocation budget conservation, the known 20-unit recency difference, route-order integrity, static SVG assets, and primary/legacy entry points.

### Workflow and failure diagnosis

- A first SVG asset assertion used an over-escaped character class and failed to match the whitespace after the SVG root element.
- Root cause was in the test regex, not the figure files. The assertion was rewritten to match an explicit whitespace-or-angle-bracket alternative.
- CI was reordered so the research pipeline and figure generation run before the API and static-asset tests.
- Subsequent runs passed the syntax check, research generation, figure generation, unit/API tests, deterministic validation, and end-to-end smoke test.

### Current boundary

The Research Lab remains read-only and uses synthetic research data. No data-generation rules, canonical outputs, experiment parameters, or validated algorithms were changed. Vercel production deployment has intentionally not been performed; it remains the final release phase after preview verification.
