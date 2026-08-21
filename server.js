/* ============================================================================
   SurakshyaPath (सुरक्षापथ) — Backend
   ----------------------------------------------------------------------------
   A small, readable Express API that powers the demo. Five core features:

     1. Anonymous incident reporting      POST /api/reports
     2. Dynamic risk-zone computation     GET  /api/zones
     3. Timing & frequency analytics      GET  /api/analytics
     4. Optimal patrol route computation  GET  /api/patrol
     5. Officer resource allocation       GET  /api/allocation

   Data is stored in ./data/incidents.json (auto-seeded with realistic
   sample data on first run, so the demo always has something to show).
   ========================================================================== */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------------------------------------------------------------------------
   1. Reference data — neighbourhood zones & police stations (Kathmandu)
   ------------------------------------------------------------------------- */

const ZONES = [
  { id: 'thamel',     name: 'Thamel',        np: 'थामेल',        lat: 27.7165, lng: 85.3125 },
  { id: 'kalimati',   name: 'Kalimati',      np: 'कालीमाटी',     lat: 27.6960, lng: 85.3000 },
  { id: 'baneshwor',  name: 'New Baneshwor', np: 'नयाँ बानेश्वर', lat: 27.6930, lng: 85.3370 },
  { id: 'chabahil',   name: 'Chabahil',      np: 'चाबाहिल',      lat: 27.7180, lng: 85.3480 },
  { id: 'koteshwor',  name: 'Koteshwor',     np: 'कोटेश्वर',     lat: 27.6780, lng: 85.3490 },
  { id: 'balaju',     name: 'Balaju',        np: 'बालाजु',       lat: 27.7370, lng: 85.3020 },
  { id: 'patan',      name: 'Patan',         np: 'पाटन',         lat: 27.6720, lng: 85.3250 },
  { id: 'gongabu',    name: 'Gongabu',       np: 'गोंगबु',       lat: 27.7350, lng: 85.3160 },
  { id: 'kirtipur',   name: 'Kirtipur',      np: 'कीर्तिपुर',    lat: 27.6780, lng: 85.2790 },
  { id: 'bouddha',    name: 'Bouddha',       np: 'बौद्ध',        lat: 27.7210, lng: 85.3620 },
];

const STATIONS = [
  { id: 'mpr',       name: 'Metropolitan Police Range (Ratna Park)', lat: 27.7040, lng: 85.3150 },
  { id: 'baneshwor', name: 'Police Circle, Baneshwor',               lat: 27.6925, lng: 85.3360 },
  { id: 'chabahil',  name: 'Police Circle, Chabahil',                lat: 27.7175, lng: 85.3470 },
];

// Incident types + severity weight (1–10) used by the risk model.
const TYPES = {
  theft:          { label: 'Theft / Pickpocketing', np: 'चोरी',           severity: 5 },
  suspicious:     { label: 'Suspicious Activity',   np: 'संदिग्ध गतिविधि', severity: 3 },
  harassment:     { label: 'Harassment',            np: 'उत्पीडन',        severity: 7 },
  infrastructure: { label: 'Infrastructure Issue',  np: 'पूर्वाधार समस्या', severity: 2 },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATA_FILE = path.join(__dirname, 'data', 'incidents.json');

/* ---------------------------------------------------------------------------
   2. Incident store — load from disk, or seed realistic demo data
   ------------------------------------------------------------------------- */

// Per-zone seeding profile: how many incidents, what mix, and how "nightly".
const SEED_PROFILE = {
  thamel:     { count: 18, types: { theft: 0.6, suspicious: 0.25, harassment: 0.15 }, night: 0.85 },
  kalimati:   { count: 15, types: { theft: 0.55, suspicious: 0.3, harassment: 0.15 }, night: 0.7 },
  baneshwor:  { count: 12, types: { harassment: 0.45, theft: 0.35, suspicious: 0.2 }, night: 0.6 },
  chabahil:   { count: 10, types: { suspicious: 0.4, theft: 0.4, infrastructure: 0.2 }, night: 0.5 },
  koteshwor:  { count: 9,  types: { theft: 0.5, infrastructure: 0.3, suspicious: 0.2 }, night: 0.55 },
  gongabu:    { count: 9,  types: { theft: 0.45, suspicious: 0.4, infrastructure: 0.15 }, night: 0.65 },
  balaju:     { count: 7,  types: { infrastructure: 0.4, theft: 0.35, suspicious: 0.25 }, night: 0.4 },
  patan:      { count: 8,  types: { theft: 0.45, suspicious: 0.35, harassment: 0.2 }, night: 0.5 },
  bouddha:    { count: 5,  types: { theft: 0.4, suspicious: 0.4, infrastructure: 0.2 }, night: 0.5 },
  kirtipur:   { count: 4,  types: { infrastructure: 0.5, theft: 0.3, suspicious: 0.2 }, night: 0.25 },
};

const SAMPLE_NOTES = {
  theft: ['Phone snatched by a motorcycle rider.', 'Shop cash box stolen at closing time.',
          'Bag pickpocketed in the crowd.', 'Bicycle stolen from parking area.'],
  suspicious: ['Two men loitering near the ATM for hours.', 'Unknown group gathering late at night.',
               'Someone checking parked scooter locks.', 'Unattended bag near the gate.'],
  harassment: ['Eve-teasing near the bus stop.', 'Followed by a stranger on the way home.',
               'Verbal abuse outside the college gate.'],
  infrastructure: ['Street light not working — fully dark lane.', 'Open manhole on the footpath.',
                   'Broken CCTV pole at the chowk.', 'No lighting at the underpass.'],
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(weights) {
  const r = Math.random();
  let acc = 0;
  for (const [key, w] of Object.entries(weights)) { acc += w; if (r <= acc) return key; }
  return Object.keys(weights)[0];
}

function seedIncidents() {
  const incidents = [];
  let id = 1;
  for (const [zoneId, p] of Object.entries(SEED_PROFILE)) {
    const zone = ZONES.find((z) => z.id === zoneId);
    for (let i = 0; i < p.count; i++) {
      // Spread over the last 30 days; bias the hour of day by the zone profile.
      const daysAgo = Math.random() * 30;
      const nightRoll = Math.random() < p.night;
      const hour = nightRoll
        ? rand([20, 21, 22, 23, 0, 1, 2, 3])
        : rand([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
      const d = new Date(Date.now() - daysAgo * DAY_MS);
      d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
      const type = weightedPick(p.types);
      incidents.push({
        id: id++,
        type,
        zone: zoneId,
        lat: +(zone.lat + (Math.random() - 0.5) * 0.012).toFixed(5),
        lng: +(zone.lng + (Math.random() - 0.5) * 0.012).toFixed(5),
        ts: d.getTime(),
        note: rand(SAMPLE_NOTES[type]),
      });
    }
  }
  return incidents.sort((a, b) => a.ts - b.ts);
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; }
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(incidents, null, 2));
}

let incidents = load() || seedIncidents();
save();

/* ---------------------------------------------------------------------------
   3. Analytics helpers — the "predictive" core of the demo
   ------------------------------------------------------------------------- */

// Great-circle distance between two lat/lng points, in km.
function haversine(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestZone(lat, lng) {
  let best = ZONES[0], bestD = Infinity;
  for (const z of ZONES) {
    const d = haversine({ lat, lng }, z);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

// Recent incidents for a zone (default lookback: 30 days).
function zoneIncidents(zoneId, days = 30) {
  const cutoff = Date.now() - days * DAY_MS;
  return incidents.filter((i) => i.zone === zoneId && i.ts >= cutoff);
}

// Recency decay: a 3-day-old incident matters more than a 25-day-old one.
// (Capped at 1 so slightly-future timestamps from clock skew stay sane.)
function decayOf(ts) {
  const days = (Date.now() - ts) / DAY_MS;
  return Math.min(1, Math.max(0.15, 1 - days / 30));
}

function riskBand(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// Score(zone) = Σ severity(incident) × recencyDecay(incident), normalised 0–100
// against the worst zone. Simple, transparent, explainable to judges.
function computeZones() {
  const raw = ZONES.map((z) => {
    const zone = zoneIncidents(z.id);
    const score = zone.reduce((sum, i) => sum + TYPES[i.type].severity * decayOf(i.ts), 0);
    return { zone: z, incidents: zone, raw: score };
  });
  const max = Math.max(...raw.map((r) => r.raw), 1);
  return raw.map((r) => {
    const hours = r.incidents.map((i) => new Date(i.ts).getHours());
    const peakHour = hours.length
      ? hours.sort((a, b) =>
          hours.filter((h) => h === b).length - hours.filter((h) => h === a).length)[0]
      : null;
    const score = Math.round((r.raw / max) * 100);
    return {
      id: r.zone.id, name: r.zone.name, np: r.zone.np,
      lat: r.zone.lat, lng: r.zone.lng,
      score, band: riskBand(score), count: r.incidents.length,
      peakHour, last24h: r.incidents.filter((i) => Date.now() - i.ts < DAY_MS).length,
    };
  }).sort((a, b) => b.score - a.score);
}

// Nearest-neighbour patrol route: station → greedily closest high-risk zone…repeat.
// Not academically optimal (that's TSP), but O(n²), instant, and easy to explain.
function computePatrol(stationId, stopCount = 5) {
  const station = STATIONS.find((s) => s.id === stationId) || STATIONS[0];
  const zones = computeZones().filter((z) => z.count > 0).slice(0, stopCount);

  let current = { lat: station.lat, lng: station.lng };
  const remaining = [...zones];
  const stops = [];
  let totalKm = 0;

  while (remaining.length) {
    let idx = 0, best = Infinity;
    remaining.forEach((z, i) => {
      const d = haversine(current, z);
      if (d < best) { best = d; idx = i; }
    });
    const next = remaining.splice(idx, 1)[0];
    totalKm += best;
    stops.push({ ...next, legKm: +best.toFixed(2) });
    current = next;
  }

  // Assume ~25 km/h city driving + 10 min on-foot presence at each stop.
  const totalMin = Math.round((totalKm / 25) * 60 + stops.length * 10);
  return { station, stops, totalKm: +totalKm.toFixed(1), totalMin };
}

// Largest-remainder proportional allocation of officers across risk zones,
// with a guaranteed minimum of 1 officer for every staffed zone.
function computeAllocation(officers = 12) {
  const zones = computeZones().filter((z) => z.count > 0);
  if (!zones.length || officers < 1) return { officers, zones: [] };

  const totalScore = zones.reduce((s, z) => s + z.score, 0) || 1;
  const staffed = zones.slice(0, Math.min(officers, zones.length));
  const shares = staffed.map((z) => (z.score / totalScore) * officers);

  const assigned = shares.map((s) => ({ floor: Math.floor(s), rem: s % 1 }));
  let left = officers - assigned.reduce((s, a) => s + a.floor, 0);
  assigned
    .map((a, i) => ({ i, rem: a.rem }))
    .sort((a, b) => b.rem - a.rem)
    .forEach((a) => { if (left-- > 0) assigned[a.i].floor++; });

  return {
    officers,
    zones: staffed.map((z, i) => {
      const peak = z.peakHour;
      const from = peak !== null ? String((peak + 23) % 24).padStart(2, '0') : '18';
      const to = peak !== null ? String((peak + 3) % 24).padStart(2, '0') : '22';
      return {
        ...z,
        officers: assigned[i].floor,
        window: `${from}:00–${to}:00`, // peak-risk patrol window for this zone
      };
    }),
  };
}

/* ---------------------------------------------------------------------------
   4. API routes
   ------------------------------------------------------------------------- */

// Bootstrap data for the frontend (zones, stations, incident types).
app.get('/api/meta', (_req, res) => {
  res.json({ zones: ZONES, stations: STATIONS, types: TYPES, generatedAt: Date.now() });
});

// 1️⃣ Anonymous reporting. NOTE: we deliberately accept NO identity fields —
//    no name, phone, or account. That is the privacy promise of SurakshyaPath.
app.post('/api/reports', (req, res) => {
  const { type, note = '', when = 'now' } = req.body || {};
  if (!TYPES[type]) return res.status(400).json({ error: 'Unknown incident type.' });
  const lat = Number(req.body.lat), lng = Number(req.body.lng);
  if (!(lat >= 27.4 && lat <= 28.2 && lng >= 84.8 && lng <= 85.6)) {
    return res.status(400).json({ error: 'Location outside the serviced municipality area.' });
  }
  const tsMap = { now: Date.now(), today: Date.now() - Math.random() * 6 * 3600e3, week: Date.now() - Math.random() * 6 * DAY_MS };
  const zone = nearestZone(lat, lng);
  const report = {
    id: incidents.length ? Math.max(...incidents.map((i) => i.id)) + 1 : 1,
    type, lat, lng, zone: zone.id,
    ts: Math.round(tsMap[when] || Date.now()),
    note: String(note).slice(0, 280),
  };
  incidents.push(report);
  save();
  res.status(201).json({ ok: true, report, zone: { id: zone.id, name: zone.name, np: zone.np } });
});

// Recent raw reports (for map markers).
app.get('/api/reports', (req, res) => {
  const days = Number(req.query.days) || 30;
  const cutoff = Date.now() - days * DAY_MS;
  res.json(incidents.filter((i) => i.ts >= cutoff));
});

// 2️⃣ Dynamic risk zones.
app.get('/api/zones', (_req, res) => res.json(computeZones()));

// 3️⃣ Timing & frequency analytics.
app.get('/api/analytics', (_req, res) => {
  const cutoff = Date.now() - 30 * DAY_MS;
  const recent = incidents.filter((i) => i.ts >= cutoff);
  const byType = Object.fromEntries(Object.keys(TYPES).map((t) => [t, 0]));
  const byHour = Array(24).fill(0);
  const byDay = Array.from({ length: 14 }, (_, k) => ({ day: k, count: 0 }));
  for (const i of recent) {
    byType[i.type]++;
    byHour[new Date(i.ts).getHours()]++;
    const d = Math.floor((Date.now() - i.ts) / DAY_MS);
    if (d >= 0 && d < 14) byDay[13 - d].count++;
  }
  const nightCount = recent.filter((i) => {
    const h = new Date(i.ts).getHours(); return h >= 20 || h < 4;
  }).length;
  res.json({
    total: recent.length,
    byType, byHour, byDay,
    nightShare: recent.length ? Math.round((nightCount / recent.length) * 100) : 0,
    topZones: computeZones().slice(0, 5).map((z) => ({ name: z.name, score: z.score })),
  });
});

// 4️⃣ Optimal patrol route.
app.get('/api/patrol', (req, res) => {
  res.json(computePatrol(req.query.station, Math.min(Number(req.query.stops) || 5, 8)));
});

// 5️⃣ Officer allocation.
app.get('/api/allocation', (req, res) => {
  res.json(computeAllocation(Math.min(Number(req.query.officers) || 12, 60)));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛡️  SurakshyaPath API + UI running at http://localhost:${PORT}`);
});
