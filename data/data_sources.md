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
