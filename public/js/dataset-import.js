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
  function parseCsv(text) {
    const source = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false, closedQuote = false;
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
          row = [];
          if (char === '\r' && source[i + 1] === '\n') i++;
        } else throw new Error('CSV contains characters after a quoted field.');
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === '"') throw new Error('CSV contains a quote in an unquoted field.');
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        row.push(field); field = '';
        if (row.some(value => value.trim() !== '')) rows.push(row);
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
    if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
    const records = rows.map((values, index) => {
      if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
    });
    return { headers, records };
  }

  function parseJson(text) {
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

  function parseTimestamp(value, now = Date.now()) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ts = value < 100000000000 ? value * 1000 : value;
      return ts >= 0 ? { ts, time: Temporal.exactTime(ts, 'imported') } : null;
    }
    const text = String(value ?? '').trim();
    if (/^\d{10}$/.test(text)) {
      const ts = Number(text) * 1000;
      return { ts, time: Temporal.exactTime(ts, 'imported') };
    }
    if (/^\d{13}$/.test(text)) {
      const ts = Number(text);
      return { ts, time: Temporal.exactTime(ts, 'imported') };
    }
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (dateOnly) {
      const [, year, month, day] = dateOnly.map(Number);
      const ts = Date.UTC(year, month - 1, day);
      const parsed = new Date(ts);
      if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
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
    if (!Number.isFinite(ts)) return null;
    return { ts, time: Temporal.exactTime(ts, 'imported') };
  }

  function parseNumber(value) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return NaN;
    return Number(value);
  }

  function mapRecords(records, mapping, now = Date.now()) {
    const errors = [];
    const mapped = records.map((record, index) => {
      const zone = String(record[mapping.zone] ?? '').trim();
      const category = String(record[mapping.category] ?? '').trim();
      const lat = parseNumber(record[mapping.latitude]);
      const lng = parseNumber(record[mapping.longitude]);
      const parsedTime = parseTimestamp(record[mapping.date], now);
      const ts = parsedTime?.ts;
      const rawSeverity = mapping.severity ? String(record[mapping.severity] ?? '').trim() : '';
      const severity = rawSeverity === '' ? 1 : Number(rawSeverity);
      const issues = [];
      if (!zone) issues.push('zone is empty');
      if (!category) issues.push('category is empty');
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) issues.push('latitude must be between -90 and 90');
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) issues.push('longitude must be between -180 and 180');
      if (!parsedTime || ts > now || parsedTime.time.start > Temporal.utcDayStart(now)) {
        issues.push('date/time is missing, invalid, or in the future');
      }
      if (!Number.isFinite(severity) || severity < 0 || severity > 10) issues.push('severity must be between 0 and 10');
      if (issues.length) {
        if (errors.length < 5) errors.push(`Row ${index + 1}: ${issues.join(', ')}.`);
        return null;
      }
      return { zone, category, lat, lng, ts, time: parsedTime.time, severity };
    });
    if (errors.length) throw new Error(errors.join(' '));
    return mapped;
  }

  return { parseCsv, parseJson, parseTimestamp, mapRecords };
}));
