# 🛡️ SurakshyaPath · सुरक्षापथ

**An experimental system for incident analysis, risk modelling, patrol routing, and resource allocation.**

SurakshyaPath started as a hackathon prototype for anonymous incident reporting and map-based risk visualization. It is now being developed as a small, reproducible engineering project for exploring how different risk-scoring assumptions affect geographic prioritization and downstream patrol/resource decisions.

> **Important:** this project does not claim to predict crime or represent real incident-level police records. The current spatial dataset is synthetic. Official Nepal Police data is used only as an aggregate monthly reference.

## What the project does

```
Incident data
     ↓
Risk modelling
     ↓
Geographic prioritization
     ↓
Patrol routing
     ↓
Resource allocation
```

The dashboard provides:

- anonymous incident submission for local testing
- a Leaflet-based incident and heatmap view
- explainable risk scores based on severity and recency
- nearest-neighbour patrol routing
- proportional resource allocation using the largest-remainder method
- basic timing and frequency analytics

## Data

The current project uses one month: **Shrawan 2083 B.S.**

- **Official reference:** Nepal Police reports **1,567 registered cases for Kathmandu Valley** for the month.
- **Spatial layer:** 1,567 synthetic incident records are used to exercise the algorithms geographically.
- **Synthetic data is clearly labelled:** it is not a set of real police incident coordinates.

See [`data/data_sources.md`](data/data_sources.md) for provenance and limitations.

## Risk model

The baseline model is intentionally explainable:

```
risk(zone) = Σ severity(type) × recency_decay(incident)
```

Recency decay decreases with age and has a minimum weight of 0.15 over the 30-day modelling window. Zone scores are normalized from 0–100 against the highest-risk zone.

The project also includes controlled experiments comparing:

1. current severity × recency model
2. frequency-only scoring
3. severity-only scoring
4. frequency × severity

These experiments ask how sensitive geographic prioritization is to the assumptions inside the scoring formula. They are **not** presented as evidence that one model is preferable for real-world policing.

## Experiments

### Risk-model sensitivity

Run:

```bash
npm run research-experiments
```

This compares the four scoring assumptions using the same deterministic synthetic dataset.

### Patrol-route sensitivity

Run:

```bash
npm run patrol-experiments
```

The patrol experiment selects the five highest-scoring zones under each model, runs the application's nearest-neighbour heuristic, and compares it with a simple 2-opt route-order improvement.

In the current synthetic coordinate experiment, the severity-only model selects a different set of five zones. For the frequency-based/current models, 2-opt reduces the open-route estimate from about **24.20 km to 22.49 km**. These are algorithm-test results, not road-network travel distances or patrol recommendations.

### Resource-allocation sensitivity

Run:

```bash
npm run allocation-experiments
```

This reuses the production largest-remainder allocation algorithm and tests the four risk models at **6, 12, and 20 officers**.

For the 12-officer scenario, the synthetic experiment produces:

| Risk model | Example allocation pattern |
|---|---|
| Frequency-only | Bouddha 3, Koteshwor 3, Balaju 2, Kirtipur 2 |
| Severity-only | Chabahil 2, Koteshwor 2, and 1 officer across several other zones |
| Frequency × severity | Bouddha 3, Koteshwor 3, Balaju 2, Kirtipur 2 |
| Severity × recency | Bouddha 3, Koteshwor 3, Kirtipur 2, plus smaller allocations including Gongabu |

Compared with the current severity × recency model at 12 officers, the frequency-only and frequency × severity models change the integer allocation in **2 zones**, while the severity-only model changes it in **6 zones**. This illustrates how scoring assumptions can propagate into discrete resource decisions on the synthetic dataset.

Results are written to `experiments/results/`.

## Architecture

```
Browser (public/)
  index.html · css/style.css · js/app.js
        │
        ▼
Express server (server.js)
        │
        ├── algorithms/risk.js
        ├── algorithms/routing.js
        ├── algorithms/allocation.js
        └── data/
```

## Quick start

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Why this project

The goal is not to build a black-box prediction system. It is to make the assumptions visible, test alternative approaches against the same data, and see whether those choices change downstream decisions such as patrol routing and resource allocation.

## Current status

- [x] Working web application
- [x] One-month Kathmandu Valley dataset integration
- [x] Explicit synthetic-data separation
- [x] Baseline risk model
- [x] Alternative risk-model experiments
- [x] Patrol-route sensitivity experiment
- [x] Resource-allocation sensitivity experiment
- [ ] Final dashboard/experiment visualization
- [ ] Portfolio-ready documentation and screenshots

## Limitations

- The spatial incident layer is synthetic.
- The official police statistic is an aggregate count, not a geocoded incident dataset.
- The current patrol planner uses a nearest-neighbour heuristic rather than an exact TSP solver.
- The 2-opt experiment uses great-circle coordinate distance rather than a road network.
- Resource allocations are mathematical outputs, not real staffing recommendations.
- Risk scores depend on explicit assumptions about severity and recency.
- Results from the synthetic dataset should not be interpreted as real-world crime predictions.

## License

MIT
