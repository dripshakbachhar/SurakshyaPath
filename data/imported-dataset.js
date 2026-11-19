'use strict';

const MAX_RECORDS = 50000;
const MAX_ZONES = 100;
const MAX_CATEGORIES = 100;

function makeIds(labels, prefix) {
  const ids = new Map();
  const used = new Set();
  for (const label of labels) {
    const key = label.toLocaleLowerCase();
    if (ids.has(key)) continue;
    const base = label.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `${prefix}-${ids.size + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    ids.set(key, id);
  }
  return ids;
}

function numberValue(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return NaN;
  return Number(value);
}

function prepareImportedDataset({ name, records }, now = Date.now()) {
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) {
    throw new Error(`Import must contain between 1 and ${MAX_RECORDS} records.`);
  }
  const datasetName = typeof name === 'string' ? name.trim() : '';
  if (!datasetName || datasetName.length > 80) {
    throw new Error('Dataset name is required and must be 80 characters or fewer.');
  }

  const zoneNames = [];
  const categories = [];
  const zoneKeySet = new Set();
  const categoryKeySet = new Set();
  const cleanRecords = records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Record ${index + 1} is not a valid object.`);
    }

    const zoneName = typeof record.zone === 'string' ? record.zone.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const lat = numberValue(record.lat);
    const lng = numberValue(record.lng);
    const ts = numberValue(record.ts);
    const severity = numberValue(record.severity);

    if (!zoneName || zoneName.length > 100) throw new Error(`Record ${index + 1} has a missing or invalid zone.`);
    if (!category || category.length > 100) throw new Error(`Record ${index + 1} has a missing or invalid category.`);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`Record ${index + 1} has an invalid latitude.`);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`Record ${index + 1} has an invalid longitude.`);
    if (!Number.isFinite(ts) || ts < 0 || ts > now) throw new Error(`Record ${index + 1} has an invalid or future date.`);
    if (!Number.isFinite(severity) || severity < 0 || severity > 10) throw new Error(`Record ${index + 1} has an invalid severity (use a value from 0 to 10).`);

    const zoneKey = zoneName.toLocaleLowerCase();
    const categoryKey = category.toLocaleLowerCase();
    if (!zoneKeySet.has(zoneKey)) { zoneKeySet.add(zoneKey); zoneNames.push(zoneName); }
    if (!categoryKeySet.has(categoryKey)) { categoryKeySet.add(categoryKey); categories.push(category); }

    return {
      id: `import-${index + 1}`,
      zoneName,
      category,
      lat,
      lng,
      ts,
      severity,
      sourceType: 'user-import',
      dataStatus: 'IMPORTED',
      reporter: 'Imported dataset',
      note: `Imported record (${category}).`
    };
  });

  if (zoneNames.length > MAX_ZONES) throw new Error(`Import contains more than ${MAX_ZONES} zones.`);
  if (categories.length > MAX_CATEGORIES) throw new Error(`Import contains more than ${MAX_CATEGORIES} categories.`);

  const zoneIds = makeIds(zoneNames, 'zone');
  const categoryIds = makeIds(categories, 'category');
  const zoneStats = new Map(zoneNames.map(name => [name.toLocaleLowerCase(), { name, lat: 0, lng: 0, count: 0 }]));
  for (const record of cleanRecords) {
    const stats = zoneStats.get(record.zoneName.toLocaleLowerCase());
    stats.lat += record.lat;
    stats.lng += record.lng;
    stats.count++;
  }
  const zones = [...zoneStats.entries()].map(([key, stats]) => {
    return {
      id: zoneIds.get(key),
      name: stats.name,
      lat: Number((stats.lat / stats.count).toFixed(6)),
      lng: Number((stats.lng / stats.count).toFixed(6))
    };
  });
  const types = Object.fromEntries(categories.map(category => [
    categoryIds.get(category.toLocaleLowerCase()),
    { label: category, severity: 1, useRecordSeverity: true }
  ]));
  const incidents = cleanRecords.map(record => ({
    id: record.id,
    zone: zoneIds.get(record.zoneName.toLocaleLowerCase()),
    type: categoryIds.get(record.category.toLocaleLowerCase()),
    lat: record.lat,
    lng: record.lng,
    ts: record.ts,
    severity: record.severity,
    sourceType: record.sourceType,
    dataStatus: record.dataStatus,
    reporter: record.reporter,
    note: record.note
  }));

  return {
    name: datasetName,
    importedAt: new Date(now).toISOString(),
    records: incidents,
    zones,
    types
  };
}

module.exports = { prepareImportedDataset, MAX_RECORDS };
