'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const DatasetImport = require('../public/js/dataset-import');
const { RESEARCH_SEVERITY } = require('../config/severity');

const CSV_FILE = path.join(__dirname, 'synthetic_incidents.csv');
const DATASET_ID = 'canonical-synthetic-benchmark-v1';
const EXPECTED_RECORDS = 1567;
const EXPECTED_HEADERS = [
  'id', 'date', 'latitude', 'longitude', 'category',
  'severity', 'source_type', 'data_status', 'age_days'
];

function parseCanonicalDataset(text) {
  const parsed = DatasetImport.parseCsv(text);
  if (parsed.blankRowsSkipped) {
    throw new Error('Canonical synthetic dataset must not contain blank CSV records.');
  }
  if (parsed.headers.length !== EXPECTED_HEADERS.length ||
      parsed.headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    throw new Error('Canonical synthetic dataset has an unsupported header schema.');
  }
  if (parsed.records.length !== EXPECTED_RECORDS) {
    throw new Error(`Canonical synthetic dataset must contain ${EXPECTED_RECORDS} records.`);
  }

  const ids = new Set();
  return parsed.records.map((row, index) => {
    const recordNumber = index + 2;
    const expectedId = `syn-shrawan-2083-${String(index + 1).padStart(4, '0')}`;
    if (row.id !== expectedId || ids.has(row.id)) {
      throw new Error(`Canonical synthetic dataset record ${recordNumber} has an invalid or duplicate identifier.`);
    }
    ids.add(row.id);

    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const severity = Number(row.severity);
    const ageDays = Number(row.age_days);
    if (row.date !== '2083-Shrawan' || !Object.hasOwn(RESEARCH_SEVERITY, row.category) ||
        severity !== RESEARCH_SEVERITY[row.category] ||
        !Number.isFinite(latitude) || latitude < 27.60 || latitude > 27.78 ||
        !Number.isFinite(longitude) || longitude < 85.20 || longitude > 85.50 ||
        !Number.isInteger(ageDays) || ageDays < 0 || ageDays >= 30 ||
        row.source_type !== 'simulation' || row.data_status !== 'SYNTHETIC') {
      throw new Error(`Canonical synthetic dataset record ${recordNumber} has invalid field values.`);
    }
    return { ...row, latitude, longitude, severity, ageDays };
  });
}

function readCanonicalDataset(filePath = CSV_FILE) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Canonical synthetic dataset is missing: ${filePath}`);
    }
    throw new Error(`Canonical synthetic dataset could not be read: ${error.message}`);
  }
  const records = parseCanonicalDataset(contents);
  const hashContents = contents.replace(/\r\n?/g, '\n');
  return {
    id: DATASET_ID,
    name: 'Deterministic synthetic Shrawan 2083 Kathmandu Valley dataset',
    schemaVersion: null,
    contentHash: {
      algorithm: 'sha256',
      representation: 'UTF-8 text with line endings normalized to LF',
      value: createHash('sha256').update(hashContents, 'utf8').digest('hex')
    },
    recordCount: records.length,
    records
  };
}

module.exports = {
  CSV_FILE,
  DATASET_ID,
  EXPECTED_RECORDS,
  EXPECTED_HEADERS,
  parseCanonicalDataset,
  readCanonicalDataset
};
