'use strict';

const API = '/api/research';
const $ = (selector) => document.querySelector(selector);
const MODEL_IDS = [
  'frequency-only',
  'severity-only',
  'frequency-severity',
  'current-severity-recency'
];
const MODEL_LABELS = {
  'frequency-only': 'Frequency-only',
  'severity-only': 'Severity-only',
  'frequency-severity': 'Frequency × severity',
  'current-severity-recency': 'Severity × recency'
};
const state = {
  models: null,
  allocation: null,
  selectedModel: 'frequency-only',
  selectedBudget: 12
};

const fmt = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

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
  state.models = payload;
  const summary = overview.canonicalSummary;
  const allocationByModel = Object.fromEntries(summary.allocation.map((item) => [item.model, item]));

  $('#model-summary').innerHTML = payload.models.map((model) => {
    const rankChange = model.zonesWithRankChange === null ? '—' : model.zonesWithRankChange;
    const shift = model.meanAbsoluteRankShift === null ? '—' : fmt(model.meanAbsoluteRankShift);
    return `<tr>
      <td>${escapeHtml(MODEL_LABELS[model.id] || model.label)}</td>
      <td>${escapeHtml(model.topZone || '—')}</td>
      <td>${rankChange}</td>
      <td>${shift}</td>
    </tr>`;
  }).join('');

  $('#model-visuals').innerHTML = payload.models.map((model) => {
    const allocation = allocationByModel[model.id];
    const zones = [...model.zones].sort((a, b) => a.rank - b.rank).slice(0, 5);
    return `<article class="model-card">
      <div class="model-card-head">
        <strong>${escapeHtml(MODEL_LABELS[model.id] || model.label)}</strong>
        <span>Top: ${escapeHtml(model.topZone || '—')}</span>
      </div>
      ${zones.map((zone) => `<div class="score-row">
        <span title="${escapeHtml(zone.zone)}">${escapeHtml(zone.zone)}</span>
        <div class="score-track" role="img" aria-label="${escapeHtml(zone.zone)} score ${fmt(zone.score, 1)} out of 100">
          <div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(zone.score) || 0))}%"></div>
        </div>
        <b>${fmt(zone.score, 1)}</b>
      </div>`).join('')}
      <p class="fine-print">12-unit allocation changes vs. frequency baseline: ${allocation?.zones_with_changed_allocation ?? '—'} zones.</p>
    </article>`;
  }).join('');

  renderSelectedModel();
  $('#model-picker').value = state.selectedModel;
}

function renderSelectedModel() {
  const model = state.models?.models?.find((item) => item.id === state.selectedModel);
  if (!model) return;
  const rows = [...model.zones].sort((a, b) => a.rank - b.rank);
  $('#selected-model-rows').innerHTML = rows.map((zone) => `<tr>
    <td>${zone.rank}</td>
    <td>${escapeHtml(zone.zone)}</td>
    <td><div class="score-cell"><span>${fmt(zone.score, 2)}</span><div class="score-track" role="img" aria-label="Score ${fmt(zone.score, 2)} out of 100"><div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(zone.score) || 0))}%"></div></div></div></td>
    <td>${zone.incidentCount}</td>
  </tr>`).join('');
}

function renderAllocation(overview, allocation) {
  state.allocation = allocation;
  const severity = overview.canonicalSummary.allocation.find((item) => item.model === 'severity-only');
  const changed = severity?.zones_with_changed_allocation ?? '—';
  const total = severity?.total_absolute_officer_change ?? '—';
  $('#allocation-highlight').innerHTML = `<span class="highlight-number">${changed}</span>
    <div><strong>Zones changed under severity-only</strong><small>${total} total absolute unit difference vs. frequency baseline at budget 12.</small></div>`;
  renderAllocationBudget();
}

function renderAllocationBudget() {
  const payload = state.allocation;
  if (!payload) return;
  const budget = String(state.selectedBudget);
  const modelValues = Object.fromEntries(MODEL_IDS.map((id) => [id, payload.models?.[id]?.[budget] || {}]));
  const zones = Object.keys(modelValues['frequency-only']);

  const rows = zones.map((zone) => {
    const vals = MODEL_IDS.map((id) => Number(modelValues[id][zone] || 0));
    return `<tr>
      <td>${escapeHtml(zone)}</td>
      ${vals.map((value) => `<td>${value}</td>`).join('')}
    </tr>`;
  }).join('');

  const totals = MODEL_IDS.map((id) =>
    Object.values(modelValues[id]).reduce((sum, value) => sum + Number(value || 0), 0)
  );
  $('#allocation-rows').innerHTML = rows + `<tr class="total-row"><td>Total assigned</td>${totals.map((value) => `<td>${value} / ${budget}</td>`).join('')}</tr>`;
  $('#allocation-list').innerHTML = MODEL_IDS.map((id, index) =>
    `<div class="compact-row"><span>${MODEL_LABELS[id]}</span><strong>${totals[index]} / ${budget} units</strong></div>`
  ).join('');
}

function renderRoutes(routes) {
  $('#route-summary').innerHTML = MODEL_IDS.map((id) => {
    const item = routes.models[id];
    return `<tr>
      <td>${escapeHtml(MODEL_LABELS[id])}</td>
      <td>${fmt(item.nearestNeighbourKm)} km</td>
      <td>${fmt(item.optimizedKm)} km</td>
      <td>${fmt(item.savingsPercent)}%</td>
    </tr>`;
  }).join('');
}

function renderRobustness(payload) {
  $('#robustness-summary').innerHTML = MODEL_IDS.map((id) => {
    const scenarios = payload.results.map((scenario) => ({
      model: scenario.models[id],
      baseline: scenario.models['frequency-only']
    }));
    const topZones = [...new Set(scenarios.map((item) => item.model.top_zone))];
    const shifts = scenarios.map((item) =>
      rankShiftFromOrders(item.model.rank_order, item.baseline.rank_order)
    );
    const allocationChanges = scenarios.map((item) =>
      Object.keys(item.model.allocation || {}).filter((zone) =>
        item.model.allocation[zone] !== item.baseline.allocation[zone]
      ).length
    );
    const shiftRange = `${fmt(Math.min(...shifts), 1)}–${fmt(Math.max(...shifts), 1)}`;
    const allocationRange = `${Math.min(...allocationChanges)}–${Math.max(...allocationChanges)}`;
    const topText = topZones.length === 1
      ? `${topZones[0]} (5/5)`
      : topZones.map((zone) => `${zone} (${scenarios.filter((item) => item.model.top_zone === zone).length}/5)`).join('; ');
    return `<tr><td>${escapeHtml(MODEL_LABELS[id])}</td><td>${escapeHtml(topText)}</td><td>${shiftRange}</td><td>${allocationRange}</td></tr>`;
  }).join('');
}

function rankShiftFromOrders(order, baseline) {
  const referenceRanks = Object.fromEntries(baseline.map((zone, index) => [zone, index + 1]));
  return order.reduce((sum, zone, index) => sum + Math.abs(index + 1 - referenceRanks[zone]), 0) / order.length;
}

function bindExplorers() {
  $('#model-picker').addEventListener('change', (event) => {
    state.selectedModel = event.target.value;
    renderSelectedModel();
  });
  $('#budget-picker').addEventListener('change', (event) => {
    const value = Number(event.target.value);
    if (![6, 12, 20].includes(value)) return;
    state.selectedBudget = value;
    renderAllocationBudget();
  });
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
    bindExplorers();
    status.classList.add('connected');
    $('#api-status').textContent = 'Research data connected';
  } catch (error) {
    status.classList.add('error');
    $('#api-status').textContent = 'Research API unavailable';
    ['#model-summary', '#route-summary', '#robustness-summary', '#selected-model-rows', '#allocation-rows'].forEach((selector) => {
      const row = $(selector);
      if (row) row.innerHTML = `<tr><td colspan="5" class="loading-cell">${escapeHtml(error.message)}</td></tr>`;
    });
    $('#provenance-note').textContent = error.message;
  }
}

boot();
