# Project data

This directory documents the data used by SurakshyaPath.

The current spatial layer is **synthetic** and exists for algorithm testing. It should not be interpreted as a collection of real police incident coordinates.

- Official aggregate reference: 1,567 registered cases for Kathmandu Valley in Shrawan 2083, from the Nepal Police monthly crime bulletin.
- Synthetic spatial records: 1,567 generated records used to exercise the risk, routing, and allocation algorithms.
- The synthetic generator is deterministic so the experiment can be reproduced without claiming that the generated coordinates are real observations.

See `data/data_sources.md` for provenance and limitations.

## Temporal precision

The canonical CSV provides integer `age_days` and a month-level date label. It does not contain minute- or hour-level event timestamps. Runtime timestamps derived from `age_days` are recency anchors only, not observed event times. They must not be used to infer event-hour, nighttime, or rolling 24-hour patterns.
