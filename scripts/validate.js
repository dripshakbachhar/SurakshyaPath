const assert = require("node:assert/strict");

const { ZONES } = require("../config/zones");
const { readCanonicalDataset } = require("../data/canonical-dataset");
const { nearestZone } = require("../data/live-incidents");
const { scoreModels } = require("../algorithms/research-models");
const { computeAllocation } = require("../algorithms/allocation");
const { computePatrol } = require("../algorithms/routing");
const { computeZones } = require("../algorithms/risk");
const Temporal = require("../public/js/temporal");

const dataset = readCanonicalDataset();
assert.equal(dataset.recordCount, 1567, "synthetic dataset must contain 1567 records");
assert.match(dataset.contentHash.value, /^[a-f0-9]{64}$/);

const incidents = dataset.records.map(record => ({
  severity: record.severity,
  ageDays: record.ageDays,
  zone: nearestZone(record.latitude, record.longitude).name
}));

const zoneNames = ZONES.map(zone => zone.name);
const counts = Object.fromEntries(zoneNames.map(zone => [zone, 0]));
for (const incident of incidents) counts[incident.zone]++;
assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 1567);

const models = scoreModels(incidents, zoneNames);
for (const scores of Object.values(models)) {
  assert.deepEqual(Object.keys(scores), zoneNames);
  assert.equal(Math.max(...Object.values(scores)), 100);
}

assert.deepEqual(scoreModels(incidents, zoneNames), scoreModels(incidents, zoneNames));

const allocation = computeAllocation({
  officers: 12,
  zones: ZONES.map(zone => ({
    ...zone,
    count: counts[zone.name],
    score: models["current-severity-recency"][zone.name],
    peakHour: null
  }))
});
assert.equal(
  allocation.zones.reduce((sum, zone) => sum + zone.officers, 0),
  12
);
assert.ok(allocation.zones.every(zone => zone.officers >= 0));

const station = { name: "Validation Station", lat: 27.705, lng: 85.315 };
const patrolZones = ZONES.map(zone => ({
  ...zone,
  count: counts[zone.name],
  score: models["current-severity-recency"][zone.name],
  peakHour: null
}));
const patrol = computePatrol({ station, zones: patrolZones, stopCount: 5 });
assert.ok(patrol.totalKm >= 0);
assert.equal(patrol.stops.length, 5);

const now = Date.UTC(2026, 8, 23);
const types = {
  theft: { severity: 5 },
  suspicious: { severity: 3 },
  harassment: { severity: 7 },
  infrastructure: { severity: 2 }
};
const liveIncidents = [
  { zone: "thamel", type: "theft", ts: now - 3600000, time: Temporal.exactTime(now - 3600000) },
  { zone: "bouddha", type: "harassment", ts: now - 7200000, time: Temporal.exactTime(now - 7200000) }
];

const riskA = computeZones({ zones: ZONES, incidents: liveIncidents, types, now });
const riskB = computeZones({ zones: ZONES, incidents: liveIncidents, types, now });

assert.deepEqual(riskA, riskB);
assert.equal(riskA.reduce((sum, zone) => sum + zone.count, 0), 2);
assert.ok(riskA.find(zone => zone.id === "thamel").score > 0);
assert.ok(riskA.find(zone => zone.id === "bouddha").score > 0);
assert.equal(riskA.find(zone => zone.id === "thamel").count, 1);
assert.equal(riskA.find(zone => zone.id === "bouddha").count, 1);

console.log("Validation passed: dataset, zones, models, allocation, patrol, and risk are deterministic and consistent.");
