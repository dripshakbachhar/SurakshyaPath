const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCsv, parseJson, mapRecords } = require('../public/js/dataset-import');
const { prepareImportedDataset } = require('../data/imported-dataset');
const { buildDataQuality } = require('../algorithms/intelligence');
const { computeZones } = require('../algorithms/risk');

const NOW = Date.UTC(2026, 8, 30, 12);

test('CSV import parser handles quoted commas, escaped quotes, and embedded newlines', () => {
  const parsed = parseCsv('zone,category,note\r\n"North, East",Theft,"A ""quoted"" note"\r\nSouth,Other,"Two\nlines"\r\n');
  assert.deepEqual(parsed.headers, ['zone', 'category', 'note']);
  assert.equal(parsed.records[0].zone, 'North, East');
  assert.equal(parsed.records[0].note, 'A "quoted" note');
  assert.equal(parsed.records[1].note, 'Two\nlines');
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
  });
  assert.deepEqual(mapped[0], {
    zone: 'Sydney', category: 'Theft', lat: -33.87, lng: 151.21,
    ts: Date.parse('2026-09-29T12:00:00Z'), severity: 1
  });
  assert.throws(() => mapRecords([{ ...rows[0], lat: '91' }], {
    zone: 'area', category: 'kind', latitude: 'lat', longitude: 'lon', date: 'occurred'
  }), /latitude must be between/);
});

test('imported data derives distinct zones and categories without Kathmandu assumptions', () => {
  const dataset = prepareImportedDataset({
    name: 'Sydney study',
    records: [
      { zone: 'North Zone', category: 'Theft', lat: -33.87, lng: 151.21, ts: NOW - 86400000, severity: 4 },
      { zone: 'North-Zone', category: 'Other', lat: -33.88, lng: 151.22, ts: NOW - 3600000, severity: 2 }
    ]
  }, NOW);

  assert.equal(dataset.records.length, 2);
  assert.equal(dataset.zones.length, 2);
  assert.notEqual(dataset.zones[0].id, dataset.zones[1].id);
  assert.deepEqual(Object.values(dataset.types).map(type => type.label), ['Theft', 'Other']);
  assert.equal(dataset.records[0].dataStatus, 'IMPORTED');
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
});

test('import normalization rejects missing zones and future timestamps', () => {
  const record = { zone: 'A', category: 'Theft', lat: 1, lng: 2, ts: NOW - 1, severity: 1 };
  assert.throws(() => prepareImportedDataset({ name: 'Bad', records: [{ ...record, zone: '' }] }, NOW), /zone/);
  assert.throws(() => prepareImportedDataset({ name: 'Bad', records: [{ ...record, ts: NOW + 1 }] }, NOW), /future date/);
});
