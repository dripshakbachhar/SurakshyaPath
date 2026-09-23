const fs = require("node:fs");
const path = require("node:path");

const resultsDir = path.join(__dirname, "results");
const summaryDir = path.join(resultsDir, "summary");

const models = [
  "frequency-only",
  "severity-only",
  "frequency-severity",
  "current-severity-recency"
];

function parseCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

const risk = Object.fromEntries(
  models.map(model => [
    model,
    parseCsv(path.join(resultsDir, model + ".csv")).map(row => ({
      zone: row.zone,
      rank: Number(row.rank),
      score: Number(row.score)
    }))
  ])
);

const reference = Object.fromEntries(
  risk["frequency-only"].map(row => [row.zone, row.rank])
);

const riskSummary = models.map(model => {
  const rows = risk[model];
  const rankChanges = rows.filter(row => row.rank !== reference[row.zone]).length;
  const meanRankShift = rows.reduce(
    (sum, row) => sum + Math.abs(row.rank - reference[row.zone]),
    0
  ) / rows.length;

  return {
    model,
    zones_with_rank_change: rankChanges,
    mean_absolute_rank_shift: round(meanRankShift, 2),
    top_zone: rows[0].zone
  };
});

const allocationRows = parseCsv(
  path.join(resultsDir, "allocation", "allocation-comparison.csv")
).filter(row => Number(row.officers) === 12);

const allocationByModel = Object.fromEntries(
  models.map(model => [
    model,
    Object.fromEntries(
      allocationRows
        .filter(row => row.model === model)
        .map(row => [row.zone, Number(row.assigned_officers)])
    )
  ])
);

const allocationReference = allocationByModel["frequency-only"];

const allocationSummary = models.map(model => {
  const assignments = allocationByModel[model];
  const changedZones = Object.keys(assignments)
    .filter(zone => assignments[zone] !== allocationReference[zone]).length;

  const absoluteOfficerChange = Object.keys(assignments)
    .reduce(
      (sum, zone) =>
        sum + Math.abs(assignments[zone] - allocationReference[zone]),
      0
    );

  return {
    model,
    officer_budget: 12,
    zones_with_changed_allocation: changedZones,
    total_absolute_officer_change: absoluteOfficerChange
  };
});

const patrolRows = parseCsv(
  path.join(resultsDir, "patrol", "route-comparison.csv")
);

const patrolSummary = patrolRows.map(row => ({
  model: row.model,
  baseline_km: Number(row.nearest_neighbour_km),
  optimized_km: Number(row.two_opt_km),
  distance_saved_km: Number(row.distance_saved_km),
  distance_saved_percent: Number(row.distance_saved_percent),
  route_order_changed: row.route_order_changed
}));

fs.mkdirSync(summaryDir, { recursive: true });

const combinedRows = [
  ["section", "model", "metric", "value"],
  ...riskSummary.flatMap(row => [
    ["risk", row.model, "zones_with_rank_change", row.zones_with_rank_change],
    ["risk", row.model, "mean_absolute_rank_shift", row.mean_absolute_rank_shift],
    ["risk", row.model, "top_zone", row.top_zone]
  ]),
  ...allocationSummary.flatMap(row => [
    ["allocation", row.model, "officer_budget", row.officer_budget],
    ["allocation", row.model, "zones_with_changed_allocation", row.zones_with_changed_allocation],
    ["allocation", row.model, "total_absolute_officer_change", row.total_absolute_officer_change]
  ]),
  ...patrolSummary.flatMap(row => [
    ["patrol", row.model, "baseline_km", row.baseline_km],
    ["patrol", row.model, "optimized_km", row.optimized_km],
    ["patrol", row.model, "distance_saved_km", row.distance_saved_km],
    ["patrol", row.model, "distance_saved_percent", row.distance_saved_percent],
    ["patrol", row.model, "route_order_changed", row.route_order_changed]
  ])
];

const csv = combinedRows.map(row => row.join(",")).join("\n") + "\n";
fs.writeFileSync(path.join(summaryDir, "research-summary.csv"), csv);

fs.writeFileSync(
  path.join(summaryDir, "research-summary.json"),
  JSON.stringify({
    dataset: "deterministic synthetic Shrawan 2083 Kathmandu Valley dataset",
    risk_reference_model: "frequency-only",
    allocation_reference_model: "frequency-only",
    officer_budget: 12,
    risk: riskSummary,
    allocation: allocationSummary,
    patrol: patrolSummary,
    note: "Descriptive comparison only. Metrics do not establish that any model is universally superior."
  }, null, 2) + "\n"
);

console.log("Generated consolidated research summary.");
console.table(riskSummary);
console.table(allocationSummary);
console.table(patrolSummary);
