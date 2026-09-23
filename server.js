/* ============================================================================
   SurakshyaPath (सुरक्षापथ) — Backend
   ----------------------------------------------------------------------------
   A small, readable Express API that powers the demo.

   Core features:
     1. Anonymous incident reporting      POST /api/reports
     2. Dynamic risk-zone computation     GET  /api/zones
     3. Timing & frequency analytics      GET  /api/analytics
     4. Patrol route computation          GET  /api/patrol
     5. Officer resource allocation       GET  /api/allocation

   Risk modelling is implemented separately in:
     ./algorithms/risk.js

   Data is stored in ./data/incidents.json (auto-seeded with sample data
   on first run).
   ========================================================================== */

const express = require('express');
const fs = require('fs');
const path = require('path');

const {
  computeZones: computeZonesFromModel,
} = require('./algorithms/risk');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


/* ---------------------------------------------------------------------------
   1. Reference data — neighbourhood zones & police stations
   ------------------------------------------------------------------------- */

const ZONES = [
  {
    id: 'thamel',
    name: 'Thamel',
    np: 'थामेल',
    lat: 27.7165,
    lng: 85.3125,
  },
  {
    id: 'kalimati',
    name: 'Kalimati',
    np: 'कालीमाटी',
    lat: 27.6960,
    lng: 85.3000,
  },
  {
    id: 'baneshwor',
    name: 'New Baneshwor',
    np: 'नयाँ बानेश्वर',
    lat: 27.6930,
    lng: 85.3370,
  },
  {
    id: 'chabahil',
    name: 'Chabahil',
    np: 'चाबाहिल',
    lat: 27.7180,
    lng: 85.3480,
  },
  {
    id: 'koteshwor',
    name: 'Koteshwor',
    np: 'कोटेश्वर',
    lat: 27.6780,
    lng: 85.3490,
  },
  {
    id: 'balaju',
    name: 'Balaju',
    np: 'बालाजु',
    lat: 27.7370,
    lng: 85.3020,
  },
  {
    id: 'patan',
    name: 'Patan',
    np: 'पाटन',
    lat: 27.6720,
    lng: 85.3250,
  },
  {
    id: 'gongabu',
    name: 'Gongabu',
    np: 'गोंगबु',
    lat: 27.7350,
    lng: 85.3160,
  },
  {
    id: 'kirtipur',
    name: 'Kirtipur',
    np: 'कीर्तिपुर',
    lat: 27.6780,
    lng: 85.2790,
  },
  {
    id: 'bouddha',
    name: 'Bouddha',
    np: 'बौद्ध',
    lat: 27.7210,
    lng: 85.3620,
  },
];

const STATIONS = [
  {
    id: 'mpr',
    name: 'Metropolitan Police Range (Ratna Park)',
    lat: 27.7040,
    lng: 85.3150,
  },
  {
    id: 'baneshwor',
    name: 'Police Circle, Baneshwor',
    lat: 27.6925,
    lng: 85.3360,
  },
  {
    id: 'chabahil',
    name: 'Police Circle, Chabahil',
    lat: 27.7175,
    lng: 85.3470,
  },
];

/*
 * Incident types and their severity weights.
 * These values are consumed by algorithms/risk.js.
 */
const TYPES = {
  theft: {
    label: 'Theft / Pickpocketing',
    np: 'चोरी',
    severity: 5,
  },

  suspicious: {
    label: 'Suspicious Activity',
    np: 'संदिग्ध गतिविधि',
    severity: 3,
  },

  harassment: {
    label: 'Harassment',
    np: 'उत्पीडन',
    severity: 7,
  },

  infrastructure: {
    label: 'Infrastructure Issue',
    np: 'पूर्वाधार समस्या',
    severity: 2,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const DATA_FILE = path.join(
  __dirname,
  'data',
  'incidents.json'
);


/* ---------------------------------------------------------------------------
   2. Incident store
   ------------------------------------------------------------------------- */

const SEED_PROFILE = {
  thamel: {
    count: 18,
    types: {
      theft: 0.6,
      suspicious: 0.25,
      harassment: 0.15,
    },
    night: 0.85,
  },

  kalimati: {
    count: 15,
    types: {
      theft: 0.55,
      suspicious: 0.3,
      harassment: 0.15,
    },
    night: 0.7,
  },

  baneshwor: {
    count: 12,
    types: {
      harassment: 0.45,
      theft: 0.35,
      suspicious: 0.2,
    },
    night: 0.6,
  },

  chabahil: {
    count: 10,
    types: {
      suspicious: 0.4,
      theft: 0.4,
      infrastructure: 0.2,
    },
    night: 0.5,
  },

  koteshwor: {
    count: 9,
    types: {
      theft: 0.5,
      infrastructure: 0.3,
      suspicious: 0.2,
    },
    night: 0.55,
  },

  gongabu: {
    count: 9,
    types: {
      theft: 0.45,
      suspicious: 0.4,
      infrastructure: 0.15,
    },
    night: 0.65,
  },

  balaju: {
    count: 7,
    types: {
      infrastructure: 0.4,
      theft: 0.35,
      suspicious: 0.25,
    },
    night: 0.4,
  },

  patan: {
    count: 8,
    types: {
      theft: 0.45,
      suspicious: 0.35,
      harassment: 0.2,
    },
    night: 0.5,
  },

  bouddha: {
    count: 5,
    types: {
      theft: 0.4,
      suspicious: 0.4,
      infrastructure: 0.2,
    },
    night: 0.5,
  },

  kirtipur: {
    count: 4,
    types: {
      infrastructure: 0.5,
      theft: 0.3,
      suspicious: 0.2,
    },
    night: 0.25,
  },
};

const SAMPLE_NOTES = {
  theft: [
    'Phone snatched by a motorcycle rider.',
    'Shop cash box stolen at closing time.',
    'Bag pickpocketed in the crowd.',
    'Bicycle stolen from parking area.',
  ],

  suspicious: [
    'Two men loitering near the ATM for hours.',
    'Unknown group gathering late at night.',
    'Someone checking parked scooter locks.',
    'Unattended bag near the gate.',
  ],

  harassment: [
    'Eve-teasing near the bus stop.',
    'Followed by a stranger on the way home.',
    'Verbal abuse outside the college gate.',
  ],

  infrastructure: [
    'Street light not working — fully dark lane.',
    'Open manhole on the footpath.',
    'Broken CCTV pole at the chowk.',
    'No lighting at the underpass.',
  ],
};

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(weights) {
  const r = Math.random();

  let acc = 0;

  for (const [key, weight] of Object.entries(weights)) {
    acc += weight;

    if (r <= acc) {
      return key;
    }
  }

  return Object.keys(weights)[0];
}

function seedIncidents() {
  const incidents = [];

  let id = 1;

  for (const [zoneId, profile] of Object.entries(SEED_PROFILE)) {
    const zone = ZONES.find((z) => z.id === zoneId);

    for (let i = 0; i < profile.count; i++) {
      const daysAgo = Math.random() * 30;

      const nightRoll =
        Math.random() < profile.night;

      const hour = nightRoll
        ? rand([20, 21, 22, 23, 0, 1, 2, 3])
        : rand([
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
          ]);

      const date = new Date(
        Date.now() - daysAgo * DAY_MS
      );

      date.setHours(
        hour,
        Math.floor(Math.random() * 60),
        0,
        0
      );

      const type = weightedPick(profile.types);

      incidents.push({
        id: id++,
        type,
        zone: zoneId,

        lat: +(
          zone.lat +
          (Math.random() - 0.5) * 0.012
        ).toFixed(5),

        lng: +(
          zone.lng +
          (Math.random() - 0.5) * 0.012
        ).toFixed(5),

        ts: date.getTime(),

        note: rand(SAMPLE_NOTES[type]),
      });
    }
  }

  return incidents.sort(
    (a, b) => a.ts - b.ts
  );
}

function load() {
  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );
  } catch {
    return null;
  }
}

function save() {
  fs.mkdirSync(
    path.dirname(DATA_FILE),
    { recursive: true }
  );

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(incidents, null, 2)
  );
}

let incidents = load() || seedIncidents();

save();


/* ---------------------------------------------------------------------------
   3. Geographic helpers
   ------------------------------------------------------------------------- */

/*
 * Great-circle distance between two latitude/longitude points.
 * Returns distance in kilometres.
 */
function haversine(a, b) {
  const R = 6371;

  const toRad = (d) =>
    (d * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  return (
    2 *
    R *
    Math.asin(Math.sqrt(h))
  );
}

function nearestZone(lat, lng) {
  let best = ZONES[0];
  let bestDistance = Infinity;

  for (const zone of ZONES) {
    const distance = haversine(
      { lat, lng },
      zone
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }

  return best;
}


/* ---------------------------------------------------------------------------
   4. Risk model interface
   ------------------------------------------------------------------------- */

/*
 * The actual risk model now lives in:
 *
 *     algorithms/risk.js
 *
 * Keeping this wrapper means the rest of the backend can continue calling
 * computeZones() without needing to know how the risk model is implemented.
 */
function computeZones() {
  return computeZonesFromModel({
    zones: ZONES,
    incidents,
    types: TYPES,
  });
}


/* ---------------------------------------------------------------------------
   5. Patrol route computation
   ------------------------------------------------------------------------- */

/*
 * Nearest-neighbour patrol route:
 *
 * station
 *   ↓
 * closest high-risk zone
 *   ↓
 * closest remaining high-risk zone
 *   ↓
 * ...
 *
 * This is a heuristic rather than an exact TSP solution.
 */
function computePatrol(
  stationId,
  stopCount = 5
) {
  const station =
    STATIONS.find(
      (s) => s.id === stationId
    ) || STATIONS[0];

  const zones = computeZones()
    .filter((zone) => zone.count > 0)
    .slice(0, stopCount);

  let current = {
    lat: station.lat,
    lng: station.lng,
  };

  const remaining = [...zones];

  const stops = [];

  let totalKm = 0;

  while (remaining.length) {
    let index = 0;
    let bestDistance = Infinity;

    remaining.forEach((zone, i) => {
      const distance = haversine(
        current,
        zone
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        index = i;
      }
    });

    const next =
      remaining.splice(index, 1)[0];

    totalKm += bestDistance;

    stops.push({
      ...next,
      legKm: +bestDistance.toFixed(2),
    });

    current = next;
  }

  /*
   * Approximate travel time:
   *   25 km/h city driving
   *   + 10 minutes at every patrol stop
   */
  const totalMin = Math.round(
    (totalKm / 25) * 60 +
      stops.length * 10
  );

  return {
    station,
    stops,
    totalKm: +totalKm.toFixed(1),
    totalMin,
  };
}


/* ---------------------------------------------------------------------------
   6. Officer resource allocation
   ------------------------------------------------------------------------- */

/*
 * Largest-remainder proportional allocation.
 *
 * The number of officers is distributed according to zone risk scores.
 */
function computeAllocation(
  officers = 12
) {
  const zones = computeZones()
    .filter((zone) => zone.count > 0);

  if (
    !zones.length ||
    officers < 1
  ) {
    return {
      officers,
      zones: [],
    };
  }

  const totalScore =
    zones.reduce(
      (sum, zone) =>
        sum + zone.score,
      0
    ) || 1;

  const staffed = zones.slice(
    0,
    Math.min(
      officers,
      zones.length
    )
  );

  const shares = staffed.map(
    (zone) =>
      (zone.score / totalScore) *
      officers
  );

  const assigned = shares.map(
    (share) => ({
      floor: Math.floor(share),
      rem: share % 1,
    })
  );

  let left =
    officers -
    assigned.reduce(
      (sum, item) =>
        sum + item.floor,
      0
    );

  assigned
    .map((item, index) => ({
      index,
      rem: item.rem,
    }))
    .sort(
      (a, b) => b.rem - a.rem
    )
    .forEach((item) => {
      if (left-- > 0) {
        assigned[item.index].floor++;
      }
    });

  return {
    officers,

    zones: staffed.map(
      (zone, index) => {
        const peak =
          zone.peakHour;

        const from =
          peak !== null
            ? String(
                (peak + 23) % 24
              ).padStart(2, '0')
            : '18';

        const to =
          peak !== null
            ? String(
                (peak + 3) % 24
              ).padStart(2, '0')
            : '22';

        return {
          ...zone,

          officers:
            assigned[index].floor,

          window:
            `${from}:00–${to}:00`,
        };
      }
    ),
  };
}


/* ---------------------------------------------------------------------------
   7. API routes
   ------------------------------------------------------------------------- */

/*
 * Bootstrap data for the frontend.
 */
app.get(
  '/api/meta',
  (_req, res) => {
    res.json({
      zones: ZONES,
      stations: STATIONS,
      types: TYPES,
      generatedAt: Date.now(),
    });
  }
);


/*
 * Anonymous incident reporting.
 *
 * No identity fields are accepted:
 *   - no name
 *   - no phone
 *   - no account
 */
app.post(
  '/api/reports',
  (req, res) => {
    const {
      type,
      note = '',
      when = 'now',
    } = req.body || {};

    if (!TYPES[type]) {
      return res.status(400).json({
        error:
          'Unknown incident type.',
      });
    }

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    if (
      !(
        lat >= 27.4 &&
        lat <= 28.2 &&
        lng >= 84.8 &&
        lng <= 85.6
      )
    ) {
      return res.status(400).json({
        error:
          'Location outside the serviced municipality area.',
      });
    }

    const tsMap = {
      now: Date.now(),

      today:
        Date.now() -
        Math.random() *
          6 *
          3600e3,

      week:
        Date.now() -
        Math.random() *
          6 *
          DAY_MS,
    };

    const zone =
      nearestZone(lat, lng);

    const report = {
      id: incidents.length
        ? Math.max(
            ...incidents.map(
              (incident) =>
                incident.id
            )
          ) + 1
        : 1,

      type,

      lat,
      lng,

      zone: zone.id,

      ts: Math.round(
        tsMap[when] ||
          Date.now()
      ),

      note: String(note).slice(
        0,
        280
      ),
    };

    incidents.push(report);

    save();

    res.status(201).json({
      ok: true,
      report,

      zone: {
        id: zone.id,
        name: zone.name,
        np: zone.np,
      },
    });
  }
);


/*
 * Recent raw reports.
 *
 * Used by the frontend for map markers.
 */
app.get(
  '/api/reports',
  (req, res) => {
    const days =
      Number(req.query.days) ||
      30;

    const cutoff =
      Date.now() -
      days * DAY_MS;

    res.json(
      incidents.filter(
        (incident) =>
          incident.ts >= cutoff
      )
    );
  }
);


/*
 * Dynamic risk zones.
 */
app.get(
  '/api/zones',
  (_req, res) => {
    res.json(
      computeZones()
    );
  }
);


/*
 * Timing and frequency analytics.
 */
app.get(
  '/api/analytics',
  (_req, res) => {
    const cutoff =
      Date.now() -
      30 * DAY_MS;

    const recent =
      incidents.filter(
        (incident) =>
          incident.ts >= cutoff
      );

    const byType =
      Object.fromEntries(
        Object.keys(TYPES).map(
          (type) => [
            type,
            0,
          ]
        )
      );

    const byHour =
      Array(24).fill(0);

    const byDay =
      Array.from(
        { length: 14 },
        (_, index) => ({
          day: index,
          count: 0,
        })
      );

    for (const incident of recent) {
      byType[incident.type]++;

      byHour[
        new Date(
          incident.ts
        ).getHours()
      ]++;

      const daysAgo =
        Math.floor(
          (Date.now() -
            incident.ts) /
            DAY_MS
        );

      if (
        daysAgo >= 0 &&
        daysAgo < 14
      ) {
        byDay[
          13 - daysAgo
        ].count++;
      }
    }

    const nightCount =
      recent.filter(
        (incident) => {
          const hour =
            new Date(
              incident.ts
            ).getHours();

          return (
            hour >= 20 ||
            hour < 4
          );
        }
      ).length;

    res.json({
      total: recent.length,

      byType,

      byHour,

      byDay,

      nightShare:
        recent.length
          ? Math.round(
              (nightCount /
                recent.length) *
                100
            )
          : 0,

      topZones:
        computeZones()
          .slice(0, 5)
          .map((zone) => ({
            name: zone.name,
            score: zone.score,
          })),
    });
  }
);


/*
 * Patrol route.
 */
app.get(
  '/api/patrol',
  (req, res) => {
    res.json(
      computePatrol(
        req.query.station,
        Math.min(
          Number(
            req.query.stops
          ) || 5,
          8
        )
      )
    );
  }
);


/*
 * Officer allocation.
 */
app.get(
  '/api/allocation',
  (req, res) => {
    res.json(
      computeAllocation(
        Math.min(
          Number(
            req.query.officers
          ) || 12,
          60
        )
      )
    );
  }
);


/* ---------------------------------------------------------------------------
   8. Server
   ------------------------------------------------------------------------- */

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `🛡️  SurakshyaPath API + UI running at http://localhost:${PORT}`
    );
  }
);
