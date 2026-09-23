# SurakshyaPath Experimental Specification

## 1. Study objective

SurakshyaPath evaluates how different incident-risk scoring models affect zone prioritization, allocation of a fixed patrol-resource budget, and patrol-route characteristics in a simulated Kathmandu Valley environment.

The study is computational and comparative. It does not claim to predict real-world crime or provide operational staffing recommendations.

## 2. Research questions

### RQ1 — Risk modelling
How differently do frequency, severity, frequency × severity, and severity × recency models score the same incident dataset?

### RQ2 — Resource allocation
How does the choice of risk model change the distribution of a fixed patrol-resource budget across active zones?

### RQ3 — Patrol routing
How does model-driven zone prioritization affect patrol-route order and total route distance?

### RQ4 — Reproducibility
Can the complete experimental pipeline reproduce identical results when the dataset, parameters, and software are unchanged?

### RQ5 — Robustness across synthetic scenarios
Do the observed model-dependent patterns remain similar when the deterministic synthetic generator is rerun with several predefined seeds?

## 3. Hypotheses

**H1:** Different risk-scoring models will produce different relative zone scores and/or prioritizations on the same incident dataset.

**H2:** Changing the risk-scoring model will change the allocation of a fixed resource budget across at least some zones.

**H3:** Different model-generated zone priorities will produce different patrol routes and potentially different total route distances.

**H4:** Identical inputs, parameters, and software will produce identical experimental outputs across repeated executions.

**H5:** The main descriptive patterns will remain reasonably stable across multiple deterministic synthetic seeds.

## 4. Dataset

The research dataset contains **1,567 synthetic spatial incident records**.

The records are generated deterministically from:

- Record count: 1,567
- Canonical random seed: 208304
- Robustness seeds: 208304, 208305, 208306, 208307, 208308
- Latitude bounds: 27.60–27.78
- Longitude bounds: 85.20–85.50
- Incident categories: theft, suspicious, harassment, infrastructure
- Research severity values are defined in `config/severity.js`
- Spatial zone assignment uses the canonical zones in `config/zones.js`

The dataset is a synthetic spatial layer. It must not be described as 1,567 individually observed police incidents.

## 5. Study zones

The experiment uses the 10 canonical zones defined in `config/zones.js`:

1. Thamel
2. Kalimati
3. New Baneshwor
4. Chabahil
5. Koteshwor
6. Balaju
7. Patan
8. Gongabu
9. Kirtipur
10. Bouddha

## 6. Risk models

Four models are evaluated on the same records.

### M1 — Frequency-only

For each zone:

`score = number of incidents`

### M2 — Severity-only

For each zone:

`score = mean incident severity`

### M3 — Frequency × Severity

For each zone:

`score = sum of incident severity`

### M4 — Severity × Recency

For each incident:

`contribution = severity × max(0.15, 1 - ageDays/30)`

The zone score is the sum of incident contributions.

Each model is normalized so that the highest-scoring zone has a normalized score of 100.

Implementation: `algorithms/research-models.js`

## 7. Resource-allocation experiment

The allocation experiment uses a fixed budget of **12 officers**.

For each risk model:

1. Calculate the model score for each zone.
2. Exclude zones with zero incidents.
3. Calculate proportional officer shares.
4. Assign floor values.
5. Distribute remaining officers using the largest-remainder method.
6. Preserve deterministic tie-breaking.

The primary response variable is:

`officers assigned per zone`

Additional derived measures can include allocation concentration and the number of zones receiving resources.

Implementation: `algorithms/allocation.js`

## 8. Patrol-routing experiment

Patrol routing uses:

- A fixed station location.
- The model-specific zone priorities.
- A maximum of 5 patrol stops.
- Nearest-neighbour routing after the initial priority selection.

The primary response variable is:

`total route distance (km)`

Secondary variables include:

- route stop order,
- individual leg distance,
- estimated patrol time,
- route-order changes.

Implementation: `algorithms/routing.js`

## 9. Baseline and comparison

The same dataset and fixed experimental parameters are used for all four models.

This is a within-dataset computational comparison: the risk-scoring method is changed while the underlying records and core allocation/routing procedures remain fixed.

The experiment therefore measures how model choice changes downstream outputs; it does not establish that one model is universally superior.

## 10. Multi-seed robustness experiment

A robustness experiment reruns the same synthetic-generation mechanism with five predefined seeds: 208304 through 208308. Each seed produces 1,567 records using the same category proportions, spatial bounds, severity definitions, canonical zones, risk models, 12-officer allocation budget, and 5-stop patrol setting.

For each seed and model, the experiment records:

- top-ranked zone,
- mean absolute rank shift relative to the frequency-only reference,
- number of zones whose 12-officer allocation differs from the frequency-only reference,
- patrol-route distance.

The results are stored under `experiments/results/robustness/`.

These seed variations are **synthetic scenario replications**, not independent real-world observations. They are intended to test algorithmic sensitivity and robustness, not to justify population-level statistical inference or claims about actual crime patterns. Replication is useful for examining stability and potential moderators in empirical software-engineering research. citeturn0search0

## 11. Reproducibility procedure

The experiment should be reproducible from the repository using the documented npm scripts.

Current experiment commands:

```text
npm.cmd run research-experiments
npm.cmd run patrol-experiments
npm.cmd run allocation-experiments
npm.cmd run robustness-experiments
npm.cmd run validate
```

The validation script checks:

- dataset size,
- zone assignment coverage,
- model output structure,
- model determinism,
- officer-allocation total,
- patrol-route validity,
- risk-model determinism and incident counting.

## 12. Expected outputs

Research outputs are stored under:

`experiments/results/`

Current result groups include:

- risk-model comparisons,
- patrol-route comparisons,
- resource-allocation comparisons.

CSV files are intended for tabular analysis; JSON files preserve machine-readable summaries.

## 13. Analysis plan

The first analysis is descriptive.

For each model, report:

- zone scores,
- zone ordering,
- officer allocation,
- route distance,
- route-distance change,
- route-order changes.

Do not interpret a numerical difference as proof of superiority without an appropriate basis for that conclusion.

Where useful, report absolute differences and percentage differences rather than only raw values.

## 14. Threats to validity

### Synthetic spatial data

The spatial distribution is generated rather than collected from individual real-world incident records. Results therefore describe the simulated environment and should not be generalized directly to real crime patterns.

### Aggregate source context

The project's documented aggregate incident count provides contextual grounding, but the synthetic records should not be presented as a reconstruction of individual official cases.

### Heuristic routing

The patrol algorithm uses a nearest-neighbour heuristic and coordinate distance. It does not model road networks, traffic, road closures, response times, or operational constraints.

### Fixed parameters

Results depend on the selected number of officers, patrol stops, recency window, severity definitions, and other parameters.

### Model assumptions

The risk models encode different assumptions about what constitutes priority. Their outputs should therefore be interpreted as model-dependent analytical results rather than objective measurements of risk.

## 15. Reproduction checklist

A reproduction should:

1. Use the repository version containing the experiment scripts.
2. Generate or use the documented 1,567-record synthetic dataset.
3. Preserve the documented random seed.
4. Preserve the canonical zone configuration.
5. Run the research, patrol, and allocation experiment commands.
6. Run the validation command.
7. Compare generated outputs with the stored experiment results.
8. Record any differences in software version, parameters, dataset, or configuration.

## 16. Implementation map

| Research component | Repository location |
|---|---|
| Canonical zones | `config/zones.js` |
| Research severity | `config/severity.js` |
| Synthetic data generation | `data/generate-synthetic.js` |
| Risk-model implementation | `algorithms/research-models.js` |
| Allocation algorithm | `algorithms/allocation.js` |
| Patrol algorithm | `algorithms/routing.js` |
| Risk validation | `scripts/validate.js` |
| Risk experiments | `experiments/run-experiments.js` |
| Patrol experiments | `experiments/run-patrol-experiments.js` |
| Allocation experiments | `experiments/run-allocation-experiments.js` |
| Results | `experiments/results/` |
