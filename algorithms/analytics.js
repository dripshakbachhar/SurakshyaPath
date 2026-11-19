'use strict';

const Temporal = require('../public/js/temporal');
const { computeZones } = require('./risk');

function buildAnalytics(source, now = Date.now()) {
  const records = Array.isArray(source) ? source : [];
  const datedRecords = records.filter(record => Number.isFinite(Number(record?.ts)) && Number(record.ts) <= now);
  const futureRecords = records.filter(record => Number.isFinite(Number(record?.ts)) && Number(record.ts) > now).length;
  const missingTimestampRecords = records.length - datedRecords.length - futureRecords;
  const last24h = Temporal.countInWindow(records, now - Temporal.DAY_MS, now, now);
  const last7d = Temporal.countInWindow(records, now - 7 * Temporal.DAY_MS, now, now);
  const last30d = Temporal.countInWindow(records, now - 30 * Temporal.DAY_MS, now, now);
  const byType = {};
  const hourlyCounts = Array(24).fill(0);
  const byDay = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Temporal.utcDayStart(now) - (29 - index) * Temporal.DAY_MS).toISOString().slice(0, 10);
    return { day: index + 1, date, count: 0 };
  });
  const dayIndexes = new Map(byDay.map((entry, index) => [entry.date, index]));
  let hourlyRecords = 0;
  let dailyExcludedRecords = 0;
  const hourlyExcludedByPrecision = {};

  for (const record of records) {
    if (Temporal.eventHour(record, now) !== null) {
      hourlyRecords++;
    } else {
      const time = Temporal.resolveTime(record, now);
      const key = `${time.origin}:${time.precision}`;
      hourlyExcludedByPrecision[key] = (hourlyExcludedByPrecision[key] || 0) + 1;
    }
  }

  for (const record of datedRecords) {
    byType[record.type] = (byType[record.type] || 0) + 1;
    const hour = Temporal.eventHour(record, now);
    if (hour !== null) hourlyCounts[hour]++;

    const key = Temporal.dateKey(record, now);
    if (key) {
      if (dayIndexes.has(key)) byDay[dayIndexes.get(key)].count++;
    } else dailyExcludedRecords++;
  }

  return {
    total: datedRecords.length,
    last24h: last24h.value,
    last7d: last7d.value,
    last30d: last30d.value,
    byType,
    byHour: hourlyRecords ? hourlyCounts : null,
    byDay,
    timezone: Temporal.TIME_ZONE,
    temporalCoverage: {
      precisionByOrigin: Temporal.precisionCounts(records, now),
      hourlyStatus: hourlyRecords ? 'AVAILABLE' : 'UNAVAILABLE',
      hourlyEligibleRecords: hourlyRecords,
      hourlyExcludedRecords: records.length - hourlyRecords,
      hourlyExcludedByPrecision,
      dailyExcludedRecords: dailyExcludedRecords + missingTimestampRecords,
      dailyStatus: dailyExcludedRecords + missingTimestampRecords ? 'PARTIAL' : 'AVAILABLE',
      futureRecords,
      missingTimestampRecords,
      windows: {
        last24h: last24h,
        last7d: last7d,
        last30d: last30d
      }
    }
  };
}

function buildStats(source, now, zones, types) {
  const window = Temporal.countInWindow(source, now - 30 * Temporal.DAY_MS, now, now);
  const windowRecords = source.filter(record =>
    Temporal.classifyWindow(record, now - 30 * Temporal.DAY_MS, now, now) === 'included'
  );
  const riskZones = computeZones({ zones, incidents: source, types, days: 30, now });
  const highRiskZones = riskZones.filter(zone => zone.band === 'high' || zone.band === 'critical').length;
  const exactHours = windowRecords.map(record => Temporal.eventHour(record, now)).filter(hour => hour !== null);
  const night = exactHours.filter(hour => hour >= 20 || hour < 4).length;
  const nightShareAvailable = window.status === 'AVAILABLE' &&
    windowRecords.length > 0 && exactHours.length === windowRecords.length;

  return {
    total: source.length,
    activeZones: new Set(windowRecords.map(record => record.zone)).size,
    highRiskZones,
    nightShare: nightShareAvailable ? Math.round(night / exactHours.length * 100) : null,
    nightShareStatus: nightShareAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
    nightShareExcludedRecords: window.ambiguous + window.unknown + window.future + windowRecords.length - exactHours.length
  };
}

module.exports = { buildAnalytics, buildStats };
