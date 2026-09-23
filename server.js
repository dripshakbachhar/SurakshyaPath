// ============================================================================
// SurakshyaPath — Express Server
// ============================================================================
// Main application server.
//
// The server handles:
//   - API routes
//   - incident storage
//   - zone/station configuration
//   - coordination between algorithm modules
//
// Core algorithms are kept separately in:
//   - algorithms/risk.js
//   - algorithms/routing.js
//   - algorithms/allocation.js
// ============================================================================

const express = require('express');
const fs = require('fs');
const { ZONES } = require('./config/zones');
const path = require('path');

const {
  computeZones: computeZonesFromModel,
} = require('./algorithms/risk');

const {
  computePatrol: computePatrolFromModel,
} = require('./algorithms/routing');

const {
  computeAllocation: computeAllocationFromModel,
} = require('./algorithms/allocation');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// CONFIGURATION
// ============================================================================



const STATIONS = [
  {
    id: 'mpr-ratna-park',
    name: 'MPR Ratna Park',
    lat: 27.705,
    lng: 85.315,
  },
  {
    id: 'baneshwor',
    name: 'Baneshwor',
    lat: 27.691,
    lng: 85.335,
  },
  {
    id: 'chabahil',
    name: 'Chabahil',
    lat: 27.717,
    lng: 85.348,
  },
];

const TYPES = {
  theft: {
    severity: 5,
    label: 'Theft',
  },

  suspicious: {
    severity: 3,
    label: 'Suspicious Activity',
  },

  harassment: {
    severity: 7,
    label: 'Harassment',
  },

  infrastructure: {
    severity: 2,
    label: 'Infrastructure Issue',
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const DATA_FILE = path.join(
  __dirname,
  'data',
  'incidents.json'
);

// ============================================================================
// SAMPLE DATA
// ============================================================================

const seedProfiles = [
  {
    name: 'Resident',
    weight: 55,
  },
  {
    name: 'Student',
    weight: 25,
  },
  {
    name: 'Business Owner',
    weight: 15,
  },
  {
    name: 'Visitor',
    weight: 5,
  },
];

const sampleNotes = {
  theft: [
    'Phone reported missing near a crowded area.',
    'Bag reported missing.',
    'Possible theft reported by resident.',
  ],

  suspicious: [
    'Suspicious activity reported near a public area.',
    'Resident reported unusual activity.',
    'Unidentified activity observed.',
  ],

  harassment: [
    'Harassment reported by resident.',
    'Verbal harassment reported.',
    'Unsafe interaction reported.',
  ],

  infrastructure: [
    'Broken streetlight reported.',
    'Damaged public infrastructure reported.',
    'Poor lighting reported.',
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function weightedPick(items) {
  const total = items.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  let random = Math.random() * total;

  for (const item of items) {
    random -= item.weight;

    if (random <= 0) {
      return item.name;
    }
  }

  return items[items.length - 1].name;
}

// ============================================================================
// INCIDENT SEEDING
// ============================================================================

function seedIncidents() {
  const incidents = [];

  const zoneIds = ZONES.map(
    (zone) => zone.id
  );

  const typeIds = Object.keys(TYPES);

  for (let i = 0; i < 180; i++) {
    const type =
      typeIds[
        Math.floor(
          Math.random() * typeIds.length
        )
      ];

    const zone =
      zoneIds[
        Math.floor(
          Math.random() * zoneIds.length
        )
      ];

    const ageDays = Math.random() * 30;

    const ts =
      Date.now() -
      ageDays * DAY_MS;

    incidents.push({
      id: `seed-${i + 1}`,

      zone,

      type,

      ts: Math.round(ts),

      reporter:
        weightedPick(seedProfiles),

      note:
        sampleNotes[type][
          Math.floor(
            Math.random() *
              sampleNotes[type].length
          )
        ],

      lat:
        ZONES.find(
          (z) => z.id === zone
        ).lat +
        rand(-0.002, 0.002),

      lng:
        ZONES.find(
          (z) => z.id === zone
        ).lng +
        rand(-0.002, 0.002),
    });
  }

  return incidents;
}

// ============================================================================
// DATA STORAGE
// ============================================================================

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return null;
    }

    return JSON.parse(
      fs.readFileSync(
        DATA_FILE,
        'utf8'
      )
    );
  } catch (error) {
    console.error(
      'Failed to load incident data:',
      error
    );

    return null;
  }
}

function save(data) {
  try {
    fs.mkdirSync(
      path.dirname(DATA_FILE),
      {
        recursive: true,
      }
    );

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        data,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      'Failed to save incident data:',
      error
    );
  }
}

let incidents = load() || seedIncidents();
let riskCache = null;
const RISK_CACHE_MS = 60_000;

save(incidents);

// ============================================================================
// ZONE HELPERS
// ============================================================================

function nearestZone(lat, lng) {
  let best = null;
  let bestDistance = Infinity;

  for (const zone of ZONES) {
    const distance =
      Math.pow(
        zone.lat - lat,
        2
      ) +
      Math.pow(
        zone.lng - lng,
        2
      );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }

  return best;
}

// ============================================================================
// RISK MODEL
// ============================================================================

function computeZones() {
  const now = Date.now();
  if (riskCache && now - riskCache.at < RISK_CACHE_MS) return riskCache.zones;

  const zones = computeZonesFromModel({
    zones: ZONES,
    incidents,
    types: TYPES,
    days: 30,
    now,
  });

  riskCache = { at: now, zones };
  return zones;
}

// ============================================================================
// PATROL ROUTING
// ============================================================================

function computePatrol(
  stationId,
  stopCount = 5
) {
  const station =
    STATIONS.find(
      (s) => s.id === stationId
    ) || STATIONS[0];

  const zones =
    computeZones();

  return computePatrolFromModel({
    station,
    zones,
    stopCount,
  });
}

// ============================================================================
// RESOURCE ALLOCATION
// ============================================================================

function computeAllocation(
  officers = 12
) {
  const zones =
    computeZones();

  return computeAllocationFromModel({
    zones,
    officers,
  });
}

// ============================================================================
// API — HEALTH
// ============================================================================

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      service: 'SurakshyaPath',
    });
  }
);

// ============================================================================
// API — CONFIGURATION
// ============================================================================

app.get(
  '/api/config',
  (req, res) => {
    res.json({
      zones: ZONES,
      stations: STATIONS,
      types: TYPES,
    });
  }
);

// ============================================================================
// API — INCIDENTS
// ============================================================================

app.get(
  '/api/incidents',
  (req, res) => {
    res.json(incidents);
  }
);

app.post(
  '/api/incidents',
  (req, res) => {
    const {
      lat,
      lng,
      type,
      note,
      reporter,
    } = req.body;

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !TYPES[type]
    ) {
      return res.status(400).json({
        error:
          'Invalid incident data.',
      });
    }

    const zone =
      nearestZone(lat, lng);

    const incident = {
      id:
        `incident-${Date.now()}-${Math.floor(Math.random() * 10000)}`,

      zone: zone.id,

      type,

      ts: Date.now(),

      reporter:
        reporter || 'Anonymous',

      note:
        note ||
        sampleNotes[type][0],

      lat,

      lng,
    };

    incidents.push(incident);
    riskCache = null;
    save(incidents);

    res.status(201).json(
      incident
    );
  }
);

// ============================================================================
// API — RISK
// ============================================================================

app.get(
  '/api/risk',
  (req, res) => {
    res.json(
      computeZones()
    );
  }
);

// ============================================================================
// API — PATROL
// ============================================================================

app.get(
  '/api/patrol',
  (req, res) => {
    const station =
      req.query.station ||
      STATIONS[0].id;

    const stopCount =
      Number(
        req.query.stops || 5
      );

    res.json(
      computePatrol(
        station,
        stopCount
      )
    );
  }
);

// ============================================================================
// API — RESOURCE ALLOCATION
// ============================================================================

app.get(
  '/api/allocation',
  (req, res) => {
    const officers =
      Number(
        req.query.officers || 12
      );

    res.json(
      computeAllocation(
        officers
      )
    );
  }
);

// ============================================================================
// ANALYTICS
// ============================================================================

function buildAnalytics(source, now = Date.now()) {
  const last24h = source.filter((incident) => now - incident.ts < DAY_MS).length;
  const last7d = source.filter((incident) => now - incident.ts < 7 * DAY_MS).length;
  const last30d = source.filter((incident) => now - incident.ts < 30 * DAY_MS).length;

  const byType = {};
  const byHour = Array(24).fill(0);
  const byDay = Array.from({ length: 30 }, (_, index) => ({ day: index + 1, count: 0 }));

  for (const incident of source) {
    byType[incident.type] = (byType[incident.type] || 0) + 1;

    const date = new Date(incident.ts);
    byHour[date.getHours()]++;

    const ageDays = Math.floor((now - incident.ts) / DAY_MS);
    if (ageDays >= 0 && ageDays < 30) byDay[29 - ageDays].count++;
  }

  return { total: source.length, last24h, last7d, last30d, byType, byHour, byDay };
}

app.get('/api/analytics', (req, res) => {
  res.json(buildAnalytics(incidents));
});

// ============================================================================
// API — DASHBOARD SNAPSHOT
// ============================================================================

app.get('/api/dashboard', (req, res) => {
  const snapshot = incidents.slice();
  const now = Date.now();

  const zones = computeZonesFromModel({
    zones: ZONES,
    incidents: snapshot,
    types: TYPES,
    days: 30,
    now,
  });

  res.json({
    incidents: snapshot,
    zones,
    analytics: buildAnalytics(snapshot, now),
  });
});

// ============================================================================
// SERVER
// ============================================================================
// ============================================================================
// SERVER
// ============================================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `SurakshyaPath running on port ${PORT}`
    );
  }
);
