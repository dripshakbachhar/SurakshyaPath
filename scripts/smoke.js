#!/usr/bin/env node

const { spawn } = require('node:child_process');
const net = require('node:net');

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
    if (!before.incidents.every(incident => incident.dataStatus === 'SYNTHETIC')) throw new Error('Dashboard contains unlabelled synthetic records.');
    if (before.zones.reduce((sum, zone) => sum + zone.count, 0) !== before.incidents.length) throw new Error('Risk zone counts are disconnected from dashboard incidents.');
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
    if (after.incidents.length !== before.incidents.length + 1) throw new Error('Created incident did not propagate to dashboard state.');
    if (after.dataQuality.recordsAccepted !== after.incidents.length) throw new Error('Created incident did not pass the data-quality gate.');
    if (!after.intelligence || after.intelligence.dataCoverage.analyzedRecords < 1) throw new Error('Created incident did not propagate to intelligence.');

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
