const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_RECORDS, parseCsv, parseJson, parseTimestamp, validateRecords,
  formatValidationSummary, mapRecords
} = require('../public/js/dataset-import');
const { prepareImportedDataset } = require('../data/imported-dataset');
const { buildDataQuality } = require('../algorithms/intelligence');
const { computeZones } = require('../algorithms/risk');
const Temporal = require('../public/js/temporal');

const NOW = Date.UTC(2026, 8, 30, 12);

test('CSV import parser handles quoted commas, escaped quotes, and embedded newlines', () => {
  const parsed = parseCsv('zone,category,note\r\n"North, East",Theft,"A ""quoted"" note"\r\nSouth,Other,"Two\nlines"\r\n');
  assert.deepEqual(parsed.headers, ['zone', 'category', 'note']);
  assert.equal(parsed.records[0].zone, 'North, East');
  assert.equal(parsed.records[0].note, 'A "quoted" note');
  assert.equal(parsed.records[1].note, 'Two\nlines');
  const withBlankLines = parseCsv('zone,category\r\nA,Theft\r\n\r\nB,Other\r\n');
  assert.equal(withBlankLines.records.length, 2);
  assert.equal(withBlankLines.blankRowsSkipped, 1);
});

test('CSV import rejects malformed quote boundaries', () => {
  assert.throws(() => parseCsv('zone,category\n"North"x,Theft'), /characters after a quoted field/);
  assert.throws(() => parseCsv('zone,category\nNorth",Theft'), /quote in an unquoted field/);
  assert.throws(() => parseCsv(' \r\n'), /empty/);
  assert.throws(() => parseCsv('zone,zone\nA,B'), /unique/i);
  assert.throws(() => parseCsv('zone,,category\nA,B,C'), /cannot be empty/);
  assert.throws(() => parseCsv('zone,category\nA,B,C'), /expected 2/);
});

test('JSON import accepts record arrays and object-wrapped records', () => {
  assert.deepEqual(parseJson('{"records":[{"area":"A"},{"area":"B"}]}').headers, ['area']);
  assert.throws(() => parseJson('{"items":[]}'), /records array/);
  assert.throws(() => parseJson(''), /empty/);
  assert.throws(() => parseJson('[null]'), /Every JSON record/);
  assert.throws(() => parseJson('{"records":[]}'), /non-empty/);
});

test('column mapping validates global coordinates and maps optional severity defaults', () => {
  const rows = [{
    area: 'Sydney',
    kind: 'Theft',
    lat: '-33.87',
    lon: '151.21',
    occurred: '2026-09-29T12:00:00Z',
    weight: ''
  }];
  const mapped = mapRecords(rows, {
    zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred', severity: 'weight'
  }, NOW);
  assert.deepEqual(mapped[0], {
    zone: 'Sydney', category: 'Theft', lat: -33.87, lng: 151.21,
    ts: Date.parse('2026-09-29T12:00:00Z'),
    time: Temporal.exactTime(Date.parse('2026-09-29T12:00:00Z'), 'imported'),
    severity: 1
  });
  assert.throws(() => mapRecords([{ ...rows[0], lat: '91' }], {
    zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred'
  }), /latitude must be between/i);
});

test('date-only imports retain day precision and timezone-less date-times use UTC', () => {
  const dateOnly = mapRecords([{
    area: 'A', kind: 'Theft', lat: 1, lon: 2, occurred: '2026-09-29'
  }], { zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred' }, NOW)[0];
  assert.equal(dateOnly.time.precision, 'date');
  assert.equal(dateOnly.time.origin, 'imported');
  assert.equal(dateOnly.ts, Date.UTC(2026, 8, 29));
  assert.equal(dateOnly.time.end, Date.UTC(2026, 8, 30) - 1);

  const offsetless = parseTimestamp('2026-09-30T10:15:00', NOW);
  assert.equal(offsetless.time.precision, 'instant');
  assert.equal(offsetless.ts, Date.UTC(2026, 8, 30, 10, 15));
  assert.equal(parseTimestamp('2026-02-30', NOW), null);
  assert.equal(parseTimestamp('', NOW).time.precision, 'unknown');
  assert.equal(parseTimestamp('not recorded', NOW).time.precision, 'unknown');
  const approximate = parseTimestamp('2026-09-28/2026-09-29', NOW);
  assert.equal(approximate.time.precision, 'range');
  assert.equal(approximate.ts, Date.UTC(2026, 8, 28));
  assert.equal(parseTimestamp('2026-10-01', NOW), null);
  assert.equal(parseTimestamp('not-a-timestamp', NOW), null);
  const unknown = mapRecords([{
    area: 'A', kind: 'Theft', lat: 1, lon: 2, occurred: ''
  }], { zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred' }, NOW)[0];
  assert.equal(unknown.time.precision, 'unknown');
  assert.equal(unknown.ts, null);
});

test('validation is all-or-nothing, reports generic row issues, and guards mapping input', () => {
  const mapping = { zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', severity: 'severity' };
  const result = validateRecords([
    { area: 'Private Zone Name', kind: 'Theft', lat: '91', lon: '2' },
    { area: 'Other', kind: 'Theft', lat: '1', lon: '2', severity: 'not-a-number' }
  ], mapping, NOW);
  assert.equal(result.importable, false);
  assert.equal(result.summary.validRecords, 0);
  assert.equal(result.summary.rejectedRecords, 2);
  assert.equal(result.summary.acceptedRecords, 0);
  assert.match(formatValidationSummary(result.summary), /all-or-nothing/i);
  assert.doesNotMatch(formatValidationSummary(result.summary), /Private Zone Name/);
  assert.equal(validateRecords([{}], null, NOW).importable, false);
  assert.equal(validateRecords([], mapping, NOW).summary.acceptedRecords, 0);
});

test('validation rejects duplicate source identifiers, excessive categories, and record counts', () => {
  const mapping = {
    zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', identifier: 'record_id'
  };
  const duplicates = validateRecords([
    { area: 'A', kind: 'Theft', lat: 1, lon: 2, record_id: 'same' },
    { area: 'A', kind: 'Theft', lat: 1, lon: 2, record_id: 'same' }
  ], mapping, NOW);
  assert.equal(duplicates.summary.rejectedRecords, 2);
  assert.equal(duplicates.summary.issueCounts['duplicate-identifier'], 2);

  const broad = validateRecords(Array.from({ length: 101 }, (_, index) => ({
    area: `Zone ${index}`, kind: `Category ${index}`, lat: 1, lon: 2
  })), { ...mapping, identifier: '' }, NOW);
  assert.equal(broad.importable, false);
  assert.ok(broad.summary.datasetIssues.some(issue => issue.code === 'zone-limit'));
  assert.ok(broad.summary.datasetIssues.some(issue => issue.code === 'category-limit'));
  assert.equal(broad.summary.acceptedRecords, 0);

  const tooMany = validateRecords(Array.from({ length: MAX_RECORDS + 1 }, () => ({})), mapping, NOW);
  assert.equal(tooMany.summary.issueCounts['record-limit'], 1);
  assert.equal(tooMany.summary.acceptedRecords, 0);
});

test('imported data derives distinct zones and categories without Kathmandu assumptions', () => {
  const dataset = prepareImportedDataset({
    name: 'Sydney study',
    records: [
      { zone: 'North Zone', category: 'Theft', lat: -33.87, lng: 151.21, ts: NOW - 86400000, time: Temporal.exactTime(NOW - 86400000), severity: 4 },
      { zone: 'North-Zone', category: 'Other', lat: -33.88, lng: 151.22, ts: NOW - 3600000, time: Temporal.exactTime(NOW - 3600000), severity: 2 }
    ]
  }, NOW);

  assert.equal(dataset.records.length, 2);
  assert.equal(dataset.zones.length, 2);
  assert.notEqual(dataset.zones[0].id, dataset.zones[1].id);
  assert.deepEqual(Object.values(dataset.types).map(type => type.label), ['Theft', 'Other']);
  assert.equal(dataset.records[0].dataStatus, 'IMPORTED');
  assert.equal(dataset.records[0].time.precision, 'instant');
  assert.equal(dataset.records[0].time.origin, 'imported');
  assert.equal(dataset.provenance.datasetId, dataset.id);
  assert.equal(dataset.provenance.datasetName, dataset.name);
  assert.equal(dataset.provenance.blankRowsSkipped, null);
  assert.ok(dataset.zones.every(zone => zone.lat < -33 && zone.lng > 150));

  const quality = buildDataQuality(dataset.records, dataset.zones, NOW, dataset.types);
  assert.equal(quality.recordsAccepted, 2);
  assert.equal(quality.recordsRejected, 0);

  const risk = computeZones({
    zones: dataset.zones,
    incidents: dataset.records,
    types: dataset.types,
    now: NOW
  });
  assert.equal(risk.reduce((sum, zone) => sum + zone.count, 0), 2);

  const { buildDatasetResearch } = require('../algorithms/dataset-research');
  const research = buildDatasetResearch(dataset, NOW);
  assert.equal(research.rows.length, 4);
  assert.ok(research.rows.every(row => row.twoOptKm <= row.nearestNeighbourKm));
  assert.ok(research.methods.robustness.includes('Not estimated'));
  assert.equal(research.dataset.temporalCoverage.recencyEligibleRecords, 2);
  assert.equal(research.sourceDataset.id, dataset.id);
  assert.equal(research.sourceDataset.contentHash.value, dataset.contentHash.value);
});

test('import provenance survives preparation and approximate times remain excluded from recency', () => {
  const start = NOW - 2 * 86400000;
  const end = NOW - 86400000;
  const dataset = prepareImportedDataset({
    name: 'Interval study',
    sourceFileName: 'C:\\uploads\\observations.csv',
    sourceFormat: 'CSV',
    mapping: { zone: 'district', category: 'class', latitude: 'y', longitude: 'x', date: 'period' },
    blankRowsSkipped: 2,
    records: [{
      zone: 'North', category: 'Theft', lat: 27, lng: 85, ts: start,
      time: { precision: 'range', origin: 'imported', start, end, window: null },
      severity: 3
    }]
  }, NOW);
  assert.equal(dataset.provenance.originalFileName, 'observations.csv');
  assert.equal(dataset.provenance.originalFormat, 'csv');
  assert.equal(dataset.provenance.blankRowsSkipped, 2);
  assert.deepEqual(dataset.provenance.selectedColumnMapping, {
    zone: 'district', category: 'class', latitude: 'y', longitude: 'x', date: 'period'
  });
  assert.equal(dataset.provenance.validationSummary.acceptedRecords, 1);
  assert.equal(dataset.provenance.temporalPrecision['imported:range'], 1);
  assert.match(dataset.contentHash.value, /^[a-f0-9]{64}$/);

  const { buildDatasetResearch } = require('../algorithms/dataset-research');
  const result = buildDatasetResearch(dataset, NOW);
  assert.equal(result.sourceDataset.schemaVersion, dataset.schemaVersion);
  assert.equal(result.dataset.temporalCoverage.recencyEligibleRecords, 0);
  assert.equal(result.dataset.temporalCoverage.exclusions.approximateRangeRecords, 1);
  assert.equal(result.rows.find(row => row.model === 'current-severity-recency').availability, 'UNAVAILABLE');
  assert.match(result.warnings.join(' '), /approximate time ranges/);
  const manyBlankLines = prepareImportedDataset({
    name: 'Blank-line accounting',
    blankRowsSkipped: 50001,
    records: [{ zone: 'North', category: 'Theft', lat: 27, lng: 85 }]
  }, NOW);
  assert.equal(manyBlankLines.provenance.blankRowsSkipped, 50001);
});

test('import normalization rejects missing zones and future timestamps', () => {
  const record = { zone: 'A', category: 'Theft', lat: 1, lng: 2, ts: NOW - 1, severity: 1 };
  assert.throws(() => prepareImportedDataset({ name: 'Bad', records: [{ ...record, zone: '' }] }, NOW), /zone/i);
  assert.throws(() => prepareImportedDataset({
    name: 'Bad',
    records: [{ ...record, ts: NOW + 1, time: Temporal.exactTime(NOW + 1) }]
  }, NOW), /future/i);
  assert.throws(() => prepareImportedDataset({
    name: 'Bad',
    records: [{ ...record, time: Temporal.exactTime(NOW) }]
  }, NOW), /invalid precision metadata/i);
  const legacy = prepareImportedDataset({ name: 'Legacy', records: [record] }, NOW);
  assert.equal(legacy.records[0].time.precision, 'unknown');
  assert.equal(legacy.records[0].time.origin, 'imported');
  const { buildDatasetResearch } = require('../algorithms/dataset-research');
  const legacyResearch = buildDatasetResearch(legacy, NOW);
  assert.equal(legacyResearch.dataset.temporalCoverage.recencyExcludedRecords, 1);
  assert.equal(legacyResearch.rows.find(row => row.model === 'current-severity-recency').availability, 'UNAVAILABLE');
});
