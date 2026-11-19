# Project data

This directory documents the data used by SurakshyaPath.

The current spatial layer is **synthetic** and exists for algorithm testing. It should not be interpreted as a collection of real police incident coordinates.

- Official aggregate reference: 1,567 registered cases for Kathmandu Valley in Shrawan 2083, from the Nepal Police monthly crime bulletin.
- Synthetic spatial records: 1,567 generated records used to exercise the risk, routing, and allocation algorithms.
- The synthetic generator is deterministic so the experiment can be reproduced without claiming that the generated coordinates are real observations.

Synthetic `age_days` values are day-level simulation inputs. The live dashboard represents them as UTC date intervals with `time.origin: "synthetic"`; its compatibility `ts` value is not an observed timestamp. Hourly charts and peak-hour outputs therefore remain unavailable for this benchmark.

See `data/data_sources.md` for provenance and limitations.

## Importing a dataset

The Datasets workspace accepts CSV files with a header row and JSON arrays (or
objects with a `records` array). Zone, category, latitude, and longitude are
required mapped fields. Date/time and source identifier are optional; severity
is optional, accepts values from 0 to 10, and defaults to 1. Coordinates must
be finite decimal degrees in the latitude and longitude ranges. Imports allow
up to 50,000 records, 100 distinct zones, and 100 distinct categories. A source
identifier mapping must be unique when supplied. Empty/duplicate CSV headers,
malformed quoting, inconsistent row widths, invalid records, and unsupported
file structures reject the import.

Import validation is all-or-nothing: if any record or dataset-level check
fails, no records are saved. The validation summary records received, valid,
accepted, and rejected counts and generic issue reasons, without embedding raw
record values. Empty CSV lines are skipped and counted. Source files and the
serialized mapped request are each limited to 4 MiB.

Date-only ISO values (`YYYY-MM-DD`) remain UTC calendar dates, not exact event
times. ISO date-times are exact; a date-time without an offset is interpreted
as UTC. A closed `start/end` interval is approximate, and blank or recognized
unknown tokens remain unknown. Invalid and future values are rejected.
Unknown and approximate times are excluded from severity × recency analysis.
No event-hour is inferred from date-only, range, or unknown times.

Imported data is stored separately from the canonical synthetic data and from
community reports. The active dashboard can be switched back to the synthetic
demo without deleting the imported file. One imported dataset is saved at a
time; a successful subsequent import replaces that saved import. Community
reports are stored in `community-reports.json`; the canonical seed and fixed
research benchmark are not changed by reports or imports. Imported datasets
have a stable identifier and provenance metadata that remain available when
switching datasets: sanitized original filename, format, import timestamp,
record count, selected column mapping, validation summary, temporal-precision
distribution, schema version, and SHA-256 hash of normalized records.

Uploads are limited to 4 MiB, including the serialized mapped JSON request.
The app supports `local-research` for one researcher on a trusted local
machine and `public-read-only` for public deployments. Ordinary non-production
development defaults to local research. Set `SURAKSHYA_MODE=public-read-only`
to explicitly select read-only behavior; production and detected deployment
environments are read-only regardless of provider. Unsupported configuration
fails closed. Local JSON writes are best-effort filesystem persistence, not a
managed database or a guarantee against machine/storage loss. The server
binds to loopback by default in local mode.

The browser parses the original file, but mapped records and import metadata
are transmitted to the application server when import is submitted. Local JSON
imports remain stored until manually removed; there is no automatic expiration
or per-user access control. Anyone with access to the host filesystem or app
process can access them. Public read-only deployments disable imports,
switching, and community-report writes. Do not upload personally identifiable
or sensitive records to an unsecured deployment.

The Research workspace can run the four scoring models, a fixed 12-unit
allocation, and nearest-neighbour versus 2-opt route-distance comparisons for
the active import. Multi-seed robustness is not estimated from a single
dataset. These are experimental research outputs, not validated
real-world operational instructions or recommendations.
