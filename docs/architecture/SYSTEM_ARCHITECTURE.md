# SurakshyaPath — System Architecture Baseline

**Phase:** 1 — Architecture and Development Baseline  
**Status:** Architecture baseline established; implementation not yet changed  
**Repository snapshot:** `audit/phase-0-forensic-review`  
**Baseline commit:** `de647d6dec376e4c355925d1d28b78a10f047867`  
**Source implementation audited:** `bf329c0aa1a4e708f73085e5efe2dc30a346accd`

## 1. Purpose and architectural north star

SurakshyaPath is a reproducible research and engineering platform for investigating how explainable spatial-prioritization models affect downstream route and resource-allocation experiments.

The primary product is the **read-only Research Lab**. It presents a defined computational study, exposes the assumptions behind its models, and allows readers to inspect reproducible artifacts. It is not a live public-safety service, incident intake platform, predictive policing product, dispatch system, or source of operational recommendations.

Architecture must optimize for:

1. Research integrity and traceability from source data to displayed result.
2. Deterministic, reproducible experiments.
3. Clear separation between research computations and legacy dashboard heuristics.
4. Small, testable modules and explicit contracts.
5. Safe failure when artifacts are missing, malformed, or incompatible.
6. Accessible, responsive presentation without changing scientific meaning.
7. A deployment design whose persistence and security guarantees match the actual runtime.

## 2. Current system (as inspected)

The repository is a single Node.js application and research workspace.

| Concern | Current implementation |
|---|---|
| Runtime | Node.js, declared engine `>=18` |
| HTTP | Express `^4.19.2` |
| Module format | CommonJS |
| Primary UI | Static HTML, CSS, and browser JavaScript |
| Test runner | Node built-in test runner |
| Research data | Canonical synthetic CSV and committed JSON/CSV/SVG artifacts |
| Research execution | Node scripts under `experiments/` |
| Legacy runtime data | Local JSON file at `data/incidents.json` |
| Deployment adapter | `api/index.js` exporting the Express app |
| Hosting configuration | `vercel.json` rewrite to `/api/index.js` |
| CI | GitHub Actions research-validation workflow |

No framework migration, database introduction, microservice split, or infrastructure redesign is justified by the current evidence.

### 2.1 Logical context

```text
Reader
  |
  v
Research Lab (static browser assets)
  |
  v
GET /api/research/*
  |
  v
Research artifact access
  |-- experiments/results/summary/*
  |-- experiments/results/allocation/*
  |-- experiments/results/patrol/*
  |-- experiments/results/robustness/*
  |-- data/synthetic_incidents.csv (metadata/count)
  |
  v
Committed, version-controlled experiment outputs

Legacy dashboard (separate experience)
  |
  v
Legacy Express API in server.js
  |-- live heuristic risk
  |-- analytics / intelligence
  |-- patrol and allocation helpers
  |-- POST /api/incidents
  |
  v
data/incidents.json (local file persistence)
```

The diagram represents logical responsibilities, not independently deployed services. Both experiences currently share one Express application and repository.

### 2.2 Current code ownership map

| Path | Responsibility | Architectural note |
|---|---|---|
| `server.js` | Express app, middleware, legacy endpoints, runtime incident state, persistence, startup | Too many responsibilities; importing the module currently performs storage initialization and a save |
| `api/index.js` | Serverless adapter | Imports and exports the Express app |
| `routes/research.js` | Read-only research endpoints and artifact reads | CSV parsing and synchronous file reads currently live in the route module |
| `algorithms/research-models.js` | Four research scoring models | Keep separate from legacy scoring |
| `algorithms/risk.js` | Legacy dashboard risk calculations | Not the manuscript model implementation |
| `algorithms/allocation.js` | Largest-remainder allocation helper | Legacy/runtime helper; do not silently substitute for stored research results |
| `algorithms/routing.js` | Nearest-neighbour route helper and haversine distance | Geometric distance, not road-network routing |
| `data/live-incidents.js` | Reads canonical CSV and maps records into runtime incident shape | Age-only records are assigned synthetic timestamps using snapshot clock |
| `experiments/` | Deterministic research and experiment scripts | Source of generated research artifacts |
| `experiments/results/` | Committed research outputs | Research API reads these artifacts |
| `public/research-lab/` | Primary research experience | Read-only UI |
| `public/legacy/` | Legacy dashboard | Separate product surface and claim boundary |
| `test/` | Unit, API, and regression tests | Browser interaction and accessibility coverage remain incomplete |

## 3. Target logical architecture

The target is an incremental modular monolith, not a rewrite.

```text
Browser
  |
  +--> Research Lab UI
  |       |
  |       +--> Research API client
  |                 |
  |                 v
  |          Research API routes
  |                 |
  |                 v
  |          Research service
  |                 |
  |                 v
  |          Artifact repository
  |                 |
  |                 +--> JSON/CSV/SVG artifacts
  |                 +--> validated artifact manifests/schemas
  |
  +--> Legacy UI (maintenance / isolated scope)
          |
          v
      Legacy API routes
          |
          +--> domain services
          +--> algorithm modules
          +--> persistence interface
                    |
                    +--> local JSON adapter (development only)
                    +--> future durable adapter (only after approval)

Research pipeline (offline / CI)
  |
  +--> canonical synthetic data + explicit configuration
  +--> deterministic model and experiment functions
  +--> validation and reproducibility checks
  +--> generated artifacts + provenance metadata
  +--> committed version-controlled outputs
```

### 3.1 Proposed module boundaries

These are target boundaries, not claims that these modules already exist.

- **HTTP boundary:** route registration, request/response handling, status codes, headers, and input parsing.
- **Research service:** assembles a requested research view from validated artifacts. It must not invoke legacy live-report scoring.
- **Artifact repository:** owns file locations, loading, schema/version checks, and controlled error mapping.
- **Research domain:** pure model/experiment functions, explicit inputs, deterministic outputs.
- **Legacy application service:** existing dashboard use cases, isolated from Research Lab contracts.
- **Incident repository interface:** separates legacy incident persistence from application construction.
- **Presentation:** Research Lab components/pages consume API contracts and display provenance/limitations with results.

Extract a boundary only when it improves testability, correctness, or ownership. Avoid empty wrappers and abstraction for its own sake.

## 4. Research domain boundaries

The canonical research study currently uses:

- 1,567 deterministic synthetic spatial records.
- Canonical seed 208304.
- Ten configured spatial units.
- Four models: frequency-only, severity-only, frequency × severity, and severity × recency.
- Allocation comparisons for stored budgets 6, 12, and 20 using largest-remainder apportionment.
- Route comparisons using the stored nearest-neighbour and open-route 2-opt outputs.
- Five designed deterministic seeds: 208304–208308.

These are experiment settings, not observed population parameters. A normalized score is not a probability or validated risk estimate. Five generated seeds are not five independent real-world samples.

### 4.1 Non-negotiable separations

1. Research severity configuration remains separate from legacy incident-type severity.
2. Research model IDs, formulas, normalization, and output schemas remain stable unless a research change is explicitly reviewed.
3. The read-only Research API reads generated artifacts or explicitly tested research services; it never reads mutable incident-report storage.
4. Legacy risk, analytics, intelligence, patrol, and allocation endpoints must not be represented as the manuscript's research outputs.
5. The UI must distinguish a stored experiment comparison from a live computation.
6. Haversine/great-circle distance must never be labeled road distance or actual travel distance.
7. No real incident intake, geolocation, dispatch, staffing recommendation, predictive claim, or real-world deployment claim belongs in the Research Lab MVP.

## 5. Data and persistence boundaries

### Research data
- Canonical input: `data/synthetic_incidents.csv`.
- Research configuration and pure computation: `config/`, `algorithms/research-models.js`, and `experiments/`.
- Generated outputs: `experiments/results/`.
- Research UI/API: read-only access to version-controlled outputs.

Research artifacts should carry enough metadata to identify schema version, generator/version, configuration, seed, and generation provenance. A manifest/schema proposal is recorded in the API and technical decision documents; it is not yet implemented.

### Legacy runtime data
The current legacy path loads, seeds, and saves `data/incidents.json`. It uses a fixed temporary filename and performs persistence work during `server.js` import. This is a prototype-only persistence arrangement, not a multi-instance or serverless durability guarantee.

Before production-like use, application construction must be separated from storage initialization and a durable storage choice must be approved. Do not add a database during this phase.

### Temporal precision rule
The canonical dataset has `age_days`, not a trustworthy event timestamp/hour. The runtime adapter currently derives `ts` from snapshot time minus age in days. The resulting timestamp inherits the snapshot clock. Any downstream hour-of-day, peak-hour, night-share, or allocation-window output is therefore unsupported as observed event-time evidence.

Until source precision supports temporal analysis:
- suppress those outputs, or
- label them explicitly as synthetic timestamp artifacts and exclude them from empirical interpretation.

Timezone conversion alone is not a valid remediation.

## 6. Runtime and deployment topology

### Local development
A single Node process serves static files and Express API routes. Local JSON persistence may remain available for legacy development while its limitations are explicit.

### Serverless adapter
`api/index.js` exports the Express app. `vercel.json` rewrites `/api/:path*` to this adapter. The Research Lab's read-only artifact path is operationally narrower than the legacy write-enabled API.

The presence of an adapter does not establish production readiness. Local filesystem writes, in-memory rate limits, import-time persistence, and multi-instance behavior must be assessed against the actual hosting runtime. Production deployment remains gated on a separate approval and release verification.

## 7. Cross-cutting quality requirements

- **Correctness:** validate inputs and artifact shapes at boundaries; fail closed on malformed data.
- **Determinism:** same code, configuration, and seed produce identical research outputs.
- **Traceability:** every displayed value maps to an API field and committed artifact or tested function.
- **Security:** bounded inputs, safe errors, minimal data exposure, no secrets in source, and threat model before production.
- **Privacy:** Research Lab collects no user-submitted incident data and requires no geolocation.
- **Accessibility:** keyboard operation, visible focus, semantic structure, chart alternatives, contrast, and reduced-motion support.
- **Resilience:** clear loading/error/empty states; missing artifacts return a controlled error.
- **Maintainability:** small CommonJS modules and existing Node tooling unless evidence supports change.
- **Compatibility:** preserve declared Node >=18 support or explicitly revise it with tested evidence.

## 8. Architecture risks and controls

| Risk | Control / phase |
|---|---|
| Age-only records create false event-hour outputs | Phase 2: suppress/qualify temporal outputs and add regression tests |
| Importing app causes filesystem writes | Phase 3: isolate app construction and explicit runtime initialization |
| Fixed temp filename causes writer contention | Phase 3: define and test storage adapter semantics |
| Research CSV parser assumes no quoted fields | Phase 4: schema/parser validation; preserve controlled-input assumption until proven |
| API reads artifacts without formal schema validation | Phase 4: artifact schemas and contract tests |
| Browser workflows not verified | Phase 6: browser E2E and accessibility review |
| File persistence unsuitable for serverless | Phase 8: deployment/storage decision; no production release until resolved |
| CI status not verified for audit snapshot | Phase 2 onward: capture actual run evidence per checkpoint |

## 9. Architecture acceptance criteria

The architecture is ready to guide implementation when:
- the current and target boundaries are explicit;
- the Research Lab and legacy system are distinguished;
- source precision and claim limits are documented;
- persistence and serverless constraints are visible;
- API and data contracts are documented;
- phase ordering and stop conditions are defined.

**Phase 1 does not certify runtime correctness, test success, accessibility conformance, security, or deployment readiness.**
