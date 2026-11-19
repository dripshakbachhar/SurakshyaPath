// ============================================================================
// SurakshyaPath — Express Server
// ============================================================================

const express = require('express');
const path = require('path');
const { createHash } = require('crypto');
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
const { createStorage, PersistentStorageError, resolveOperatingMode } = require('./storage/json-storage');
const ImportLimits = require('./public/js/import-limits');
const RESEARCH_SUMMARY = require('./experiments/results/summary/research-summary.json');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; script-src-attr 'none'; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: blob: https://cdnjs.cloudflare.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org; " +
    "font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  );
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (!origin) return next();
  try {
    const parsedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) ||
        parsedOrigin.host.toLowerCase() !== String(req.get('host') || '').toLowerCase()) {
      return res.status(403).json({ error: 'Cross-origin mutation requests are not allowed.' });
    }
  } catch {
    return res.status(403).json({ error: 'Cross-origin mutation requests are not allowed.' });
  }
  next();
});
app.use(express.json({ limit: ImportLimits.MAX_IMPORT_PAYLOAD_BYTES }));
app.use(express.static(path.join(__dirname, 'public')));

const DEMO_STATIONS = [
  { id: 'mpr-ratna-park', name: 'MPR Ratna Park', lat: 27.705, lng: 85.315 },
  { id: 'baneshwor', name: 'Baneshwor', lat: 27.691, lng: 85.335 },
  { id: 'chabahil', name: 'Chabahil', lat: 27.717, lng: 85.348 }
];

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

const operatingMode = resolveOperatingMode();
const mutationsAllowed = operatingMode.mode === 'local-research';

function seedIncidents(now = Date.now()) {
  return loadSyntheticIncidents(now);
}

const storage = createStorage();
let storageFailure = null;
let storageReadStatus = null;
let storageWriteStatus = null;
function storageStatus() {
  const status = storage.status();
  return {
    ...status,
    operatingMode: operatingMode.mode,
    readable: storageFailure?.operation === 'read' ? false : storageReadStatus === null ? status.readable : storageReadStatus,
    writable: storageFailure ? false : storageWriteStatus === null ? status.writable : storageWriteStatus,
    available: storageFailure ? false :
      (storageReadStatus === true || storageWriteStatus === true ? true : status.available),
    reason: storageFailure?.message || status.reason
  };
}
function recordStorageFailure(error, operation = 'write') {
  storageFailure = {
    message: error?.message || 'A persistent storage operation failed.',
    code: error?.code || 'STORAGE_ERROR',
    operation
  };
  console.error('Persistent storage is unavailable:', error);
}
function readStoredValue(key, isValid, label) {
  if (!storage.status().configured) return null;
  try {
    const value = storage.read(key);
    if (value !== null) storageReadStatus = true;
    if (value !== null && !isValid(value)) {
      throw new PersistentStorageError(`Stored ${label} has an invalid shape.`, 'STORAGE_INVALID_DATA');
    }
    return value;
  } catch (error) {
    recordStorageFailure(error, 'read');
    return null;
  }
}
function isValidImportedDataset(value) {
  if (!value || typeof value !== 'object' ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(value.name) ||
      (value.id !== undefined && (typeof value.id !== 'string' || !value.id.trim())) ||
      !Array.isArray(value.records) || value.records.length === 0 || value.records.length > MAX_INCIDENTS ||
      !Array.isArray(value.zones) || value.zones.length === 0 ||
      !value.types || typeof value.types !== 'object' || Array.isArray(value.types)) return false;
  const zoneIds = new Set();
  for (const zone of value.zones) {
    if (!zone || typeof zone.id !== 'string' || !zone.id ||
        typeof zone.name !== 'string' || !Number.isFinite(zone.lat) || zone.lat < -90 || zone.lat > 90 ||
        !Number.isFinite(zone.lng) || zone.lng < -180 || zone.lng > 180) return false;
    zoneIds.add(zone.id);
  }
  const typeIds = new Set(Object.keys(value.types));
  if (!typeIds.size || Object.values(value.types).some(type =>
    !type || typeof type.label !== 'string' || !Number.isFinite(type.severity))) return false;
  const recordIds = new Set();
  const sourceIds = new Set();
  return value.records.every(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.id !== 'string' || recordIds.has(record.id) ||
        zoneIds.has(record.zone) === false || !typeIds.has(record.type) ||
        !Number.isFinite(record.lat) || record.lat < -90 || record.lat > 90 ||
        !Number.isFinite(record.lng) || record.lng < -180 || record.lng > 180 ||
        !(record.ts === null || (Number.isFinite(record.ts) && record.ts >= 0)) ||
        !Number.isFinite(record.severity) || record.severity < 0 || record.severity > 10 ||
        !Temporal.isValidTime(record.time) ||
        (record.time.precision !== 'unknown' && record.time.start !== record.ts)) return false;
    if (record.sourceId && sourceIds.has(record.sourceId)) return false;
    recordIds.add(record.id);
    if (record.sourceId) sourceIds.add(record.sourceId);
    return true;
  });
}
function validCommunityReports(value) {
  return Array.isArray(value) && value.length <= MAX_INCIDENTS &&
    value.every(record => record && typeof record === 'object' && record.sourceType === 'community-report');
}
const canonicalIncidents = seedIncidents();
const legacyIncidents = readStoredValue(
  'incidents',
  value => Array.isArray(value) && value.length <= MAX_INCIDENTS,
  'legacy incident data'
);
const storedCommunityReports = readStoredValue('communityReports', validCommunityReports, 'community report data');
const legacyCommunityReports = Array.isArray(legacyIncidents)
  ? legacyIncidents.filter(record => record && record.sourceType === 'community-report')
  : [];
let communityReports = storedCommunityReports || legacyCommunityReports;
let demoIncidents = canonicalIncidents.concat(communityReports);
let incidents = demoIncidents;
let riskCache = null;
const RISK_CACHE_MS = 60000;
let importedDataset = null;
let activeMode = 'demo';
let savedMode = { mode: 'demo' };
const storedMode = readStoredValue('activeMode',
  value => value && typeof value === 'object' && ['demo', 'imported'].includes(value.mode),
  'active dataset mode');
if (storedMode) savedMode = storedMode;
importedDataset = readStoredValue('importedDataset', isValidImportedDataset, 'imported dataset');
if (importedDataset) {
  const digest = importedDataset.id
    ? null
    : createHash('sha256').update(JSON.stringify(importedDataset)).digest('hex').slice(0, 20);
  importedDataset = {
    ...importedDataset,
    id: importedDataset.id || `import-legacy-${digest}`,
    provenance: importedDataset.provenance || {
      type: 'user-import',
      importedAt: importedDataset.importedAt || null,
      recordCount: importedDataset.records.length
    }
  };
}
if (savedMode.mode === 'imported' && !importedDataset) {
  recordStorageFailure(new PersistentStorageError('The active imported dataset is missing or invalid.', 'STORAGE_INVALID_DATA'));
  savedMode = { mode: 'demo' };
}
activeMode = savedMode.mode;

let activeZones = activeMode === 'imported' ? importedDataset.zones : ZONES;
let activeTypes = activeMode === 'imported' ? importedDataset.types : DEMO_TYPES;
let activeStations = DEMO_STATIONS;
if (activeMode === 'imported') {
  const lat = activeZones.reduce((sum, zone) => sum + zone.lat, 0) / activeZones.length;
  const lng = activeZones.reduce((sum, zone) => sum + zone.lng, 0) / activeZones.length;
  activeStations = [{ id: 'dataset-centre', name: 'Dataset centre', lat, lng }];
  incidents = importedDataset.records;
}

function requireWritableStorage(res) {
  const status = storageStatus();
  if (!mutationsAllowed || !status.configured || storageFailure) {
    res.status(503).json({
      error: status.reason || operatingMode.reason || 'Persistent writes are unavailable.',
      storage: status
    });
    return false;
  }
  return true;
}
function storageWriteFailure(res, error, message) {
  recordStorageFailure(error);
  return res.status(503).json({ error: message, storage: storageStatus() });
}
function storageWriteSucceeded() {
  storageWriteStatus = true;
}
function datasetSummary() {
  return {
    mode: activeMode,
    id: activeMode === 'imported' ? importedDataset.id : 'synthetic-dashboard-v1',
    name: activeMode === 'imported' ? importedDataset.name : 'Synthetic dashboard demo',
    records: incidents.length,
    zones: activeZones.length,
    categories: Object.values(activeTypes).map(type => type.label),
    importedAt: activeMode === 'imported' ? importedDataset.importedAt : null,
    schemaVersion: activeMode === 'imported' ? importedDataset.schemaVersion || null : null,
    contentHash: activeMode === 'imported' ? importedDataset.contentHash || null : null,
    provenance: activeMode === 'imported' ? importedDataset.provenance : { type: 'synthetic-demo' },
    communityReports: activeMode === 'demo' ? communityReports.length : 0,
    hasImportedDataset: Boolean(importedDataset),
    importedDatasetId: importedDataset?.id || null
  };
}
function activateImportedDataset(dataset) {
  if (!isValidImportedDataset(dataset)) {
    throw new PersistentStorageError('The saved imported dataset is invalid.', 'STORAGE_INVALID_DATA');
  }
  importedDataset = dataset;
  activeMode = 'imported';
  activeZones = dataset.zones;
  activeTypes = dataset.types;
  incidents = dataset.records;
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
  ok: true,
  service: 'SurakshyaPath',
  version: '1.1.0',
  timestamp: new Date().toISOString(),
  operatingMode: operatingMode.mode,
  mutationPolicy: mutationsAllowed ? 'local-research-only' : 'disabled',
  storage: storageStatus()
}));
app.get('/api/config', (req, res) => res.json({ zones: activeZones, stations: activeStations, types: activeTypes }));
app.get('/api/research/summary', (req, res) => {
  const precisionCounts = Temporal.precisionCounts(canonicalIncidents, snapshotNow());
  res.json({
    ...RESEARCH_SUMMARY,
    sourceDataset: {
      id: 'canonical-synthetic-benchmark-v1',
      name: RESEARCH_SUMMARY.dataset,
      schemaVersion: null,
      contentHash: null,
      recordCount: canonicalIncidents.length,
      zoneCount: ZONES.length,
      temporalCoverage: {
        precisionCounts,
        hourlyAnalysis: {
          status: 'UNAVAILABLE',
          explanation: 'Synthetic age anchors are date-level simulation inputs, not observed event timestamps.'
        }
      }
    },
    modelConfiguration: {
      scoringModels: RESEARCH_SUMMARY.risk.map(result => result.model),
      referenceModel: RESEARCH_SUMMARY.risk_reference_model,
      allocationBudget: RESEARCH_SUMMARY.officer_budget,
      seed: 208304
    },
    warnings: [
      'Synthetic age anchors do not establish exact event times; event-hour analysis is unavailable.',
      'Spatial rankings, routes, and allocations are experimental outputs, not validated real-world operational instructions.'
    ]
  });
});
app.get('/api/incidents', (req, res) => res.json(incidents));
app.get('/api/dataset', (req, res) => res.json(datasetSummary()));
app.get('/api/dataset/research', (req, res) => {
  if (activeMode !== 'imported') {
    return res.status(409).json({ error: 'Import a dataset before running a dataset-specific research comparison.' });
  }
  res.json(buildDatasetResearch(importedDataset, snapshotNow()));
});

app.post('/api/dataset/import', (req, res) => {
  if (!requireWritableStorage(res)) return;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Import request must be a JSON object.' });
  }
  let dataset;
  try {
    dataset = prepareImportedDataset(req.body);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
      ...(error.validation ? { validation: error.validation } : {})
    });
  }
  try {
    storage.write('importedDataset', dataset);
    storageWriteSucceeded();
  } catch (error) {
    return storageWriteFailure(res, error, 'Imported dataset could not be saved.');
  }
  if (activeMode !== 'imported') {
    try {
      storage.write('activeMode', { mode: 'imported' });
      storageWriteSucceeded();
    } catch (error) {
      return storageWriteFailure(
        res,
        error,
        'Dataset was saved, but activation failed. The active dataset has not changed.'
      );
    }
  }
  activateImportedDataset(dataset);
  res.status(201).json({ dataset: datasetSummary() });
});

app.post('/api/dataset/use-imported', (req, res) => {
  if (!requireWritableStorage(res)) return;
  if (!importedDataset) return res.status(404).json({ error: 'No saved imported dataset is available.' });
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'Activation request must be a JSON object.' });
  }
  if (req.body?.datasetId !== undefined && req.body.datasetId !== importedDataset.id) {
    return res.status(409).json({ error: 'The requested dataset is not the saved imported dataset.' });
  }
  if (!isValidImportedDataset(importedDataset)) {
    return res.status(409).json({ error: 'The saved imported dataset is invalid; the active dataset was not changed.' });
  }
  try {
    storage.write('activeMode', { mode: 'imported' });
    storageWriteSucceeded();
  } catch (error) {
    return storageWriteFailure(res, error, 'Dashboard could not switch to the saved imported dataset.');
  }
  activateImportedDataset(importedDataset);
  res.json({ dataset: datasetSummary() });
});

app.post('/api/dataset/use-demo', (req, res) => {
  if (!requireWritableStorage(res)) return;
  try {
    storage.write('activeMode', { mode: 'demo' });
    storageWriteSucceeded();
  } catch (error) {
    return storageWriteFailure(res, error, 'Dashboard could not switch back to demo data.');
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
  if (!requireWritableStorage(res)) return;
  if (incidents.length >= MAX_INCIDENTS) {
    return res.status(503).json({ error: 'Incident storage limit reached.' });
  }
  if (!validCoordinate(lat, 27.55, 27.85) ||
      !validCoordinate(lng, 85.15, 85.55) ||
      !DEMO_TYPES[type] ||
      (when !== undefined && !VALID_REPORT_WINDOWS.has(when)) ||
      (note !== undefined && (typeof note !== 'string' || note.length > MAX_REPORT_NOTE_LENGTH))) {
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
  let updatedReports;
  try {
    updatedReports = storage.update('communityReports', current => {
      const currentReports = current === null ? communityReports : current;
      if (!validCommunityReports(currentReports)) {
        throw new PersistentStorageError('Stored community report data has an invalid shape.', 'STORAGE_INVALID_DATA');
      }
      if (canonicalIncidents.length + currentReports.length >= MAX_INCIDENTS) {
        const error = new Error('Incident storage limit reached.');
        error.code = 'INCIDENT_LIMIT';
        throw error;
      }
      return currentReports.concat(incident);
    }, communityReports);
  } catch (error) {
    if (error.code === 'INCIDENT_LIMIT') {
      return res.status(503).json({ error: error.message });
    }
    return storageWriteFailure(res, error, 'Incident could not be persisted. Please try again.');
  }
  storageWriteSucceeded();
  communityReports = updatedReports;
  demoIncidents = canonicalIncidents.concat(communityReports);
  incidents = demoIncidents;
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
  const persistence = storageStatus();
  res.json({
    status: intelligence.status,
    data: { records: incidents.length, validRecords: quality.recordsAccepted, qualityScore: quality.qualityScore },
    pipeline: { storage: persistence.available === true, risk: true, analytics: true, intelligence: intelligence.status === 'SUCCESS' || intelligence.status === 'PARTIAL_SUCCESS' },
    storage: persistence,
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
  res.json({ incidents: snapshot, zones, analytics: buildAnalytics(snapshot, now), stats: buildStats(snapshot, now, activeZones, activeTypes), intelligence, dataQuality, dataset: datasetSummary(), storage: storageStatus(), types: activeTypes, stations: activeStations });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request body.' });
  if (error?.type === 'entity.too.large') {
    const limitMiB = ImportLimits.MAX_IMPORT_PAYLOAD_BYTES / (1024 * 1024);
    return res.status(413).json({ error: `Request body is too large. Dataset requests are limited to ${limitMiB} MiB.` });
  }
  console.error('Unhandled request error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

function startServer(port = PORT) {
  const host = process.env.HOST || (operatingMode.mode === 'local-research' ? '127.0.0.1' : undefined);
  const onListening = () => console.log('SurakshyaPath running on port ' + port);
  const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);
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
