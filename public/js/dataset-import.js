'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DatasetImport = api;
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function parseCsv(text) {
    const source = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) quoted = true;
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

  function parseTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value < 100000000000 ? value * 1000 : value;
    const text = String(value ?? '').trim();
    if (/^\d{10}$/.test(text)) return Number(text) * 1000;
    if (/^\d{13}$/.test(text)) return Number(text);
    return Date.parse(text);
  }

  function parseNumber(value) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return NaN;
    return Number(value);
  }

  function mapRecords(records, mapping) {
    const errors = [];
    const mapped = records.map((record, index) => {
      const zone = String(record[mapping.zone] ?? '').trim();
      const category = String(record[mapping.category] ?? '').trim();
      const lat = parseNumber(record[mapping.latitude]);
      const lng = parseNumber(record[mapping.longitude]);
      const ts = parseTimestamp(record[mapping.date]);
      const rawSeverity = mapping.severity ? String(record[mapping.severity] ?? '').trim() : '';
      const severity = rawSeverity === '' ? 1 : Number(rawSeverity);
      const issues = [];
      if (!zone) issues.push('zone is empty');
      if (!category) issues.push('category is empty');
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) issues.push('latitude must be between -90 and 90');
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) issues.push('longitude must be between -180 and 180');
      if (!Number.isFinite(ts) || ts < 0 || ts > Date.now()) issues.push('date is invalid or in the future');
      if (!Number.isFinite(severity) || severity < 0 || severity > 10) issues.push('severity must be between 0 and 10');
      if (issues.length) {
        if (errors.length < 5) errors.push(`Row ${index + 1}: ${issues.join(', ')}.`);
        return null;
      }
      return { zone, category, lat, lng, ts, severity };
    });
    if (errors.length) throw new Error(errors.join(' '));
    return mapped;
  }

  return { parseCsv, parseJson, mapRecords };
}));
