'use strict';

const { createHash, randomUUID } = require('crypto');
const Temporal = require('../public/js/temporal');
const DatasetImport = require('../public/js/dataset-import');
const ImportLimits = require('../public/js/import-limits');

const { MAX_RECORDS, MAX_ZONES, MAX_CATEGORIES } = DatasetImport;
const IMPORT_SCHEMA_VERSION = 1;
const MAPPING_KEYS = ['zone', 'category', 'latitude', 'longitude', 'date', 'severity', 'identifier'];

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

function normalizeFileName(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Original filename must be 255 characters or fewer and contain no control characters.');
  }
  const fileName = value.split(/[\\/]/).pop().trim();
  if (!fileName) throw new Error('Original filename is invalid.');
  return fileName;
}

function normalizeFormat(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !['csv', 'json'].includes(value.toLowerCase())) {
    throw new Error('Original format must be CSV or JSON.');
  }
  return value.toLowerCase();
}

function normalizeMapping(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Selected column mapping must be an object.');
  }
  const mapping = {};
  for (const key of MAPPING_KEYS) {
    if (value[key] === undefined || value[key] === null || value[key] === '') continue;
    if (typeof value[key] !== 'string' || value[key].length > 256 ||
        /[\u0000-\u001f\u007f]/.test(value[key])) {
      throw new Error('Selected column mapping contains an invalid field name.');
    }
    mapping[key] = value[key];
  }
  return Object.keys(mapping).length ? mapping : null;
}

function normalizeBlankRows(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > ImportLimits.MAX_IMPORT_PAYLOAD_BYTES) {
    throw new Error('Blank-line count is invalid.');
  }
  return value;
}

function validationError(summary) {
  const error = new Error(DatasetImport.formatValidationSummary(summary));
  error.validation = summary;
  return error;
}

function prepareImportedDataset(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Import request must be an object.');
  }
  const { name, records } = input;
  const datasetName = typeof name === 'string' ? name.trim() : '';
  if (!datasetName || datasetName.length > 80 || /[\u0000-\u001f\u007f]/.test(datasetName)) {
    throw new Error('Dataset name is required and must be 80 characters or fewer.');
  }

  const sourceFileName = normalizeFileName(input.sourceFileName);
  const sourceFormat = normalizeFormat(input.sourceFormat);
  const selectedColumnMapping = normalizeMapping(input.mapping);
  const blankRowsSkipped = normalizeBlankRows(input.blankRowsSkipped);
  const validation = DatasetImport.validateRecords(records, {
    zone: 'zone',
    category: 'category',
    latitude: 'lat',
    longitude: 'lng',
    severity: 'severity',
    identifier: 'sourceId'
  }, now);
  if (!validation.importable) throw validationError(validation.summary);

  const zoneNames = [...new Set(validation.records.map(record => record.zone.toLocaleLowerCase()))]
    .map(key => validation.records.find(record => record.zone.toLocaleLowerCase() === key).zone);
  const categories = [...new Set(validation.records.map(record => record.category.toLocaleLowerCase()))]
    .map(key => validation.records.find(record => record.category.toLocaleLowerCase() === key).category);
  const cleanRecords = validation.records.map((record, index) => ({
    ...record,
    zoneName: record.zone,
    id: `import-${index + 1}`
  }));

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
    time: record.time,
    severity: record.severity,
    ...(record.sourceId ? { sourceId: record.sourceId } : {}),
    sourceType: 'user-import',
    dataStatus: 'IMPORTED',
    reporter: 'Imported dataset',
    note: `Imported record (${record.category}).`
  }));

  const importedAt = new Date(now).toISOString();
  const contentHashInput = cleanRecords.map(record => ({
    sourceId: record.sourceId || null,
    zone: record.zoneName,
    category: record.category,
    lat: record.lat,
    lng: record.lng,
    ts: record.ts,
    time: record.time,
    severity: record.severity
  }));
  const contentHash = {
    algorithm: 'sha256',
    value: createHash('sha256').update(JSON.stringify(contentHashInput)).digest('hex')
  };
  const temporalPrecision = Temporal.precisionCounts(incidents, now);
  const validationSummary = {
    ...validation.summary,
    acceptedRecords: incidents.length,
    rejectedRecords: 0
  };
  const datasetId = `import-${randomUUID()}`;
  return {
    id: datasetId,
    name: datasetName,
    schemaVersion: IMPORT_SCHEMA_VERSION,
    importedAt,
    contentHash,
    provenance: {
      type: 'user-import',
      datasetId,
      datasetName,
      originalFileName: sourceFileName,
      originalFormat: sourceFormat,
      blankRowsSkipped,
      importedAt,
      recordCount: incidents.length,
      selectedColumnMapping,
      validationSummary,
      temporalPrecision,
      schemaVersion: IMPORT_SCHEMA_VERSION,
      contentHash
    },
    records: incidents,
    zones,
    types
  };
}

module.exports = {
  prepareImportedDataset,
  MAX_RECORDS,
  MAX_ZONES,
  MAX_CATEGORIES,
  IMPORT_SCHEMA_VERSION
};
