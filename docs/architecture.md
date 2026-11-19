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
- `data/incidents.json`: legacy local runtime file; never used to replace the canonical synthetic seed.
- `data/community-reports.json`: local community submissions, distinct from synthetic and imported records.
- `data/imported-dataset.json` and `data/active-dataset.json`: separate imported dataset and active-mode pointer.
- `data/synthetic_incidents.csv`: research dataset; separate from live demo storage.
- `algorithms/`: deterministic analytical components.
- `server.js`: API composition and persistence boundary; it depends on the storage interface, not filesystem operations.
- `storage/json-storage.js`: atomic local JSON adapter and read-only deployment adapter.
- `public/js/app.js`: API consumer and presentation state.

Two operating modes are supported. Ordinary local development defaults to
`local-research`; `SURAKSHYA_MODE=public-read-only` or a detected deployment
environment selects `public-read-only`. An unsupported mode and a requested
local-research mode inside a detected deployment fail closed to read-only.
There is no public-write option for the local JSON adapter.

Local research mode is for one researcher on a trusted machine. The server
binds to loopback unless `HOST` is explicitly set. JSON files live under
`data/` or `SURAKSHYA_DATA_DIR`, and atomic rename prevents partial file
replacement but is not a database transaction or a managed durability
guarantee. Import activation writes the separate imported dataset before
switching the active-mode pointer. The dashboard process has one shared active
dataset and report set; it does not provide per-user isolation or safe
multi-process concurrent updates.

Public read-only mode serves the canonical synthetic dashboard and fixed
research results. It disables report submission, import, and dataset
switching, regardless of deployment provider. Storage diagnostics distinguish
configuration and observed read/write outcomes; an adapter instance does not
prove that a local filesystem is writable. Public deployments do not attempt
project-directory writes.

Imported files are parsed in the browser; mapped records are transmitted to
the application server on import. Local imports remain in JSON storage until
manually removed and have no automatic expiration. Anyone with host or
application access can read them. Do not upload sensitive records to an
unsecured deployment.

Other persisted outputs are separate from runtime state: the browser stores a
generated patrol plan in `localStorage`, and explicitly run research/figure
scripts write derived outputs under `experiments/`. The synthetic-data generator
also writes its canonical CSV only when explicitly invoked. These are not
server-side user-data stores.

## Important boundary

Synthetic dashboard records, community reports, imported datasets, and fixed
research results have separate storage/source identities. The dashboard may
combine its synthetic seed and local community reports for display, but report
writes never update the canonical benchmark. Derived imported research
responses include the source dataset identifier. The intelligence layer is
statistical/heuristic. There is currently no trained neural-network model in
the repository. Spatial prioritization, route comparisons, and allocations
are experimental outputs, not validated real-world operational instructions.

The intelligence layer is statistical/heuristic. There is currently no trained neural-network model in the repository.
