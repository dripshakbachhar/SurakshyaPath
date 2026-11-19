const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCsv, parseJson, parseTimestamp, mapRecords } = require('../public/js/dataset-import');
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
});

test('CSV import rejects malformed quote boundaries', () => {
  assert.throws(() => parseCsv('zone,category\n"North"x,Theft'), /characters after a quoted field/);
  assert.throws(() => parseCsv('zone,category\nNorth",Theft'), /quote in an unquoted field/);
});

test('JSON import accepts record arrays and object-wrapped records', () => {
  assert.deepEqual(parseJson('{"records":[{"area":"A"},{"area":"B"}]}').headers, ['area']);
  assert.throws(() => parseJson('{"items":[]}'), /records array/);
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
  }), /latitude must be between/);
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
  assert.equal(parseTimestamp('', NOW), null);
  assert.equal(parseTimestamp('not-a-timestamp', NOW), null);
  assert.throws(() => mapRecords([{
    area: 'A', kind: 'Theft', lat: 1, lon: 2, occurred: ''
  }], { zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred' }, NOW), /date\/time is missing, invalid, or in the future/);
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
});

test('import normalization rejects missing zones and future timestamps', () => {
  const record = { zone: 'A', category: 'Theft', lat: 1, lng: 2, ts: NOW - 1, severity: 1 };
  assert.throws(() => prepareImportedDataset({ name: 'Bad', records: [{ ...record, zone: '' }] }, NOW), /zone/);
  assert.throws(() => prepareImportedDataset({ name: 'Bad', records: [{ ...record, ts: NOW + 1 }] }, NOW), /future date/);
  assert.throws(() => prepareImportedDataset({
    name: 'Bad',
    records: [{ ...record, time: Temporal.exactTime(NOW) }]
  }, NOW), /time precision metadata/);
  const legacy = prepareImportedDataset({ name: 'Legacy', records: [record] }, NOW);
  assert.equal(legacy.records[0].time.precision, 'unknown');
  assert.equal(legacy.records[0].time.origin, 'imported');
  const { buildDatasetResearch } = require('../algorithms/dataset-research');
  const legacyResearch = buildDatasetResearch(legacy, NOW);
  assert.equal(legacyResearch.dataset.temporalCoverage.recencyExcludedRecords, 1);
  assert.equal(legacyResearch.rows.find(row => row.model === 'current-severity-recency').availability, 'UNAVAILABLE');
});
