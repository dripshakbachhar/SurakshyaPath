const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(__dirname, 'results');
const RESEARCH_FIGURES = path.join(ROOT, 'research', 'figures');
const PUBLIC_FIGURES = path.join(ROOT, 'public', 'research-lab', 'assets');

const MODEL_IDS = [
  'frequency-only',
  'severity-only',
  'frequency-severity',
  'current-severity-recency'
];
const LABELS = {
  'frequency-only': 'Frequency-only',
  'severity-only': 'Severity-only',
  'frequency-severity': 'Frequency × severity',
  'current-severity-recency': 'Severity × recency'
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(RESULTS, file), 'utf8'));
}

function parseCsv(file) {
  const lines = fs.readFileSync(path.join(RESULTS, file), 'utf8').trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((key, index) => [key, values[index]]));
  });
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[char]));
}

function svgDocument(title, description, content, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title>
<desc id="desc">${escapeXml(description)}</desc>
<rect width="100%" height="100%" fill="#ffffff"/>
<g font-family="Arial, Helvetica, sans-serif">
  <text x="48" y="48" fill="#182d48" font-size="25" font-weight="700">${escapeXml(title)}</text>
  <text x="48" y="76" fill="#68758b" font-size="13">${escapeXml(description)}</text>
  ${content}
</g>
</svg>
`;
}

function writeFigure(name, svg) {
  for (const directory of [RESEARCH_FIGURES, PUBLIC_FIGURES]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name), svg);
  }
}

function scoreColor(value) {
  const low = [235, 243, 241], high = [45, 118, 110];
  const t = Math.max(0, Math.min(1, Number(value) / 100));
  const rgb = low.map((start, index) => Math.round(start + (high[index] - start) * t));
  return `rgb(${rgb.join(',')})`;
}

function scoreHeatmap(models) {
  const zoneOrder = [...models['frequency-only']].sort((a, b) => Number(a.rank) - Number(b.rank)).map((row) => row.zone);
  const x0 = 290, y0 = 175, cellW = 82, cellH = 62, gap = 7;
  let body = '<text x="290" y="116" fill="#68758b" font-size="11">Zones ordered by the frequency-only baseline</text>';
  zoneOrder.forEach((zone, index) => {
    const x = x0 + index * (cellW + gap) + 2;
    body += `<text x="${x}" y="155" transform="rotate(-25 ${x} 155)" fill="#68758b" font-size="10">${escapeXml(zone)}</text>`;
  });
  MODEL_IDS.forEach((id, rowIndex) => {
    const y = y0 + rowIndex * (cellH + 12);
    body += `<text x="270" y="${y + 35}" text-anchor="end" fill="#182d48" font-size="12" font-weight="700">${escapeXml(LABELS[id])}</text>`;
    const lookup = Object.fromEntries(models[id].map((row) => [row.zone, Number(row.score)]));
    zoneOrder.forEach((zone, columnIndex) => {
      const value = lookup[zone] || 0;
      const x = x0 + columnIndex * (cellW + gap);
      body += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="7" fill="${scoreColor(value)}" stroke="#dfe8e5"/>
        <text x="${x + cellW / 2}" y="${y + 36}" text-anchor="middle" fill="${value > 55 ? '#ffffff' : '#182d48'}" font-size="13" font-weight="700">${value.toFixed(1)}</text>`;
    });
  });
  body += '<text x="290" y="505" fill="#68758b" font-size="11">Normalized score (0–100). Values are model-relative, not probabilities.</text>';
  return svgDocument(
    'Canonical normalized scores by zone',
    'All ten configured zones under the four research scoring models, using canonical synthetic seed 208304.',
    body, 1240, 550
  );
}

function allocationMatrix(allocation) {
  const budgets = allocation.officerCounts.map(String);
  const zoneNames = Object.keys(allocation.models['frequency-only'][budgets[0]]);
  const panelWidth = 380, panelXs = [30, 440, 850], y0 = 170;
  let body = '';
  budgets.forEach((budget, panelIndex) => {
    const panelX = panelXs[panelIndex];
    body += `<text x="${panelX + 10}" y="120" fill="#182d48" font-size="17" font-weight="700">Budget: ${budget} units</text>`;
    const labelW = 104, cellW = 26, rowH = 65;
    MODEL_IDS.forEach((id, rowIndex) => {
      const y = y0 + rowIndex * rowH;
      body += `<text x="${panelX + labelW - 8}" y="${y + 24}" text-anchor="end" fill="#68758b" font-size="10">${escapeXml(LABELS[id].replace(' × ', ' × '))}</text>`;
      zoneNames.forEach((zone, zoneIndex) => {
        const value = Number(allocation.models[id][budget][zone] || 0);
        const x = panelX + labelW + zoneIndex * cellW;
        const opacity = value === 0 ? 0.12 : Math.min(0.95, 0.3 + value * 0.18);
        body += `<rect x="${x}" y="${y}" width="22" height="34" rx="4" fill="#2d766e" opacity="${opacity}"/>
          <text x="${x + 11}" y="${y + 22}" text-anchor="middle" fill="${value >= 2 ? '#ffffff' : '#182d48'}" font-size="11" font-weight="700">${value}</text>`;
      });
    });
    zoneNames.forEach((zone, zoneIndex) => {
      const x = panelX + labelW + zoneIndex * cellW + 11;
      body += `<text x="${x}" y="465" transform="rotate(-55 ${x} 465)" fill="#68758b" font-size="8">${escapeXml(zone)}</text>`;
    });
  });
  body += '<text x="48" y="530" fill="#68758b" font-size="11">Values show integer outputs from largest-remainder apportionment. Synthetic algorithm experiment only.</text>';
  return svgDocument(
    'Allocation vectors across stored budgets',
    'Per-zone allocation outputs for every model at budgets of 6, 12, and 20 units.',
    body, 1260, 570
  );
}

function routeComparison(routes) {
  const maxKm = Math.max(...MODEL_IDS.flatMap((id) => [
    routes.models[id].nearestNeighbourKm, routes.models[id].optimizedKm
  ]));
  const chartX = 260, chartW = 650, rowGap = 92;
  let body = '';
  MODEL_IDS.forEach((id, index) => {
    const model = routes.models[id];
    const y = 135 + index * rowGap;
    const baseWidth = Number(model.nearestNeighbourKm) / maxKm * chartW;
    const optWidth = Number(model.optimizedKm) / maxKm * chartW;
    body += `<text x="240" y="${y + 19}" text-anchor="end" fill="#182d48" font-size="12" font-weight="700">${escapeXml(LABELS[id])}</text>
      <rect x="${chartX}" y="${y}" width="${baseWidth}" height="25" rx="5" fill="#b7c3d2"/>
      <text x="${chartX + baseWidth + 9}" y="${y + 17}" fill="#68758b" font-size="11">${Number(model.nearestNeighbourKm).toFixed(2)} km</text>
      <rect x="${chartX}" y="${y + 33}" width="${optWidth}" height="25" rx="5" fill="#2d766e"/>
      <text x="${chartX + optWidth + 9}" y="${y + 50}" fill="#2d766e" font-size="11">${Number(model.optimizedKm).toFixed(2)} km</text>
      <text x="1010" y="${y + 27}" fill="#182d48" font-size="11" font-weight="700">${Number(model.savingsPercent).toFixed(2)}% saved</text>`;
  });
  body += '<rect x="48" y="515" width="12" height="12" rx="2" fill="#b7c3d2"/><text x="67" y="525" fill="#68758b" font-size="10">Nearest neighbour</text><rect x="220" y="515" width="12" height="12" rx="2" fill="#2d766e"/><text x="239" y="525" fill="#68758b" font-size="10">2-opt order</text>';
  body += '<text x="48" y="550" fill="#68758b" font-size="10">Open-route great-circle distance between configured points; not road distance or travel time.</text>';
  return svgDocument(
    'Nearest-neighbour and 2-opt distance comparison',
    'Canonical seed 208304, five model-ranked zones, fixed origin MPR Ratna Park, great-circle geometry.',
    body, 1200, 580
  );
}

function rankShift(order, baseline) {
  const ranks = Object.fromEntries(baseline.map((zone, index) => [zone, index + 1]));
  return order.reduce((sum, zone, index) => sum + Math.abs(index + 1 - ranks[zone]), 0) / order.length;
}

function robustnessFigure(robustness) {
  const baselineModel = 'frequency-only';
  const maxShift = 3;
  const x0 = 360, chartW = 550;
  let body = '';
  for (let tick = 0; tick <= 3; tick++) {
    const x = x0 + tick / maxShift * chartW;
    body += `<line x1="${x}" y1="120" x2="${x}" y2="465" stroke="#e5eaf0" stroke-dasharray="3 5"/>
      <text x="${x}" y="492" text-anchor="middle" fill="#68758b" font-size="10">${tick.toFixed(1)}</text>`;
  }
  MODEL_IDS.forEach((id, index) => {
    const y = 165 + index * 86;
    const shifts = robustness.results.map((scenario) => rankShift(
      scenario.models[id].rank_order,
      scenario.models[baselineModel].rank_order
    ));
    body += `<text x="335" y="${y + 4}" text-anchor="end" fill="#182d48" font-size="12" font-weight="700">${escapeXml(LABELS[id])}</text>`;
    shifts.forEach((value, seedIndex) => {
      const x = x0 + Math.min(maxShift, value) / maxShift * chartW;
      body += `<circle cx="${x}" cy="${y}" r="7" fill="#2d766e" stroke="#ffffff" stroke-width="2"><title>Seed ${robustness.seeds[seedIndex]}: rank shift ${value.toFixed(2)}</title></circle>`;
    });
    const changes = robustness.results.map((scenario) => {
      const model = scenario.models[id], baseline = scenario.models[baselineModel];
      return Object.keys(model.allocation).filter((zone) => model.allocation[zone] !== baseline.allocation[zone]).length;
    });
    body += `<text x="955" y="${y + 4}" fill="#68758b" font-size="10">Allocation changes: ${changes.join(' / ')}</text>`;
  });
  body += '<text x="360" y="525" fill="#68758b" font-size="11">Mean absolute rank shift relative to frequency-only; each dot is one deterministic seed.</text>';
  return svgDocument(
    'Robustness across five deterministic seeds',
    'Per-seed rank shifts and allocation-change counts for the four research models.',
    body, 1200, 560
  );
}

function main() {
  const modelRows = Object.fromEntries(MODEL_IDS.map((id) => [
    id,
    parseCsv(`${id}.csv`).map((row) => ({
      zone: row.zone,
      score: Number(row.score),
      rank: Number(row.rank),
      incidentCount: Number(row.incident_count)
    }))
  ]));
  const allocation = readJson('allocation/allocation-summary.json');
  const routes = readJson('patrol/route-comparison.json');
  const robustness = readJson('robustness/robustness-summary.json');

  writeFigure('risk-model-comparison.svg', scoreHeatmap(modelRows));
  writeFigure('allocation-comparison.svg', allocationMatrix(allocation));
  writeFigure('patrol-comparison.svg', routeComparison(routes));
  writeFigure('robustness-comparison.svg', robustnessFigure(robustness));

  const readme = [
    '# Research figures',
    '',
    'Generated from canonical research-model scores and committed deterministic experiment results.',
    '',
    '- `risk-model-comparison.svg` — normalized score heatmap for all four models and ten zones.',
    '- `allocation-comparison.svg` — all per-zone allocation vectors at budgets 6, 12, and 20.',
    '- `patrol-comparison.svg` — nearest-neighbour versus 2-opt route distances for the canonical seed.',
    '- `robustness-comparison.svg` — per-seed rank shifts and allocation changes across five designed scenarios.',
    '',
    'The same figures are copied to `public/research-lab/assets/` for the read-only website.',
    '',
    'Regenerate with `npm run research` followed by `npm run figures`.',
    '',
    'All graphics describe synthetic algorithm outputs. They are not forecasts, field evidence, road-network navigation, or operational guidance.',
    ''
  ].join('\n');
  for (const directory of [RESEARCH_FIGURES, PUBLIC_FIGURES]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'README.md'), readme);
  }

  console.log('Generated four canonical data-driven research figures for the manuscript and Research Lab.');
}

main();
