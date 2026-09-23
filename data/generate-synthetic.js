const fs = require("fs");
const path = require("path");

const COUNT = 1567;
const SEED = 208304;
const bounds = { minLat: 27.60, maxLat: 27.78, minLon: 85.20, maxLon: 85.50 };
const categories = [
  { name: "theft", severity: 2 },
  { name: "suspicious", severity: 1 },
  { name: "harassment", severity: 3 },
  { name: "infrastructure", severity: 1 }
];

let seed = SEED;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function pickCategory(i) {
  if (i <= 626) return categories[0];
  if (i <= 1017) return categories[1];
  if (i <= 1330) return categories[2];
  return categories[3];
}

const rows = [
  "id,date,latitude,longitude,category,severity,source_type,data_status,age_days"
];

for (let i = 1; i <= COUNT; i++) {
  const category = pickCategory(i);
  const lat = bounds.minLat + random() * (bounds.maxLat - bounds.minLat);
  const lon = bounds.minLon + random() * (bounds.maxLon - bounds.minLon);
  const ageDays = Math.floor(random() * 30);

  rows.push([
    `syn-shrawan-2083-${String(i).padStart(4, "0")}`,
    "2083-Shrawan",
    lat.toFixed(6),
    lon.toFixed(6),
    category.name,
    category.severity,
    "simulation",
    "SYNTHETIC",
    ageDays
  ].join(","));
}

const out = path.join(__dirname, "synthetic_incidents.csv");
fs.writeFileSync(out, rows.join("\n") + "\n");
console.log(`Generated ${COUNT} synthetic records at ${out}`);
