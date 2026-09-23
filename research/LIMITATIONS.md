# SurakshyaPath Limitations

## 1. Synthetic data

The largest limitation is that the 1,567 incident records are synthetic. Their spatial distribution and category structure come from a deterministic generator rather than individually observed official incident records.

Therefore, the results cannot be interpreted as estimates of actual crime patterns in Kathmandu Valley.

## 2. Synthetic seed replications

The five robustness scenarios differ only through the generator seed while preserving the same generation mechanism and category structure.

They are useful for testing algorithmic stability, but they are not independent observations of the real world. They should not be treated as a basis for population-level statistical inference.

## 3. Zone assignment

Incidents are assigned to the nearest canonical zone using coordinate distance in latitude/longitude space. This is a simplified spatial abstraction.

Real geographic boundaries, road networks, administrative boundaries, travel times, and physical accessibility are not represented.

## 4. Severity assumptions

The research severity values are predefined assumptions:

- theft: 2
- suspicious: 1
- harassment: 3
- infrastructure: 1

Changing these values could change the model rankings and downstream allocations.

The experiment therefore evaluates the consequences of the chosen scoring assumptions rather than discovering an objectively correct severity scale.

## 5. Recency model

The recency formulation uses a fixed 30-day window and a minimum decay contribution of 0.15.

Different decay functions, windows, or minimum contributions could produce different results.

## 6. Resource allocation

The primary comparison uses a fixed budget of 12 officers and a largest-remainder allocation rule.

Results can change with different officer budgets or allocation policies. The existing allocation experiments include additional budgets, but those remain computational scenarios rather than evidence about real staffing requirements.

## 7. Patrol routing

The patrol model uses a nearest-neighbour heuristic and coordinate-based distance.

It does not model:

- road-network distance,
- traffic,
- one-way roads,
- road closures,
- travel-time uncertainty,
- patrol coverage requirements,
- officer availability,
- response times,
- shift constraints,
- safety constraints.

Consequently, route distance is a simplified algorithmic response variable.

## 8. Model comparison design

The current reference comparisons use frequency-only as a descriptive baseline.

A baseline makes differences easy to report, but it should not be interpreted as a statement that frequency-only is the objectively correct reference model.

Future work can include explicit pairwise comparisons among all models.

## 9. Statistical inference

The present experiment is primarily descriptive and deterministic.

The five synthetic seeds are insufficient to justify treating the generated scenarios as independent samples from a real-world population. Conventional significance testing would therefore require a substantially different experimental design and clearly defined sampling assumptions.

## 10. External validity

The results are specific to the implemented synthetic generator, canonical zones, severity definitions, allocation parameters, routing procedure, and software version.

Generalizing beyond those conditions requires additional evidence.

## 11. Operational deployment

The research code should not be interpreted as an operational police-dispatch or staffing system. A real deployment would require validated data, domain review, legal and ethical assessment, security controls, auditability, monitoring, and appropriate human oversight.

## 12. Reproducibility versus validity

The project currently has strong reproducibility properties: deterministic inputs, documented parameters, executable experiments, stored outputs, and validation checks.

Reproducibility does not remove validity limitations. A perfectly reproducible experiment can still model the wrong phenomenon or use unrealistic assumptions. The research therefore reports reproducibility and validity as separate properties.

## 13. Future evidence

A stronger future study could:

1. Validate the spatial model against appropriate aggregate data.
2. Test multiple severity schemes.
3. Vary the recency function.
4. Compare multiple officer budgets.
5. Evaluate alternative routing algorithms.
6. Add pairwise model comparisons.
7. Use carefully documented real or validated aggregate datasets where legally and ethically appropriate.
8. Predefine evaluation metrics before examining outcomes.
