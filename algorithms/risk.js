// ============================================================================
// SurakshyaPath — Risk Model
// ============================================================================
// Baseline risk-scoring system.
//
// Risk is calculated from:
//   1. Incident severity
//   2. Incident recency
//
// The score is normalized from 0–100 against the highest-risk zone.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate how much weight an incident receives based on its age.
 *
 * Newer incidents receive greater weight.
 * Incidents older than 30 days are excluded by the caller.
 *
 * Minimum weight: 0.15
 * Maximum weight: 1.00
 */
function decayOf(ts, now = Date.now()) {
  const days = (now - ts) / DAY_MS;

  return Math.min(
    1,
    Math.max(0.15, 1 - days / 30)
  );
}

/**
 * Convert a numerical risk score into a human-readable band.
 */
function riskBand(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

/**
 * Calculate the raw risk score for a single zone.
 *
 * Formula:
 *
 *   Risk(zone) =
 *     Σ [severity(incident) × recency_decay(incident)]
 */
function calculateZoneRisk(zoneIncidents, types, now = Date.now()) {
  return zoneIncidents.reduce((sum, incident) => {
    const type = types[incident.type];
    const timestamp = Number(incident.ts);

    if (!type || !Number.isFinite(timestamp) || timestamp > now) return sum;

    return sum + (
      type.severity *
      decayOf(timestamp, now)
    );
  }, 0);
}

/**
 * Calculate risk scores for all zones.
 *
 * Results are normalized against the highest-risk zone.
 */
function computeZones({
  zones,
  incidents,
  types,
  days = 30,
  now = Date.now(),
}) {
  const cutoff = now - days * DAY_MS;

  const rawZones = zones.map((zone) => {
    const zoneIncidents = incidents.filter((incident) => {
      const timestamp = Number(incident.ts);
      return (
        incident.zone === zone.id &&
        Number.isFinite(timestamp) &&
        timestamp >= cutoff &&
        timestamp <= now
      );
    });

    const raw = calculateZoneRisk(zoneIncidents, types, now);

    return {
      zone,
      incidents: zoneIncidents,
      raw,
    };
  });

  const maxRisk = Math.max(
    ...rawZones.map((zone) => zone.raw),
    1
  );

  return rawZones
    .map(({ zone, incidents, raw }) => {
      const hourCounts = new Map();
      for (const incident of incidents) {
        const hour = new Date(incident.ts).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }

      let peakHour = null;
      let peakCount = 0;
      for (const [hour, count] of hourCounts) {
        if (count > peakCount || (count === peakCount && (peakHour === null || hour < peakHour))) {
          peakHour = hour;
          peakCount = count;
        }
      }

      const score = Math.round((raw / maxRisk) * 100);

      return {
        id: zone.id,
        name: zone.name,
        np: zone.np,
        lat: zone.lat,
        lng: zone.lng,
        score,
        band: riskBand(score),
        count: incidents.length,
        peakHour,
        last24h: incidents.filter(
          (incident) => now - incident.ts < DAY_MS
        ).length,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

module.exports = {
  decayOf,
  riskBand,
  calculateZoneRisk,
  computeZones,
};
