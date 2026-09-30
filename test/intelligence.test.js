const test = require('node:test');
const assert = require('node:assert/strict');

const { ZONES } = require('../config/zones');
const { INCIDENT_TYPES } = require('../config/incident-types');
const { buildDataQuality, buildIntelligence } = require('../algorithms/intelligence');

const NOW = Date.UTC(2026, 8, 30, 12);

test('intelligence reports no data instead of returning an empty object', () => {
  const result = buildIntelligence({ incidents: [], zones: ZONES, types: INCIDENT_TYPES, now: NOW });
  assert.equal(result.status, 'NO_DATA');
  assert.equal(result.modelType, 'STATISTICAL_HEURISTIC');
  assert.match(result.summary, /No validated incident data/);
  assert.ok(Array.isArray(result.patterns));
});

test('intelligence consumes the same validated incident snapshot as risk analytics', () => {
  const incidents = [
    { id: 'a', zone: 'thamel', type: 'theft', ts: NOW - 3600000, lat: 27.715, lng: 85.312 },
    { id: 'b', zone: 'thamel', type: 'harassment', ts: NOW - 2 * 3600000, lat: 27.716, lng: 85.313 },
    { id: 'c', zone: 'patan', type: 'infrastructure', ts: NOW - 3 * 86400000, lat: 27.673, lng: 85.324 },
    { id: 'future', zone: 'patan', type: 'theft', ts: NOW + 86400000, lat: 27.673, lng: 85.324 }
  ];
  const quality = buildDataQuality(incidents, ZONES, NOW);
  const result = buildIntelligence({ incidents, zones: ZONES, types: INCIDENT_TYPES, now: NOW });

  assert.equal(quality.recordsReceived, 4);
  assert.equal(quality.recordsAccepted, 3);
  assert.equal(quality.futureDates, 1);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.dataCoverage.analyzedRecords, 3);
  assert.equal(result.riskFactors[0].zone, 'Thamel');
  assert.equal(result.trend.direction, 'NO_BASELINE');
});

test('data quality rejects invalid coordinates and unknown types', () => {
  const result = buildDataQuality([
    { id: 'bad', zone: 'thamel', type: 'unknown', ts: NOW, lat: 0, lng: 0 }
  ], ZONES, NOW);
  assert.equal(result.recordsReceived, 1);
  assert.equal(result.recordsAccepted, 0);
  assert.equal(result.recordsRejected, 1);
  assert.equal(result.invalidCoordinates, 2);
  assert.ok(result.rejectedSamples[0].reasons.some(reason => reason.includes('unknown')));
});
