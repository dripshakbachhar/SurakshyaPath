const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const outputDir = path.join(__dirname, "results");
const input = path.join(dataDir, "synthetic_incidents.csv");

if (!fs.existsSync(input)) {
  require("../data/generate-synthetic");
}

const { ZONES } = require("../config/zones");
const zones = ZONES.map(z => [z.name, z.lat, z.lng]);

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

const frequency = Object.fromEntries(zones.map(z => [z[0], 0]));
for (const incident of incidents) frequency[incident.zone]++;

const { scoreModels } = require("../algorithms/research-models");

const models = scoreModels(incidents, zones.map(z => z[0]));

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
  [
    "# Risk-model experiment results",
    "",
    "Generated from the deterministic 1,567-record synthetic dataset.",
    "",
    "Models:",
    "- frequency-only",
    "- severity-only",
    "- frequency-severity",
    "- current-severity-recency",
    "",
    "These outputs measure sensitivity of the algorithm on synthetic data. They are not real-world crime predictions.",
    "",
    "Run again with:",
    "",
    "```bash",
    "npm run research-experiments",
    "```",
    "",
  ].join("\n")
);

console.log(`Generated experiment outputs for ${incidents.length} synthetic records.`);
for (const [name, ranked] of Object.entries(comparison)) {
  console.log(`\n${name}`);
  console.table(ranked);
}
