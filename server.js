// ============================================================================
// SurakshyaPath — Express Server
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { ZONES } = require('./config/zones');
const { INCIDENT_TYPES: DEMO_TYPES } = require('./config/incident-types');
const { computeZones: computeZonesFromModel } = require('./algorithms/risk');
const { computePatrol: computePatrolFromModel } = require('./algorithms/routing');
const { computeAllocation: computeAllocationFromModel } = require('./algorithms/allocation');
const { buildDatasetResearch } = require('./algorithms/dataset-research');
const { buildAnalytics, buildStats: buildStatsForSnapshot } = require('./algorithms/analytics');
const { buildDataQuality, buildIntelligence } = require('./algorithms/intelligence');
const Temporal = require('./public/js/temporal');
const { loadSyntheticIncidents } = require('./data/live-incidents');
const { prepareImportedDataset } = require('./data/imported-dataset');
const RESEARCH_SUMMARY = require('./experiments/results/summary/research-summary.json');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const DEMO_STATIONS = [
  { id: 'mpr-ratna-park', name: 'MPR Ratna Park', lat: 27.705, lng: 85.315 },
  { id: 'baneshwor', name: 'Baneshwor', lat: 27.691, lng: 85.335 },
  { id: 'chabahil', name: 'Chabahil', lat: 27.717, lng: 85.348 }
];

const DATA_FILE = path.join(__dirname, 'data', 'incidents.json');
const USER_DATASET_FILE = path.join(__dirname, 'data', 'imported-dataset.json');
const ACTIVE_MODE_FILE = path.join(__dirname, 'data', 'active-dataset.json');
const VALID_REPORT_WINDOWS = new Set(Temporal.REPORT_WINDOWS);
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

const demoIncidents = incidents;
let importedDataset = null;
let activeMode = 'demo';
let savedMode = { mode: 'demo' };
try {
  if (fs.existsSync(ACTIVE_MODE_FILE)) savedMode = JSON.parse(fs.readFileSync(ACTIVE_MODE_FILE, 'utf8'));
  if (!['demo', 'imported'].includes(savedMode.mode)) throw new Error('Stored active dataset mode is invalid.');
  if (fs.existsSync(USER_DATASET_FILE)) {
    importedDataset = JSON.parse(fs.readFileSync(USER_DATASET_FILE, 'utf8'));
    if (!Array.isArray(importedDataset.records) || !Array.isArray(importedDataset.zones) || !importedDataset.types) {
      throw new Error('Stored imported dataset has an invalid shape.');
    }
  }
  if (savedMode.mode === 'imported' && !importedDataset) throw new Error('Active imported dataset is missing.');
  activeMode = savedMode.mode;
} catch (error) {
  console.error('Failed to restore the active dataset:', error);
  if (savedMode.mode === 'imported') throw error;
}

let activeZones = activeMode === 'imported' ? importedDataset.zones : ZONES;
let activeTypes = activeMode === 'imported' ? importedDataset.types : DEMO_TYPES;
let activeStations = DEMO_STATIONS;
if (activeMode === 'imported') {
  const lat = activeZones.reduce((sum, zone) => sum + zone.lat, 0) / activeZones.length;
  const lng = activeZones.reduce((sum, zone) => sum + zone.lng, 0) / activeZones.length;
  activeStations = [{ id: 'dataset-centre', name: 'Dataset centre', lat, lng }];
  incidents = importedDataset.records;
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, file);
    return true;
  } catch (error) {
    console.error(`Failed to write ${path.basename(file)}:`, error);
    try { fs.rmSync(file + '.tmp', { force: true }); } catch {}
    return false;
  }
}
function datasetSummary() {
  return {
    mode: activeMode,
    name: activeMode === 'imported' ? importedDataset.name : 'Synthetic dashboard demo',
    records: incidents.length,
    zones: activeZones.length,
    categories: Object.values(activeTypes).map(type => type.label),
    importedAt: activeMode === 'imported' ? importedDataset.importedAt : null,
    hasImportedDataset: Boolean(importedDataset)
  };
}
function activateImportedDataset() {
  activeMode = 'imported';
  activeZones = importedDataset.zones;
  activeTypes = importedDataset.types;
  incidents = importedDataset.records;
  const lat = activeZones.reduce((sum, zone) => sum + zone.lat, 0) / activeZones.length;
  const lng = activeZones.reduce((sum, zone) => sum + zone.lng, 0) / activeZones.length;
  activeStations = [{ id: 'dataset-centre', name: 'Dataset centre', lat, lng }];
  riskCache = null;
}
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
function incidentTimeWindow(when) {
  const now = snapshotNow();
  return Temporal.communityReportTime(when, now);
}
function nearestZone(lat, lng) {
  let best = null, bestDistance = Infinity;
  for (const zone of ZONES) {
    const distance = (zone.lat - lat) ** 2 + (zone.lng - lng) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = zone; }
  }
  return best;
}
function snapshotNow() { return Date.now(); }
function computeZones() {
  const now = snapshotNow();
  if (riskCache && now - riskCache.at < RISK_CACHE_MS) return riskCache.zones;
  riskCache = { at: now, zones: computeZonesFromModel({ zones: activeZones, incidents, types: activeTypes, days: 30, now }) };
  return riskCache.zones;
}
function buildStats(source, now, zones = activeZones) {
  return buildStatsForSnapshot(source, now, zones, activeTypes);
}
function computePatrol(stationId, stopCount = 5) {
  const station = activeStations.find(s => s.id === stationId) || activeStations[0];
  return computePatrolFromModel({ station, zones: computeZones(), stopCount });
}
function computeAllocation(officers = 12) {
  return computeAllocationFromModel({ zones: computeZones(), officers });
}

app.get('/api/health', (req, res) => res.json({
  ok: true, service: 'SurakshyaPath', version: '1.1.0', timestamp: new Date().toISOString()
}));
app.get('/api/config', (req, res) => res.json({ zones: activeZones, stations: activeStations, types: activeTypes }));
app.get('/api/research/summary', (req, res) => res.json(RESEARCH_SUMMARY));
app.get('/api/incidents', (req, res) => res.json(incidents));
app.get('/api/dataset', (req, res) => res.json(datasetSummary()));
app.get('/api/dataset/research', (req, res) => {
  if (activeMode !== 'imported') {
    return res.status(409).json({ error: 'Import a dataset before running a dataset-specific research comparison.' });
  }
  res.json(buildDatasetResearch(importedDataset, snapshotNow()));
});

app.post('/api/dataset/import', (req, res) => {
  let dataset;
  try {
    dataset = prepareImportedDataset(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!writeJson(USER_DATASET_FILE, dataset)) {
    return res.status(503).json({ error: 'Imported dataset could not be saved.' });
  }
  importedDataset = dataset;
  if (!writeJson(ACTIVE_MODE_FILE, { mode: 'imported' })) {
    if (activeMode === 'imported') {
      activateImportedDataset();
      return res.status(201).json({ dataset: datasetSummary() });
    }
    return res.status(503).json({ error: 'Dataset was saved but could not be activated. Use the dashboard data selector to try again.' });
  }
  activateImportedDataset();
  res.status(201).json({ dataset: datasetSummary() });
});

app.post('/api/dataset/use-imported', (req, res) => {
  if (!importedDataset) return res.status(404).json({ error: 'No saved imported dataset is available.' });
  if (!writeJson(ACTIVE_MODE_FILE, { mode: 'imported' })) {
    return res.status(503).json({ error: 'Dashboard could not switch to the saved imported dataset.' });
  }
  activateImportedDataset();
  res.json({ dataset: datasetSummary() });
});

app.post('/api/dataset/use-demo', (req, res) => {
  if (!writeJson(ACTIVE_MODE_FILE, { mode: 'demo' })) {
    return res.status(503).json({ error: 'Dashboard could not switch back to demo data.' });
  }
  activeMode = 'demo';
  activeZones = ZONES;
  activeTypes = DEMO_TYPES;
  activeStations = DEMO_STATIONS;
  incidents = demoIncidents;
  riskCache = null;
  res.json({ dataset: datasetSummary() });
});

app.post('/api/incidents', (req, res) => {
  const { lat, lng, type, note, when } = req.body || {};
  if (activeMode !== 'demo') {
    return res.status(409).json({ error: 'Community reporting is available only in the synthetic demo workspace.' });
  }
  if (incidents.length >= MAX_INCIDENTS) {
    return res.status(503).json({ error: 'Incident storage limit reached.' });
  }
  if (!validCoordinate(lat, 27.55, 27.85) ||
      !validCoordinate(lng, 85.15, 85.55) ||
      !DEMO_TYPES[type] ||
      (when !== undefined && !VALID_REPORT_WINDOWS.has(when))) {
    return res.status(400).json({ error: 'Invalid location, incident type, or time window.' });
  }
  if (!allowReport(req.ip)) return res.status(429).json({ error: 'Too many reports. Please try again later.' });

  const zone = nearestZone(lat, lng);
  const reportTime = incidentTimeWindow(when || 'now');
  const incident = {
    id: 'incident-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    zone: zone.id, type, severity: DEMO_TYPES[type].severity, ...reportTime, reporter: 'Anonymous',
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
  const station = req.query.station || activeStations[0].id;
  const parsedStops = Number(req.query.stops);
  const stops = Number.isFinite(parsedStops) ? Math.max(1, Math.min(10, Math.floor(parsedStops))) : 5;
  res.json(computePatrol(station, stops));
});
app.get('/api/allocation', (req, res) => {
  const parsedOfficers = Number(req.query.officers);
  const officers = Number.isFinite(parsedOfficers) ? Math.max(2, Math.min(40, Math.floor(parsedOfficers))) : 12;
  res.json(computeAllocation(officers));
});

app.get('/api/analytics', (req, res) => res.json(buildAnalytics(incidents)));
app.get('/api/data-quality', (req, res) => res.json(buildDataQuality(incidents, activeZones, Date.now(), activeTypes)));
app.get('/api/intelligence', (req, res) => res.json(buildIntelligence({ incidents, zones: activeZones, riskZones: computeZones(), types: activeTypes })));
app.get('/api/diagnostics', (req, res) => {
  const now = snapshotNow();
  const quality = buildDataQuality(incidents, activeZones, now, activeTypes);
  const intelligence = buildIntelligence({ incidents, zones: activeZones, riskZones: computeZones(), types: activeTypes, now });
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
  const zones = computeZonesFromModel({ zones: activeZones, incidents: snapshot, types: activeTypes, days: 30, now });
  const intelligence = buildIntelligence({ incidents: snapshot, zones: activeZones, riskZones: zones, types: activeTypes, now });
  const dataQuality = buildDataQuality(snapshot, activeZones, now, activeTypes);
  res.json({ incidents: snapshot, zones, analytics: buildAnalytics(snapshot, now), stats: buildStats(snapshot, now, activeZones, activeTypes), intelligence, dataQuality, dataset: datasetSummary(), types: activeTypes, stations: activeStations });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request body.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large. Dataset imports are limited to 25 MB.' });
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
