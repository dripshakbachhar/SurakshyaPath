'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const Temporal = require('../public/js/temporal');

const NOW = Date.UTC(2026, 8, 30, 12);

test('temporal records distinguish exact, date-only, synthetic, and unknown times', () => {
  const exact = { ts: NOW - 1000, time: Temporal.exactTime(NOW - 1000) };
  const date = { ts: Date.UTC(2026, 8, 29), time: Temporal.dateTime(Date.UTC(2026, 8, 29), NOW) };
  const synthetic = {
    ts: Date.UTC(2026, 8, 28, 10),
    dataStatus: 'SYNTHETIC',
    sourceType: 'simulation'
  };

  assert.equal(Temporal.resolveTime(exact, NOW).precision, 'instant');
  assert.equal(Temporal.resolveTime(date, NOW).precision, 'date');
  assert.equal(Temporal.resolveTime(synthetic, NOW).precision, 'date');
  assert.equal(Temporal.resolveTime(synthetic, NOW).origin, 'synthetic');
  assert.equal(Temporal.resolveTime({ ts: NOW - 1 }, NOW).precision, 'unknown');
  assert.equal(Temporal.resolveTime({}, NOW).precision, 'unknown');
  assert.equal(Temporal.resolveTime({ ts: NOW, time: { precision: 'instant' } }, NOW).origin, 'invalid-metadata');
  const recent = NOW - 36 * Temporal.HOUR_MS;
  assert.equal(Temporal.ageDays({ ts: recent, time: Temporal.exactTime(recent) }, NOW), 1.5);
  assert.equal(Temporal.ageDays({ ts: NOW - 1 }, NOW), null);
});

test('UTC calendar boundaries and date precision control time-window support', () => {
  const dateStart = Date.UTC(2026, 8, 30);
  const now = Date.UTC(2026, 8, 30, 12);
  const today = { ts: dateStart, time: Temporal.dateTime(dateStart, now) };
  const yesterday = { ts: Date.UTC(2026, 8, 29), time: Temporal.dateTime(Date.UTC(2026, 8, 29), now) };
  const window = Temporal.countInWindow([today], now - Temporal.DAY_MS, now, now);
  const boundary = Temporal.countInWindow([yesterday], now - Temporal.DAY_MS, now, now);

  assert.equal(Temporal.utcDayStart(now), dateStart);
  assert.equal(window.value, 1);
  assert.equal(window.status, 'AVAILABLE');
  assert.equal(boundary.value, null);
  assert.equal(boundary.ambiguous, 1);
  assert.equal(Temporal.ageDays(yesterday, now), 1);
});

test('event-hour metrics require exact non-synthetic timestamps', () => {
  const instant = Date.UTC(2026, 8, 30, 23);
  const exact = { ts: instant, time: Temporal.exactTime(instant) };
  const synthetic = { ts: instant, time: Temporal.exactTime(instant, 'synthetic') };
  const dateOnly = { ts: Date.UTC(2026, 8, 30), time: Temporal.dateTime(Date.UTC(2026, 8, 30), NOW) };

  assert.equal(Temporal.eventHour(exact, instant), 23);
  assert.equal(Temporal.eventHour(synthetic, instant), null);
  assert.equal(Temporal.eventHour(dateOnly, NOW), null);
});

test('all report windows create explicit approximate UTC intervals', () => {
  const expected = {
    now: NOW - Temporal.HOUR_MS,
    today: Date.UTC(2026, 8, 30),
    week: NOW - 7 * Temporal.DAY_MS,
    month: NOW - 30 * Temporal.DAY_MS
  };
  for (const [window, start] of Object.entries(expected)) {
    const report = Temporal.communityReportTime(window, NOW);
    assert.equal(report.ts, start);
    assert.equal(report.reportedAt, NOW);
    assert.equal(report.time.precision, 'range');
    assert.equal(report.time.origin, 'community-report');
    assert.equal(report.time.start, start);
    assert.equal(report.time.end, NOW);
    assert.equal(report.time.window, window);
  }
  assert.throws(() => Temporal.communityReportTime('year', NOW), /Unsupported report time window/);
});

test('known future records are excluded and unknown times make window counts unavailable', () => {
  const futureTs = NOW + 1000;
  const future = { ts: futureTs, time: Temporal.exactTime(futureTs) };
  const unknown = { ts: NOW - 1000 };
  const futureOnly = Temporal.countInWindow([future], NOW - Temporal.DAY_MS, NOW, NOW);
  const withUnknown = Temporal.countInWindow([
    { ts: NOW - 1000, time: Temporal.exactTime(NOW - 1000) },
    unknown
  ], NOW - Temporal.DAY_MS, NOW, NOW);

  assert.equal(futureOnly.value, 0);
  assert.equal(futureOnly.future, 1);
  assert.equal(withUnknown.value, null);
  assert.equal(withUnknown.unknown, 1);
});

test('UTC hour and calendar-date results are invariant across process timezones', () => {
  const modulePath = JSON.stringify(require.resolve('../public/js/temporal'));
  const script = `const t=require(${modulePath});const ts=Date.UTC(2026,8,30,23);const r={ts,time:t.exactTime(ts)};console.log(JSON.stringify([t.eventHour(r,ts),t.utcDayStart(ts),t.dateKey(r,ts)]));`;
  const output = ['Pacific/Honolulu', 'Asia/Kathmandu'].map(timezone => execFileSync(
    process.execPath,
    ['-e', script],
    { encoding: 'utf8', env: { ...process.env, TZ: timezone } }
  ).trim());
  assert.equal(output[0], output[1]);
  assert.deepEqual(JSON.parse(output[0]), [23, Date.UTC(2026, 8, 30), '2026-09-30']);
});
