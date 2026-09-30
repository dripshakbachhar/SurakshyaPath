# 🛡️ SurakshyaPath · सुरक्षापथ

**A reproducible research and engineering system for incident analysis, explainable risk modelling, patrol-route experimentation, and resource-allocation analysis.**

> **Research safety note:** the current spatial dataset is synthetic. SurakshyaPath is an experimental system, not a crime-prediction product and not an operational policing recommendation engine.

## Why this project exists

SurakshyaPath studies a practical systems question:

> **How do different, explainable risk-scoring assumptions change geographic prioritization and downstream routing/resource-allocation outputs when evaluated on the same deterministic synthetic dataset?**

The project intentionally makes modelling assumptions visible and compares multiple approaches instead of treating a single formula as ground truth.

## System pipeline

```
Synthetic incident data
        ↓
Validation + spatial assignment
        ↓
Risk models
        ↓
Geographic prioritization
     ↙       ↘
Patrol routing   Resource allocation
        ↓
Dashboard + reproducible experiments
```

## Features

- 🗺️ Leaflet-based incident and risk-map dashboard
- 📝 Anonymous local incident-reporting workflow
- 📊 30-day risk scoring using severity × recency
- 🧪 Frequency, severity, frequency×severity, and severity×recency research models
- 🚔 Nearest-neighbour patrol routing with route-sensitivity experiments
- 👮 Largest-remainder proportional allocation experiments
- 📈 Timing, frequency, and trend analytics
- 🔁 Deterministic synthetic-data generation
- ✅ Node.js unit tests + deterministic validation
- 🤖 GitHub Actions CI for code and research reproducibility
- 🔐 Basic API hardening, security headers, payload limits, input validation, and rate limiting
- 💻 One-command local hosting

## Architecture

```
Browser
  └── public/
       ├── index.html
       ├── css/style.css
       └── js/app.js
             │
             ▼
        Express API
          server.js
             │
       ┌─────┼───────────────┐
       ▼     ▼               ▼
     risk  routing       allocation
       │     │               │
       └─────┼───────────────┘
             ▼
          config/
          data/
          experiments/
          research/
```

Core algorithms are intentionally small and independently testable.

## Quick start

Requires **Node.js 18+**.

```bash
npm install
npm run local
```

Open **http://localhost:3000**.

Alternative commands:

```bash
npm start          # production-style local start
npm run dev        # Node watch mode
PORT=4000 npm run local
```

## Quality checks

Run the same checks used by CI:

```bash
npm test
npm run validate
npm run research
npm run figures
```

Research experiment commands:

```bash
npm run research-experiments
npm run patrol-experiments
npm run allocation-experiments
npm run robustness-experiments
```

Generated research outputs are stored under `experiments/results/`.

## Research design

The baseline risk model is:

```
risk(zone) = Σ severity(incident) × recency_decay(incident)
```

The current recency function gives newer records more weight and applies a minimum weight of 0.15 within the 30-day modelling window.

The research suite compares:

1. **frequency-only**
2. **severity-only**
3. **frequency × severity**
4. **severity × recency**

The purpose is sensitivity analysis: measuring how explicit modelling choices propagate into rankings, route order, and mathematical allocations.

## Data provenance

The repository currently contains **1,567 synthetic spatial records** representing a Shrawan 2083 experimental scenario. Aggregate official statistics are treated as contextual reference data, not as geocoded incident records.

See:

- `data/data_sources.md`
- `data/README.md`
- `research/LIMITATIONS.md`
- `research/EXPERIMENT.md`
- `research/RESULTS.md`

## Responsible-use boundaries

This project deliberately does **not** claim to:

- predict individual crime events;
- represent real incident-level police records;
- produce operational patrol recommendations;
- provide validated staffing recommendations;
- infer causality from synthetic data;
- establish that one risk model is objectively superior.

The patrol experiments use great-circle coordinate distance, not road-network travel time. Resource allocation is an algorithmic experiment. Any real deployment would require validated data, domain expertise, legal/ethical review, security controls, auditability, and meaningful human oversight.

**Reproducibility does not imply real-world validity.**

## Engineering practices

- Shared live incident taxonomy in `config/incident-types.js`
- Research-only severity assumptions remain isolated in `config/severity.js`
- Core algorithm tests use Node's built-in test runner
- API input is validated at the boundary
- JSON request bodies are size-limited
- Security response headers are applied centrally
- API 404s and unexpected errors return controlled JSON responses
- Rate-limit state is bounded in memory
- Server shutdown is graceful
- Local runtime data remains ignored by Git
- CI runs tests, validation, research generation, and figure generation

## Project status

- [x] Working dashboard
- [x] Explainable baseline risk model
- [x] Alternative model experiments
- [x] Patrol-route sensitivity experiment
- [x] Resource-allocation sensitivity experiment
- [x] Robustness experiments
- [x] Deterministic validation
- [x] Reproducible research figures
- [x] Automated unit tests
- [x] CI quality pipeline
- [x] Local hosting command
- [x] Engineering/security documentation
- [ ] Production deployment hardening
- [ ] Road-network routing integration
- [ ] External peer review of modelling assumptions

## License

MIT
