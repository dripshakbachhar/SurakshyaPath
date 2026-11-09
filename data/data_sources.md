# Data sources and limitations

## Official reference

Nepal Police, Crime Investigation Department, Crime Monthly E-Bulletin, Year 9 Issue 4 (Shrawan 2083), reports **1,567 registered cases for Kathmandu Valley** for the month.

The official figure is an aggregate count. It is not used as if it were a set of geocoded incident records.

## Spatial experiment layer

SurakshyaPath uses 1,567 deterministic synthetic records to exercise its geographic algorithms. The generated locations, categories, and severity values are simulation inputs, not official police incident records.

This separation is deliberate: the project can demonstrate risk modelling, routing, and allocation without inventing real-world police coordinates.

## Research/engineering question

The experiment layer asks:

> How sensitive is geographic prioritization and downstream planning to the assumptions inside a risk-scoring formula?

Results should be interpreted as algorithm experiments on synthetic data, not as evidence about actual crime patterns in Kathmandu Valley.

## Temporal precision

The canonical CSV stores integer `age_days` and a month-level date label; it does not provide event-hour or minute-level timestamps. Any runtime timestamp derived from `age_days` is an internal recency anchor, not an observed event time. Day-level recency comparisons remain available, but event-hour, peak-hour, nighttime-share, and last-24-hour claims are unavailable for these age-only records.
