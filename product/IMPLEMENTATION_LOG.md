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
