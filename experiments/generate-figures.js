const fs = require('node:fs');
const path = require('node:path');
const DatasetImport = require('../public/js/dataset-import');
const { ZONES } = require('../config/zones');
const { createExperimentProvenance, hashFile } = require('./provenance');

const input = path.join(__dirname, 'results', 'robustness', 'robustness-summary.csv');
const experimentFile = path.join(__dirname, 'results', 'robustness', 'robustness-summary.json');
const outDir = path.join(__dirname, '..', 'research', 'figures');

if (!fs.existsSync(input)) throw new Error('Run npm.cmd run robustness-experiments first.');

const parsed = DatasetImport.parseCsv(fs.readFileSync(input, 'utf8'));
const expectedHeaders = [
  'seed', 'model', 'top_zone', 'mean_absolute_rank_shift_vs_frequency',
  'zones_with_changed_allocation_vs_frequency', 'patrol_km'
];
if (parsed.blankRowsSkipped ||
    parsed.headers.length !== expectedHeaders.length ||
    parsed.headers.some((header, index) => header !== expectedHeaders[index])) {
  throw new Error('Unexpected robustness CSV structure.');
}

const models = ['frequency-only', 'severity-only', 'frequency-severity', 'current-severity-recency'];
const modelSet = new Set(models);
const zoneSet = new Set(ZONES.map(zone => zone.name));
function parseNumber(value) {
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value);
}
const rows = parsed.records.map(row => {
  const seed = parseNumber(row.seed);
  const rankShift = parseNumber(row.mean_absolute_rank_shift_vs_frequency);
  const allocationChanges = parseNumber(row.zones_with_changed_allocation_vs_frequency);
  const patrolKm = parseNumber(row.patrol_km);
  if (!Number.isInteger(seed) || !modelSet.has(row.model) || !zoneSet.has(row.top_zone) ||
      !Number.isFinite(rankShift) || rankShift < 0 ||
      !Number.isInteger(allocationChanges) || allocationChanges < 0 ||
      !Number.isFinite(patrolKm) || patrolKm < 0) {
    throw new Error('Invalid robustness CSV result row.');
  }
  return { seed: String(seed), model: row.model, topZone: row.top_zone, rankShift, allocationChanges, patrolKm };
});
const seeds = [...new Set(rows.map(row => row.seed))].sort();
if (rows.length !== 20 || seeds.length !== 5 ||
    models.some(model => rows.filter(row => row.model === model).length !== seeds.length) ||
    new Set(rows.map(row => `${row.seed}:${row.model}`)).size !== rows.length) {
  throw new Error('Robustness results must contain one row per model and each of five seeds.');
}

const experiment = JSON.parse(fs.readFileSync(experimentFile, 'utf8'));
const sourceDataset = experiment.provenance && experiment.provenance.sourceDataset;
if (!sourceDataset || !sourceDataset.contentHash ||
    !/^[a-f0-9]{64}$/.test(sourceDataset.contentHash.value) ||
    !Array.isArray(experiment.provenance.randomSeeds) ||
    experiment.provenance.randomSeeds.map(String).sort().join(',') !== seeds.join(',')) {
  throw new Error('Robustness result provenance is missing or inconsistent with the CSV.');
}

const labels = {
  'frequency-only': 'Frequency',
  'severity-only': 'Severity',
  'frequency-severity': 'Frequency × Severity',
  'current-severity-recency': 'Severity × Recency'
};

fs.mkdirSync(outDir, { recursive: true });

function svg(title, subtitle, body, width = 1000, height = 620) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<text x="60" y="55" font-family="Arial" font-size="28" font-weight="700">' + title + '</text>' +
    '<text x="60" y="85" font-family="Arial" font-size="16">' + subtitle + '</text>' +
    body + '</svg>\n';
}

function barChart(title, subtitle, values, maxValue, suffix = '') {
  const left = 250, top = 130, barH = 55, gap = 18, chartW = 650;
  const body = values.map((item, i) => {
    const y = top + i * (barH + gap);
    const w = maxValue ? Math.max(2, item.value / maxValue * chartW) : 2;
    return '<text x="235" y="' + (y + 36) + '" text-anchor="end" font-family="Arial" font-size="16">' + item.label + '</text>' +
      '<rect x="' + left + '" y="' + y + '" width="' + w + '" height="' + barH + '" fill="#444"/>' +
      '<text x="' + (left + w + 10) + '" y="' + (y + 36) + '" font-family="Arial" font-size="15">' + item.value + suffix + '</text>';
  }).join('\n');
  return svg(title, subtitle, body);
}

const topZoneConsistency = models.map(model => {
  const modelRows = rows.filter(r => r.model === model);
  const counts = {};
  for (const row of modelRows) counts[row.topZone] = (counts[row.topZone] || 0) + 1;
  const topZone = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { label: labels[model], value: topZone[1] };
});

const rankValues = models.map(model => {
  const data = rows.filter(r => r.model === model);
  return { label: labels[model], value: Number((data.reduce((sum, r) => sum + r.rankShift, 0) / data.length).toFixed(2)) };
});

const allocationValues = models.map(model => ({
  label: labels[model],
  value: rows.filter(r => r.model === model).reduce((sum, r) => sum + r.allocationChanges, 0)
}));

const patrolValues = models.map(model => {
  const data = rows.filter(r => r.model === model);
  return { label: labels[model], value: Number((data.reduce((sum, r) => sum + r.patrolKm, 0) / data.length).toFixed(2)) };
});

fs.writeFileSync(path.join(outDir, 'risk-model-comparison.svg'), barChart(
  'Top-zone consistency across five synthetic seeds',
  'Number of seeds in which the most common top-ranked zone was retained.',
  topZoneConsistency,
  rows.length / models.length
));

fs.writeFileSync(path.join(outDir, 'allocation-comparison.svg'), barChart(
  'Allocation sensitivity across five seeds',
  'Total zone-allocation changes relative to the frequency-only reference.',
  allocationValues,
  Math.max(...allocationValues.map(x => x.value), 1)
));

fs.writeFileSync(path.join(outDir, 'robustness-comparison.svg'), barChart(
  'Mean rank shift across five seeds',
  'Mean absolute rank shift relative to frequency-only.',
  rankValues,
  Math.max(...rankValues.map(x => x.value), 1)
));

fs.writeFileSync(path.join(outDir, 'patrol-comparison.svg'), barChart(
  'Mean patrol-route distance',
  'Mean route distance across five synthetic scenarios.',
  patrolValues,
  Math.max(...patrolValues.map(x => x.value), 1),
  ' km'
));

const readme = [
  '# Research figures',
  '',
  'Generated directly from the deterministic robustness experiment output.',
  '',
  '## Figures',
  '',
  '- `risk-model-comparison.svg` — top-zone consistency across five synthetic seeds.',
  '- `allocation-comparison.svg` — aggregate allocation changes across five seeds.',
  '- `robustness-comparison.svg` — mean absolute rank shift across five seeds.',
  '- `patrol-comparison.svg` — mean patrol distance across five seeds.',
  '',
  'Generate with:',
  '',
  '    npm.cmd run figures',
  '',
  'All figures are descriptive visualizations of a synthetic computational experiment. They do not establish real-world crime risk, operational effectiveness, or universal superiority of any model.',
  ''
].join('\n');

fs.writeFileSync(path.join(outDir, 'README.md'), readme);
fs.writeFileSync(
  path.join(outDir, 'figure-provenance.json'),
  JSON.stringify({
    provenance: createExperimentProvenance({
      experimentId: 'research-figures',
      sourceDataset: experiment.provenance.sourceDataset,
      randomSeeds: experiment.provenance.randomSeeds,
      modelConfiguration: {
        sourceExperiment: experiment.provenance.experimentId,
        figures: [
          'risk-model-comparison.svg',
          'allocation-comparison.svg',
          'robustness-comparison.svg',
          'patrol-comparison.svg'
        ]
      },
      inputArtifacts: [
        {
          path: 'experiments/results/robustness/robustness-summary.csv',
          contentHash: hashFile(input)
        },
        {
          path: 'experiments/results/robustness/robustness-summary.json',
          contentHash: hashFile(experimentFile)
        }
      ],
      metrics: {
        topZoneConsistency: { unit: 'scenario replications' },
        rankShift: { unit: 'mean absolute rank positions' },
        allocationChanges: { unit: 'zone allocations' },
        patrolDistance: { unit: 'kilometres' }
      },
      warnings: ['Figures visualize deterministic synthetic experiments and are not real-world operational guidance.']
    })
  }, null, 2) + '\n'
);
console.log('Generated 4 data-driven research figures.');