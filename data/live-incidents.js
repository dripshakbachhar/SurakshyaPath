const { ZONES } = require('../config/zones');
const Temporal = require('../public/js/temporal');
const { CSV_FILE, readCanonicalDataset } = require('./canonical-dataset');

const DAY_MS = 86400000;

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

function loadSyntheticIncidents(now = Date.now()) {
  const snapshotNow = Math.floor(now / 60000) * 60000;
  const rows = readCanonicalDataset().records;
  return rows.map(row => {
    const lat = row.latitude;
    const lng = row.longitude;
    const ageDays = row.ageDays;
    const zone = nearestZone(lat, lng);

    if (!zone) {
      throw new Error(`Invalid synthetic incident record: ${row.id || 'unknown'}`);
    }

    const ts = Temporal.utcDayStart(snapshotNow) - ageDays * DAY_MS;
    return {
      id: row.id,
      zone: zone.id,
      type: row.category,
      severity: row.severity,
      ts,
      time: Temporal.dateTime(ts, snapshotNow, 'synthetic'),
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
