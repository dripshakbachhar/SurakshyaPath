'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ImportLimits = require('../public/js/import-limits');
const vercelConfig = require('../vercel.json');

const previousVercel = process.env.VERCEL;
const previousDataDir = process.env.SURAKSHYA_DATA_DIR;
const previousMode = process.env.SURAKSHYA_MODE;
const storageParent = fs.mkdtempSync(path.join(os.tmpdir(), 'surakshyapath-vercel-'));
const storageRoot = path.join(storageParent, 'runtime-data');
process.env.VERCEL = '1';
process.env.SURAKSHYA_DATA_DIR = storageRoot;
process.env.SURAKSHYA_MODE = 'local-research';
const { app } = require('../server');
if (previousVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = previousVercel;
if (previousDataDir === undefined) delete process.env.SURAKSHYA_DATA_DIR;
else process.env.SURAKSHYA_DATA_DIR = previousDataDir;
if (previousMode === undefined) delete process.env.SURAKSHYA_MODE;
else process.env.SURAKSHYA_MODE = previousMode;

test('read-only deployment serves research data and rejects persistent writes', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(resolve);
  }));
  t.after(() => fs.rmSync(storageParent, { recursive: true, force: true }));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const healthResponse = await fetch(`${base}/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.operatingMode, 'public-read-only');
  assert.equal(health.mutationPolicy, 'disabled');
  assert.equal(health.storage.configured, false);
  assert.equal(health.storage.readable, false);
  assert.equal(health.storage.mode, 'read-only');
  assert.equal(health.storage.writable, false);
  const vercelHeaders = vercelConfig.headers.find(rule => rule.source === '/(.*)').headers;
  const configuredCsp = vercelHeaders.find(header => header.key === 'Content-Security-Policy').value;
  assert.equal(healthResponse.headers.get('content-security-policy'), configuredCsp);
  assert.equal(healthResponse.headers.get('cache-control'), 'no-store');

  const workspacePage = await fetch(base.replace(/\/api$/, '') + '/workspace.html');
  assert.equal(workspacePage.status, 200);
  assert.match(workspacePage.headers.get('content-security-policy'), /object-src 'none'/);
  assert.match(await workspacePage.text(), /manifest\.webmanifest/);

  const offlinePage = await fetch(base.replace(/\/api$/, '') + '/offline.html');
  assert.equal(offlinePage.status, 200);
  assert.match(await offlinePage.text(), /does not cache API responses or imported data/);

  const malformedJson = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name":'
  });
  assert.equal(malformedJson.status, 400);
  assert.match(malformedJson.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const dashboardResponse = await fetch(`${base}/dashboard`);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboard.dataset.mode, 'demo');
  assert.ok(dashboard.incidents.length > 0);

  const diagnosticsResponse = await fetch(`${base}/diagnostics`);
  const diagnostics = await diagnosticsResponse.json();
  assert.equal(diagnostics.pipeline.storage, false);
  assert.equal(diagnostics.storage.writable, false);

  const researchResponse = await fetch(`${base}/research/summary`);
  assert.equal(researchResponse.status, 200);
  const research = await researchResponse.json();
  assert.equal(research.sourceDataset.id, 'canonical-synthetic-benchmark-v1');
  assert.equal(research.sourceDataset.recordCount, 1567);
  assert.equal(research.sourceDataset.zoneCount, 10);
  assert.equal(research.sourceDataset.temporalCoverage.hourlyAnalysis.status, 'UNAVAILABLE');
  assert.equal(research.modelConfiguration.referenceModel, 'frequency-only');
  assert.ok(research.warnings.some(warning => /not validated real-world operational instructions/i.test(warning)));

  const writes = [
    ['/incidents', { lat: 27.7, lng: 85.3, type: 'theft' }],
    ['/dataset/import', {}],
    ['/dataset/use-imported', {}],
    ['/dataset/use-demo', {}]
  ];
  for (const [endpoint, body] of writes) {
    const response = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    assert.equal(response.status, 503, `${endpoint} should be unavailable without persistent storage`);
    assert.match(result.error, /read-only|disabled/);
  }

  const oversized = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(ImportLimits.MAX_IMPORT_PAYLOAD_BYTES) })
  });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /4 MiB/);
  assert.match(oversized.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(fs.existsSync(storageRoot), false);
});
