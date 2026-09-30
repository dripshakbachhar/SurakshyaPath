# SurakshyaPath Intelligence Pipeline

## Current model classification

The current intelligence implementation is:

**STATISTICAL_HEURISTIC**

It is deliberately not described as a neural network, machine-learning model, or generative AI system.

## Pipeline

```
validated incident snapshot
        |
        v
data-quality checks
        |
        v
30-day evidence window
        |
        +--> zone volume
        +--> incident-type frequency
        +--> hour-of-day frequency
        +--> recent 7-day volume
        +--> preceding 7-day volume
        |
        v
trend + pattern fusion
        |
        v
structured intelligence contract
        |
        +--> status
        +--> summary
        +--> patterns
        +--> anomalies
        +--> risk factors
        +--> recommendations
        +--> evidence coverage
        +--> limitations
```

## Status semantics

- `NO_DATA`: no validated records are available.
- `INSUFFICIENT_DATA`: fewer than 10 validated records are available.
- `PARTIAL_SUCCESS`: enough data exists, but quality is below the configured threshold.
- `SUCCESS`: enough validated evidence exists and data quality passes the configured threshold.

## Confidence semantics

The reported confidence is an **evidence-coverage indicator**, not a calibrated probability. It reflects record volume, data quality and availability of a preceding 7-day baseline.

## Future model integration

A trained ML/neural model can be added behind the same contract after providing:

- documented training data
- feature schema
- temporal leakage controls
- train/test separation
- model versioning
- evaluation metrics
- reproducibility controls
- calibrated uncertainty/confidence
- explainability
- explicit limitations

Until those requirements exist, deterministic intelligence is preferable to fabricated AI claims.
