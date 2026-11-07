'use strict';

const API = '/api/research';
const $ = (selector) => document.querySelector(selector);

const MODEL_LABELS = {
  'frequency-only': 'Frequency-only',
  'severity-only': 'Severity-only',
  'frequency-severity': 'Frequency × severity',
  'current-severity-recency': 'Severity × recency'
};

const fmt = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

async function getJson(path) {
  const response = await fetch(`${API}/${path}`, {
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Research API returned ${response.status}`);
  return data;
}

function renderDataset(overview, models, robustness) {
  $('#record-count').textContent = Number(overview.dataset.recordCount).toLocaleString();
  $('#zone-count').textContent = overview.dataset.spatialUnits;
  $('#model-count').textContent = models.models.length;
  $('#seed-count').textContent = robustness.seeds.length;
  $('#provenance-note').textContent = overview.dataset.provenanceNote;
}

function renderModels(overview, payload) {
  const summary = overview.canonicalSummary;
  const allocationByModel = Object.fromEntries(summary.allocation.map((item) => [item.model, item]));

  $('#model-summary').innerHTML = payload.models.map((model) => {
    const rankChange = model.zonesWithRankChange === null ? '—' : model.zonesWithRankChange;
    const shift = model.meanAbsoluteRankShift === null ? '—' : fmt(model.meanAbsoluteRankShift);
    return `<tr>
      <td>${MODEL_LABELS[model.id] || model.label}</td>
      <td>${model.topZone || '—'}</td>
      <td>${rankChange}</td>
      <td>${shift}</td>
    </tr>`;
  }).join('');

  $('#model-visuals').innerHTML = payload.models.map((model) => {
    const allocation = allocationByModel[model.id];
    const zones = model.zones.slice(0, 5);
    return `<article class="model-card">
      <div class="model-card-head">
        <strong>${MODEL_LABELS[model.id] || model.label}</strong>
        <span>Top: ${model.topZone || '—'}</span>
      </div>
      ${zones.map((zone) => `<div class="score-row">
        <span title="${zone.zone}">${zone.zone}</span>
        <div class="score-track" aria-label="${zone.zone} score ${fmt(zone.score, 1)} out of 100">
          <div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(zone.score) || 0))}%"></div>
        </div>
        <b>${fmt(zone.score, 1)}</b>
      </div>`).join('')}
      <p class="fine-print">12-unit allocation changes vs. frequency baseline: ${allocation?.zones_with_changed_allocation ?? '—'} zones.</p>
    </article>`;
  }).join('');
}

function renderAllocation(overview, allocation) {
  const severity = overview.canonicalSummary.allocation.find((item) => item.model === 'severity-only');
  const changed = severity?.zones_with_changed_allocation ?? '—';
  const total = severity?.total_absolute_officer_change ?? '—';
  $('#allocation-highlight').innerHTML = `<span class="highlight-number">${changed}</span>
    <div><strong>Zones changed under severity-only</strong><small>${total} total absolute unit difference vs. frequency baseline at budget 12.</small></div>`;

  const models = allocation.models || {};
  $('#allocation-list').innerHTML = ['frequency-only', 'severity-only', 'frequency-severity', 'current-severity-recency']
    .map((id) => {
      const values = models[id]?.['12'] || {};
      const totalUnits = Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
      return `<div class="compact-row"><span>${MODEL_LABELS[id]}</span><strong>${totalUnits} / 12 units</strong></div>`;
    }).join('');
}

function renderRoutes(routes) {
  const ids = Object.keys(MODEL_LABELS);
  $('#route-summary').innerHTML = ids.map((id) => {
    const item = routes.models[id];
    return `<tr>
      <td>${MODEL_LABELS[id]}</td>
      <td>${fmt(item.nearestNeighbourKm)} km</td>
      <td>${fmt(item.optimizedKm)} km</td>
      <td>${fmt(item.savingsPercent)}%</td>
    </tr>`;
  }).join('');
}

function renderRobustness(payload) {
  const ids = Object.keys(MODEL_LABELS);
  $('#robustness-summary').innerHTML = ids.map((id) => {
    const rows = payload.results.map((scenario) => scenario.models[id]);
    const topZones = [...new Set(rows.map((row) => row.top_zone))];
    const shifts = rows.map((row) => {
      const reference = scenarioModel(payload, row, 'frequency-only');
      return Number(row.mean_absolute_rank_shift ?? rankShiftFromOrders(row.rank_order, reference.rank_order));
    });
    const allocationChanges = rows.map((row) => {
      const reference = scenarioModel(payload, row, 'frequency-only');
      return Object.keys(row.allocation || {}).filter((zone) =>
        row.allocation[zone] !== reference.allocation[zone]
      ).length;
    });
    const shiftRange = `${fmt(Math.min(...shifts), 1)}–${fmt(Math.max(...shifts), 1)}`;
    const allocationRange = `${Math.min(...allocationChanges)}–${Math.max(...allocationChanges)}`;
    const topText = topZones.length === 1
      ? `${topZones[0]} (5/5)`
      : topZones.map((zone) => `${zone} (${rows.filter((row) => row.top_zone === zone).length}/5)`).join('; ');
    return `<tr><td>${MODEL_LABELS[id]}</td><td>${topText}</td><td>${shiftRange}</td><td>${allocationRange}</td></tr>`;
  }).join('');
}

function scenarioModel(payload, row, modelId) {
  const scenario = payload.results.find((item) => item.seed === payload.results.find((result) => result.models[Object.keys(result.models)[0]] === row)?.seed);
  if (scenario?.models?.[modelId]) return scenario.models[modelId];
  const owner = payload.results.find((result) => result.models[modelId] && result.models[modelId].allocation);
  return owner.models[modelId];
}

function rankShiftFromOrders(order, baseline) {
  const referenceRanks = Object.fromEntries(baseline.map((zone, index) => [zone, index + 1]));
  return order.reduce((sum, zone, index) => sum + Math.abs(index + 1 - referenceRanks[zone]), 0) / order.length;
}

async function boot() {
  const status = $('.topbar-status');
  try {
    const [overview, models, allocation, routes, robustness] = await Promise.all([
      getJson('overview'),
      getJson('models'),
      getJson('allocation'),
      getJson('routes'),
      getJson('robustness')
    ]);
    renderDataset(overview, models, robustness);
    renderModels(overview, models);
    renderAllocation(overview, allocation);
    renderRoutes(routes);
    renderRobustness(robustness);
    status.classList.add('connected');
    $('#api-status').textContent = 'Research data connected';
  } catch (error) {
    status.classList.add('error');
    $('#api-status').textContent = 'Research API unavailable';
    ['#model-summary', '#route-summary', '#robustness-summary'].forEach((selector) => {
      const row = $(selector);
      if (row) row.innerHTML = `<tr><td colspan="4" class="loading-cell">${error.message}</td></tr>`;
    });
    $('#provenance-note').textContent = error.message;
  }
}

boot();
