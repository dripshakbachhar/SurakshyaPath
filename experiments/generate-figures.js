const fs = require('node:fs');
const path = require('node:path');

const input = path.join(__dirname, 'results', 'robustness', 'robustness-summary.csv');
const outDir = path.join(__dirname, '..', 'research', 'figures');

if (!fs.existsSync(input)) throw new Error('Run npm.cmd run robustness-experiments first.');

const rows = fs.readFileSync(input, 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const [seed, model, topZone, rankShift, allocationChanges, patrolKm] = line.split(',');
  return { seed, model, topZone, rankShift: Number(rankShift), allocationChanges: Number(allocationChanges), patrolKm: Number(patrolKm) };
});

const models = ['frequency-only', 'severity-only', 'frequency-severity', 'current-severity-recency'];
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
console.log('Generated 4 data-driven research figures.');