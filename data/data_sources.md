# Data sources and limitations

## Official reference

The project cites Nepal Police, Crime Investigation Department, *Crime Monthly E-Bulletin*, Year 9 Issue 4 (Shrawan 2083), as reporting **1,567 registered cases for Kathmandu Valley** during that month. This is a project-cited aggregate; the bulletin issue itself was not located among the public pages checked for this update.

The [CID Crime Information Collection Unit page](https://cid.nepalpolice.gov.np/cid-wings/crime-information-collection-unit/) describes collecting and analyzing crime information and preparing monthly reports for internal reporting. It does not expose a downloadable, row-level incident dataset. The cited count is monthly context only: it does not provide incident-level coordinates, zones, or time-of-day needed by SurakshyaPath’s spatial models. Verify the original bulletin before using the figure in a publication.

The [Nepal Police latest-news feed](https://nepalpolice.gov.np/ne/news/latest-news/) publishes narrative reports. These selected updates can help readers understand public context, but they are not a complete or consistently structured crime dataset. Arrests and allegations reported there are not findings of guilt, and the news feed is not used as model input.

## Spatial experiment layer

SurakshyaPath uses 1,567 deterministic synthetic records to exercise its geographic algorithms. The generated locations, categories, and severity values are simulation inputs, not official police incident records.

This separation is deliberate: the project can demonstrate risk modelling, routing, and allocation without inventing real-world police coordinates.

## Research/engineering question

The experiment layer asks:

> How sensitive is geographic prioritization and downstream planning to the assumptions inside a risk-scoring formula?

Results should be interpreted as algorithm experiments on synthetic data, not as evidence about actual crime patterns in Kathmandu Valley.
