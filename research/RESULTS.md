# SurakshyaPath Results

## 1. Experimental overview

The experiment compares four deterministic incident-risk scoring models on a synthetic Kathmandu Valley spatial dataset.

- Synthetic records: 1,567
- Canonical scenario seed: 208304
- Robustness seeds: 208304–208308
- Zones: 10
- Risk models: 4
- Primary allocation budget: 12 officers
- Patrol stops: 5
- Patrol station: MPR Ratna Park

All reported results are computational outputs from the repository's current implementation.

## 2. Risk-model comparison

For the canonical seed (208304):

| Model | Top zone | Rank changes vs frequency-only | Mean absolute rank shift |
|---|---|---:|---:|
| frequency-only | Bouddha | 0 | 0.00 |
| severity-only | Thamel | 7 | 2.80 |
| frequency-severity | Bouddha | 0 | 0.00 |
| current-severity-recency | Bouddha | 0 | 0.00 |

The severity-only model produces the largest change in zone ordering relative to the frequency-only reference. The other three models preserve the same complete rank ordering for the canonical scenario.

## 3. Resource allocation

With a fixed budget of 12 officers:

| Model | Zones with changed allocation vs frequency-only | Total absolute officer change |
|---|---:|---:|
| frequency-only | 0 | 0 |
| severity-only | 6 | 10 |
| frequency-severity | 0 | 0 |
| current-severity-recency | 0 | 0 |

The severity-only model therefore changes the allocation pattern substantially in the canonical scenario. The other three models produce the same 12-officer allocation as the frequency-only reference.

## 4. Patrol routing

The patrol experiment applies the same routing procedure to each model's selected priority zones.

| Model | Baseline km | Optimized km | Distance saved | Saved (%) | Route order changed |
|---|---:|---:|---:|---:|---|
| frequency-only | 23.62 | 22.31 | 1.30 | 5.51% | yes |
| severity-only | 18.12 | 18.12 | 0.00 | 0.00% | no |
| frequency-severity | 23.62 | 22.31 | 1.30 | 5.51% | yes |
| current-severity-recency | 23.62 | 22.31 | 1.30 | 5.51% | yes |

These values describe the route produced by the implemented heuristics. They do not demonstrate that a model is operationally superior.

## 5. Multi-seed robustness

Five deterministic synthetic scenarios were evaluated.

| Model | Top-zone result across seeds | Rank-shift range | Allocation-change range |
|---|---|---:|---:|
| frequency-only | Bouddha in 5/5 | 0.0 | 0–0 |
| severity-only | Thamel in 4/5; Chabahil in 1/5 | 1.8–2.8 | 6–7 |
| frequency-severity | Bouddha in 5/5 | 0.0–0.2 | 0–0 |
| current-severity-recency | Bouddha in 5/5 | 0.0–0.2 | 0–2 |

The robustness runs show that the broad distinction between severity-only and the other models is persistent in these five synthetic scenarios. They also show that the current-severity-recency model can produce a small allocation difference under one seed.

## 6. Reproducibility

The complete research pipeline completed successfully, followed by the repository validation suite.

Validation confirmed deterministic and internally consistent behavior for:

- dataset size,
- zone assignment,
- risk models,
- resource allocation,
- patrol routing,
- live risk calculations.

## 7. Interpretation boundary

These results establish what the implemented algorithms produce under the documented synthetic scenarios. They do not establish real-world crime risk, operational patrol effectiveness, or universal superiority of any scoring model.

The multi-seed experiment is a robustness check over synthetic scenarios, not a sample of independent real-world observations.
