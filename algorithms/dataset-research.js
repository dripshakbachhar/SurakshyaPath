'use strict';

const { computePatrol, routeDistance, twoOptOpenRoute } = require('./routing');
const { computeAllocation } = require('./allocation');
const { scoreModels } = require('./research-models');
const Temporal = require('../public/js/temporal');

function buildDatasetResearch(dataset, now = Date.now()) {
  if (!dataset || !Array.isArray(dataset.records) || !Array.isArray(dataset.zones) ||
      !dataset.records.length || !dataset.zones.length) {
    throw new Error('The active imported dataset is invalid; research analysis was not run.');
  }
  const source = dataset.records;
  const zones = dataset.zones;
  const station = {
    id: 'dataset-centre',
    name: 'Dataset centre',
    lat: zones.reduce((sum, zone) => sum + zone.lat, 0) / zones.length,
    lng: zones.reduce((sum, zone) => sum + zone.lng, 0) / zones.length
  };
  const normalized = source.map(incident => ({
    zone: incident.zone,
    severity: incident.severity,
    ageDays: Temporal.ageDays(incident, now)
  }));
  const timedRecords = normalized.filter((incident, index) => {
    const precision = Temporal.resolveTime(source[index], now).precision;
    return ['instant', 'date'].includes(precision) && Number.isFinite(incident.ageDays);
  });
  const precisionCounts = Temporal.precisionCounts(source, now);
  const precisionTotals = { instant: 0, date: 0, range: 0, unknown: 0 };
  for (const [key, count] of Object.entries(precisionCounts)) {
    const precision = key.slice(key.lastIndexOf(':') + 1);
    if (Object.hasOwn(precisionTotals, precision)) precisionTotals[precision] += count;
  }
  const rangeExcludedRecords = precisionTotals.range;
  const unknownTimeRecords = precisionTotals.unknown;
  const futureTimeRecords = source.filter(incident => {
    const time = Temporal.resolveTime(incident, now);
    return Number.isFinite(incident.ts) && incident.ts > now ||
      time.precision !== 'unknown' &&
      (time.start > now || time.precision === 'date' && time.start > Temporal.utcDayStart(now));
  }).length;
  const warnings = [];
  if (precisionTotals.date) {
    warnings.push(`${precisionTotals.date} records have date-only precision; hour-level analysis is unavailable for them.`);
  }
  if (rangeExcludedRecords) {
    warnings.push(`${rangeExcludedRecords} approximate time ranges were excluded from severity × recency because their event age is not a single point.`);
  }
  if (unknownTimeRecords) {
    warnings.push(`${unknownTimeRecords} records have unknown event time and were excluded from severity × recency.`);
  }
  if (futureTimeRecords) warnings.push(`${futureTimeRecords} future-dated records were excluded from time-dependent analysis.`);
  const zoneIds = zones.map(zone => zone.id);
  const models = scoreModels(normalized, zoneIds);
  models['current-severity-recency'] = scoreModels(timedRecords, zoneIds)['current-severity-recency'];
  const counts = new Map(zoneIds.map(zoneId => [zoneId, 0]));
  for (const incident of source) counts.set(incident.zone, counts.get(incident.zone) + 1);
  const timedCounts = new Map(zoneIds.map(zoneId => [zoneId, 0]));
  for (const incident of timedRecords) timedCounts.set(incident.zone, timedCounts.get(incident.zone) + 1);
  const baselineScores = models['frequency-only'];
  const baselineRank = Object.keys(baselineScores).sort((a, b) => baselineScores[b] - baselineScores[a] || a.localeCompare(b));
  const baselineRankIndex = new Map(baselineRank.map((zoneId, index) => [zoneId, index]));
  const modelZones = (scores, modelCounts = counts) => zones.map(zone => ({
    ...zone,
    count: modelCounts.get(zone.id),
    score: scores[zone.id]
  }));
  const baselineAllocation = computeAllocation({ zones: modelZones(baselineScores), officers: 12 });
  const baselineAllocationByZone = new Map(baselineAllocation.zones.map(zone => [zone.id, zone.officers]));
  const rows = Object.entries(models).map(([model, scores]) => {
    if (model === 'current-severity-recency' && timedRecords.length === 0) {
      return {
        model,
        availability: 'UNAVAILABLE',
        topZone: null,
        zonesReRanked: null,
        allocationChanges: null,
        zoneCount: zones.length,
        nearestNeighbourKm: null,
        twoOptKm: null,
        optimizedRoute: []
      };
    }
    const modelCounts = model === 'current-severity-recency' ? timedCounts : counts;
    const ranked = [...zones].sort((a, b) => scores[b.id] - scores[a.id] || a.id.localeCompare(b.id));
    const allocation = computeAllocation({ zones: modelZones(scores, modelCounts), officers: 12 });
    const allocationChanges = allocation.zones.filter(zone => zone.officers !== baselineAllocationByZone.get(zone.id)).length;
    const routeZones = ranked.map(zone => ({ ...zone, count: modelCounts.get(zone.id), score: scores[zone.id] }));
    const nearest = computePatrol({ station, zones: routeZones, stopCount: 5 });
    const optimized = twoOptOpenRoute(station, nearest.stops);
    return {
      model,
      availability: model === 'current-severity-recency' && timedRecords.length < source.length ? 'PARTIAL' : 'AVAILABLE',
      topZone: ranked[0]?.name || '—',
      zonesReRanked: ranked.filter((zone, index) => baselineRankIndex.get(zone.id) !== index).length,
      allocationChanges,
      zoneCount: zones.length,
      nearestNeighbourKm: Number(routeDistance(station, nearest.stops).toFixed(2)),
      twoOptKm: Number(optimized.totalKm.toFixed(2)),
      optimizedRoute: optimized.stops.map(zone => zone.name)
    };
  });
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      schemaVersion: dataset.schemaVersion || null,
      contentHash: dataset.contentHash || null,
      records: source.length,
      zones: zones.length,
      categories: Object.values(dataset.types).map(type => type.label),
      importedAt: dataset.importedAt,
      provenance: dataset.provenance || null,
      temporalCoverage: {
        records: source.length,
        recencyEligibleRecords: timedRecords.length,
        recencyExcludedRecords: source.length - timedRecords.length,
        exclusions: {
          unknownTimeRecords,
          approximateRangeRecords: rangeExcludedRecords,
          futureTimeRecords
        },
        precisionCounts: precisionTotals,
        precisionByOrigin: precisionCounts,
        hourlyAnalysis: {
          status: 'UNAVAILABLE',
          explanation: 'Dataset-specific route comparisons do not calculate event-hour metrics; imported exact timestamps remain distinct from date-only and approximate times.'
        }
      }
    },
    sourceDataset: {
      id: dataset.id,
      name: dataset.name,
      schemaVersion: dataset.schemaVersion || null,
      contentHash: dataset.contentHash || null
    },
    modelConfiguration: {
      scoring: {
        'frequency-only': 'Record count per zone.',
        'severity-only': 'Mean record severity per zone.',
        'frequency-severity': 'Sum of record severity per zone.',
        'current-severity-recency': 'Severity weighted by max(0.15, 1 - ageDays/30); exact and date-only records only.'
      },
      referenceModel: 'frequency-only',
      recencyWindowDays: 30,
      recencyMinimumWeight: 0.15,
      allocationBudget: 12,
      routeStopCount: 5,
      routeDistance: 'Great-circle coordinate distance; not road-network distance.'
    },
    warnings,
    methods: {
      scoring: 'Four shared research models. Severity-only uses mean record severity; frequency-severity uses the sum; recency weight is max(0.15, 1 - ageDays/30), so older records remain at the 0.15 floor. Imported date-only ages use UTC calendar days; recency excludes records with unknown or future timing.',
      allocation: 'Largest-remainder allocation using a fixed budget of 12 across dataset zones.',
      routing: 'Five highest-ranked zones; nearest-neighbour route compared with open-route 2-opt using great-circle distances.',
      robustness: 'Not estimated from a single imported dataset; repeat the study with independent datasets or a documented resampling design.'
    },
    rows
  };
}

module.exports = { buildDatasetResearch };
