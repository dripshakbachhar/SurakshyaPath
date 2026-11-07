const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const router = express.Router();
const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'experiments', 'results');

const MODEL_FILES = [
  { id: 'frequency-only', label: 'Frequency-only', file: 'frequency-only.csv' },
  { id: 'severity-only', label: 'Severity-only', file: 'severity-only.csv' },
  { id: 'frequency-severity', label: 'Frequency × severity', file: 'frequency-severity.csv' },
  { id: 'current-severity-recency', label: 'Severity × recency', file: 'current-severity-recency.csv' }
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(RESULTS, file), 'utf8'));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'Research artifacts are unavailable. Run the reproducible research pipeline and try again.'
  });
}

router.get('/overview', (req, res) => {
  try {
    const datasetPath = path.join(ROOT, 'data', 'synthetic_incidents.csv');
    const rows = fs.readFileSync(datasetPath, 'utf8').trim().split(/\r?\n/);
    const summary = readJson('summary/research-summary.json');
    const robustness = readJson('robustness/robustness-summary.json');
    const { ZONES } = require('../config/zones');

    res.json({
      schemaVersion: '1.0.0',
      project: 'SurakshyaPath Research Lab',
      researchQuestion: 'How do explainable scoring assumptions propagate through spatial ranking, fixed-budget allocation, and route-order experiments?',
      dataset: {
        recordCount: Math.max(0, rows.length - 1),
        canonicalSeed: 208304,
        robustnessSeeds: robustness.seeds,
        spatialUnits: ZONES.length,
        dataStatus: 'SYNTHETIC',
        sourceFile: 'data/synthetic_incidents.csv',
        provenanceNote: 'The official source is an aggregate contextual reference only. The spatial records are deterministic synthetic data, not official incident-level observations.'
      },
      canonicalSummary: summary,
      interpretation: {
        allowed: 'Descriptive comparison of specified algorithms on deterministic synthetic scenarios.',
        notEstablished: [
          'crime prediction or predictive accuracy',
          'causal effect or public-safety impact',
          'operational patrol or staffing recommendations',
          'fairness, calibration, or model superiority'
        ]
      }
    });
  } catch (error) {
    console.error('Research overview unavailable:', error.message);
    return unavailable(res);
  }
});

router.get('/models', (req, res) => {
  try {
    const summary = readJson('summary/research-summary.json');
    const models = MODEL_FILES.map((model) => {
      const rows = parseCsv(fs.readFileSync(path.join(RESULTS, model.file), 'utf8'));
      const meta = summary.risk.find((item) => item.model === model.id) || {};
      return {
        id: model.id,
        label: model.label,
        topZone: meta.top_zone || null,
        meanAbsoluteRankShift: meta.mean_absolute_rank_shift ?? null,
        zonesWithRankChange: meta.zones_with_rank_change ?? null,
        zones: rows.map((row) => ({
          zone: row.zone,
          score: Number(row.score),
          rank: Number(row.rank),
          incidentCount: Number(row.incident_count)
        }))
      };
    });

    res.json({ models, baselineModel: 'frequency-only', normalization: '100 × raw score / max(1, maximum raw score)' });
  } catch (error) {
    console.error('Research models unavailable:', error.message);
    return unavailable(res);
  }
});

router.get('/allocation', (req, res) => {
  try {
    res.json(readJson('allocation/allocation-summary.json'));
  } catch (error) {
    console.error('Research allocation results unavailable:', error.message);
    return unavailable(res);
  }
});

router.get('/routes', (req, res) => {
  try {
    res.json(readJson('patrol/route-comparison.json'));
  } catch (error) {
    console.error('Research route results unavailable:', error.message);
    return unavailable(res);
  }
});

router.get('/robustness', (req, res) => {
  try {
    res.json(readJson('robustness/robustness-summary.json'));
  } catch (error) {
    console.error('Research robustness results unavailable:', error.message);
    return unavailable(res);
  }
});

module.exports = router;
