# SurakshyaPath Data Flow

## Incident lifecycle

1. The application loads `data/incidents.json`.
2. If the file is absent or invalid, `server.js` creates deterministic demo incidents.
3. An anonymous report enters through `POST /api/incidents`.
4. Boundary validation checks location, type, time-window and payload limits.
5. The report is assigned to the nearest canonical zone.
6. The report is persisted atomically when storage is available.
7. The risk cache is invalidated.
8. The next dashboard snapshot recomputes risk, analytics, data quality and intelligence.
9. The browser replaces its normalized state with the snapshot.
10. Map, charts, statistics, patrol and intelligence views derive from that state.

## Data lineage

| Data | Created | Transformed | API | UI |
|---|---|---|---|---|
| Incident | seed/report route | validation + zone assignment | `/api/dashboard`, `/api/incidents` | map/report detail |
| Zone risk | risk model | severity × recency | `/api/risk`, dashboard | risk map, overview, patrol |
| Analytics | `buildAnalytics` | time/type aggregation | `/api/analytics`, dashboard | charts |
| Data quality | intelligence module | validation/quality metrics | `/api/data-quality`, dashboard | intelligence |
| Intelligence | intelligence module | temporal/type/zone fusion | `/api/intelligence`, dashboard | Intelligence tab |
| Allocation | allocation model | largest remainder | `/api/allocation` | Patrol tab |
| Route | routing model | nearest-neighbour | `/api/patrol` | map + Patrol tab |

## Propagation invariant

A successfully persisted incident must appear in the next `/api/dashboard` response. The end-to-end `npm run smoke` test verifies this invariant and also verifies that intelligence is recomputed from the updated snapshot.
