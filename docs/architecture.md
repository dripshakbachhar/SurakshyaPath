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
- `server.js`: API composition and persistence boundary.
- `public/js/app.js`: API consumer and presentation state.

## Important boundary

The dashboard seed data and the research CSV are both synthetic, but they are different datasets. The live dashboard intentionally uses a small deterministic seed so the application is immediately usable; the research pipeline uses the documented 1,567-record dataset.

The intelligence layer is statistical/heuristic. There is currently no trained neural-network model in the repository.
