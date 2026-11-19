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
const Temporal = require('../public/js/temporal');

function decayForAge(days) {
  return Math.min(1, Math.max(0.15, 1 - days / 30));
}

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

  return decayForAge(days);
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
    const age = Temporal.ageDays(incident, now);

    if (!type || age === null) return sum;

    const severity = type.useRecordSeverity && Number.isFinite(Number(incident.severity))
      ? Number(incident.severity)
      : type.severity;
    if (!Number.isFinite(severity) || severity < 0) return sum;

    return sum + severity * decayForAge(age);
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
    const candidates = incidents.filter(incident => incident.zone === zone.id);
    const windowCounts = { included: 0, ambiguous: 0, unknown: 0, future: 0, outside: 0 };
    const zoneIncidents = candidates.filter(incident => {
      const status = Temporal.classifyWindow(incident, cutoff, now, now);
      windowCounts[status]++;
      return status === 'included';
    });

    const raw = calculateZoneRisk(zoneIncidents, types, now);

    return {
      zone,
      candidates,
      incidents: zoneIncidents,
      raw,
      windowCounts,
      candidateCount: candidates.length
    };
  });

  const maxRisk = Math.max(
    ...rawZones.map((zone) => zone.raw),
    1
  );

  return rawZones
    .map(({ zone, candidates, incidents, raw, windowCounts, candidateCount }) => {
      const hourCounts = new Map();
      for (const incident of incidents) {
        const hour = Temporal.eventHour(incident, now);
        if (hour === null) continue;
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
      const recent24h = Temporal.countInWindow(
        candidates,
        now - DAY_MS,
        now,
        now
      );

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
        peakHourStatus: hourCounts.size ? 'AVAILABLE' : 'UNAVAILABLE',
        last24h: recent24h.value,
        last24hStatus: recent24h.status,
        last24hCoverage: {
          ambiguous: recent24h.ambiguous,
          unknown: recent24h.unknown,
          future: recent24h.future,
          included: recent24h.included
        },
        temporalCoverage: {
          considered: candidateCount,
          included: windowCounts.included,
          ambiguous: windowCounts.ambiguous,
          unknown: windowCounts.unknown,
          future: windowCounts.future,
          outsideWindow: windowCounts.outside,
          hourlyRecords: [...hourCounts.values()].reduce((sum, count) => sum + count, 0)
        },
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
