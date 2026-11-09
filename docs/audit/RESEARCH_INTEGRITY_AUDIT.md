# Research Integrity Audit — Phase 0

## Research identity

The repository describes SurakshyaPath as a reproducible research and engineering system examining how explainable spatial-prioritization assumptions affect downstream allocation and route-order experiments.

The Research Lab correctly identifies its dataset as synthetic and disclaims predictive accuracy, causal impact, operational recommendations, fairness evidence, and model superiority.

## Positive controls to preserve

1. The canonical research dataset is explicitly named `synthetic_incidents.csv`.
2. The Research Lab reports `dataStatus: SYNTHETIC`.
3. The API provenance note says records are deterministic synthetic data, not official incident-level observations.
4. The four research models are separate from the live dashboard's risk model.
5. Research endpoints read stored artifacts rather than accepting incident submissions.
6. Research limitations describe seed scenarios as synthetic replications, not independent real-world observations.
7. Route documentation identifies great-circle distance rather than road-network distance.
8. The README distinguishes reproducibility from validity.

## Findings

### RI-01 — Synthetic age converted into apparent event time (High)
The CSV includes `age_days`, not a recorded event hour. `data/live-incidents.js` computes `ts = snapshotNow - ageDays * DAY_MS`. This preserves the age offset but inherits the snapshot's minute/hour from the current clock.

Downstream calculations use `Date#getHours()` to create peak-hour, by-hour, night-share, and intelligence patterns. Those time-of-day results are not observations contained in the source dataset.

**Required boundary:** Do not report hourly/nighttime patterns as empirical or observed event-time findings from these records. Mark them unavailable or explicitly identify them as artifacts of synthetic timestamp construction. Do not attempt to “fix” this solely by converting timezones.

### RI-02 — Temporal fields influence allocation windows (High)
`algorithms/allocation.js` derives a time window from `zone.peakHour`. Since the peak hour may be derived from synthetic snapshot-clock timestamps, the generated window has no defensible event-hour basis.

**Required boundary:** Suppress or label these windows as unavailable for age-only data. Any future event-hour analysis requires a documented source precision and timezone policy.

### RI-03 — Coordinate distance is not road distance (Medium; limitation already documented)
The routing module uses haversine great-circle distance. Experiment documentation and README state that this is not road-network distance.

**Required boundary:** Preserve the distinction in all charts, labels, exports, and future API contracts. Do not add travel-time claims without a validated routing source and clear assumptions.

### RI-04 — Synthetic seeds are not independent real-world samples (Medium; limitation already documented)
Five seed variants are generated under the same mechanism. The limitations document correctly restricts their interpretation to algorithmic stability checks.

**Required boundary:** Keep scenario robustness separate from statistical inference and external validity.

### RI-05 — Live heuristic and research models must remain separate (High safeguard)
The project has a live dashboard scoring path and four manuscript research models. The Research Lab is intentionally not routed through the legacy dashboard risk calculation.

**Required boundary:** Keep their names, data contracts, formulas, and UI descriptions distinct. Any shared code must be justified and tested to avoid changing research outputs.

### RI-06 — Artifact parsing and schema assumptions (Medium)
The research API reads committed JSON/CSV outputs. CSV parsing is a simple comma split. Current artifacts appear controlled by project scripts, but schema assumptions are not validated at the API boundary.

**Required follow-up:** Add artifact schema validation and explicit error tests before accepting external or user-supplied files.

## Research outputs and methods

The inspected API identifies four models:
- frequency-only
- severity-only
- frequency-severity
- current-severity-recency

The allocation endpoint returns stored allocation summaries; route and robustness endpoints return stored experiment summaries. The API reports canonical dataset size, seed information, zone count, and interpretation boundaries.

The research API test asserts that at budget 20, frequency and recency allocation vectors differ in Chabahil and Bouddha. This is a useful regression assertion because it checks a nontrivial result rather than only endpoint availability.

## Required follow-up before research claims are expanded

- Reconcile manuscript text against generated result artifacts.
- Verify all displayed figures are generated from the same committed outputs served by the API.
- Confirm experiment parameters and seeds are recorded.
- Verify deterministic outputs from a clean checkout.
- Add data schema and artifact schema validation.
- Ensure temporal findings are suppressed or correctly qualified.
- Preserve the explicit boundary between computational comparison and real-world effectiveness.

## Conclusion

The Research Lab has strong disclosure language and meaningful reproducibility scaffolding. The temporal precision issue is a substantive integrity defect in the legacy analytics path and must be addressed before those hourly/nighttime outputs are presented as observations.
