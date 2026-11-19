// ============================================================================
// SurakshyaPath — Explainable Intelligence Layer
// ============================================================================
// This module is intentionally NOT a neural network.
// It is an explainable statistical/heuristic fusion layer that converts the
// validated live snapshot into structured intelligence for the API and UI.
// A future trained ML/neural model can be inserted behind the same contract.
// ============================================================================

const Temporal = require('../public/js/temporal');
const DAY_MS = Temporal.DAY_MS;

const DEFAULT_TYPES = new Set(['theft', 'suspicious', 'harassment', 'infrastructure']);

function classifyRecord(incident, zonesById, types, now) {
  const reasons = [];
  if (!incident || typeof incident !== 'object') reasons.push('record is not an object');
  const ts = Number(incident?.ts);
  const lat = Number(incident?.lat);
  const lng = Number(incident?.lng);

  if (!Number.isFinite(ts)) reasons.push('timestamp is invalid');
  if (Number.isFinite(ts) && ts > now) reasons.push('timestamp is in the future');
  if (incident?.time && (!Temporal.isValidTime(incident.time) ||
      Temporal.resolveTime(incident, now).origin === 'invalid-metadata')) {
    reasons.push('timestamp precision metadata is invalid');
  }
  const knownType = types
    ? Object.hasOwn(types, incident?.type)
    : DEFAULT_TYPES.has(incident?.type);
  if (!knownType) reasons.push('incident type is unknown');
  if (!zonesById.has(incident?.zone)) reasons.push('zone is unknown');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) reasons.push('latitude is outside valid bounds');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) reasons.push('longitude is outside valid bounds');

  return { valid: reasons.length === 0, reasons };
}

function buildDataQuality(incidents, zones, now = Date.now(), types) {
  const source = Array.isArray(incidents) ? incidents : [];
  const zonesById = new Map((zones || []).map(zone => [zone.id, zone]));
  const rejected = [];
  const seen = new Set();
  let duplicates = 0;
  let futureDates = 0;
  let invalidCoordinates = 0;
  let missingValues = 0;
  const precisionByOrigin = {};
  let eventHourEligibleRecords = 0;

  source.forEach((incident, index) => {
    const id = incident?.id;
    const isDuplicate = Boolean(id && seen.has(id));
    if (isDuplicate) duplicates++;
    if (id) seen.add(id);

    const check = classifyRecord(incident, zonesById, types, now);
    if (isDuplicate) { check.reasons.push('duplicate id'); check.valid = false; }
    if (check.valid) {
      const time = Temporal.resolveTime(incident, now);
      const key = `${time.origin}:${time.precision}`;
      precisionByOrigin[key] = (precisionByOrigin[key] || 0) + 1;
      if (Temporal.eventHour(incident, now) !== null) eventHourEligibleRecords++;
    }
    if (!check.valid) {
      rejected.push({ index, id: id || null, reasons: check.reasons });
      if (check.reasons.includes('timestamp is in the future')) futureDates++;
      invalidCoordinates += check.reasons.filter(reason => reason.includes('outside valid bounds')).length;
      if (check.reasons.some(reason => reason.includes('invalid') || reason.includes('unknown') || reason.includes('missing'))) missingValues++;
    }
  });

  const recordsAccepted = source.length - rejected.length;
  const qualityScore = source.length
    ? Math.max(0, Number((recordsAccepted / source.length - duplicates / source.length).toFixed(3)))
    : 0;

  return {
    recordsReceived: source.length,
    recordsAccepted,
    recordsRejected: rejected.length,
    duplicates,
    missingValues,
    futureDates,
    invalidCoordinates,
    qualityScore,
    temporalCoverage: {
      precisionByOrigin,
      eventHourEligibleRecords,
      recordsWithoutKnownTime: Object.entries(precisionByOrigin)
        .filter(([key]) => key.endsWith(':unknown'))
        .reduce((sum, [, count]) => sum + count, 0)
    },
    rejectedSamples: rejected.slice(0, 10),
    rejectedIndexes: rejected.map(item => item.index)
  };
}

function statusFor(count, qualityScore) {
  if (count === 0) return 'NO_DATA';
  if (count < 10) return 'INSUFFICIENT_DATA';
  if (qualityScore < 0.8) return 'PARTIAL_SUCCESS';
  return 'SUCCESS';
}

function buildIntelligence({ incidents, zones, riskZones = [], types, now = Date.now() }) {
  const source = Array.isArray(incidents) ? incidents : [];
  const zoneList = Array.isArray(zones) ? zones : [];
  const quality = buildDataQuality(source, zoneList, now, types);
  const rejectedIndexes = new Set(quality.rejectedIndexes || []);
  const zonesById = new Map(zoneList.map(z => [z.id, z]));
  const valid = source.filter((incident, index) => !rejectedIndexes.has(index) && classifyRecord(incident, zonesById, types, now).valid);
  const recent30Window = Temporal.countInWindow(valid, now - 30 * DAY_MS, now, now);
  const recent7Window = Temporal.countInWindow(valid, now - 7 * DAY_MS, now, now);
  const previous7Window = Temporal.countInWindow(valid, now - 14 * DAY_MS, now - 7 * DAY_MS - 1, now);
  const inWindow = (record, start, end) => Temporal.classifyWindow(record, start, end, now) === 'included';
  const recent30 = valid.filter(i => inWindow(i, now - 30 * DAY_MS, now));
  const recent7 = valid.filter(i => inWindow(i, now - 7 * DAY_MS, now));
  const previous7 = valid.filter(i => inWindow(i, now - 14 * DAY_MS, now - 7 * DAY_MS - 1));

  const byZone = new Map(zoneList.map(zone => [zone.id, 0]));
  const byType = {};
  const byHour = Array(24).fill(0);
  let hourlyRecords = 0;

  for (const incident of recent30) {
    byZone.set(incident.zone, (byZone.get(incident.zone) || 0) + 1);
    byType[incident.type] = (byType[incident.type] || 0) + 1;
    const hour = Temporal.eventHour(incident, now);
    if (hour !== null) {
      byHour[hour]++;
      hourlyRecords++;
    }
  }

  const rankedZones = [...byZone.entries()]
    .map(([zoneId, count]) => ({
      zoneId,
      zone: zoneList.find(z => z.id === zoneId)?.name || zoneId,
      count
    }))
    .sort((a, b) => b.count - a.count || a.zoneId.localeCompare(b.zoneId));

  const peak = byHour.reduce(
    (best, count, hour) => count > best.count ? { hour, count } : best,
    { hour: null, count: 0 }
  );
  if (!hourlyRecords) peak.hour = null;

  const trendRatio = previous7Window.status === 'AVAILABLE' && previous7.length
    ? recent7.length / previous7.length
    : null;
  const trend = recent7Window.status !== 'AVAILABLE' || previous7Window.status !== 'AVAILABLE'
    ? 'UNAVAILABLE'
    : trendRatio === null
    ? 'NO_BASELINE'
    : trendRatio > 1.15
      ? 'INCREASING'
      : trendRatio < 0.85
        ? 'DECREASING'
        : 'STABLE';

  const topZone = rankedZones[0] || null;
  const topRiskZone = [...(Array.isArray(riskZones) ? riskZones : [])].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0] || null;
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  const ages = recent30.map(record => Temporal.ageDays(record, now)).filter(Number.isFinite);
  const evidenceDays = ages.length
    ? Math.min(30, Math.max(1, Math.ceil(Math.max(...ages) + 1)))
    : 0;
  const timeExcluded = recent30Window.ambiguous + recent30Window.unknown + recent30Window.future;
  const timeCoverage = recent30.length + timeExcluded
    ? recent30.length / (recent30.length + timeExcluded)
    : 0;

  const confidence = Number(Math.min(
    1,
    quality.qualityScore *
    Math.min(1, recent30.length / 30) *
    (previous7Window.status === 'AVAILABLE' && previous7.length ? 1 : 0.75) *
    timeCoverage
  ).toFixed(2));

  const recommendations = [];
  if (topRiskZone && peak.hour !== null) {
    recommendations.push({
      zone: topRiskZone.name,
      reason: `Highest modelled risk is ${topRiskZone.score}/100 from ${topRiskZone.count} validated 30-day records; the peak UTC hour among exact-time records is ${String(peak.hour).padStart(2, '0')}:00.`,
      priority: topRiskZone.score,
      riskScore: topRiskZone.score,
      confidence
    });
  }
  if (trend === 'INCREASING') {
    recommendations.push({
      zone: topZone?.zone || null,
      reason: 'Validated 7-day volume is above the preceding 7-day baseline.',
      priority: recent7.length
    });
  }

  const baseStatus = statusFor(recent30.length, quality.qualityScore);
  const status = (recent30.length === 0 && valid.length > 0 && timeExcluded > 0) ||
    (timeExcluded > 0 && baseStatus === 'SUCCESS')
    ? 'PARTIAL_SUCCESS'
    : baseStatus;
  const summary = status === 'NO_DATA'
    ? 'No validated incident data is available for intelligence analysis.'
    : baseStatus === 'INSUFFICIENT_DATA'
      ? `Only ${recent30.length} validated records are available; the system can describe records but evidence is limited.` +
        (timeExcluded ? ` ${timeExcluded} records have unknown or boundary-ambiguous timing and were excluded from time-window metrics.` : '')
      : `Analyzed ${recent30.length} validated records across ${rankedZones.filter(z => z.count > 0).length} active zones.` +
        (timeExcluded ? ` ${timeExcluded} records have unknown, future, or boundary-ambiguous timing and were excluded from time-window metrics.` : '');

  return {
    status,
    modelType: 'STATISTICAL_HEURISTIC',
    modelVersion: 'heuristic-intelligence-v1',
    generatedAt: new Date(now).toISOString(),
    summary,
    patterns: [
      topZone ? `Highest validated 30-day record count: ${topZone.zone} (${topZone.count}).` : 'No zone pattern is available.',
      topRiskZone ? `Highest modelled risk: ${topRiskZone.name} (${topRiskZone.score}/100, ${topRiskZone.band}).` : 'No risk model output is available.',
      topType ? `Most frequent type: ${types?.[topType[0]]?.label || topType[0]} (${topType[1]}).` : 'No incident-type pattern is available.',
      peak.hour !== null
        ? `Peak UTC hour across ${hourlyRecords} exact-time records: ${String(peak.hour).padStart(2, '0')}:00.`
        : 'Hourly pattern unavailable: no exact, non-synthetic event timestamps.'
    ],
    anomalies: trend === 'INCREASING'
      ? [{ type: 'volume_change', description: 'Recent 7-day volume exceeds the preceding 7-day baseline.' }]
      : [],
    riskFactors: [
      ...(topZone ? [{ factor: 'incident_volume', zone: topZone.zone, value: topZone.count }] : []),
      ...(topRiskZone ? [{ factor: 'risk_score', zone: topRiskZone.name, value: topRiskZone.score, band: topRiskZone.band }] : [])
    ],
    recommendations,
    confidence,
    dataCoverage: {
      validRecords: valid.length,
      analyzedRecords: recent30.length,
      evidenceDays,
      activeZones: rankedZones.filter(z => z.count > 0).length,
      riskModelZones: Array.isArray(riskZones) ? riskZones.length : 0,
      temporalPrecision: quality.temporalCoverage.precisionByOrigin,
      timeWindowExcludedRecords: timeExcluded,
      boundaryAmbiguousRecords: recent30Window.ambiguous,
      unknownTimeRecords: recent30Window.unknown,
      hourlyEligibleRecords: hourlyRecords
    },
    trend: {
      direction: trend,
      recent7d: recent7Window.value,
      previous7d: previous7Window.value,
      status: recent7Window.status === 'AVAILABLE' && previous7Window.status === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
      excluded: {
        recent7d: recent7Window.ambiguous + recent7Window.unknown + recent7Window.future,
        previous7d: previous7Window.ambiguous + previous7Window.unknown + previous7Window.future
      }
    },
    limitations: [
      'This is an explainable statistical/heuristic layer, not a trained neural network.',
      source.some(incident => incident.dataStatus === 'IMPORTED')
        ? 'Imported records are user-provided; their provenance and quality have not been independently verified.'
        : 'The dashboard dataset is synthetic and must not be interpreted as real incident-level police data.',
      `All event-time analytics use UTC. Hourly metrics use exact timestamps only; date-only, synthetic, approximate, and unknown times are excluded.`,
      'Confidence is an evidence-coverage heuristic, not a calibrated probability.'
    ]
  };
}

module.exports = {
  buildDataQuality,
  buildIntelligence
};
