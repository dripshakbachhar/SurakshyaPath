'use strict';

const { computePatrol, routeDistance, twoOptOpenRoute } = require('./routing');
const { computeAllocation } = require('./allocation');
const { scoreModels } = require('./research-models');
const Temporal = require('../public/js/temporal');

function buildDatasetResearch(dataset, now = Date.now()) {
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
  const timedRecords = normalized.filter(incident => Number.isFinite(incident.ageDays));
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
      name: dataset.name,
      records: source.length,
      zones: zones.length,
      categories: Object.values(dataset.types).map(type => type.label),
      importedAt: dataset.importedAt,
      temporalCoverage: {
        records: source.length,
        recencyEligibleRecords: timedRecords.length,
        recencyExcludedRecords: source.length - timedRecords.length,
        precisionByOrigin: Temporal.precisionCounts(source, now)
      }
    },
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
