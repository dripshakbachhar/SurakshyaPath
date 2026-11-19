# Project data

This directory documents the data used by SurakshyaPath.

The current spatial layer is **synthetic** and exists for algorithm testing. It should not be interpreted as a collection of real police incident coordinates.

- Official aggregate reference: 1,567 registered cases for Kathmandu Valley in Shrawan 2083, from the Nepal Police monthly crime bulletin.
- Synthetic spatial records: 1,567 generated records used to exercise the risk, routing, and allocation algorithms.
- The synthetic generator is deterministic so the experiment can be reproduced without claiming that the generated coordinates are real observations.

Synthetic `age_days` values are day-level simulation inputs. The live dashboard represents them as UTC date intervals with `time.origin: "synthetic"`; its compatibility `ts` value is not an observed timestamp. Hourly charts and peak-hour outputs therefore remain unavailable for this benchmark.

See `data/data_sources.md` for provenance and limitations.

## Importing a dataset

The Datasets workspace accepts CSV files and JSON arrays (or objects with a
`records` array). Imports map columns for zone, category, latitude, longitude,
and date/time; an optional severity column accepts values from 0 to 10 and
defaults to 1 when omitted. Each record must have a zone label and valid
geographic coordinates. The dashboard groups records by the supplied zone
labels and calculates a centroid for each zone.

Import accepts ISO date-only values as date precision and ISO date-times as exact timestamps. Date-times without an explicit UTC offset are interpreted as UTC. Unknown or legacy timestamps are not promoted to exact times; time-window counts are unavailable when those records could affect the result.

Imported data is stored separately from `incidents.json`, which holds the
synthetic demo and its community reports. The active dashboard can be switched
back to that demo without deleting the imported file. The fixed research
benchmark and its saved results are not changed by imports.

The Research workspace can run the four scoring models, a fixed 12-unit
allocation, and nearest-neighbour versus 2-opt route-distance comparisons for
the active import. Multi-seed robustness is not estimated from a single
dataset.
