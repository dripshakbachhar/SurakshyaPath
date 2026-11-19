'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const packageInfo = require('../package.json');
const { ZONES } = require('../config/zones');
const {
  CSV_FILE,
  DATASET_ID,
  EXPECTED_RECORDS,
  parseCanonicalDataset,
  readCanonicalDataset
} = require('../data/canonical-dataset');

const root = path.join(__dirname, '..');

test('canonical dataset loading validates its structure and hashes normalized source content', () => {
  const contents = fs.readFileSync(CSV_FILE, 'utf8');
  const dataset = readCanonicalDataset();

  assert.equal(dataset.id, DATASET_ID);
  assert.equal(dataset.recordCount, EXPECTED_RECORDS);
  assert.equal(dataset.records.length, EXPECTED_RECORDS);
  assert.equal(
    dataset.contentHash.representation,
    'UTF-8 text with line endings normalized to LF'
  );
  assert.equal(
    dataset.contentHash.value,
    createHash('sha256').update(contents.replace(/\r\n?/g, '\n'), 'utf8').digest('hex')
  );
  assert.equal(dataset.records[0].id, 'syn-shrawan-2083-0001');
  assert.equal(dataset.records[0].severity, 2);
  assert.throws(
    () => readCanonicalDataset(path.join(root, 'data', 'missing-synthetic.csv')),
    /dataset is missing/
  );
  assert.throws(() => parseCanonicalDataset(contents.replace('age_days', 'age')), /header schema/);
  assert.throws(
    () => parseCanonicalDataset(contents.slice(0, contents.lastIndexOf('syn-shrawan-2083-1567'))),
    /must contain 1567 records/
  );
  assert.throws(() => parseCanonicalDataset(contents.replace('27.773662', '91.000000')), /record 2 has invalid field values/);
  assert.throws(() => parseCanonicalDataset(contents.replace('85.270700,theft', '85.270700')), /expected 9/);
  assert.throws(
    () => parseCanonicalDataset(contents.replace(
      'syn-shrawan-2083-0002,',
      'syn-shrawan-2083-0001,'
    )),
    /invalid or duplicate identifier/
  );
});

test('generated experiment artifacts preserve source and execution provenance', () => {
  const canonical = readCanonicalDataset();
  const provenanceFiles = [
    'experiments/results/risk-model-comparison.json',
    'experiments/results/patrol/route-comparison.json',
    'experiments/results/allocation/allocation-summary.json',
    'experiments/results/robustness/robustness-summary.json',
    'experiments/results/summary/research-summary.json',
    'research/figures/figure-provenance.json'
  ];

  for (const relativePath of provenanceFiles) {
    const result = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const provenance = result.provenance;
    assert.ok(provenance, `${relativePath} must include provenance`);
    assert.ok(provenance.experimentId);
    assert.ok(provenance.executedAt);
    assert.equal(provenance.softwareVersion, packageInfo.version);
    assert.equal(provenance.executionStatus, 'success');
    assert.ok(provenance.modelConfiguration);
    assert.ok(provenance.metrics);
    assert.ok(Array.isArray(provenance.exclusions));
    assert.ok(Array.isArray(provenance.warnings));
    assert.ok(Array.isArray(provenance.inputArtifacts));
    assert.match(provenance.sourceDataset.contentHash.value, /^[a-f0-9]{64}$/);
  }

  const canonicalResultPaths = provenanceFiles.slice(0, 3).concat(provenanceFiles[4]);
  for (const relativePath of canonicalResultPaths) {
    const result = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    assert.equal(result.provenance.sourceDataset.id, DATASET_ID);
    assert.equal(result.provenance.sourceDataset.contentHash.value, canonical.contentHash.value);
    assert.equal(result.provenance.sourceDataset.recordCount, EXPECTED_RECORDS);
    assert.equal(result.provenance.sourceDataset.zoneCount, ZONES.length);
  }

  const robustness = JSON.parse(fs.readFileSync(
    path.join(root, 'experiments/results/robustness/robustness-summary.json'),
    'utf8'
  ));
  assert.equal(robustness.provenance.sourceDataset.scenarioCount, 5);
  assert.equal(
    robustness.provenance.sourceDataset.contentHash.representation,
    'JSON.stringify UTF-8 bytes'
  );
  assert.equal(robustness.provenance.randomSeeds.length, 5);
  assert.equal(robustness.results.length, 5);
  assert.deepEqual(robustness.provenance.modelConfiguration.categoryCounts, {
    theft: 626,
    suspicious: 391,
    harassment: 313,
    infrastructure: 237
  });

  const summary = JSON.parse(fs.readFileSync(
    path.join(root, 'experiments/results/summary/research-summary.json'),
    'utf8'
  ));
  assert.equal(summary.provenance.inputArtifacts.length, 6);
  assert.ok(summary.provenance.inputArtifacts.every(artifact =>
    /^[a-f0-9]{64}$/.test(artifact.contentHash.value)
  ));
});
