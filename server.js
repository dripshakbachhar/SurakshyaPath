// ============================================================================
// SurakshyaPath — Express Server
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { ZONES } = require('./config/zones');
const { INCIDENT_TYPES: TYPES } = require('./config/incident-types');
const { computeZones: computeZonesFromModel } = require('./algorithms/risk');
const { computePatrol: computePatrolFromModel } = require('./algorithms/routing');
const { computeAllocation: computeAllocationFromModel } = require('./algorithms/allocation');
const { buildDataQuality, buildIntelligence } = require('./algorithms/intelligence');
const { EVENT_TIME_ZONE, hasEventHourPrecision, getEventHour, getAgeDays, precisionForReportWindow } = require('./algorithms/temporal');
const { loadSyntheticIncidents } = require('./data/live-incidents');
const researchRouter = require('./routes/research');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api/research', researchRouter);
app.use(express.static(path.join(__dirname, 'public')));

const STATIONS = [
  { id: 'mpr-ratna-park', name: 'MPR Ratna Park', lat: 27.705, lng: 85.315 },
  { id: 'baneshwor', name: 'Baneshwor', lat: 27.691, lng: 85.335 },
  { id: 'chabahil', name: 'Chabahil', lat: 27.717, lng: 85.348 }
];

const DAY_MS = 86400000;
const DATA_FILE = path.join(__dirname, 'data', 'incidents.json');
const VALID_REPORT_WINDOWS = new Set(['now', 'today', 'week', 'month']);
const MAX_REPORT_NOTE_LENGTH = 280;
const MAX_INCIDENTS = 50000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 12;
const sampleNotes = {
  theft: ['Phone reported missing near a crowded area.', 'Bag reported missing.', 'Possible theft reported by resident.'],
  suspicious: ['Suspicious activity reported near a public area.', 'Resident reported unusual activity.', 'Unidentified activity observed.'],
  harassment: ['Harassment reported by resident.', 'Verbal harassment reported.', 'Unsafe interaction reported.'],
  infrastructure: ['Broken streetlight reported.', 'Damaged public infrastructure reported.', 'Poor lighting reported.']
};


function seedIncidents(now = Date.now()) {
  return loadSyntheticIncidents(now);
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(parsed) || parsed.length > MAX_INCIDENTS) {
      console.error('Incident data has an invalid shape or exceeds the configured limit.');
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('Failed to load incident data:', error);
    return null;
  }
}
function save(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const temporary = DATA_FILE + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, DATA_FILE);
    return true;
  } catch (error) {
    console.error('Failed to save incident data:', error);
    try { fs.rmSync(DATA_FILE + '.tmp', { force: true }); } catch {}
    return false;
  }
}
let incidents = load();
const isLegacyRuntimeSeed = Array.isArray(incidents) && incidents.length === 180 && incidents.every(incident => String(incident.id || '').startsWith('seed-'));
if (!incidents || isLegacyRuntimeSeed) {
  try {
    incidents = seedIncidents();
  } catch (error) {
    console.error('Failed to load canonical synthetic data:', error);
    incidents = [];
  }
}
let riskCache = null;
const RISK_CACHE_MS = 60000;
let persistenceAvailable = save(incidents);
if (!persistenceAvailable) console.warn('Incident data is running in memory; persistence is unavailable.');

const reportWindow = new Map();
function allowReport(ip) {
  const now = Date.now();
  const recent = (reportWindow.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    reportWindow.set(ip, recent);
    return false;
  }
  recent.push(now);
  reportWindow.set(ip, recent);
  if (reportWindow.size > 10000) {
    for (const [key, timestamps] of reportWindow) {
      if (!timestamps.some(t => now - t < RATE_LIMIT_WINDOW_MS)) reportWindow.delete(key);
    }
  }
  return true;
}
function validCoordinate(n, min, max) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}
function incidentTimestamp(when) {
  const now = snapshotNow();
  if (when === 'today') return now - 3 * 60 * 60 * 1000;
  if (when === 'week') return now - 3 * DAY_MS;
  return now;
}
function nearestZone(lat, lng) {
  let best = null, bestDistance = Infinity;
  for (const zone of ZONES) {
    const distance = (zone.lat - lat) ** 2 + (zone.lng - lng) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = zone; }
  }
  return best;
}
function snapshotNow() { return Math.floor(Date.now() / 60000) * 60000; }
function computeZones() {
  const now = snapshotNow();
  if (riskCache && now - riskCache.at < RISK_CACHE_MS) return riskCache.zones;
  riskCache = { at: now, zones: computeZonesFromModel({ zones: ZONES, incidents, types: TYPES, days: 30, now }) };
  return riskCache.zones;
}
function computePatrol(stationId, stopCount = 5) {
  const station = STATIONS.find(s => s.id === stationId) || STATIONS[0];
  return computePatrolFromModel({ station, zones: computeZones(), stopCount });
}
function computeAllocation(officers = 12) {
  return computeAllocationFromModel({ zones: computeZones(), officers });
}

app.get('/api/health', (req, res) => res.json({
  ok: true, service: 'SurakshyaPath', version: '1.1.0', timestamp: new Date().toISOString()
}));
app.get('/api/config', (req, res) => res.json({ zones: ZONES, stations: STATIONS, types: TYPES }));
app.get('/api/incidents', (req, res) => res.json(incidents));

app.post('/api/incidents', (req, res) => {
  const { lat, lng, type, note, when } = req.body || {};
  if (incidents.length >= MAX_INCIDENTS) {
    return res.status(503).json({ error: 'Incident storage limit reached.' });
  }
  if (!validCoordinate(lat, 27.55, 27.85) ||
      !validCoordinate(lng, 85.15, 85.55) ||
      !TYPES[type] ||
      (when !== undefined && !VALID_REPORT_WINDOWS.has(when))) {
    return res.status(400).json({ error: 'Invalid location, incident type, or time window.' });
  }
  if (!allowReport(req.ip)) return res.status(429).json({ error: 'Too many reports. Please try again later.' });

  const zone = nearestZone(lat, lng);
  const incident = {
    id: 'incident-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    zone: zone.id, type, severity: TYPES[type].severity, ts: incidentTimestamp(when),
    eventTimePrecision: precisionForReportWindow(when),
    reportedTimeWindow: when || 'now',
    reporter: 'Anonymous',
    note: typeof note === 'string' ? note.trim().slice(0, MAX_REPORT_NOTE_LENGTH) || sampleNotes[type][0] : sampleNotes[type][0],
    sourceType: 'community-report', dataStatus: 'LIVE',
    lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5))
  };
  incidents.push(incident);
  if (!save(incidents)) {
    persistenceAvailable = false;
    incidents.pop();
    return res.status(503).json({ error: 'Incident could not be persisted. Please try again.' });
  }
  persistenceAvailable = true;
  riskCache = null;
  res.status(201).json(incident);
});

app.get('/api/risk', (req, res) => res.json(computeZones()));
app.get('/api/patrol', (req, res) => {
  const station = req.query.station || STATIONS[0].id;
  const parsedStops = Number(req.query.stops);
  const stops = Number.isFinite(parsedStops) ? Math.max(1, Math.min(10, Math.floor(parsedStops))) : 5;
  res.json(computePatrol(station, stops));
});
app.get('/api/allocation', (req, res) => {
  const parsedOfficers = Number(req.query.officers);
  const officers = Number.isFinite(parsedOfficers) ? Math.max(2, Math.min(40, Math.floor(parsedOfficers))) : 12;
  res.json(computeAllocation(officers));
});

function buildAnalytics(source, now = Date.now()) {
  const recent = source.filter(incident => Number.isFinite(Number(incident.ts)) && now - Number(incident.ts) >= 0);
  const eventTimeRecords = recent.filter(hasEventHourPrecision);
  const byType = {};
  const byHour = Array(24).fill(0);
  const byDay = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, count: 0 }));

  for (const incident of recent) {
    byType[incident.type] = (byType[incident.type] || 0) + 1;

    if (hasEventHourPrecision(incident)) {
      const hour = getEventHour(incident.ts);
      if (hour !== null) byHour[hour]++;
    }

    const ageDays = getAgeDays(incident, now);
    if (ageDays !== null && ageDays < 30) {
      const bucket = 29 - Math.floor(ageDays);
      if (bucket >= 0 && bucket < byDay.length) byDay[bucket].count++;
    }
  }

  return {
    total: recent.length,
    last24h: eventTimeRecords.length
      ? eventTimeRecords.filter(incident => now - Number(incident.ts) < DAY_MS).length
      : null,
    last7d: recent.filter(incident => getAgeDays(incident, now) < 7).length,
    last30d: recent.filter(incident => getAgeDays(incident, now) < 30).length,
    byType,
    byHour: eventTimeRecords.length ? byHour : null,
    byDay,
    temporalPrecision: {
      eventHourAvailable: eventTimeRecords.length > 0,
      eventHourRecordCount: eventTimeRecords.length,
      timeZone: EVENT_TIME_ZONE
    }
  };
}
function buildStats(source, now) {
  const window = source.filter(i => Number.isFinite(Number(i.ts)) && now - Number(i.ts) >= 0 && now - Number(i.ts) < 30 * DAY_MS);
  const activeZones = new Set(window.map(i => i.zone)).size;
  const zones = computeZonesFromModel({ zones: ZONES, incidents: source, types: TYPES, days: 30, now });
  const highRiskZones = zones.filter(z => z.band === 'high' || z.band === 'critical').length;
  const eventTimeWindow = window.filter(hasEventHourPrecision);
  const night = eventTimeWindow.filter(incident => {
    const hour = getEventHour(incident.ts);
    return hour !== null && (hour >= 20 || hour < 4);
  }).length;
  return {
    total: source.length,
    activeZones,
    highRiskZones,
    nightShare: eventTimeWindow.length ? Math.round(night / eventTimeWindow.length * 100) : null,
    nightShareRecordCount: eventTimeWindow.length,
    eventHourAvailable: eventTimeWindow.length > 0,
    eventTimeZone: EVENT_TIME_ZONE
  };
}
app.get('/api/analytics', (req, res) => res.json(buildAnalytics(incidents)));
app.get('/api/data-quality', (req, res) => res.json(buildDataQuality(incidents, ZONES)));
app.get('/api/intelligence', (req, res) => res.json(buildIntelligence({ incidents, zones: ZONES, riskZones: computeZones(), types: TYPES })));
app.get('/api/diagnostics', (req, res) => {
  const now = snapshotNow();
  const quality = buildDataQuality(incidents, ZONES, now);
  const intelligence = buildIntelligence({ incidents, zones: ZONES, riskZones: computeZones(), types: TYPES, now });
  res.json({
    status: intelligence.status,
    data: { records: incidents.length, validRecords: quality.recordsAccepted, qualityScore: quality.qualityScore },
    pipeline: { storage: persistenceAvailable, risk: true, analytics: true, intelligence: intelligence.status === 'SUCCESS' || intelligence.status === 'PARTIAL_SUCCESS' },
    model: { type: intelligence.modelType, version: intelligence.modelVersion },
    generatedAt: intelligence.generatedAt
  });
});

app.get('/api/dashboard', (req, res) => {
  const snapshot = incidents.slice();
  const now = snapshotNow();
  const zones = computeZonesFromModel({ zones: ZONES, incidents: snapshot, types: TYPES, days: 30, now });
  const intelligence = buildIntelligence({ incidents: snapshot, zones: ZONES, riskZones: zones, types: TYPES, now });
  const dataQuality = buildDataQuality(snapshot, ZONES, now);
  res.json({ incidents: snapshot, zones, analytics: buildAnalytics(snapshot, now), stats: buildStats(snapshot, now), intelligence, dataQuality });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request body.' });
  console.error('Unhandled request error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

function startServer(port = PORT) {
  const server = app.listen(port, () => console.log('SurakshyaPath running on port ' + port));
  const shutdown = signal => {
    console.log(signal + ' received; shutting down gracefully.');
    server.close(error => {
      if (error) { console.error('Shutdown error:', error); process.exitCode = 1; }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (require.main === module) startServer();

module.exports = { app, startServer, seedIncidents, validCoordinate, nearestZone, buildAnalytics, buildStats };
