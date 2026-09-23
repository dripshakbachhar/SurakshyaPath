# Resource-allocation experiment

This experiment tests how risk-scoring assumptions affect proportional resource allocation.

## Question

If the same 1,567 synthetic incidents are scored with different risk models, how does the largest-remainder allocation of officers change?

## Risk models

- frequency-only
- severity-only
- frequency-severity
- current-severity-recency

## Staffing scenarios

The experiment runs the allocation with:

- 6 officers
- 12 officers
- 20 officers

The production allocation algorithm is reused: officers are distributed proportionally to normalized zone scores with the largest-remainder method.

## Metrics

For each model, staffing level, and zone, the results record:

- normalized risk score
- ideal fractional officer share
- final integer officer allocation

This makes it possible to see whether a change in the risk model changes not only ranking, but the discrete resource decision.

## Run

```bash
node experiments/run-allocation-experiments.js
```

Results are written to `experiments/results/allocation/`.

All incident records are synthetic. The allocations are algorithm outputs for testing and are not real staffing recommendations.
