# SurakshyaPath Research Lab — Product Brief

## Product statement

SurakshyaPath Research Lab is an interactive, reproducible presentation of the computational study in the IEEE manuscript:

> How do different explainable risk-scoring assumptions propagate through spatial prioritization, resource allocation, and patrol-routing algorithms when they are evaluated on the same deterministic synthetic dataset?

It should help a reader understand the experiment, inspect the evidence, and reproduce the outputs—not tell anyone what to do in a real place.

## Audience

- Readers evaluating the research and its methods.
- Students and researchers exploring explainable scoring and deterministic simulation.
- Developers inspecting how inputs, formulas, and downstream computations connect.

The intended user is **not** a police operator or a person submitting a real incident.

## Product promise

A visitor should be able to answer five questions without reading the source code:

1. What data does the experiment use?
2. What are the four scoring formulas?
3. How do the four formulas change zone rankings?
4. How do the changes propagate into the fixed-budget allocation experiment?
5. What does the nearest-neighbour versus open-route 2-opt comparison measure—and what does it not measure?

## Research contract

The first release is a read-only viewer of the existing experiment.

- Dataset: 1,567 deterministic synthetic records; canonical seed 208304.
- Spatial units: ten configured zone centres.
- Research severity values: theft 2, suspicious 1, harassment 3, infrastructure 1.
- Models: frequency-only, severity-only, aggregate severity (frequency × severity), and severity × recency.
- Allocation: largest-remainder apportionment at the stored budgets 6, 12, and 20.
- Routing experiment: MPR Ratna Park origin, five model-ranked zones, great-circle distance, open route, and the stored 2-opt comparison.
- Robustness: the five deterministic seeds already stored by the repository.

The app must label these as synthetic experiment settings. A normalized score is not a probability, a forecast, a validated public-safety measure, or a deployment recommendation.

## Proposed information architecture

1. **Overview** — research question, dataset provenance, scope, key canonical findings, and visible synthetic-data notice.
2. **Scoring models** — formula cards, assumptions, normalized scores, and model-by-model rank comparison.
3. **Allocation experiment** — fixed budget selector limited to stored budgets; compare the algorithmic output vectors without presenting them as staffing advice.
4. **Route experiment** — compare the stored nearest-neighbour and 2-opt geometric paths as an algorithm illustration; do not present travel time, turn-by-turn navigation, or an actionable patrol plan.
5. **Robustness** — show the five deterministic seeds as designed scenarios, not independent empirical observations or confidence intervals.
6. **Methods & limits** — generator, spatial assignment, normalization, evaluation metrics, references, and explicit claim boundaries.

A compact global data/provenance panel should remain available throughout the experience.

## Explicitly out of scope for MVP

- Real incident collection, public submissions, or user geolocation.
- Live crime feeds or importing identifiable incident-level records.
- Police dispatch, operational patrol guidance, staffing advice, or real-world route recommendations.
- Predictive claims, automated decisions, fairness claims, or claims that one model is universally better.
- Accounts, roles, public report storage, or production multi-tenant infrastructure.
- A wholesale rewrite of the validated research algorithms.

The current legacy UI/API contains a report form and operational-style patrol/allocation views. These are not part of the manuscript's research question and should not be carried into the new research-first experience.

## Success criteria

A first release is successful when:

- All visible numbers trace back to a repository result file or a tested research function.
- The four models and their definitions are visible together.
- The canonical results and five-seed results can be compared without implying statistical generalization.
- The app works on desktop and mobile, has keyboard-accessible controls, useful empty/error/loading states, and readable chart labels.
- No real-world report submission or operational recommendation is exposed.
- Existing research tests, deterministic validation, and smoke tests continue to pass.
