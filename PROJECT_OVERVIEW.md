# SurakshyaPath project overview

SurakshyaPath is a reproducible research and engineering testbed for studying
how explainable spatial-prioritization models affect downstream route and
resource-allocation experiments. The canonical benchmark is deterministic and
synthetic. Imported data can be analyzed separately; neither source represents
validated operational guidance.

## Application

- `server.js` serves the static browser application and JSON API.
- `public/` contains the landing page, dashboard, shared design tokens, and
  local-only static assets.
- `algorithms/` contains the scoring, routing, allocation, analytics, and
  dataset-comparison implementations.
- `data/` contains the canonical synthetic data and separate runtime data
  files. Do not commit local runtime records.
- `storage/json-storage.js` provides atomic best-effort local JSON persistence
  and a deployment read-only adapter.
- `experiments/` contains deterministic research scripts, results, figures,
  and provenance.

## Operating modes

**Local research** is for a single researcher on a trusted machine. It enables
local JSON imports, dataset switching, and demo reports. The active dataset is
shared by all requests to the process; this is not multi-user isolation.

**Public read-only** serves the canonical synthetic benchmark and fixed
research results while disabling imports, dataset switching, and community
report writes. Configure `SURAKSHYA_MODE=public-read-only` for every public
deployment. Production and recognized deployment environments also fail
closed to read-only mode.

Local JSON files are not encrypted, automatically expired, or backed up by a
managed database. Imported files are parsed in the browser, but mapped records
are sent to the application server on import. Do not upload sensitive records
to an unsecured deployment.

## Research boundaries

Model rankings, allocations, route comparisons, and intelligence summaries are
experimental outputs. They are not validated real-world predictions or
operational instructions. See [SECURITY.md](./SECURITY.md),
[docs/architecture.md](./docs/architecture.md), and
[docs/deployment.md](./docs/deployment.md) for boundaries and deployment
requirements.
