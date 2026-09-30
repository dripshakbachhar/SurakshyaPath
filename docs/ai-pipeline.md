# SurakshyaPath Intelligence Pipeline

## Current model classification

The current intelligence implementation is **STATISTICAL_HEURISTIC**. It is deliberately not described as a neural network, machine-learning model, or generative AI system.

## Connected pipeline

```
canonical synthetic/live incidents
        |
        v
data-quality gate
        |
        v
validated 30-day evidence
        |
        +--> zone volume
        +--> incident-type frequency
        +--> hour-of-day frequency
        +--> recent 7-day volume
        +--> preceding 7-day volume
        |
        v
risk model (severity × recency)
        |
        v
intelligence fusion
        |
        +--> observed patterns
        +--> risk factors
        +--> trend/anomaly state
        +--> evidence coverage
        +--> recommendations
        |
        v
dashboard / diagnostics / patrol inputs
```

The important invariant is that intelligence consumes the same validated incident snapshot and risk-zone output used by the dashboard; it no longer operates beside an unrelated demo dataset.

## Status semantics

- `NO_DATA`: no validated records are available.
- `INSUFFICIENT_DATA`: fewer than 10 validated records are available.
- `PARTIAL_SUCCESS`: enough data exists, but quality is below the configured threshold.
- `SUCCESS`: enough validated evidence exists and data quality passes the configured threshold.

## Confidence semantics

The reported confidence is an **evidence-coverage indicator**, not a calibrated probability. It reflects record volume, data quality and availability of a preceding 7-day baseline.

## Future model integration

A trained ML/neural model can be added behind the same contract after providing documented training data, feature schema, temporal leakage controls, train/test separation, model versioning, evaluation metrics, reproducibility controls, calibrated uncertainty/confidence, explainability, and explicit limitations.

Until those requirements exist, deterministic intelligence is preferable to fabricated AI claims.
