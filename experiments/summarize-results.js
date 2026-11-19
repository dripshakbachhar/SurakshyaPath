const fs = require("node:fs");
const path = require("node:path");
const DatasetImport = require("../public/js/dataset-import");
const { ZONES } = require("../config/zones");
const { readCanonicalDataset } = require("../data/canonical-dataset");
const { createExperimentProvenance, hashFile } = require("./provenance");

const resultsDir = path.join(__dirname, "results");
const summaryDir = path.join(resultsDir, "summary");

const models = [
  "frequency-only",
  "severity-only",
  "frequency-severity",
  "current-severity-recency"
];

function parseCsv(file, expectedHeaders) {
  const parsed = DatasetImport.parseCsv(fs.readFileSync(file, "utf8"));
  if (parsed.blankRowsSkipped ||
      parsed.headers.length !== expectedHeaders.length ||
      parsed.headers.some((header, index) => header !== expectedHeaders[index])) {
    throw new Error(`Unexpected CSV structure in ${path.basename(file)}.`);
  }
  if (!parsed.records.length) {
    throw new Error(`No records found in ${path.basename(file)}.`);
  }
  return parsed.records;
}

function parseNumber(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid numeric value in ${label}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value in ${label}.`);
  return parsed;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

const zoneNames = ZONES.map(zone => zone.name);
const risk = Object.fromEntries(
  models.map(model => [
    model,
    parseCsv(path.join(resultsDir, model + ".csv"), [
      "zone", "score", "rank", "incident_count"
    ]).map(row => ({
      zone: row.zone,
      rank: parseNumber(row.rank, `${model}.rank`),
      score: parseNumber(row.score, `${model}.score`),
      incidentCount: parseNumber(row.incident_count, `${model}.incident_count`)
    }))
  ])
);

for (const model of models) {
  const rows = risk[model];
  if (rows.length !== zoneNames.length ||
      rows.some((row, index) => row.rank !== index + 1 ||
        !zoneNames.includes(row.zone) || row.score < 0 || row.score > 100 ||
        !Number.isInteger(row.incidentCount) || row.incidentCount < 0) ||
      new Set(rows.map(row => row.zone)).size !== zoneNames.length) {
    throw new Error(`Invalid zone ranking rows in ${model}.csv.`);
  }
}

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
  path.join(resultsDir, "allocation", "allocation-comparison.csv"),
  ["model", "officers", "zone", "normalized_risk", "assigned_officers", "ideal_share"]
).map(row => ({
  ...row,
  officers: parseNumber(row.officers, "allocation.officers"),
  normalizedRisk: parseNumber(row.normalized_risk, "allocation.normalized_risk"),
  assignedOfficers: parseNumber(row.assigned_officers, "allocation.assigned_officers"),
  idealShare: parseNumber(row.ideal_share, "allocation.ideal_share")
}));
const allocationGroups = new Map();
for (const row of allocationRows) {
  if (!models.includes(row.model) || !zoneNames.includes(row.zone) ||
      ![6, 12, 20].includes(row.officers) ||
      row.normalizedRisk < 0 || row.normalizedRisk > 100 ||
      row.idealShare < 0 ||
      !Number.isInteger(row.assignedOfficers) || row.assignedOfficers < 0) {
    throw new Error("Invalid allocation result row.");
  }
  const key = `${row.model}:${row.officers}`;
  if (!allocationGroups.has(key)) allocationGroups.set(key, []);
  allocationGroups.get(key).push(row);
}
for (const model of models) {
  for (const officers of [6, 12, 20]) {
    const rows = allocationGroups.get(`${model}:${officers}`) || [];
    if (rows.length !== zoneNames.length ||
        new Set(rows.map(row => row.zone)).size !== zoneNames.length ||
        rows.reduce((sum, row) => sum + row.assignedOfficers, 0) !== officers) {
      throw new Error(`Allocation budget or zone coverage failed for ${model} at ${officers} units.`);
    }
  }
}

const allocationByModel = Object.fromEntries(
  models.map(model => [
    model,
    Object.fromEntries(
      allocationRows
        .filter(row => row.model === model && row.officers === 12)
        .map(row => [row.zone, row.assignedOfficers])
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
  path.join(resultsDir, "patrol", "route-comparison.csv"),
  [
    "model", "nearest_neighbour_route", "two_opt_route",
    "nearest_neighbour_km", "two_opt_km", "distance_saved_km",
    "distance_saved_percent", "route_order_changed"
  ]
);

const patrolSummary = patrolRows.map(row => ({
  model: row.model,
  baseline_km: parseNumber(row.nearest_neighbour_km, "patrol.nearest_neighbour_km"),
  optimized_km: parseNumber(row.two_opt_km, "patrol.two_opt_km"),
  distance_saved_km: parseNumber(row.distance_saved_km, "patrol.distance_saved_km"),
  distance_saved_percent: parseNumber(row.distance_saved_percent, "patrol.distance_saved_percent"),
  route_order_changed: row.route_order_changed
}));
if (patrolSummary.length !== models.length ||
    patrolSummary.some(row =>
      !models.includes(row.model) ||
      row.baseline_km < 0 ||
      row.optimized_km < 0 ||
      row.optimized_km > row.baseline_km + 0.01 ||
      row.distance_saved_km < 0 ||
      Math.abs(row.baseline_km - row.optimized_km - row.distance_saved_km) > 0.02 ||
      !["yes", "no"].includes(row.route_order_changed)
    ) ||
    new Set(patrolSummary.map(row => row.model)).size !== models.length) {
  throw new Error("Invalid patrol-route comparison results.");
}

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
    provenance: createExperimentProvenance({
      experimentId: "consolidated-research-summary",
      sourceDataset: {
        ...readCanonicalDataset(),
        zoneCount: zoneNames.length
      },
      randomSeed: 208304,
      modelConfiguration: {
        models,
        riskReferenceModel: "frequency-only",
        allocationReferenceModel: "frequency-only",
        officerBudget: 12,
        allocationBudgets: [6, 12, 20],
        routePriorityZoneCount: 5
      },
      inputArtifacts: [
        ...models.map(model => ({
          path: `${model}.csv`,
          contentHash: hashFile(path.join(resultsDir, `${model}.csv`))
        })),
        {
          path: "allocation/allocation-comparison.csv",
          contentHash: hashFile(path.join(resultsDir, "allocation", "allocation-comparison.csv"))
        },
        {
          path: "patrol/route-comparison.csv",
          contentHash: hashFile(path.join(resultsDir, "patrol", "route-comparison.csv"))
        }
      ],
      metrics: {
        riskRankShift: { unit: "rank positions vs frequency-only" },
        allocationChange: { unit: "officer units vs frequency-only" },
        patrolDistance: { unit: "kilometres" }
      },
      warnings: ["Consolidated metrics summarize synthetic computational comparisons; they do not establish that any model is universally superior."]
    }),
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
