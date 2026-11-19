'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const packageInfo = require('../package.json');

function hashJson(value) {
  return {
    algorithm: 'sha256',
    representation: 'JSON.stringify UTF-8 bytes',
    value: createHash('sha256').update(JSON.stringify(value)).digest('hex')
  };
}

function hashFile(filePath) {
  return {
    algorithm: 'sha256',
    representation: 'file-bytes',
    value: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
  };
}

function createExperimentProvenance({
  experimentId,
  sourceDataset,
  randomSeed = null,
  randomSeeds = null,
  modelConfiguration,
  metrics,
  inputArtifacts = [],
  exclusions = [],
  warnings = []
}) {
  return {
    experimentId,
    sourceDataset: {
      id: sourceDataset.id,
      name: sourceDataset.name,
      schemaVersion: sourceDataset.schemaVersion ?? null,
      contentHash: sourceDataset.contentHash ?? null,
      recordCount: sourceDataset.recordCount,
      zoneCount: sourceDataset.zoneCount ?? null,
      scenarioCount: sourceDataset.scenarioCount ?? null
    },
    randomSeed,
    randomSeeds,
    modelConfiguration,
    inputArtifacts,
    softwareVersion: packageInfo.version,
    commit: process.env.GITHUB_SHA || null,
    executedAt: new Date().toISOString(),
    metrics,
    exclusions,
    warnings,
    executionStatus: 'success'
  };
}

module.exports = { createExperimentProvenance, hashFile, hashJson };
