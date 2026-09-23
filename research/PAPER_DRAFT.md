# SurakshyaPath: A Reproducible Computational Study of Explainable Risk Scoring for Spatial Prioritization, Patrol Routing, and Resource Allocation

## Abstract

Public-safety analytics systems often transform incident records into spatial priorities and then use those priorities in downstream processes such as resource allocation and route planning. This creates an important methodological question: how strongly do downstream outputs depend on the assumptions embedded in the initial risk-scoring model?

SurakshyaPath is a reproducible computational research prototype designed to study this question in a controlled synthetic Kathmandu Valley environment. Four explainable risk formulations are compared on the same synthetic spatial dataset: frequency-only, severity-only, frequency × severity, and severity × recency. Their outputs are propagated into a fixed 12-officer resource-allocation procedure and a five-stop patrol-routing procedure. Reproducibility is assessed through deterministic execution, while robustness is explored using five predefined synthetic generator seeds.

For the canonical scenario, the severity-only formulation produces the largest change in zone ordering relative to the frequency-only reference, with a mean absolute rank shift of 2.80 positions and seven changed zone ranks. It also changes the allocation of six zones, with a total absolute officer change of 10. The other three models preserve the same complete zone ordering in the canonical scenario. For patrol routing, the tested nearest-neighbour route is reduced from 23.62 km to 22.31 km by the implemented 2-opt comparison for three models, while the severity-only route is 18.12 km before and after the tested optimization. Across five synthetic scenarios, the severity-only formulation remains the most variable.

These findings demonstrate model sensitivity and downstream propagation within the simulated environment. They do not establish real-world crime patterns, causal effects, patrol effectiveness, staffing requirements, or superiority of any risk model. The primary contribution is a transparent and reproducible framework for examining how explainable modelling assumptions affect subsequent computational outputs.

Keywords: spatial analytics, risk modelling, reproducibility, patrol routing, resource allocation, synthetic data, sensitivity analysis

## 1. Introduction

Data-driven decision systems frequently contain a chain of transformations rather than a single predictive model. In a spatial public-safety setting, incident observations may first be converted into zone-level priorities, after which those priorities can influence resource allocation and route planning. A change in the initial scoring assumption may therefore propagate through the entire pipeline.

SurakshyaPath was developed as a research prototype around this principle. The system combines an interactive spatial dashboard with a reproducible experimental pipeline. The research component evaluates multiple explainable scoring formulations using the same synthetic spatial records.

The central research question is:

How do different, explainable risk-scoring assumptions change geographic prioritization, patrol routing, and resource allocation when evaluated on the same synthetic dataset?

The study addresses five questions:

1. How differently do the four risk formulations score the same incident dataset?
2. How does risk-model choice change allocation of a fixed resource budget?
3. How does model-generated priority affect patrol-route order and distance?
4. Can the computational pipeline reproduce identical results under unchanged inputs and parameters?
5. Do the observed descriptive patterns remain similar across multiple deterministic synthetic scenarios?

## 2. System Architecture

The research pipeline follows:

Synthetic incident generation → spatial zone assignment → risk scoring → zone prioritization → resource allocation and patrol routing → robustness analysis → figures and interpretation.

The repository separates risk modelling, routing, allocation, data generation, experiments, and validation. The dashboard consumes a common backend snapshot so that displayed incident, zone, and analytical statistics are derived from consistent data.

## 3. Research Design

This is a computational sensitivity and robustness experiment. It is not a field study and does not estimate the prevalence or probability of real-world crime.

The primary experimental manipulation is the risk-scoring formulation. Within each scenario, the incident dataset, canonical zones, allocation budget, patrol-stop count, and downstream procedures are held constant.

### Dataset

The research pipeline uses 1,567 synthetic spatial incident records. The canonical generator seed is 208304, with robustness seeds 208304 through 208308. Records represent theft, suspicious activity, harassment, and infrastructure issues.

The spatial layer is bounded within the documented Kathmandu Valley coordinate region and assigned to ten canonical zones. These records are synthetic and must not be interpreted as individually observed police incidents.

### Zones

The ten canonical zones are Thamel, Kalimati, New Baneshwor, Chabahil, Koteshwor, Balaju, Patan, Gongabu, Kirtipur, and Bouddha.

Incidents are assigned to the nearest canonical zone using coordinate distance. This is a simplified spatial abstraction rather than a representation of official administrative or policing boundaries.

## 4. Risk Models

### M1 — Frequency-only

Zone score equals the number of incidents in that zone.

### M2 — Severity-only

Zone score equals the mean assigned severity of incidents in that zone.

### M3 — Frequency × Severity

Zone score equals the sum of incident severity values.

### M4 — Severity × Recency

Each incident contributes:

severity × max(0.15, 1 − ageDays / 30)

The zone score is the sum of incident contributions within the 30-day model window.

All models are normalized so that the highest-scoring zone has a score of 100.

The models encode different assumptions about what should influence priority. They are not treated as interchangeable definitions of objective risk.

## 5. Resource Allocation

The allocation experiment uses a fixed budget of 12 officers. For each model, zones are scored, zero-incident zones are excluded, proportional shares are calculated, floor values are assigned, and remaining officers are distributed using the largest-remainder method with deterministic tie-breaking.

The primary outcomes are the number of zones whose allocation changes relative to the frequency-only reference and the total absolute officer change.

## 6. Patrol Routing

The patrol experiment uses one fixed station, model-generated zone priorities, five patrol stops, a nearest-neighbour routing heuristic, and a 2-opt route-order comparison.

The primary outcome is total route distance in kilometres. Distances are coordinate-based estimates rather than road-network travel distances.

## 7. Reproducibility and Robustness

The pipeline is designed to be deterministic when the dataset, seed, parameters, and software remain unchanged. The repository provides executable commands for research-model experiments, patrol experiments, allocation experiments, robustness experiments, figure generation, and validation.

Five predefined synthetic seeds are used for robustness analysis. These are repeated simulations from the same generator rather than independent real-world observations.

## 8. Results

### 8.1 Risk-model comparison

For seed 208304:

| Model | Top zone | Rank changes vs frequency-only | Mean absolute rank shift |
|---|---|---:|---:|
| Frequency-only | Bouddha | 0 | 0.00 |
| Severity-only | Thamel | 7 | 2.80 |
| Frequency × severity | Bouddha | 0 | 0.00 |
| Severity × recency | Bouddha | 0 | 0.00 |

The severity-only formulation produces the largest change in zone ordering in the canonical synthetic scenario.

### 8.2 Resource allocation

With 12 officers:

| Model | Zones with changed allocation | Total absolute officer change |
|---|---:|---:|
| Frequency-only | 0 | 0 |
| Severity-only | 6 | 10 |
| Frequency × severity | 0 | 0 |
| Severity × recency | 0 | 0 |

This demonstrates that a change in the scoring formulation can propagate into discrete allocation outputs.

### 8.3 Patrol routing

| Model | Baseline km | Optimized km | Distance saved | Saved (%) |
|---|---:|---:|---:|---:|
| Frequency-only | 23.62 | 22.31 | 1.30 | 5.51% |
| Severity-only | 18.12 | 18.12 | 0.00 | 0.00% |
| Frequency × severity | 23.62 | 22.31 | 1.30 | 5.51% |
| Severity × recency | 23.62 | 22.31 | 1.30 | 5.51% |

These values describe the implemented routing heuristics and do not demonstrate operational patrol effectiveness.

### 8.4 Robustness

Across seeds 208304–208308:

| Model | Top-zone result | Rank-shift range | Allocation-change range |
|---|---|---:|---:|
| Frequency-only | Bouddha in 5/5 | 0.0 | 0–0 |
| Severity-only | Thamel in 4/5; Chabahil in 1/5 | 1.8–2.8 | 6–7 |
| Frequency × severity | Bouddha in 5/5 | 0.0–0.2 | 0–0 |
| Severity × recency | Bouddha in 5/5 | 0.0–0.2 | 0–2 |

The synthetic robustness experiment shows a persistent separation between the severity-only formulation and the other formulations under the current generator.

## 9. Discussion

The main computational finding is that scoring formulation affects geographic prioritization when different formulations emphasize different properties of the same records.

Frequency-only emphasizes volume. Severity-only emphasizes average assigned severity, allowing a zone with fewer but relatively severe incidents to move upward. Frequency × severity behaves as an aggregate burden measure because every additional incident contributes to the total. Severity × recency adds a temporal component by reducing the contribution of older records.

Importantly, differences do not remain isolated within the risk layer. In the canonical scenario, severity-only changes six zone allocations and produces a different route structure. This demonstrates a general property of chained decision systems: upstream modelling assumptions can propagate into downstream computational outputs.

The robustness experiment shows that the separation observed in the canonical scenario also appears across the current synthetic generator's predefined seeds. However, these scenarios share the same generator and therefore do not constitute independent observations of the real world.

The findings support sensitivity analysis rather than model selection. The study demonstrates that explainable assumptions can produce materially different computational priorities, but it does not establish that any formulation is more accurate or appropriate for real-world deployment.

## 10. Limitations

The principal limitation is the use of synthetic incident records. Their spatial and categorical structure is generated rather than individually observed.

The five robustness seeds are variations of the same generator and are not independent real-world samples.

Severity values are predefined assumptions. Changing the severity scale can change rankings and allocations.

The recency model uses a fixed 30-day window and minimum contribution of 0.15. Alternative temporal functions could produce different outputs.

Nearest-zone assignment using coordinate distance does not represent real boundaries, road accessibility, or travel time.

The routing model does not represent traffic, one-way streets, road closures, travel-time uncertainty, officer availability, shift constraints, or actual road-network distance.

The allocation experiment uses a fixed 12-officer budget and a particular allocation rule; neither should be interpreted as evidence about real staffing requirements.

The study is primarily descriptive and deterministic and does not provide population-level statistical inference about Kathmandu Valley.

The prototype should not be interpreted as an operational police-dispatch or staffing system. Real deployment would require validated data, domain review, legal and ethical assessment, security controls, monitoring, auditability, and human oversight.

## 11. Future Work

The next phase should strengthen empirical validity rather than simply add dashboard features.

1. Validate spatial abstractions against appropriately sourced aggregate public data where legally and ethically appropriate.
2. Test multiple severity schemes.
3. Compare alternative recency functions and observation windows.
4. Compare multiple officer budgets and allocation rules.
5. Compare alternative routing algorithms using road-network distance where appropriate data exist.
6. Perform pairwise comparisons among all risk models.
7. Define evaluation metrics before inspecting experimental outcomes.
8. Involve relevant domain experts in evaluating interpretability, auditability, and constraints.

## 12. Conclusion

SurakshyaPath provides a reproducible framework for studying how explainable risk-scoring assumptions propagate through spatial prioritization, resource allocation, and patrol routing.

Using the same synthetic incident environment, the study demonstrates that alternative scoring formulations can produce different geographic rankings and downstream allocation and routing outputs. The severity-only formulation shows the largest observed sensitivity in the canonical experiment, while the other formulations remain comparatively close to the frequency reference under the current synthetic generator.

The principal contribution is methodological rather than operational. SurakshyaPath makes modelling assumptions visible, separates computational stages, preserves deterministic experiment settings, and records both results and limitations. This makes the system a useful testbed for studying model sensitivity before stronger empirical data and evaluation designs are introduced.

The current evidence should therefore be interpreted as a reproducible computational sensitivity study. The next step is to test its assumptions systematically and, where justified, against carefully validated external data.

## Source Documents

This paper draft is synthesized from the repository's current research record:

- research/README.md
- research/EXPERIMENT.md
- research/ANALYSIS.md
- research/RESULTS.md
- research/LIMITATIONS.md
- algorithms/research-models.js
- algorithms/routing.js
- algorithms/allocation.js
- data/generate-synthetic.js
- scripts/validate.js
- experiments/

The draft intentionally does not claim statistical significance, real-world predictive accuracy, operational effectiveness, causal conclusions, or universal superiority of any scoring model.
