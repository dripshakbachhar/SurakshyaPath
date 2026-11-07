# Architecture Decisions

## D-001 — Research Lab is the primary product

**Decision:** Rebuild the primary experience as a research and reproducibility viewer.

**Reason:** The manuscript's contribution is the comparison of scoring assumptions and their computational propagation. The current legacy dashboard emphasizes community reporting, live risk scoring, intelligence summaries, and operational-style patrol/allocation controls. Those are not the manuscript's contribution.

## D-002 — Research outputs have one source of truth

**Decision:** The new UI reads research-scoped API contracts backed by the canonical synthetic dataset, research algorithms, and committed experiment outputs.

**Reason:** The existing repository deliberately separates `config/severity.js` (research values) from `config/incident-types.js` (legacy dashboard values). The new UI must not accidentally call the latter pipeline.

## D-003 — Read-only MVP

**Decision:** No create/update/delete operations, no report form, no geolocation request, and no live data ingestion in the new experience.

**Reason:** This keeps the MVP aligned to the research question and avoids collecting sensitive incident information. It also avoids presenting synthetic outputs as operational signals.

## D-004 — Preserve research artifacts

**Decision:** Treat `data/synthetic_incidents.csv`, `algorithms/research-models.js`, experiment scripts, and committed results as protected baseline inputs. Any change requires a reproducibility comparison and a documented reason.

**Reason:** The manuscript depends on their deterministic behavior.

## D-005 — Preserve the current backend before migrating the frontend

**Decision:** Keep the existing Express server and research algorithms initially. Add a research-scoped read-only API and a separate frontend surface. Choose a frontend framework only when the first vertical slice needs it; do not migrate the entire application in one step.

**Reason:** A staged approach limits regression risk and makes it possible to test data contracts before UI migration.

## D-006 — No operational interpretation

**Decision:** The route and allocation views are algorithm demonstrations only. Do not display an operational patrol plan, estimated dispatch time, staffing instructions, or recommendations for real places.

**Reason:** The experiment uses synthetic records, configured zone centres, great-circle distance, and deliberately simplified assumptions. Its outputs are not validated for real-world use.
