'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SurakshyaTemporal = api;
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const TIME_ZONE = 'UTC';
  const REPORT_WINDOWS = Object.freeze(['now', 'today', 'week', 'month']);
  const PRECISIONS = new Set(['instant', 'date', 'range', 'unknown']);

  function utcDayStart(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function unknownTime(origin = 'unknown') {
    return { precision: 'unknown', origin, start: null, end: null, window: null };
  }

  function isValidTime(time) {
    if (!time || !PRECISIONS.has(time.precision) || typeof time.origin !== 'string') return false;
    if (time.precision === 'unknown') return time.start == null && time.end == null;
    if (!Number.isFinite(time.start) || !Number.isFinite(time.end) || time.start > time.end) return false;
    if (time.precision === 'instant') return time.start === time.end;
    if (time.precision === 'date') {
      return utcDayStart(time.start) === time.start &&
        utcDayStart(time.end) === time.start &&
        time.end < time.start + DAY_MS;
    }
    return true;
  }

  function exactTime(timestamp, origin = 'imported') {
    return { precision: 'instant', origin, start: timestamp, end: timestamp, window: null };
  }

  function dateTime(timestamp, now = Date.now(), origin = 'imported') {
    const start = utcDayStart(timestamp);
    return {
      precision: 'date',
      origin,
      start,
      end: Math.min(start + DAY_MS - 1, now),
      window: null
    };
  }

  function resolveTime(record, now = Date.now()) {
    const ts = Number(record?.ts);
    if (isValidTime(record?.time)) {
      if (record.time.precision !== 'unknown' && (!Number.isFinite(ts) || record.time.start !== ts)) {
        return unknownTime('invalid-metadata');
      }
      return record.time;
    }
    if (record?.time) return unknownTime('invalid-metadata');
    if (!Number.isFinite(ts)) return unknownTime('missing');
    if (record?.dataStatus === 'SYNTHETIC' || record?.sourceType === 'simulation') {
      return dateTime(ts, now, 'synthetic');
    }
    return unknownTime('legacy');
  }

  function normalizeImportedTime(time, timestamp, now = Date.now()) {
    if (!time) return unknownTime('imported');
    if (!isValidTime(time)) {
      throw new Error('Record has invalid timestamp precision metadata.');
    }
    if (time.precision === 'unknown') return unknownTime('imported');
    const normalized = { ...time, origin: 'imported', window: null };
    if (normalized.precision === 'instant') {
      if (normalized.start !== timestamp || normalized.end !== timestamp) {
        throw new Error('Exact timestamp metadata does not match the record timestamp.');
      }
    } else if (normalized.precision === 'date') {
      if (normalized.start !== utcDayStart(normalized.start) ||
          normalized.end > normalized.start + DAY_MS - 1 ||
          normalized.end > now ||
          timestamp !== normalized.start) {
        throw new Error('Date-only timestamp metadata must describe one UTC calendar day.');
      }
    } else if (timestamp !== normalized.start || normalized.end > now) {
      throw new Error('Time-range metadata must use its start as the compatibility timestamp and end no later than import time.');
    }
    if (normalized.start > now) throw new Error('Record has an invalid or future date.');
    return normalized;
  }

  function isFuture(time, now) {
    if (time.precision === 'unknown') return false;
    if (time.precision === 'date') return time.start > utcDayStart(now);
    return time.start > now;
  }

  function classifyWindow(record, start, end, now = Date.now()) {
    const time = resolveTime(record, now);
    const ts = Number(record?.ts);
    if (Number.isFinite(ts) && ts > now) return 'future';
    if (time.precision === 'unknown') return 'unknown';
    if (isFuture(time, now)) return 'future';
    if (time.end < start || time.start > end) return 'outside';
    if (time.start >= start && time.end <= end) return 'included';
    return 'ambiguous';
  }

  function countInWindow(records, start, end, now = Date.now()) {
    const counts = { included: 0, ambiguous: 0, unknown: 0, future: 0, outside: 0 };
    for (const record of records) counts[classifyWindow(record, start, end, now)]++;
    const unavailable = counts.ambiguous + counts.unknown > 0;
    return {
      value: unavailable ? null : counts.included,
      status: unavailable ? 'UNAVAILABLE' : 'AVAILABLE',
      ...counts
    };
  }

  function ageDays(record, now = Date.now()) {
    const time = resolveTime(record, now);
    if (time.precision === 'unknown' || isFuture(time, now)) return null;
    if (time.precision === 'date') return Math.floor((utcDayStart(now) - time.start) / DAY_MS);
    return Math.max(0, (now - time.start) / DAY_MS);
  }

  function eventHour(record, now = Date.now()) {
    const time = resolveTime(record, now);
    if (time.precision !== 'instant' || time.origin === 'synthetic' || isFuture(time, now)) return null;
    return new Date(time.start).getUTCHours();
  }

  function dateKey(record, now = Date.now()) {
    const time = resolveTime(record, now);
    if (time.precision === 'unknown' || isFuture(time, now)) return null;
    if (utcDayStart(time.start) !== utcDayStart(time.end)) return null;
    return new Date(time.start).toISOString().slice(0, 10);
  }

  function precisionCounts(records, now = Date.now()) {
    const result = {};
    for (const record of records) {
      const time = resolveTime(record, now);
      const key = `${time.origin}:${time.precision}`;
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  function communityReportTime(window, now) {
    if (!REPORT_WINDOWS.includes(window)) throw new Error(`Unsupported report time window: ${window}`);
    let start;
    if (window === 'now') start = now - HOUR_MS;
    else if (window === 'today') start = utcDayStart(now);
    else if (window === 'week') start = now - 7 * DAY_MS;
    else if (window === 'month') start = now - 30 * DAY_MS;
    return {
      ts: start,
      reportedAt: now,
      time: { precision: 'range', origin: 'community-report', start, end: now, window }
    };
  }

  return {
    DAY_MS,
    HOUR_MS,
    TIME_ZONE,
    REPORT_WINDOWS,
    utcDayStart,
    isValidTime,
    unknownTime,
    exactTime,
    dateTime,
    resolveTime,
    normalizeImportedTime,
    classifyWindow,
    countInWindow,
    ageDays,
    eventHour,
    dateKey,
    precisionCounts,
    communityReportTime
  };
}));
