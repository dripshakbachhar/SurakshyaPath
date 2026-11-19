// ============================================================================
// SurakshyaPath — Patrol Routing Model
// ============================================================================
// Baseline patrol-routing algorithm.
//
// The current implementation uses a nearest-neighbour heuristic:
//
//   1. Start at a police station.
//   2. Identify the highest-risk zones.
//   3. Visit the closest remaining high-risk zone.
//   4. Repeat until the required number of stops is reached.
//
// This is a heuristic, not an exact Traveling Salesperson Problem (TSP)
// solution. Future experiments can compare it with approaches such as
// 2-opt or other route-optimization methods.
// ============================================================================

/**
 * Calculate the great-circle distance between two latitude/longitude points.
 *
 * Returns distance in kilometres.
 */
function haversine(a, b) {
  const R = 6371;

  const toRad = (degrees) =>
    (degrees * Math.PI) / 180;

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

function routeDistance(station, stops) {
  let current = station;
  let total = 0;
  for (const stop of stops) {
    total += haversine(current, stop);
    current = stop;
  }
  return total;
}

function twoOptOpenRoute(station, stops) {
  let best = [...stops];
  let bestDistance = routeDistance(station, best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const distance = routeDistance(station, candidate);
        if (distance + 1e-9 < bestDistance) {
          best = candidate;
          bestDistance = distance;
          improved = true;
        }
      }
    }
  }
  return { stops: best, totalKm: bestDistance };
}

/**
 * Calculate a patrol route using the nearest-neighbour heuristic.
 *
 * @param {Object} options
 * @param {Object} options.station
 * @param {Array} options.zones
 * @param {number} options.stopCount
 *
 * @returns {Object}
 */
function computePatrol({
  station,
  zones,
  stopCount = 5,
}) {
  const selectedZones = zones
    .filter((zone) => zone.count > 0)
    .slice(0, stopCount);

  let current = {
    lat: station.lat,
    lng: station.lng,
  };

  const remaining = [...selectedZones];

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
   *
   * 25 km/h average city driving
   * +
   * 10 minutes at each patrol stop
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

module.exports = {
  haversine,
  routeDistance,
  twoOptOpenRoute,
  computePatrol,
};
