const test = require('node:test');
const assert = require('node:assert/strict');

const { ZONES } = require('../config/zones');
const { INCIDENT_TYPES } = require('../config/incident-types');
const { decayOf, riskBand, calculateZoneRisk, computeZones } = require('../algorithms/risk');
const { haversine, computePatrol } = require('../algorithms/routing');
const { computeAllocation } = require('../algorithms/allocation');
const { normalize, scoreModels } = require('../algorithms/research-models');

test('risk decay is bounded and decreases with age', () => {
  const now = Date.UTC(2026, 8, 30);
  assert.equal(decayOf(now, now), 1);
  assert.ok(decayOf(now - 15 * 86400000, now) < 1);
  assert.equal(decayOf(now - 60 * 86400000, now), 0.15);
});

test('risk bands map scores to documented thresholds', () => {
  assert.equal(riskBand(0), 'low');
  assert.equal(riskBand(25), 'moderate');
  assert.equal(riskBand(50), 'high');
  assert.equal(riskBand(75), 'critical');
});

test('zone risk ignores unknown incident types', () => {
  const now = Date.UTC(2026, 8, 30);
  const incidents = [
    { type: 'theft', ts: now },
    { type: 'not-real', ts: now },
  ];
  assert.equal(calculateZoneRisk(incidents, INCIDENT_TYPES, now), 5);
});

test('zone computation is deterministic for a fixed snapshot', () => {
  const now = Date.UTC(2026, 8, 30);
  const incidents = [
    { zone: 'thamel', type: 'theft', ts: now - 3600000 },
    { zone: 'bouddha', type: 'harassment', ts: now - 7200000 },
  ];
  const a = computeZones({ zones: ZONES, incidents, types: INCIDENT_TYPES, now });
  const b = computeZones({ zones: ZONES, incidents, types: INCIDENT_TYPES, now });
  assert.deepEqual(a, b);
  assert.equal(a.reduce((sum, zone) => sum + zone.count, 0), 2);
});

test('haversine returns zero for identical points', () => {
  const point = { lat: 27.7, lng: 85.3 };
  assert.equal(haversine(point, point), 0);
});

test('patrol route visits at most the requested number of active zones', () => {
  const station = { id: 'test', name: 'Test Station', lat: 27.705, lng: 85.315 };
  const zones = ZONES.map((zone, index) => ({
    ...zone, count: index < 4 ? 1 : 0, score: 100 - index, peakHour: null
  }));
  const route = computePatrol({ station, zones, stopCount: 10 });
  assert.equal(route.stops.length, 4);
  assert.ok(route.totalKm >= 0);
});

test('largest-remainder allocation preserves the officer total', () => {
  const zones = ZONES.slice(0, 4).map((zone, index) => ({
    ...zone, count: 1, score: [40, 30, 20, 10][index], peakHour: null
  }));
  const result = computeAllocation({ zones, officers: 12 });
  assert.equal(result.zones.reduce((sum, zone) => sum + zone.officers, 0), 12);
  assert.ok(result.zones.every(zone => Number.isInteger(zone.officers) && zone.officers >= 0));
});

test('research normalization reaches 100 for a non-empty score set', () => {
  const normalized = normalize({ a: 2, b: 1, c: 0 });
  assert.equal(normalized.a, 100);
  assert.equal(normalized.c, 0);
});

test('research models return the same zone keys', () => {
  const zones = ZONES.map(z => z.name);
  const incidents = [
    { zone: zones[0], severity: 2, ageDays: 1 },
    { zone: zones[1], severity: 3, ageDays: 10 },
  ];
  const models = scoreModels(incidents, zones);
  assert.deepEqual(Object.keys(models['frequency-only']), zones);
  assert.deepEqual(Object.keys(models['current-severity-recency']), zones);
});
