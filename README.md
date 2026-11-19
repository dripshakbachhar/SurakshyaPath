# SurakshyaPath · सुरक्षापथ

**An experimental research platform for exploring how spatial-prioritization models influence route and resource-allocation experiments.**

<p align="center">
  <a href="YOUR_VERIFIED_VERCEL_URL">Live Application</a> ·
  <a href="https://github.com/dripshakbachhar/SurakshyaPath">Source Code</a> ·
  <a href="./PROJECT_OVERVIEW.md">Project Overview</a>
</p>

---

## About

SurakshyaPath is a research and engineering platform for investigating how different scoring assumptions affect geographic priorities and subsequent computational experiments.

It combines dataset management, spatial visualization, explainable scoring models, route comparisons, and resource-allocation experiments in one workspace.

The objective is to make modelling choices transparent and their computational effects reproducible.

## Features

- **Dataset management:** Import and validate CSV/JSON datasets.
- **Spatial visualization:** Explore geographic records and zone-level patterns.
- **Model comparison:** Compare four explainable scoring approaches.
- **Route experiments:** Evaluate nearest-neighbour and 2-opt route distances.
- **Resource allocation:** Compare allocations under different budgets.
- **Research workspace:** Run reproducible experiments and inspect results.
- **Analytics:** Examine distributions, temporal patterns, and data quality.

## Research benchmark

| Component | Current setup |
|---|---:|
| Synthetic records | 1,567 |
| Geographic zones | 10 |
| Scoring models | 4 |
| Robustness scenarios | 5 |

The benchmark uses deterministic synthetic data. Generated locations are not actual police incident coordinates. Results demonstrate algorithmic behaviour under specified assumptions, not real-world crime patterns or operational effectiveness.

See [Data Sources](./data/data_sources.md) and [Research Limitations](./research/LIMITATIONS.md).

## Technology

- **Backend:** Node.js, Express
- **Frontend:** HTML, CSS, JavaScript
- **Mapping:** Leaflet, Leaflet.heat
- **Visualization:** Three.js
- **Deployment:** Vercel
- **Testing:** Node.js test runner, GitHub Actions

## Installation and local setup

**Requirements:** Node.js 18+ and npm.

Clone the repository:

```bash
git clone https://github.com/dripshakbachhar/SurakshyaPath.git
```

Navigate into the project:

```bash
cd SurakshyaPath
```

Install dependencies:

```bash
npm ci
```

Start the application:

```bash
npm run local
```

**Open the application in your browser:**

```text
http://localhost:3000
```

The default local development port is `3000`.

## Validation

Run the project's main validation and research commands:

```bash
npm test
npm run validate
npm run smoke
npm run research
npm run figures
```

## Deployment and data

Public Vercel deployments operate in **read-only mode**. Dataset imports, dataset switching, and community-report writes are disabled.

Local research mode supports imports and JSON persistence but is intended for a single researcher on a trusted machine. It does not provide per-user isolation or managed database storage.

Do not upload sensitive or personally identifiable information to an unsecured deployment.

See [Deployment Guide](./docs/deployment.md) and [Security Policy](./SECURITY.md).

## Documentation

- [Project Overview](./PROJECT_OVERVIEW.md)
- [Architecture](./docs/architecture.md)
- [Data Sources](./data/data_sources.md)
- [Experimental Design](./research/EXPERIMENT.md)
- [Research Results](./research/RESULTS.md)
- [Research Limitations](./research/LIMITATIONS.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

## License and attribution

The project intends to use the **MIT License**. A root-level `LICENSE` file must be added to complete this licensing setup.

Third-party components retain their respective licenses:

- [Express — MIT](https://github.com/expressjs/express)
- [Three.js — MIT](https://github.com/mrdoob/three.js)
- [Leaflet — BSD-2-Clause](https://github.com/Leaflet/Leaflet)
- [Leaflet.heat — BSD-2-Clause](https://github.com/Leaflet/Leaflet.heat)
- [Vercel Speed Insights — Apache-2.0](https://github.com/vercel/speed-insights)
- [OpenStreetMap — ODbL and tile usage policy](https://www.openstreetmap.org/copyright)

See the dependency lockfile for additional package licenses.

---

**SurakshyaPath · सुरक्षापथ**

*Explore the assumptions. Compare the outcomes. Reproduce the experiment.*
