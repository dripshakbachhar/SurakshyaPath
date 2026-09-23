const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { ZONES } = require("../config/zones");
const { scoreModels } = require("../algorithms/research-models");
const { computeAllocation } = require("../algorithms/allocation");
const { computePatrol } = require("../algorithms/routing");
const { computeZones } = require("../algorithms/risk");

const csv = fs.readFileSync(
  path.join(__dirname, "../data/synthetic_incidents.csv"),
  "utf8"
).trim().split(/\r?\n/);

assert.equal(csv.length - 1, 1567, "synthetic dataset must contain 1567 records");

const headers = csv.shift().split(",");
const incidents = csv.map(line => {
  const values = line.split(",");
  return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
}).map(r => ({
  severity: Number(r.severity),
  ageDays: Number(r.age_days),
  latitude: Number(r.latitude),
  longitude: Number(r.longitude)
}));

function nearestZone(lat, lng) {
  return ZONES.reduce((best, zone) => {
    const d = Math.hypot(lat - zone.lat, lng - zone.lng);
    return d < best.d ? { zone, d } : best;
  }, { zone: ZONES[0], d: Infinity }).zone.name;
}

for (const incident of incidents) incident.zone = nearestZone(incident.latitude, incident.longitude);

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
  zones: ZONES.map((zone, i) => ({
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
const patrolZones = ZONES.map((zone, i) => ({
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
  { zone: "thamel", type: "theft", createdAt: now - 3600000 },
  { zone: "bouddha", type: "harassment", createdAt: now - 7200000 }
];
assert.deepEqual(
  computeZones({ zones: ZONES, incidents: liveIncidents, types, now }),
  computeZones({ zones: ZONES, incidents: liveIncidents, types, now })
);

console.log("Validation passed: dataset, zones, models, allocation, patrol, and risk are deterministic and consistent.");
