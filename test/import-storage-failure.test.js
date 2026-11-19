'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Temporal = require('../public/js/temporal');

const previousVercel = process.env.VERCEL;
const previousDataDir = process.env.SURAKSHYA_DATA_DIR;
const previousMode = process.env.SURAKSHYA_MODE;
const previousNodeEnv = process.env.NODE_ENV;
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surakshyapath-import-failure-'));
delete process.env.VERCEL;
process.env.SURAKSHYA_DATA_DIR = storageRoot;
process.env.SURAKSHYA_MODE = 'local-research';
delete process.env.NODE_ENV;
const { app } = require('../server');
if (previousVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = previousVercel;
if (previousDataDir === undefined) delete process.env.SURAKSHYA_DATA_DIR;
else process.env.SURAKSHYA_DATA_DIR = previousDataDir;
if (previousMode === undefined) delete process.env.SURAKSHYA_MODE;
else process.env.SURAKSHYA_MODE = previousMode;
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;

test('failed imported-dataset persistence returns an error without activating unsaved data', async t => {
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

  const timestamp = Date.now() - 1000;
  const originalRename = fs.renameSync;
  fs.renameSync = function (source, target) {
    if (String(target).endsWith('imported-dataset.json')) {
      const error = new Error('simulated import storage failure');
      error.code = 'ENOSPC';
      throw error;
    }
    return originalRename.apply(this, arguments);
  };
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${server.address().port}/api/dataset/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Must not become active',
        records: [{
          zone: 'Test',
          category: 'Observation',
          lat: 27.7,
          lng: 85.3,
          ts: timestamp,
          time: Temporal.exactTime(timestamp, 'imported'),
          severity: 1
        }]
      })
    });
  } finally {
    fs.renameSync = originalRename;
  }

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /could not be saved/i);
  const dataset = await (await fetch(`http://127.0.0.1:${server.address().port}/api/dataset`)).json();
  assert.equal(dataset.mode, 'demo');
  assert.equal(dataset.id, 'synthetic-dashboard-v1');
  assert.equal(fs.existsSync(path.join(storageRoot, 'imported-dataset.json')), false);
  assert.equal(fs.existsSync(path.join(storageRoot, 'active-dataset.json')), false);
  const health = await (await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).json();
  assert.equal(health.storage.writable, false);
});
