# SurakshyaPath Architecture

SurakshyaPath is a local/research prototype with a single live incident snapshot feeding the analytical and presentation layers.

## Runtime flow

```
Incident seed / anonymous report
        |
        v
server.js incident store
        |
        +--> data-quality validation
        |
        +--> risk model ------------------+
        |                                  |
        +--> analytics --------------------+--> /api/dashboard
        |                                  |
        +--> intelligence -----------------+
        |
        +--> patrol routing
        |
        +--> resource allocation
        |
        v
Browser state (public/js/app.js)
        |
        +--> map
        +--> statistics
        +--> analytics
        +--> intelligence
        +--> patrol plan
        |
        v
New anonymous report
        |
        +-------------------------------> same snapshot
```

## Sources of truth

- `config/zones.js`: canonical dashboard zones.
- `config/incident-types.js`: live incident taxonomy and dashboard severity weights.
- `data/incidents.json`: local runtime persistence; ignored by Git.
- `data/synthetic_incidents.csv`: research dataset; separate from live demo storage.
- `algorithms/`: deterministic analytical components.
- `server.js`: API composition and persistence boundary; it depends on the storage interface, not filesystem operations.
- `storage/json-storage.js`: atomic local JSON adapter and read-only deployment adapter.
- `public/js/app.js`: API consumer and presentation state.

Local development persists incidents, imported datasets, and the active dataset
selection in separate JSON files under `data/` (or `SURAKSHYA_DATA_DIR` when
configured). Writes use a temporary file followed by an atomic rename. Import
activation writes the dataset before switching the active-mode pointer, so a
failed activation does not replace the current dataset.

Vercel uses the read-only adapter unless a durable storage provider is added.
It serves the canonical synthetic dashboard and fixed research results without
attempting project-directory writes. Report submission, dataset import, and
dataset switching return `503` while persistence is unavailable. The adapter
does not use `/tmp` or claim that serverless instance memory is durable.

Other persisted outputs are separate from runtime state: the browser stores a
generated patrol plan in `localStorage`, and explicitly run research/figure
scripts write derived outputs under `experiments/`. The synthetic-data generator
also writes its canonical CSV only when explicitly invoked. These are not
server-side user-data stores.

## Important boundary

The dashboard seed data and the research CSV are both synthetic, but they are different datasets. The live dashboard intentionally uses a small deterministic seed so the application is immediately usable; the research pipeline uses the documented 1,567-record dataset.

The intelligence layer is statistical/heuristic. There is currently no trained neural-network model in the repository.
