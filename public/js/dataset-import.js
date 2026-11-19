'use strict';

(function (root, factory) {
  const temporal = typeof module === 'object' && module.exports
    ? require('./temporal')
    : root.SurakshyaTemporal;
  const api = factory(temporal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DatasetImport = api;
}(typeof globalThis === 'undefined' ? this : globalThis, function (Temporal) {
  if (!Temporal) throw new Error('Temporal utilities must load before dataset import.');
  const MAX_RECORDS = 50000;
  const MAX_ZONES = 100;
  const MAX_CATEGORIES = 100;
  const MAX_IDENTIFIER_LENGTH = 200;
  const MAX_ISSUE_SAMPLES = 10;
  const UNKNOWN_TIME_VALUES = new Set(['unknown', 'n/a', 'na', 'not recorded', 'not available']);
  const REQUIRED_MAPPING_FIELDS = ['zone', 'category', 'latitude', 'longitude'];

  function parseCsv(text) {
    const source = String(text).replace(/^\uFEFF/, '');
    if (!source.trim()) throw new Error('CSV file is empty.');
    const rows = [];
    let row = [], field = '', quoted = false, closedQuote = false, blankRowsSkipped = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; closedQuote = true; }
        else field += char;
      } else if (closedQuote) {
        if (char === ',') { row.push(field); field = ''; closedQuote = false; }
        else if (char === '\n' || char === '\r') {
          row.push(field); field = ''; closedQuote = false;
          if (row.some(value => value.trim() !== '')) rows.push(row);
          else blankRowsSkipped++;
          row = [];
          if (char === '\r' && source[i + 1] === '\n') i++;
        } else throw new Error('CSV contains characters after a quoted field.');
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === '"') throw new Error('CSV contains a quote in an unquoted field.');
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        row.push(field); field = '';
        if (row.some(value => value.trim() !== '')) rows.push(row);
        else blankRowsSkipped++;
        row = [];
        if (char === '\r' && source[i + 1] === '\n') i++;
      } else field += char;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted field.');
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
    if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.');

    const headers = rows.shift().map(header => header.trim());
    if (headers.some(header => !header)) throw new Error('CSV headers cannot be empty.');
    if (new Set(headers.map(header => header.toLocaleLowerCase())).size !== headers.length) {
      throw new Error('CSV headers must be unique, ignoring letter case.');
    }
    const records = rows.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    });
    return { headers, records, blankRowsSkipped };
  }

  function parseJson(text) {
    if (!String(text).trim()) throw new Error('JSON file is empty.');
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('JSON file could not be parsed.'); }
    const records = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
    if (!records || !records.length) throw new Error('JSON must be a non-empty array of records or an object with a records array.');
    if (records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
      throw new Error('Every JSON record must be an object.');
    }
    const headers = [...new Set(records.flatMap(record => Object.keys(record)))];
    if (!headers.length) throw new Error('JSON records do not contain any fields.');
    return { headers, records };
  }

  function parsePointTimestamp(value, now = Date.now()) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ts = value < 100000000000 ? value * 1000 : value;
      return ts >= 0 && Number.isFinite(new Date(ts).getTime())
        ? { ts, time: Temporal.exactTime(ts, 'imported') }
        : null;
    }
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (/^\d{10}$/.test(text)) {
      const ts = Number(text) * 1000;
      return Number.isFinite(new Date(ts).getTime()) ? { ts, time: Temporal.exactTime(ts, 'imported') } : null;
    }
    if (/^\d{13}$/.test(text)) {
      const ts = Number(text);
      return Number.isFinite(new Date(ts).getTime()) ? { ts, time: Temporal.exactTime(ts, 'imported') } : null;
    }
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (dateOnly) {
      const [, year, month, day] = dateOnly.map(Number);
      const ts = Date.UTC(year, month - 1, day);
      const parsed = new Date(ts);
      if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
      if (ts > now) return null;
      return { ts, time: Temporal.dateTime(ts, now, 'imported') };
    }

    const dateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
    if (!dateTime) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = dateTime;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    const calendarDay = new Date(Date.UTC(year, month - 1, day));
    if (calendarDay.getUTCFullYear() !== year || calendarDay.getUTCMonth() !== month - 1 ||
        calendarDay.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
    const isoText = text.includes(' ') ? text.replace(' ', 'T') : text;
    const ts = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoText) ? isoText : `${isoText}Z`);
    if (!Number.isFinite(ts) || !Number.isFinite(new Date(ts).getTime())) return null;
    return { ts, time: Temporal.exactTime(ts, 'imported') };
  }

  function parseTimestamp(value, now = Date.now()) {
    if (value === null || value === undefined ||
        (typeof value === 'string' && (!value.trim() || UNKNOWN_TIME_VALUES.has(value.trim().toLowerCase())))) {
      return { ts: null, time: Temporal.unknownTime('imported') };
    }
    if (typeof value === 'string' && value.includes('/')) {
      const endpoints = value.split('/');
      if (endpoints.length !== 2) return null;
      const start = parsePointTimestamp(endpoints[0], now);
      const end = parsePointTimestamp(endpoints[1], now);
      if (!start || !end || end.time.end < start.time.start || end.time.end > now) return null;
      return {
        ts: start.time.start,
        time: { precision: 'range', origin: 'imported', start: start.time.start, end: end.time.end, window: null }
      };
    }
    return parsePointTimestamp(value, now);
  }

  function parseNumber(value) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return NaN;
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    return Number(value);
  }

  function parseRecordTime(record, mapping, now) {
    const dateColumn = typeof mapping.date === 'string' && mapping.date.length > 0;
    const rawValue = dateColumn ? record[mapping.date] : undefined;
    const isBlank = rawValue === null || rawValue === undefined ||
      (typeof rawValue === 'string' && !rawValue.trim());
    if (isBlank && record.time !== undefined) {
      const timestamp = record.ts === null || record.ts === undefined ? record.time.start : parseNumber(record.ts);
      try {
        const time = Temporal.normalizeImportedTime(record.time, timestamp, now);
        return { ts: time.precision === 'unknown' ? null : time.start, time };
      } catch {
        return null;
      }
    }
    return parseTimestamp(rawValue, now);
  }

  function sourceIdentifier(record, mapping) {
    if (typeof mapping.identifier !== 'string' || !mapping.identifier) return { value: null, invalid: false };
    const raw = record[mapping.identifier];
    if (raw === null || raw === undefined || raw === '') return { value: null, invalid: false };
    if ((typeof raw !== 'string' && typeof raw !== 'number') || !Number.isFinite(typeof raw === 'number' ? raw : 0)) {
      return { value: null, invalid: true };
    }
    const value = String(raw).trim();
    if (!value) return { value: null, invalid: false };
    return { value, invalid: value.length > MAX_IDENTIFIER_LENGTH };
  }

  function summarizeIssues(issues) {
    const issueCounts = {};
    for (const issue of issues) issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
    return { issueCounts, issues: issues.slice(0, MAX_ISSUE_SAMPLES) };
  }

  function validateRecords(records, mapping = {}, now = Date.now()) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) mapping = {};
    const source = Array.isArray(records) ? records : [];
    const rowIssues = new Map();
    const datasetIssues = [];
    const mapped = [];
    const sourceIds = new Map();
    const addRowIssue = (row, code, message) => {
      const list = rowIssues.get(row) || [];
      list.push({ row, code, message });
      rowIssues.set(row, list);
    };
    const addDatasetIssue = (code, message) => datasetIssues.push({ row: null, code, message });
    const invalidSource = !Array.isArray(records);

    if (invalidSource) addDatasetIssue('records-shape', 'Records must be an array.');
    else if (!source.length) addDatasetIssue('empty-records', 'The dataset must contain at least one record.');
    else if (source.length > MAX_RECORDS) addDatasetIssue('record-limit', `Imports are limited to ${MAX_RECORDS.toLocaleString()} records.`);

    if (source.length > MAX_RECORDS || invalidSource) {
      const validation = {
        policy: 'all-or-nothing',
        receivedRecords: source.length,
        validRecords: 0,
        rejectedRecords: source.length,
        acceptedRecords: 0,
        precisionByOrigin: {},
        precisionCounts: {},
        datasetIssues,
        ...summarizeIssues(datasetIssues)
      };
      return { records: [], summary: validation, importable: false };
    }

    const selected = REQUIRED_MAPPING_FIELDS.filter(field =>
      typeof mapping[field] !== 'string' || !mapping[field]
    );
    if (selected.length) {
      const missing = selected.map(field => ({
        zone: 'Zone', category: 'category', latitude: 'latitude', longitude: 'longitude'
      })[field]);
      addDatasetIssue('missing-mapping', `Select a source column for each required field (${missing.join(', ')}).`);
    }

    if (typeof mapping.identifier === 'string' && mapping.identifier) {
      for (const record of source) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
        const id = sourceIdentifier(record, mapping);
        if (id.value) sourceIds.set(id.value, (sourceIds.get(id.value) || 0) + 1);
      }
    }

    source.forEach((record, index) => {
      const row = index + 1;
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        addRowIssue(row, 'record-shape', 'Record must be an object.');
        return;
      }
      const getString = key => typeof mapping[key] === 'string' && mapping[key]
        ? record[mapping[key]]
        : undefined;
      const zoneRaw = getString('zone');
      const categoryRaw = getString('category');
      const zone = typeof zoneRaw === 'string' ? zoneRaw.trim() : '';
      const category = typeof categoryRaw === 'string' ? categoryRaw.trim() : '';
      const lat = parseNumber(getString('latitude'));
      const lng = parseNumber(getString('longitude'));
      const parsedTime = parseRecordTime(record, mapping, now);
      const severityRaw = getString('severity');
      const severityText = typeof severityRaw === 'string' ? severityRaw.trim() : severityRaw;
      const severity = severityText === null || severityText === undefined || severityText === '' ? 1 : parseNumber(severityText);
      const sourceId = sourceIdentifier(record, mapping);

      if (!zone) addRowIssue(row, 'missing-zone', 'Zone is required.');
      else if (zone.length > 100) addRowIssue(row, 'zone-length', 'Zone labels must be 100 characters or fewer.');
      if (!category) addRowIssue(row, 'missing-category', 'Category is required.');
      else if (category.length > 100) addRowIssue(row, 'category-length', 'Category labels must be 100 characters or fewer.');
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) addRowIssue(row, 'invalid-latitude', 'Latitude must be between -90 and 90.');
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) addRowIssue(row, 'invalid-longitude', 'Longitude must be between -180 and 180.');
      if (!parsedTime) addRowIssue(row, 'invalid-timestamp', 'Date/time is invalid, in the future, or has invalid precision metadata.');
      else if (parsedTime.time.precision !== 'unknown' &&
          (parsedTime.time.start > now || parsedTime.time.end > now ||
           (parsedTime.time.precision === 'date' && parsedTime.time.start > Temporal.utcDayStart(now)))) {
        addRowIssue(row, 'future-timestamp', 'Date/time is in the future.');
      }
      if (!Number.isFinite(severity) || severity < 0 || severity > 10) {
        addRowIssue(row, 'invalid-severity', 'Severity must be between 0 and 10.');
      }
      if (sourceId.invalid) addRowIssue(row, 'invalid-identifier', `Identifiers must be at most ${MAX_IDENTIFIER_LENGTH} characters.`);
      if (sourceId.value && sourceIds.get(sourceId.value) > 1) {
        addRowIssue(row, 'duplicate-identifier', 'Source identifiers must be unique.');
      }

      if (!rowIssues.has(row)) {
        mapped.push({
          zone, category, lat, lng,
          ts: parsedTime.ts,
          time: parsedTime.time,
          severity,
          ...(sourceId.value ? { sourceId: sourceId.value } : {})
        });
      }
    });

    const validZoneCount = new Set(mapped.map(record => record.zone.toLocaleLowerCase())).size;
    const validCategoryCount = new Set(mapped.map(record => record.category.toLocaleLowerCase())).size;
    if (validZoneCount > MAX_ZONES) addDatasetIssue('zone-limit', `Imports are limited to ${MAX_ZONES} zones.`);
    if (validCategoryCount > MAX_CATEGORIES) addDatasetIssue('category-limit', `Imports are limited to ${MAX_CATEGORIES} categories.`);

    const issues = [...rowIssues.values()].flat().concat(datasetIssues);
    const rejectedRecords = rowIssues.size;
    const importable = rejectedRecords === 0 && datasetIssues.length === 0 && source.length > 0;
    const precisionByOrigin = Temporal.precisionCounts(mapped, now);
    const precisionCounts = { instant: 0, date: 0, range: 0, unknown: 0 };
    for (const [key, count] of Object.entries(precisionByOrigin)) {
      const precision = key.slice(key.lastIndexOf(':') + 1);
      if (Object.hasOwn(precisionCounts, precision)) precisionCounts[precision] += count;
    }
    const validation = {
      policy: 'all-or-nothing',
      receivedRecords: source.length,
      validRecords: mapped.length,
      rejectedRecords,
      acceptedRecords: importable ? mapped.length : 0,
      precisionByOrigin,
      precisionCounts,
      datasetIssues,
      ...summarizeIssues(issues)
    };
    return { records: mapped, summary: validation, importable };
  }

  function formatValidationSummary(summary) {
    const counts = `${summary.validRecords} valid, ${summary.rejectedRecords} rejected of ${summary.receivedRecords} records.`;
    const outcome = summary.acceptedRecords
      ? `${summary.acceptedRecords} records can be imported.`
      : 'Nothing will be imported because validation is all-or-nothing.';
    const examples = [...new Set(summary.issues.slice(0, 3).map(issue =>
      `${issue.row === null ? '' : `Row ${issue.row}: `}${issue.message}`
    ))];
    return `Validation (all-or-nothing): ${counts} ${outcome}${examples.length ? ` ${examples.join(' ')}` : ''}`;
  }

  function mapRecords(records, mapping, now = Date.now()) {
    const validation = validateRecords(records, mapping, now);
    if (!validation.importable) {
      const error = new Error(formatValidationSummary(validation.summary));
      error.validation = validation.summary;
      throw error;
    }
    return validation.records;
  }

  return {
    MAX_RECORDS,
    MAX_ZONES,
    MAX_CATEGORIES,
    parseCsv,
    parseJson,
    parseTimestamp,
    validateRecords,
    formatValidationSummary,
    mapRecords
  };
}));
