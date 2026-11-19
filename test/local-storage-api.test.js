'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Temporal = require('../public/js/temporal');

const previousVercel = process.env.VERCEL;
const previousDataDir = process.env.SURAKSHYA_DATA_DIR;
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surakshyapath-local-api-'));
delete process.env.VERCEL;
process.env.SURAKSHYA_DATA_DIR = storageRoot;
fs.writeFileSync(
  path.join(storageRoot, 'incidents.json'),
  JSON.stringify(Array.from({ length: 180 }, (_, index) => ({ id: `seed-legacy-${index}` })))
);
const { app } = require('../server');
if (previousVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = previousVercel;
if (previousDataDir === undefined) delete process.env.SURAKSHYA_DATA_DIR;
else process.env.SURAKSHYA_DATA_DIR = previousDataDir;

test('local API persists reports atomically and preserves separate datasets', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise(resolve => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    server.close(resolve);
  }));
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const storedPath = path.join(storageRoot, 'incidents.json');

  const beforeReport = await fetch(`${base}/dashboard`);
  const initialDashboard = await beforeReport.json();
  assert.equal(beforeReport.status, 200);
  assert.equal(initialDashboard.incidents.length, 1567);
  assert.equal(JSON.parse(fs.readFileSync(storedPath, 'utf8')).length, 180);
  const diagnosticsResponse = await fetch(`${base}/diagnostics`);
  const diagnostics = await diagnosticsResponse.json();
  assert.equal(diagnostics.pipeline.storage, true);
  assert.equal(diagnostics.storage.mode, 'local-json');

  const reportResponse = await fetch(`${base}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 27.715, lng: 85.312, type: 'theft', when: 'now' })
  });
  const report = await reportResponse.json();
  assert.equal(reportResponse.status, 201);

  const persistedIncidents = JSON.parse(fs.readFileSync(storedPath, 'utf8'));
  assert.equal(persistedIncidents.length, 1568);
  assert.ok(persistedIncidents.some(incident => incident.id === report.id));

  const timestamp = Date.now() - 1000;
  const importResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Isolated test dataset',
      records: [{
        zone: 'Test Zone',
        category: 'Observation',
        lat: 27.7,
        lng: 85.3,
        ts: timestamp,
        time: Temporal.exactTime(timestamp, 'imported'),
        severity: 1
      }]
    })
  });
  assert.equal(importResponse.status, 201);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'imported');
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8')).records.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(storedPath, 'utf8')).length, 1568);

  const savedImportResponse = await fetch(`${base}/dataset/use-imported`, { method: 'POST' });
  assert.equal(savedImportResponse.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'imported');

  const switchResponse = await fetch(`${base}/dataset/use-demo`, { method: 'POST' });
  assert.equal(switchResponse.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'demo');
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8')).records.length, 1);
});
