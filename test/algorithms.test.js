const test = require('node:test');
const assert = require('node:assert/strict');

const { ZONES } = require('../config/zones');
const { INCIDENT_TYPES } = require('../config/incident-types');
const { decayOf, riskBand, calculateZoneRisk, computeZones } = require('../algorithms/risk');
const { haversine, computePatrol } = require('../algorithms/routing');
const { computeAllocation } = require('../algorithms/allocation');
const { normalize, scoreModels } = require('../algorithms/research-models');
const Temporal = require('../public/js/temporal');
const { buildAnalytics, buildStats } = require('../algorithms/analytics');

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
    { type: 'theft', ts: now, time: Temporal.exactTime(now) },
    { type: 'not-real', ts: now, time: Temporal.exactTime(now) },
  ];
  assert.equal(calculateZoneRisk(incidents, INCIDENT_TYPES, now), 5);
});

test('zone computation is deterministic for a fixed snapshot', () => {
  const now = Date.UTC(2026, 8, 30);
  const incidents = [
    { zone: 'thamel', type: 'theft', ts: now - 3600000, time: Temporal.exactTime(now - 3600000) },
    { zone: 'bouddha', type: 'harassment', ts: now - 7200000, time: Temporal.exactTime(now - 7200000) },
  ];
  const a = computeZones({ zones: ZONES, incidents, types: INCIDENT_TYPES, now });
  const b = computeZones({ zones: ZONES, incidents, types: INCIDENT_TYPES, now });
  assert.deepEqual(a, b);
  assert.equal(a.reduce((sum, zone) => sum + zone.count, 0), 2);
});

test('future incidents do not enter a risk snapshot', () => {
  const now = Date.UTC(2026, 8, 30);
  const zones = [{ id: 'test-zone', name: 'Test', np: 'टेस्ट', lat: 27.7, lng: 85.3 }];
  const ts = now + 3600000;
  const incidents = [{ zone: 'test-zone', type: 'theft', ts, time: Temporal.exactTime(ts) }];
  const result = computeZones({ zones, incidents, types: INCIDENT_TYPES, now });
  assert.equal(result[0].count, 0);
  assert.equal(result[0].score, 0);
});

test('peak-hour ties resolve to the earliest UTC hour', () => {
  const now = Date.UTC(2026, 8, 30, 23);
  const zones = [{ id: 'test-zone', name: 'Test', np: 'टेस्ट', lat: 27.7, lng: 85.3 }];
  const incidents = [
    { zone: 'test-zone', type: 'theft', ts: Date.UTC(2026, 8, 30, 10), time: Temporal.exactTime(Date.UTC(2026, 8, 30, 10)) },
    { zone: 'test-zone', type: 'theft', ts: Date.UTC(2026, 8, 30, 22), time: Temporal.exactTime(Date.UTC(2026, 8, 30, 22)) },
  ];
  const result = computeZones({ zones, incidents, types: INCIDENT_TYPES, now });
  assert.equal(result[0].peakHour, 10);
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


test('zero-score allocation still conserves the requested budget', () => {
  const zones = ZONES.slice(0, 3).map(zone => ({
    ...zone, count: 1, score: 0, peakHour: null
  }));
  const result = computeAllocation({ zones, officers: 5 });
  assert.equal(result.zones.reduce((sum, zone) => sum + zone.officers, 0), 5);
  assert.deepEqual(result.zones.map(zone => zone.officers), [2, 2, 1]);
});
test('analytics excludes future incidents and keeps stable UTC calendar-day buckets', () => {
  const now = Date.UTC(2026, 8, 30);
  const analytics = buildAnalytics([
    { type: 'theft', ts: now - 2 * 86400000, time: Temporal.exactTime(now - 2 * 86400000) },
    { type: 'harassment', ts: now - 12 * 60 * 60 * 1000, time: Temporal.exactTime(now - 12 * 60 * 60 * 1000) },
    { type: 'theft', ts: now + 86400000, time: Temporal.exactTime(now + 86400000) },
  ], now);
  assert.equal(analytics.total, 2);
  assert.equal(analytics.last7d, 2);
  assert.equal(analytics.last30d, 2);
  assert.equal(analytics.byType.theft, 1);
  assert.equal(analytics.byType.harassment, 1);
  assert.equal(analytics.byHour[12], 1);
  assert.equal(analytics.byDay.length, 30);
  assert.equal(analytics.byDay[27].date, '2026-09-28');
});

test('night-share stats require exact timestamps and distinguish unavailable from zero', () => {
  const now = Date.UTC(2026, 8, 30, 23);
  const zones = [{ id: 'test-zone', name: 'Test', np: 'टेस्ट', lat: 27.7, lng: 85.3 }];
  const types = { theft: { severity: 5 } };
  const exact = { zone: 'test-zone', type: 'theft', ts: now - 3600000, time: Temporal.exactTime(now - 3600000) };
  const dateTs = Date.UTC(2026, 8, 30);
  const dateOnly = { zone: 'test-zone', type: 'theft', ts: dateTs, time: Temporal.dateTime(dateTs, now) };

  assert.equal(buildStats([exact], now, zones, types).nightShare, 100);
  const unsupported = buildStats([dateOnly], now, zones, types);
  assert.equal(unsupported.nightShare, null);
  assert.equal(unsupported.nightShareStatus, 'UNAVAILABLE');
  assert.equal(unsupported.nightShareExcludedRecords, 1);
});

test('hourly analytics separates unavailable data from zero-valued hours', () => {
  const now = Date.UTC(2026, 8, 30, 23);
  const dateTs = Date.UTC(2026, 8, 30);
  const synthetic = {
    type: 'theft', ts: dateTs, dataStatus: 'SYNTHETIC',
    time: Temporal.dateTime(dateTs, now, 'synthetic')
  };
  const unsupported = buildAnalytics([synthetic], now);
  assert.equal(unsupported.byHour, null);
  assert.equal(unsupported.temporalCoverage.hourlyExcludedRecords, 1);

  const exactTs = now - 3600000;
  const supported = buildAnalytics([
    synthetic,
    { type: 'theft', ts: exactTs, time: Temporal.exactTime(exactTs) }
  ], now);
  assert.equal(supported.byHour[22], 1);
  assert.equal(supported.byHour[0], 0);
  assert.equal(supported.temporalCoverage.hourlyExcludedRecords, 1);
});


test('canonical synthetic dataset feeds the live intelligence contract', () => {
  const { loadSyntheticIncidents } = require('../data/live-incidents');
  const { buildDataQuality, buildIntelligence } = require('../algorithms/intelligence');
  const incidents = loadSyntheticIncidents(Date.UTC(2026, 8, 30));
  assert.equal(incidents.length, 1567);
  assert.ok(incidents.every(incident => incident.dataStatus === 'SYNTHETIC'));
  assert.ok(incidents.every(incident => Number.isFinite(incident.ts)));
  assert.ok(incidents.every(incident => incident.time.precision === 'date' && incident.time.origin === 'synthetic'));
  const quality = buildDataQuality(incidents, ZONES, Date.UTC(2026, 8, 30));
  assert.equal(quality.recordsAccepted, 1567);
  assert.equal(quality.recordsRejected, 0);
  assert.equal(quality.qualityScore, 1);
  const riskZones = computeZones({
    zones: ZONES,
    incidents,
    types: INCIDENT_TYPES,
    days: 30,
    now: Date.UTC(2026, 8, 30)
  });
  const intelligence = buildIntelligence({
    incidents,
    zones: ZONES,
    riskZones,
    types: INCIDENT_TYPES,
    now: Date.UTC(2026, 8, 30)
  });
  assert.equal(intelligence.status, 'SUCCESS');
  assert.equal(intelligence.dataCoverage.analyzedRecords, 1567);
  assert.equal(intelligence.dataCoverage.riskModelZones, ZONES.length);
  assert.equal(intelligence.dataCoverage.hourlyEligibleRecords, 0);
  assert.match(intelligence.patterns[3], /Hourly pattern unavailable/);
  assert.ok(intelligence.riskFactors.some(factor => factor.factor === 'risk_score'));
});

test('duplicate records are rejected by the data quality gate', () => {
  const { buildDataQuality } = require('../algorithms/intelligence');
  const incident = {
    id: 'duplicate-1',
    zone: ZONES[0].id,
    type: 'theft',
    ts: Date.UTC(2026, 8, 30),
    lat: ZONES[0].lat,
    lng: ZONES[0].lng
  };
  const quality = buildDataQuality([incident, { ...incident }], ZONES, Date.UTC(2026, 8, 30));
  assert.equal(quality.recordsRejected, 1);
  assert.equal(quality.duplicates, 1);
});
