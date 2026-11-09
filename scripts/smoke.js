#!/usr/bin/env node

const { spawn } = require('node:child_process');
const net = require('node:net');
const { ZONES } = require('../config/zones');
const { INCIDENT_TYPES } = require('../config/incident-types');
const { computeZones } = require('../algorithms/risk');
const { hasEventHourPrecision } = require('../algorithms/temporal');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base, child) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (child.exitCode !== null) throw new Error('Server exited before becoming healthy.');
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for /api/health.');
}

async function json(base, path, options) {
  const response = await fetch(base + path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  const port = await findFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForHealth(base, child);

    const before = await json(base, '/api/dashboard');
    const intelligence = await json(base, '/api/intelligence');
    const quality = await json(base, '/api/data-quality');
    if (!Array.isArray(before.incidents) || before.incidents.length < 1500) throw new Error('Dashboard is not connected to the canonical synthetic dataset.');
    if (before.incidents.filter(incident => incident.dataStatus === 'SYNTHETIC').length < 1500) throw new Error('Canonical synthetic records are not connected to the dashboard.');
    if (before.zones.reduce((sum, zone) => sum + zone.count, 0) !== before.incidents.length) throw new Error('Risk zone counts are disconnected from dashboard incidents.');
    const syntheticOnly = before.incidents.filter(incident => incident.dataStatus === 'SYNTHETIC');
    if (!syntheticOnly.every(incident => incident.eventTimePrecision === 'DAY' && incident.timestampKind === 'SYNTHETIC_RECENCY_ANCHOR')) throw new Error('Canonical synthetic records are missing their day-level temporal provenance.');
    if (syntheticOnly.some(hasEventHourPrecision)) throw new Error('Age-only synthetic records were classified as event-hour observations.');
    const syntheticZones = computeZones({ zones: ZONES, incidents: syntheticOnly, types: INCIDENT_TYPES, days: 30, now: Date.now() });
    if (!syntheticZones.every(zone => zone.peakHour === null && zone.last24h === null)) throw new Error('Age-only synthetic records produced zone-level event-hour metrics.');
    if (intelligence.status !== 'SUCCESS' || !intelligence.modelVersion) throw new Error('Intelligence pipeline did not reach SUCCESS.');
    if (!intelligence.riskFactors?.some(factor => factor.factor === 'risk_score')) throw new Error('Intelligence is not consuming risk-model output.');
    if (quality.recordsAccepted < 1) throw new Error('Data-quality pipeline accepted no records.');

    const created = await json(base, '/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 27.715, lng: 85.312, type: 'theft', when: 'now', note: 'Automated smoke-test record.' })
    });

    const after = await json(base, '/api/dashboard');
    if (!created.id || created.dataStatus !== 'LIVE') throw new Error('Incident creation returned an incomplete live-data record.');
    if (created.eventTimePrecision !== 'MINUTE' || !hasEventHourPrecision(created)) throw new Error('A just-now community report was not marked as minute-precision.');
    if (after.incidents.length !== before.incidents.length + 1) throw new Error('Created incident did not propagate to dashboard state.');
    if (after.dataQuality.recordsAccepted !== after.incidents.length) throw new Error('Created incident did not pass the data-quality gate.');
    if (!after.intelligence || after.intelligence.dataCoverage.analyzedRecords < 1) throw new Error('Created incident did not propagate to intelligence.');
    if (after.analytics.temporalPrecision?.eventHourAvailable !== true || after.analytics.byHour === null) throw new Error('Minute-precision community report did not enable the timestamped-subset hour metrics.');

    console.log('Smoke test passed: health → data → intelligence → create incident → dashboard propagation.');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    if (child.exitCode && child.exitCode !== 0) console.error(stderr);
  }
})().catch(error => {
  console.error('Smoke test failed:', error.message);
  process.exitCode = 1;
});
