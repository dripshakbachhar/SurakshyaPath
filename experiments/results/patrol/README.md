# Patrol-route experiment

This is the second experiment layer for SurakshyaPath.

## Question

If the risk-scoring assumption changes, does the resulting patrol route change?

The experiment also compares the application's current nearest-neighbour route with a simple 2-opt route-order improvement.

## Models

- frequency-only
- severity-only
- frequency-severity
- current-severity-recency

For each model, the five highest-scoring zones are passed to the same baseline patrol-routing algorithm used by the application.

## Route methods

**Nearest neighbour:** starts at MPR Ratna Park and repeatedly visits the closest remaining selected zone.

**2-opt:** keeps the same selected stops and searches for route-order reversals that reduce total open-route distance.

This is an algorithm experiment, not a road-network routing engine.

## Metrics

The experiment records:

- baseline route order
- optimized route order
- baseline distance
- optimized distance
- distance saved
- percentage distance saved
- whether the stop order changed

Distances are great-circle estimates between configured coordinates, so they should not be interpreted as actual driving distance or travel time.

## Run

```bash
node experiments/run-patrol-experiments.js
```

Results are written to `experiments/results/patrol/`.

All incident records are synthetic. The experiment does not predict crime or represent actual police patrol recommendations.
