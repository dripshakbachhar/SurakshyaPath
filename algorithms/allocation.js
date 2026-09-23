// ============================================================================
// SurakshyaPath — Resource Allocation Model
// ============================================================================
// Baseline resource-allocation algorithm.
//
// Officers are distributed proportionally according to zone risk scores
// using the largest-remainder method.
//
// Future experiments can compare this approach with alternative allocation
// strategies.
// ============================================================================

/**
 * Allocate officers across risk zones.
 *
 * @param {Object} options
 * @param {Array} options.zones
 * @param {number} options.officers
 *
 * @returns {Object}
 */
function computeAllocation({
  zones,
  officers = 12,
}) {
  const activeZones = zones.filter(
    (zone) => zone.count > 0
  );

  if (
    !activeZones.length ||
    officers < 1
  ) {
    return {
      officers,
      zones: [],
    };
  }

  const totalScore =
    activeZones.reduce(
      (sum, zone) =>
        sum + zone.score,
      0
    ) || 1;

  const shares = activeZones.map(
    (zone) => ({
      zone,
      share:
        (zone.score / totalScore) *
        officers,
    })
  );

  const assigned = shares.map(
    (item) => ({
      floor: Math.floor(item.share),
      rem: item.share % 1,
    })
  );

  let remaining =
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
      (a, b) =>
        b.rem - a.rem ||
        a.index - b.index
    )
    .forEach((item) => {
      if (remaining > 0) {
        assigned[item.index].floor++;
        remaining--;
      }
    });

  return {
    officers,

    zones: activeZones.map(
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

module.exports = {
  computeAllocation,
};
