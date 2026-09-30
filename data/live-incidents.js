const fs = require('node:fs');
const path = require('node:path');
const { ZONES } = require('../config/zones');

const DAY_MS = 86400000;
const CSV_FILE = path.join(__dirname, 'synthetic_incidents.csv');
const MIN_LAT = 27.55;
const MAX_LAT = 27.85;
const MIN_LNG = 85.15;
const MAX_LNG = 85.55;

function nearestZone(lat, lng) {
  let best = null;
  let bestDistance = Infinity;
  for (const zone of ZONES) {
    const distance = (zone.lat - lat) ** 2 + (zone.lng - lng) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function loadSyntheticIncidents(now = Date.now()) {
  if (!fs.existsSync(CSV_FILE)) {
    throw new Error(`Canonical synthetic dataset is missing: ${CSV_FILE}`);
  }

  const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  return rows.map(row => {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const ageDays = Number(row.age_days);
    const zone = nearestZone(lat, lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ageDays) || !zone) {
      throw new Error(`Invalid synthetic incident record: ${row.id || 'unknown'}`);
    }

    return {
      id: row.id,
      zone: zone.id,
      type: row.category,
      severity: Number(row.severity),
      ts: now - ageDays * DAY_MS,
      reporter: 'Synthetic simulation',
      note: `Synthetic research record (${row.category}).`,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      sourceType: row.source_type,
      dataStatus: row.data_status,
      ageDays
    };
  });
}

module.exports = {
  CSV_FILE,
  loadSyntheticIncidents,
  nearestZone
};
