const test = require('node:test');
const assert = require('node:assert/strict');

const { ZONES } = require('../config/zones');
const { INCIDENT_TYPES } = require('../config/incident-types');
const { hasEventHourPrecision, getEventHour, EVENT_TIME_ZONE, precisionForReportWindow } = require('../algorithms/temporal');
const { computeZones } = require('../algorithms/risk');
const { computeAllocation } = require('../algorithms/allocation');
const { buildIntelligence } = require('../algorithms/intelligence');
const { buildAnalytics, buildStats } = require('../server');

function syntheticAgeOnly(now) {
  const zone = ZONES[0];
  return {
    id: 'synthetic-age-only',
    zone: zone.id,
    type: 'theft',
    severity: INCIDENT_TYPES.theft.severity,
    ts: now,
    ageDays: 0,
    eventTimePrecision: 'DAY',
    timestampKind: 'SYNTHETIC_RECENCY_ANCHOR',
    sourceType: 'simulation',
    dataStatus: 'SYNTHETIC',
    lat: zone.lat,
    lng: zone.lng
  };
}

test('age-only synthetic records cannot be treated as event-hour observations', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  const incident = syntheticAgeOnly(now);

  assert.equal(hasEventHourPrecision(incident), false);
  assert.equal(hasEventHourPrecision({ ...incident, eventTimePrecision: 'MINUTE' }), false);

  const zones = computeZones({
    zones: ZONES,
    incidents: [incident],
    types: INCIDENT_TYPES,
    days: 30,
    now
  });
  const zone = zones.find(item => item.id === incident.zone);

  assert.equal(zone.count, 1);
  assert.equal(zone.peakHour, null);
  assert.equal(zone.eventHourRecordCount, 0);
  assert.equal(zone.last24h, null);

  const allocation = computeAllocation({
    zones: [{ ...zone, score: 50 }],
    officers: 3
  });
  assert.equal(allocation.zones[0].window, null);
  assert.equal(allocation.zones[0].windowStatus, 'UNAVAILABLE_EVENT_TIME_PRECISION');
});

test('dashboard analytics marks hour and last-24-hour metrics unavailable for age-only data', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  const incident = syntheticAgeOnly(now);

  const analytics = buildAnalytics([incident], now);
  assert.equal(analytics.last24h, null);
  assert.equal(analytics.byHour, null);
  assert.equal(analytics.temporalPrecision.eventHourAvailable, false);
  assert.equal(analytics.temporalPrecision.eventHourRecordCount, 0);
  assert.equal(analytics.last7d, 1);
  assert.equal(analytics.last30d, 1);
  assert.equal(analytics.byDay[29].count, 1);

  const stats = buildStats([incident], now);
  assert.equal(stats.nightShare, null);
  assert.equal(stats.eventHourAvailable, false);
  assert.equal(stats.nightShareRecordCount, 0);
});

test('intelligence does not describe inherited snapshot hours as observed patterns', () => {
  const now = Date.UTC(2026, 8, 30, 12);
  const incident = syntheticAgeOnly(now);
  const intelligence = buildIntelligence({
    incidents: [incident],
    zones: ZONES,
    riskZones: [],
    types: INCIDENT_TYPES,
    now
  });

  assert.equal(intelligence.temporalPrecision.eventHourAvailable, false);
  assert.equal(intelligence.temporalPrecision.eventHourRecordCount, 0);
  assert.ok(intelligence.patterns.some(pattern => pattern.includes('minute-precision event times')));
  assert.ok(intelligence.limitations.some(limitation => limitation.includes('do not contain event-hour precision')));
  assert.ok(!intelligence.patterns.some(pattern => pattern.includes('Peak observed hour')));
});

test('minute-precision timestamps use the explicit Kathmandu timezone', () => {
  const timestamp = Date.UTC(2026, 8, 30, 17, 0);
  const now = timestamp + 1000;
  const zone = ZONES[0];
  const incident = {
    id: 'minute-precision-report',
    zone: zone.id,
    type: 'theft',
    severity: INCIDENT_TYPES.theft.severity,
    ts: timestamp,
    eventTimePrecision: 'MINUTE',
    sourceType: 'community-report',
    dataStatus: 'LIVE',
    lat: zone.lat,
    lng: zone.lng
  };

  assert.equal(EVENT_TIME_ZONE, 'Asia/Kathmandu');
  assert.equal(hasEventHourPrecision(incident), true);
  assert.equal(getEventHour(timestamp), 22);

  const result = computeZones({
    zones: ZONES,
    incidents: [incident],
    types: INCIDENT_TYPES,
    days: 30,
    now
  });
  const computed = result.find(item => item.id === zone.id);
  assert.equal(computed.peakHour, 22);
  assert.equal(computed.eventHourRecordCount, 1);
  assert.equal(computed.last24h, 1);
});

test('coarse community-report windows do not qualify for event-hour analysis', () => {
  const base = {
    ts: Date.UTC(2026, 8, 30, 12),
    sourceType: 'community-report',
    dataStatus: 'LIVE'
  };

  assert.equal(hasEventHourPrecision({ ...base, eventTimePrecision: 'MINUTE' }), true);
  assert.equal(hasEventHourPrecision({ ...base, eventTimePrecision: 'DAY' }), false);
  assert.equal(hasEventHourPrecision({ ...base, eventTimePrecision: 'WEEK' }), false);
  assert.equal(hasEventHourPrecision({ ...base, eventTimePrecision: 'UNKNOWN' }), false);
  assert.equal(hasEventHourPrecision({ ...base, eventTimePrecision: undefined }), false);
  assert.equal(precisionForReportWindow(undefined), 'MINUTE');
  assert.equal(precisionForReportWindow('now'), 'MINUTE');
  assert.equal(precisionForReportWindow('today'), 'DAY');
  assert.equal(precisionForReportWindow('week'), 'WEEK');
  assert.equal(precisionForReportWindow('month'), 'MONTH');
});
