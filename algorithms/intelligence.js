// ============================================================================
// SurakshyaPath — Explainable Intelligence Layer
// ============================================================================
// This module is intentionally NOT a neural network.
// It is an explainable statistical/heuristic fusion layer that converts the
// validated live snapshot into structured intelligence for the API and UI.
// A future trained ML/neural model can be inserted behind the same contract.
// ============================================================================

const DAY_MS = 86400000;

const VALID_TYPES = new Set(['theft', 'suspicious', 'harassment', 'infrastructure']);

function classifyRecord(incident, zonesById, now) {
  const reasons = [];
  if (!incident || typeof incident !== 'object') reasons.push('record is not an object');
  const ts = Number(incident?.ts);
  const lat = Number(incident?.lat);
  const lng = Number(incident?.lng);

  if (!Number.isFinite(ts)) reasons.push('timestamp is invalid');
  if (Number.isFinite(ts) && ts > now) reasons.push('timestamp is in the future');
  if (!VALID_TYPES.has(incident?.type)) reasons.push('incident type is unknown');
  if (!zonesById.has(incident?.zone)) reasons.push('zone is unknown');
  if (!Number.isFinite(lat) || lat < 27.55 || lat > 27.85) reasons.push('latitude is outside configured bounds');
  if (!Number.isFinite(lng) || lng < 85.15 || lng > 85.55) reasons.push('longitude is outside configured bounds');

  return { valid: reasons.length === 0, reasons };
}

function buildDataQuality(incidents, zones, now = Date.now()) {
  const source = Array.isArray(incidents) ? incidents : [];
  const zonesById = new Map((zones || []).map(zone => [zone.id, zone]));
  const rejected = [];
  const seen = new Set();
  let duplicates = 0;
  let futureDates = 0;
  let invalidCoordinates = 0;
  let missingValues = 0;

  source.forEach((incident, index) => {
    const id = incident?.id;
    const isDuplicate = Boolean(id && seen.has(id));
    if (isDuplicate) duplicates++;
    if (id) seen.add(id);

    const check = classifyRecord(incident, zonesById, now);
    if (isDuplicate) check.reasons.push('duplicate id');
    if (!check.valid) {
      rejected.push({ index, id: id || null, reasons: check.reasons });
      if (check.reasons.includes('timestamp is in the future')) futureDates++;
      if (check.reasons.some(reason => reason.includes('outside configured bounds'))) invalidCoordinates++;
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
    rejectedSamples: rejected.slice(0, 10)
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
  const quality = buildDataQuality(source, zoneList, now);
  const valid = source.filter(incident => classifyRecord(incident, new Map(zoneList.map(z => [z.id, z])), now).valid);
  const recent30 = valid.filter(i => now - Number(i.ts) < 30 * DAY_MS);
  const recent7 = valid.filter(i => now - Number(i.ts) < 7 * DAY_MS);
  const previous7 = valid.filter(i => {
    const age = now - Number(i.ts);
    return age >= 7 * DAY_MS && age < 14 * DAY_MS;
  });

  const byZone = new Map(zoneList.map(zone => [zone.id, 0]));
  const byType = {};
  const byHour = Array(24).fill(0);

  for (const incident of recent30) {
    byZone.set(incident.zone, (byZone.get(incident.zone) || 0) + 1);
    byType[incident.type] = (byType[incident.type] || 0) + 1;
    byHour[new Date(Number(incident.ts)).getHours()]++;
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

  const trendRatio = previous7.length ? recent7.length / previous7.length : null;
  const trend = trendRatio === null
    ? 'NO_BASELINE'
    : trendRatio > 1.15
      ? 'INCREASING'
      : trendRatio < 0.85
        ? 'DECREASING'
        : 'STABLE';

  const topZone = rankedZones[0] || null;
  const topRiskZone = [...(Array.isArray(riskZones) ? riskZones : [])].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0] || null;
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  const evidenceDays = recent30.length
    ? Math.min(30, Math.max(1, Math.ceil((now - Math.min(...recent30.map(i => Number(i.ts)))) / DAY_MS)))
    : 0;

  const confidence = Number(Math.min(
    1,
    quality.qualityScore *
    Math.min(1, recent30.length / 30) *
    (previous7.length ? 1 : 0.75)
  ).toFixed(2));

  const recommendations = [];
  if (topRiskZone && peak.hour !== null) {
    recommendations.push({
      zone: topRiskZone.name,
      reason: `Highest modelled risk is ${topRiskZone.score}/100 from ${topRiskZone.count} validated 30-day records; peak observed hour is ${String(peak.hour).padStart(2, '0')}:00.`,
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

  const status = statusFor(recent30.length, quality.qualityScore);
  const summary = status === 'NO_DATA'
    ? 'No validated incident data is available for intelligence analysis.'
    : status === 'INSUFFICIENT_DATA'
      ? `Only ${recent30.length} validated records are available; the system can describe observations but evidence is limited.`
      : `Analyzed ${recent30.length} validated records across ${rankedZones.filter(z => z.count > 0).length} active zones.`;

  return {
    status,
    modelType: 'STATISTICAL_HEURISTIC',
    modelVersion: 'heuristic-intelligence-v1',
    generatedAt: new Date(now).toISOString(),
    summary,
    patterns: [
      topZone ? `Highest observed 30-day volume: ${topZone.zone} (${topZone.count}).` : 'No zone pattern is available.',
      topRiskZone ? `Highest modelled risk: ${topRiskZone.name} (${topRiskZone.score}/100, ${topRiskZone.band}).` : 'No risk model output is available.',
      topType ? `Most frequent type: ${types?.[topType[0]]?.label || topType[0]} (${topType[1]}).` : 'No incident-type pattern is available.',
      peak.hour !== null ? `Peak observed hour: ${String(peak.hour).padStart(2, '0')}:00 (${peak.count} records).` : 'No temporal pattern is available.'
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
      riskModelZones: Array.isArray(riskZones) ? riskZones.length : 0
    },
    trend: {
      direction: trend,
      recent7d: recent7.length,
      previous7d: previous7.length
    },
    limitations: [
      'This is an explainable statistical/heuristic layer, not a trained neural network.',
      'The dashboard dataset is synthetic and must not be interpreted as real incident-level police data.',
      'Confidence is an evidence-coverage heuristic, not a calibrated probability.'
    ]
  };
}

module.exports = {
  buildDataQuality,
  buildIntelligence
};
