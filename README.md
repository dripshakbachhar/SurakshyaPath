# 🛡️ SurakshyaPath · सुरक्षापथ

**Community-driven predictive policing for Nepali municipalities.**

Citizens anonymously report thefts, suspicious activity, harassment, and infrastructure
issues. The backend analyzes incident **frequency, severity, and timing** to map dynamic
risk zones, automatically compute **optimal patrol routes**, and allocate **limited
station resources** — turning scattered citizen signals into smarter, data-backed policing.

> **Hackathon MVP** — deliberately small and readable. One Express server, one page of
> vanilla JS, zero build step, zero API keys.

---

## ✨ Features (all live in the demo)

| # | Feature | Where to see it |
|---|---------|-----------------|
| 1 | **Anonymous incident reporting** — no name, no login, no phone. Location pinned by map click or GPS | `Report` tab |
| 2 | **Dynamic risk-zone map** — heatmap + scored zones (frequency × severity × recency), recomputed live as reports arrive | `Risk Map` tab |
| 3 | **Timing & frequency analytics** — incidents by type, hour-of-day peak windows, 14-day trend, night-share stat | `Analytics` tab |
| 4 | **Optimal patrol route** — nearest-neighbour route through the top-risk zones from any station, with distance & ETA | `Patrol & Resources` tab |
| 5 | **Officer resource allocation** — largest-remainder proportional split of on-duty officers across zones, each with its peak-risk patrol window | `Patrol & Resources` tab |

## 🏗️ Architecture

```
Browser (public/)
  index.html · css/style.css · js/app.js     ← Leaflet map + heatmap + Chart.js
        │  fetch (relative URLs, same origin)
        ▼
Express server (server.js)                   ← REST API + static hosting
  POST /api/reports      anonymous report (identity fields never accepted)
  GET  /api/zones        risk score per zone  = Σ severity × recency-decay (0–100)
  GET  /api/analytics    by-type / by-hour / 14-day trend / night share
  GET  /api/patrol?station=&stops=   nearest-neighbour route + km + ETA
  GET  /api/allocation?officers=     proportional officer split + peak windows
        ▼
data/incidents.json                          ← auto-seeded with ~97 realistic sample
                                               incidents around Kathmandu (first run)
```

**The risk model (explainable in one sentence):**
`risk(zone) = Σ over last 30 days  severity(type) × max(0.15, 1 − age/30)`, normalized
to 0–100 against the worst zone. Fresh + severe = high risk. No black box.

## 🚀 Quick start

```bash
npm install
npm start          # → http://localhost:3000
```

Requires Node ≥ 18. Nothing else — no database, no API keys, no build step.
Delete `data/incidents.json` to re-seed fresh demo data.

## 🎤 60-second judge demo script

1. **Report** — click the map near Thamel → pick *"Theft"* → submit. Toast confirms it
   was logged anonymously; the stats bar ticks up instantly.
2. **Risk Map** — show the heatmap and zone list; point at Thamel's red *critical* badge
   and its peak hour.
3. **Analytics** — highlight the hour-of-day chart: most bars are red → *63% of incidents
   happen between 8pm–4am* → policing should too.
4. **Patrol & Resources** — pick a station, set 12 officers, hit *Generate patrol plan*:
   numbered route drawn on the map, total km/ETA, and an allocation table with per-zone
   peak patrol windows.
5. One-liner: **"One anonymous click from a citizen becomes a patrol stop tonight."**

## 🧰 Tech stack

- **Backend:** Node.js + Express (~350 commented lines)
- **Frontend:** Vanilla HTML/CSS/JS, Leaflet + leaflet.heat + Chart.js (CDN)
- **Storage:** JSON file (swap for Postgres later — the API wouldn't change)
- **Why this stack:** everything runs anywhere Node runs, judges can read 100% of the
  code, and the demo never breaks because of a missing API key.

## 🗺️ Roadmap (post-MVP)

- SMS/WhatsApp reporting for citizens without smartphones
- Police-station login with verified escalation of reports
- True TSP solver (2-opt / OR-tools) when zones grow
- Nepali-language UI toggle
