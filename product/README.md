# SurakshyaPath Product Workspace

This folder is the product-development workspace for **SurakshyaPath — flagship project 2**.

The product direction is a polished, reproducible **research lab** that makes the existing IEEE-manuscript experiment understandable and explorable. It is not a real-world crime prediction, public reporting, police dispatch, staffing, or patrol-deployment system.

## Start here

- [Product brief](PRODUCT_BRIEF.md) — audience, product promise, scope, and guardrails.
- [MVP backlog](MVP_BACKLOG.md) — the smallest complete, testable build sequence.
- [Development workflow](WORKFLOW.md) — the repeatable implement, diagnose, test, commit, and verify loop.
- [Architecture decisions](DECISIONS.md) — decisions that protect the research and keep the first release small.
- [Implementation log](IMPLEMENTATION_LOG.md) — audit findings and build progress.

## Source of truth

The paper's experiment must continue to be grounded in the existing research code and artifacts:

- `data/synthetic_incidents.csv`
- `config/zones.js`
- `config/severity.js`
- `algorithms/research-models.js`
- `algorithms/allocation.js`
- `algorithms/routing.js`
- `experiments/run-*.js`
- `experiments/results/`

The product UI must not silently substitute the separate dashboard severity weights or dashboard endpoints for the manuscript's research pipeline.

## Working rule

Build a read-only, research-first vertical slice before considering any broader application functionality. Keep the synthetic-data disclosure visible, preserve existing experiment outputs, and make every displayed metric traceable to a stored result or a reproducible algorithm.
