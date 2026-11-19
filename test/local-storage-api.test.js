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
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surakshyapath-local-api-'));
delete process.env.VERCEL;
process.env.SURAKSHYA_DATA_DIR = storageRoot;
process.env.SURAKSHYA_MODE = 'local-research';
delete process.env.NODE_ENV;
fs.writeFileSync(
  path.join(storageRoot, 'incidents.json'),
  JSON.stringify(Array.from({ length: 180 }, (_, index) => ({ id: `seed-legacy-${index}` })))
);
const { app } = require('../server');
if (previousVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = previousVercel;
if (previousDataDir === undefined) delete process.env.SURAKSHYA_DATA_DIR;
else process.env.SURAKSHYA_DATA_DIR = previousDataDir;
if (previousMode === undefined) delete process.env.SURAKSHYA_MODE;
else process.env.SURAKSHYA_MODE = previousMode;
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;

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

  const healthResponse = await fetch(`${base}/health`);
  const health = await healthResponse.json();
  assert.equal(health.operatingMode, 'local-research');
  assert.equal(health.mutationPolicy, 'local-research-only');

  const beforeReport = await fetch(`${base}/dashboard`);
  const initialDashboard = await beforeReport.json();
  assert.equal(beforeReport.status, 200);
  assert.equal(initialDashboard.incidents.length, 1567);
  assert.equal(initialDashboard.dataset.id, 'synthetic-dashboard-v1');
  assert.equal(initialDashboard.dataset.communityReports, 0);
  assert.equal(JSON.parse(fs.readFileSync(storedPath, 'utf8')).length, 180);
  const diagnosticsResponse = await fetch(`${base}/diagnostics`);
  const diagnostics = await diagnosticsResponse.json();
  assert.equal(diagnostics.pipeline.storage, true);
  assert.equal(diagnostics.storage.mode, 'local-json');
  assert.equal(diagnostics.storage.configured, true);
  assert.equal(diagnostics.storage.readable, true);
  assert.equal(diagnostics.storage.writable, null);
  assert.equal(diagnostics.storage.durable, false);

  const reportResponse = await fetch(`${base}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 27.715, lng: 85.312, type: 'theft', when: 'now' })
  });
  const report = await reportResponse.json();
  assert.equal(reportResponse.status, 201);
  assert.equal((await (await fetch(`${base}/health`)).json()).storage.writable, true);

  const persistedIncidents = JSON.parse(fs.readFileSync(storedPath, 'utf8'));
  assert.equal(persistedIncidents.length, 180);
  const persistedReports = JSON.parse(fs.readFileSync(path.join(storageRoot, 'community-reports.json'), 'utf8'));
  assert.equal(persistedReports.length, 1);
  assert.ok(persistedReports.some(incident => incident.id === report.id));
  assert.equal(persistedReports[0].sourceType, 'community-report');

  const timestamp = Date.now() - 1000;
  const importResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Isolated test dataset',
      sourceFileName: 'observations.csv',
      sourceFormat: 'csv',
      mapping: { zone: 'district', category: 'kind', latitude: 'lat', longitude: 'lng', date: 'occurred' },
      blankRowsSkipped: 3,
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
  const importedDataset = (await importResponse.clone().json()).dataset;
  assert.match(importedDataset.id, /^import-/);
  assert.equal(importedDataset.provenance.type, 'user-import');
  assert.equal(importedDataset.provenance.originalFileName, 'observations.csv');
  assert.equal(importedDataset.provenance.originalFormat, 'csv');
  assert.equal(importedDataset.provenance.blankRowsSkipped, 3);
  assert.equal(importedDataset.provenance.selectedColumnMapping.zone, 'district');
  assert.equal(importedDataset.provenance.validationSummary.acceptedRecords, 1);
  assert.match(importedDataset.contentHash.value, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'imported');
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8')).records.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(storedPath, 'utf8')).length, 180);

  const replacementImport = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Replacement test dataset',
      sourceFileName: 'replacement.json',
      sourceFormat: 'json',
      records: [
        {
          zone: 'Replacement North',
          category: 'Observation',
          lat: 27.71,
          lng: 85.31,
          ts: timestamp,
          time: Temporal.exactTime(timestamp, 'imported'),
          severity: 2
        },
        {
          zone: 'Replacement South',
          category: 'Observation',
          lat: 27.69,
          lng: 85.33,
          ts: timestamp,
          time: Temporal.exactTime(timestamp, 'imported'),
          severity: 1
        }
      ]
    })
  });
  assert.equal(replacementImport.status, 201);
  const replacementDataset = (await replacementImport.json()).dataset;
  assert.notEqual(replacementDataset.id, importedDataset.id);
  assert.notEqual(replacementDataset.contentHash.value, importedDataset.contentHash.value);
  assert.equal(replacementDataset.provenance.originalFileName, 'replacement.json');
  assert.equal(replacementDataset.provenance.originalFormat, 'json');
  const savedReplacement = JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8'));
  assert.equal(savedReplacement.id, replacementDataset.id);
  assert.equal(savedReplacement.records.length, 2);
  assert.equal(JSON.parse(fs.readFileSync(storedPath, 'utf8')).length, 180);

  const invalidRecordsResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Must not replace saved data',
      records: [{
        zone: 'Sensitive raw zone label',
        category: 'Observation',
        lat: 91,
        lng: 85.3,
        ts: timestamp,
        time: Temporal.exactTime(timestamp, 'imported'),
        severity: 1
      }]
    })
  });
  const invalidRecords = await invalidRecordsResponse.json();
  assert.equal(invalidRecordsResponse.status, 400);
  assert.equal(invalidRecords.validation.acceptedRecords, 0);
  assert.equal(invalidRecords.validation.rejectedRecords, 1);
  assert.doesNotMatch(invalidRecords.error, /Sensitive raw zone label/);
  const unchangedDataset = await (await fetch(`${base}/dataset`)).json();
  assert.equal(unchangedDataset.id, replacementDataset.id);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8')).id, replacementDataset.id);

  const invalidImportResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  });
  assert.equal(invalidImportResponse.status, 400);

  const invalidNameResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bad\nName',
      records: [{
        zone: 'Test Zone', category: 'Observation', lat: 27.7, lng: 85.3,
        ts: timestamp, time: Temporal.exactTime(timestamp, 'imported'), severity: 1
      }]
    })
  });
  assert.equal(invalidNameResponse.status, 400);

  const invalidFormatResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Unsupported source format',
      sourceFormat: 'xml',
      records: [{
        zone: 'Test Zone', category: 'Observation', lat: 27.7, lng: 85.3,
        ts: timestamp, time: Temporal.exactTime(timestamp, 'imported'), severity: 1
      }]
    })
  });
  assert.equal(invalidFormatResponse.status, 400);
  assert.match((await invalidFormatResponse.json()).error, /CSV or JSON/);
  assert.equal((await (await fetch(`${base}/dataset`)).json()).id, replacementDataset.id);

  const switchToDemo = await fetch(`${base}/dataset/use-demo`, { method: 'POST' });
  assert.equal(switchToDemo.status, 200);
  const invalidReportResponse = await fetch(`${base}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 27.715, lng: 85.312, type: 'theft', note: 'x'.repeat(281) })
  });
  assert.equal(invalidReportResponse.status, 400);

  const invalidJsonResponse = await fetch(`${base}/dataset/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name":'
  });
  assert.equal(invalidJsonResponse.status, 400);

  const invalidActivation = await fetch(`${base}/dataset/use-imported`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datasetId: 'import-not-the-saved-dataset' })
  });
  assert.equal(invalidActivation.status, 409);
  assert.equal((await (await fetch(`${base}/dataset`)).json()).mode, 'demo');

  const savedImportResponse = await fetch(`${base}/dataset/use-imported`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datasetId: replacementDataset.id })
  });
  assert.equal(savedImportResponse.status, 200);
  const reactivatedDataset = await savedImportResponse.json();
  assert.equal(reactivatedDataset.dataset.provenance.originalFileName, 'replacement.json');
  assert.equal(reactivatedDataset.dataset.provenance.blankRowsSkipped, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'imported');
  const researchResponse = await fetch(`${base}/dataset/research`);
  const research = await researchResponse.json();
  assert.equal(researchResponse.status, 200);
  assert.equal(research.sourceDataset.id, replacementDataset.id);
  assert.equal(research.sourceDataset.contentHash.value, replacementDataset.contentHash.value);
  assert.equal(research.sourceDataset.schemaVersion, replacementDataset.schemaVersion);
  assert.equal(research.dataset.id, replacementDataset.id);
  assert.equal(research.dataset.temporalCoverage.records, 2);
  assert.equal(research.modelConfiguration.referenceModel, 'frequency-only');

  const switchResponse = await fetch(`${base}/dataset/use-demo`, { method: 'POST' });
  assert.equal(switchResponse.status, 200);
  assert.equal((await fetch(`${base}/dataset/research`)).status, 409);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'active-dataset.json'), 'utf8')).mode, 'demo');
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'imported-dataset.json'), 'utf8')).records.length, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'community-reports.json'), 'utf8')).length, 1);

  const originalRename = fs.renameSync;
  fs.renameSync = function (source, target) {
    if (String(target).endsWith('community-reports.json')) {
      const error = new Error('simulated storage failure');
      error.code = 'ENOSPC';
      throw error;
    }
    return originalRename.apply(this, arguments);
  };
  let failedWriteResponse;
  try {
    failedWriteResponse = await fetch(`${base}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 27.715, lng: 85.312, type: 'theft', when: 'now' })
    });
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(failedWriteResponse.status, 503);
  assert.match((await failedWriteResponse.json()).error, /could not be persisted/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(storageRoot, 'community-reports.json'), 'utf8')).length, 1);
  assert.equal((await (await fetch(`${base}/dashboard`)).json()).incidents.length, 1568);
  const failedStorageHealth = await (await fetch(`${base}/health`)).json();
  assert.equal(failedStorageHealth.storage.available, false);
  assert.equal(failedStorageHealth.storage.writable, false);
});
