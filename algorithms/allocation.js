// ============================================================================
// SurakshyaPath — Resource Allocation Model
// ============================================================================
// Baseline resource-allocation algorithm.
//
// Officers are distributed proportionally according to zone risk scores
// using the largest-remainder method.
//
// If every active zone has a zero score, there is no proportional signal;
// the implementation falls back to equal shares with deterministic
// largest-remainder tie-breaking so the requested budget is still conserved.
// ============================================================================

function computeAllocation({
  zones,
  officers = 12,
}) {
  const budget = Number.isFinite(officers)
    ? Math.max(0, Math.floor(officers))
    : 0;

  const activeZones = zones.filter(
    (zone) => zone.count > 0
  );

  if (!activeZones.length || budget < 1) {
    return {
      officers: budget,
      zones: [],
    };
  }

  const totalScore = activeZones.reduce(
    (sum, zone) => sum + Math.max(0, Number(zone.score) || 0),
    0
  );

  const denominator = totalScore > 0 ? totalScore : activeZones.length;

  const shares = activeZones.map((zone) => {
    const score = totalScore > 0 ? Math.max(0, Number(zone.score) || 0) : 1;
    return {
      zone,
      share: (score / denominator) * budget,
    };
  });

  const assigned = shares.map((item) => ({
    floor: Math.floor(item.share),
    rem: item.share % 1,
  }));

  let remaining =
    budget -
    assigned.reduce((sum, item) => sum + item.floor, 0);

  assigned
    .map((item, index) => ({ index, rem: item.rem }))
    .sort((a, b) => b.rem - a.rem || a.index - b.index)
    .forEach((item) => {
      if (remaining > 0) {
        assigned[item.index].floor++;
        remaining--;
      }
    });

  return {
    officers: budget,
    zones: activeZones.map((zone, index) => {
      const peak = zone.peakHour;
      const from = peak !== null
        ? String((peak + 23) % 24).padStart(2, '0')
        : '18';
      const to = peak !== null
        ? String((peak + 3) % 24).padStart(2, '0')
        : '22';

      return {
        ...zone,
        officers: assigned[index].floor,
        window: `${from}:00–${to}:00`,
      };
    }),
  };
}

module.exports = {
  computeAllocation,
};
