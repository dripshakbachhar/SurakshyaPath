const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const outputDir = path.join(__dirname, "results");
const input = path.join(dataDir, "synthetic_incidents.csv");

if (!fs.existsSync(input)) {
  require("../data/generate-synthetic");
}

const zones = [
  ["Thamel", 27.715, 85.312],
  ["Kalimati", 27.700, 85.283],
  ["New Baneshwor", 27.691, 85.342],
  ["Chabahil", 27.718, 85.347],
  ["Koteshwor", 27.678, 85.347],
  ["Balaju", 27.735, 85.291],
  ["Patan", 27.676, 85.325],
  ["Gongabu", 27.735, 85.312],
  ["Kirtipur", 27.678, 85.277],
  ["Bouddha", 27.721, 85.362]
];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function nearestZone(lat, lon) {
  let best = zones[0];
  let bestD = Infinity;
  for (const zone of zones) {
    const d = Math.hypot(lat - zone[1], lon - zone[2]);
    if (d < bestD) { best = zone; bestD = d; }
  }
  return best[0];
}

function rank(scores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([zone], i) => ({ zone, rank: i + 1, score: bRound(scores[zone]) }));
}

function bRound(n) {
  return Number(n.toFixed(4));
}

const incidents = parseCsv(fs.readFileSync(input, "utf8")).map(r => ({
  ...r,
  severity: Number(r.severity),
  ageDays: Number(r.age_days),
  zone: nearestZone(Number(r.latitude), Number(r.longitude))
}));

const grouped = Object.fromEntries(zones.map(z => [z[0], []]));
for (const incident of incidents) grouped[incident.zone].push(incident);

const frequency = {};
const severity = {};
const frequencySeverity = {};
const current = {};

for (const [zone, records] of Object.entries(grouped)) {
  frequency[zone] = records.length;
  severity[zone] = records.length ? records.reduce((s, r) => s + r.severity, 0) / records.length : 0;
  frequencySeverity[zone] = records.reduce((s, r) => s + r.severity, 0);
  current[zone] = records.reduce((s, r) => {
    const decay = Math.max(0.15, 1 - r.ageDays / 30);
    return s + r.severity * decay;
  }, 0);
}

function normalize(scores) {
  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(Object.entries(scores).map(([z, v]) => [z, (v / max) * 100]));
}

const models = {
  "frequency-only": normalize(frequency),
  "severity-only": normalize(severity),
  "frequency-severity": normalize(frequencySeverity),
  "current-severity-recency": normalize(current)
};

fs.mkdirSync(outputDir, { recursive: true });

const comparison = {};
for (const [name, scores] of Object.entries(models)) {
  const rows = [["zone,score,rank,incident_count"]];
  const ranked = rank(scores);
  for (const item of ranked) rows.push(`${item.zone},${item.score},${item.rank},${frequency[item.zone]}`);
  fs.writeFileSync(path.join(outputDir, `${name}.csv`), rows.join("\n") + "\n");
  comparison[name] = ranked;
}

fs.writeFileSync(
  path.join(outputDir, "README.md"),
  `# Risk-model experiment results

Generated from the deterministic 1,567-record synthetic dataset.

Models:
- frequency-only
- severity-only
- frequency-severity
- current-severity-recency

These outputs measure sensitivity of the algorithm on synthetic data. They are not real-world crime predictions.

Run again with:

```bash
npm run research-experiments
```
`
);

console.log(`Generated experiment outputs for ${incidents.length} synthetic records.`);
for (const [name, ranked] of Object.entries(comparison)) {
  console.log(`\\n${name}`);
  console.table(ranked);
}
