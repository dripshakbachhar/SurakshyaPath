const fs = require("fs");
const path = require("path");

const outputDir = path.join(__dirname, "results");
const { ZONES } = require("../config/zones");
const zones = ZONES.map(z => [z.name, z.lat, z.lng]);
const { readCanonicalDataset } = require("../data/canonical-dataset");
const { nearestZone } = require("../data/live-incidents");
const { createExperimentProvenance } = require("./provenance");

function rank(scores) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([zone], i) => ({ zone, rank: i + 1, score: bRound(scores[zone]) }));
}

function bRound(n) {
  return Number(n.toFixed(4));
}

const dataset = readCanonicalDataset();
const incidents = dataset.records.map(record => ({
  severity: record.severity,
  ageDays: record.ageDays,
  zone: nearestZone(record.latitude, record.longitude).name
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
fs.writeFileSync(
  path.join(outputDir, "risk-model-comparison.json"),
  JSON.stringify({
    provenance: createExperimentProvenance({
      experimentId: "risk-model-comparison",
      sourceDataset: { ...dataset, zoneCount: zones.length },
      randomSeed: 208304,
      modelConfiguration: {
        models: Object.keys(models),
        scoreNormalization: "Maximum zone score is 100.",
        recencyWindowDays: 30,
        recencyMinimumWeight: 0.15
      },
      metrics: {
        zoneScore: { unit: "normalized points, 0-100" },
        rank: { unit: "ordinal position, 1 is highest" },
        incidentCount: { unit: "records" }
      },
      warnings: ["Synthetic scenario results are descriptive and do not establish real-world risk or model superiority."]
    }),
    models: comparison
  }, null, 2) + "\n"
);

console.log(`Generated experiment outputs for ${incidents.length} synthetic records.`);
for (const [name, ranked] of Object.entries(comparison)) {
  console.log(`\n${name}`);
  console.table(ranked);
}
