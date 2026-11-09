# SurakshyaPath — Phase-Gated Development Roadmap

**Phase:** 1 — Architecture and Development Baseline  
**Baseline branch:** `audit/phase-0-forensic-review`  
**Baseline commit:** `de647d6dec376e4c355925d1d28b78a10f047867`

## 1. Delivery principles

Development proceeds as small, reviewable increments on a dedicated development branch. Each phase has a defined scope, dependencies, evidence, and exit gate.

1. Audit before modifying.
2. Fix research-integrity defects before polishing presentation.
3. Preserve the existing Node/Express and static frontend stack unless a measured requirement justifies change.
4. Keep research algorithms, legacy heuristics, and display transformations separate.
5. Do not regenerate or alter canonical results merely to make tests pass.
6. Add tests with each behavior change; run the full relevant suite before a phase checkpoint.
7. Never infer successful tests, CI, browser behavior, accessibility, security, or deployment from source inspection.
8. Do not overwrite local user changes. The remote GitHub view does not expose uncommitted local files.
9. Commit only phase-scoped files after reviewing the diff.
10. No merge, production deployment, schema migration, paid service, or major infrastructure change without explicit approval.

## 2. Branch and checkpoint strategy

### Current state
- Audit branch: `audit/phase-0-forensic-review`.
- Phase 0 audit commit: `de647d6dec376e4c355925d1d28b78a10f047867`.
- Source snapshot originally audited: `bf329c0aa1a4e708f73085e5efe2dc30a346accd`.
- PR #11 (`feat/research-lab-foundation` → `main`) remains open and draft.
- The audit branch was created from the PR #11 head, not confirmed `main`.

Do not open a PR from the audit branch to `main`: it includes the PR #11 feature ancestry and would mix scopes. Before implementation, inspect the local working tree and remote branch graph, then create a dedicated development branch from the agreed integration base. Keep Phase 0 audit documents available as the evidence baseline.

### Checkpoint naming
Use one focused commit per logical change when possible. A phase checkpoint should include:
- phase identifier and status;
- changed file list;
- test commands and actual exit codes;
- CI run URL/status, if available;
- research artifact diff assessment;
- unresolved risks and next dependencies.

GitHub Contents API may create one commit per file; if that path is used, report the exact commit count and validate the final branch head. Do not describe multiple commits as one atomic commit.

## 3. Phase sequence

| Phase | Scope | Primary deliverables | Gate |
|---|---|---|---|
| 0 — Forensic audit | Read-only repository, architecture, bug, security, research, UX, testing audit | `docs/audit/*` | Complete: `PASSED_WITH_DOCUMENTED_LIMITATIONS` |
| 1 — Architecture baseline | Current/target architecture, contracts, data flow, decisions, sequenced plan | `docs/architecture/*` | Complete when docs agree with inspected source and no implementation is mixed in |
| 2 — Research integrity remediation | Remove or qualify unsupported time-of-day outputs; prevent age-only data from becoming apparent event-hour evidence | Code changes, regression tests, research limitation update | No unsupported hourly/night/allocation-window claim remains in affected API/UI paths; deterministic tests pass |
| 3 — Application and persistence boundaries | Separate app construction from runtime initialization; isolate storage; address temp-file concurrency semantics | App factory/initialization boundary, storage interface/adapter, tests | Importing app has no persistence side effects; storage failure/concurrency behavior is tested |
| 4 — Research API and artifact contracts | Validate artifact schemas, explicit API response contracts, robust parsing/error behavior | Schemas, artifact repository/service if justified, contract tests | All endpoints conform; malformed/missing artifacts fail predictably; read-only invariant passes |
| 5 — Research Lab frontend refinement | Improve information hierarchy and data presentation using established API contracts | Focused UI changes, responsive states, chart/table alternatives | No hard-coded duplicate result values; visible provenance and claim boundaries retained |
| 6 — Browser and accessibility verification | Browser-driven workflows, keyboard, responsive, semantic and automated accessibility checks | E2E tests, accessibility report, remediation | Critical journeys work; no unresolved critical accessibility blocker; manual checks documented |
| 7 — Reproducibility and quality pipeline | Clean-checkout reproducibility, deterministic artifact checks, dependency review, CI reliability | CI updates, reproducibility evidence, dependency audit report | Clean install and all required checks pass; artifact changes are explained and reviewed |
| 8 — Security and deployment readiness | Threat model, storage/runtime compatibility, secrets, rate limiting, headers, error handling, hosting constraints | Security review, deployment architecture and release checklist | No unresolved critical/high release blocker; durable storage and runtime assumptions are approved |
| 9 — Release candidate and integration | Full regression, docs, review of PR #11 ancestry and merge plan, release evidence | Release candidate tag/branch, final test matrix, integration PR if approved | Independent review and explicit user approval for merge |
| 10 — Controlled release pipeline | Preview verification, approved production release, post-release checks and rollback plan | Deployment evidence, smoke/health checks, rollback record | Production action only after explicit authorization; no automatic deployment |

## 4. Phase 2 — research integrity remediation

Priority is the temporal precision defect because it can contaminate analytics and interpretation.

Required work:
- Inventory every consumer of `ts`, `peakHour`, `byHour`, `nightShare`, and `window`.
- Trace whether each consumer receives canonical age-only synthetic records, actual community reports, or mixed data.
- Define a representation for unavailable temporal precision; do not overload a fabricated timestamp as an event time.
- Suppress unsupported hour-of-day and night-share metrics for age-only records.
- Prevent downstream allocation windows from implying evidence-based time periods when peak-hour evidence is unavailable.
- Keep any genuine timestamped community-report behavior clearly separated and non-research.
- Add regression tests for both age-only and genuinely timestamped fixtures.
- Update UI labels and documentation where the unsupported metric is exposed.
- Preserve model formulas and canonical research artifacts unless a separately reviewed research change is required.

**Stop condition:** If data provenance or consumer behavior cannot be established, do not silently transform values. Mark the affected metric unavailable and document the unresolved behavior.

## 5. Phase 3 — app lifecycle and persistence

Required work:
- Create an app construction path that does not load, seed, or save incident data as an import side effect.
- Move explicit runtime initialization into the local/server startup boundary.
- Inject or compose a storage adapter for legacy incident state.
- Keep the current JSON adapter for local development if appropriate.
- Replace fixed temporary-file contention with a strategy supported by the actual runtime and verified by concurrency/failure tests.
- Ensure test setup can construct the app without touching repository data files.
- Keep serverless limitations explicit; do not claim a local JSON adapter is durable in serverless execution.

A database is not a default requirement. Select one only after a concrete persistence requirement, hosting target, security needs, and cost/operational trade-offs are approved.

## 6. Phase 4 — API and artifact contracts

Required work:
- Document exact success payloads and error envelopes.
- Introduce versioned artifact schemas or equivalent runtime validation.
- Validate required keys, types, ranges, model IDs, seed lists, allocation conservation, route membership, and provenance.
- Move CSV parsing out of HTTP route handlers if that creates a meaningful test boundary.
- Use a standards-compliant parser if supported inputs require quoted fields; otherwise validate and document the restricted artifact format.
- Preserve GET-only research semantics.
- Add tests for missing, malformed, truncated, and unsupported-version artifacts.
- Do not let API errors leak filesystem paths or stack traces.

## 7. Phase 5 — frontend refinement

The Research Lab is the primary product. Work from the existing information architecture:
- Overview and provenance.
- Scoring models.
- Allocation comparison.
- Route comparison.
- Robustness scenarios.
- Methods and limitations.

Requirements:
- Keep synthetic status visible.
- Distinguish normalized scores from probabilities.
- Distinguish geometric route length from road distance/travel time.
- Distinguish deterministic scenarios from independent samples.
- Explain unavailable temporal measures rather than filling gaps with invented precision.
- Keep values sourced from API responses/artifacts.
- Preserve loading, error, empty, and narrow-screen behavior.
- Avoid redesign that changes model meaning or claims.

## 8. Phase 6 — browser and accessibility

Add browser automation only after core workflows are stable. Test:
- Research Lab initial load and navigation.
- All five research endpoints reflected in the correct views.
- API failure and missing-artifact states.
- Desktop and narrow viewport layouts.
- Keyboard-only navigation and focus order.
- Semantic headings, landmarks, tables, chart alternatives, and labels.
- Reduced-motion behavior.
- Contrast and zoom/reflow.

Automated scans are evidence, not proof of accessibility. Record manual keyboard and screen-reader checks separately. Do not claim WCAG conformance without a defined audit scope and results.

## 9. Phase 7 — reproducibility and dependency hygiene

- Use a clean checkout and lockfile-based installation.
- Run research generation twice with the same inputs and compare output hashes/diffs.
- Validate that generated figures match canonical outputs.
- Run unit, API, smoke, and browser tests.
- Run `npm audit --json` and classify direct/transitive vulnerabilities.
- Update dependencies only with compatibility evidence and regression tests.
- Record Node/npm versions and command exit codes.
- Do not blindly commit regenerated artifacts.

## 10. Phase 8 — security and deployment readiness

Threat-model both product surfaces separately. Research Lab is read-only; legacy endpoints include anonymous report submission and local persistence.

Review:
- data sensitivity and retention;
- authentication/authorization requirements if any write feature remains;
- rate limiting across instances;
- storage durability and encryption;
- secrets and environment configuration;
- request validation and body limits;
- security headers and Content Security Policy suitability;
- dependency vulnerabilities;
- logging and error disclosure;
- serverless cold starts, filesystem semantics, and concurrency;
- backup, recovery, monitoring, and rollback.

The default safe product scope is a read-only research presentation. Do not enable public incident submission or operational features as part of a visual rebuild.

## 11. Phase 9–10 — integration and release

Before integration:
- inspect local `git status`;
- inspect PR #11 changes and merge status;
- choose an integration base explicitly;
- compare research artifacts and generated figures;
- run full checks on the final candidate;
- obtain review for all scientific, API, security, and product changes.

Before production:
- user must explicitly authorize production deployment;
- confirm target project/environment and domain;
- verify environment variables without exposing secret values;
- deploy to preview first;
- run post-deploy smoke tests;
- verify data persistence assumptions;
- document rollback and recovery;
- do not auto-merge or auto-promote.

## 12. Definition of done for every phase

A phase may be marked **PASSED** only when its acceptance criteria and required verification evidence are complete.

Use **PASSED_WITH_DOCUMENTED_LIMITATIONS** when the scoped deliverable is complete but a clearly identified external verification remains unavailable and does not invalidate the deliverable.

Use **BLOCKED** when a prerequisite fails, a material unknown makes safe progress impossible, or required tests fail.

Every checkpoint must state:
- exact branch and starting/ending commit;
- changed files;
- what was actually executed;
- tests and exit codes;
- CI result or “not available”;
- artifacts changed or “none”;
- known limitations;
- next phase prerequisites.

**No phase status may be upgraded based on intention, source inspection alone, or a tool call that did not return a successful result.**
