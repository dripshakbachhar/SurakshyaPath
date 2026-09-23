/* ============================================================================
   SurakshyaPath — Frontend application (vanilla JS, no build step)
   Talks to the Express API with relative URLs, so it works on any host.
   ========================================================================== */

'use strict';

/* ------------------------------ state & constants ------------------------ */

const API = '/api';                    // same-origin API
const TYPE_META = {
  theft:          { label: 'Theft / Pickpocketing', icon: '💼', color: '#f5a623' },
  suspicious:     { label: 'Suspicious Activity',   icon: '🕵️', color: '#a78bfa' },
  harassment:     { label: 'Harassment',            icon: '🆘', color: '#ef4444' },
  infrastructure: { label: 'Infrastructure Issue',  icon: '⚠️', color: '#38bdf8' },
};
const BAND_COLOR = { low: '#22c55e', moderate: '#eab308', high: '#f97316', critical: '#ef4444' };
const DAY_MS = 24 * 60 * 60 * 1000;

const state = { reports: [], zones: [], types: {}, analytics: null, pick: null, tab: 'report', loading: false };

/* --------------------------------- helpers ------------------------------- */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${ok ? 'ok' : 'err'}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = 'toast'), 3200);
}

async function getJSON(url, options = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const timeAgo = (ts) => {
  const h = Math.floor((Date.now() - ts) / 3600e3);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

/* ---------------------------------- map ---------------------------------- */

const map = L.map('map', { zoomControl: true }).setView([27.7054, 85.3243], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18,
}).addTo(map);

const layers = {
  heat: L.layerGroup().addTo(map),
  markers: L.layerGroup().addTo(map),
  zones: L.layerGroup().addTo(map),
  route: L.layerGroup().addTo(map),
};

// Map legend (bottom-right) explaining the risk colours.
L.Control.Legend = L.Control.extend({
  onAdd() {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML = Object.entries(BAND_COLOR)
      .map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('');
    return d;
  },
});
map.addControl(new L.Control.Legend({ position: 'bottomright' }));

// Clicking the map in "Report" mode picks the report location.
map.on('click', (e) => {
  if (state.tab !== 'report') return;
  state.pick = { lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) };
  L.circleMarker(e.latlng, { radius: 9, color: '#fff', weight: 2, fillColor: '#f5a623', fillOpacity: 1 })
    .addTo(layers.markers).bindTooltip('Report location').openTooltip();
  $('#picked-spot').classList.add('set');
  $('#picked-spot').innerHTML = `📍 Pinned: ${state.pick.lat}, ${state.pick.lng} <button type="button" id="use-geo" class="mini">use my location</button>`;
  $('#use-geo').onclick = useMyLocation;
});

function useMyLocation() {
  if (!navigator.geolocation) return toast('Geolocation not available', false);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.pick = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) };
      map.setView([state.pick.lat, state.pick.lng], 14);
      $('#picked-spot').innerHTML = `📍 Pinned to your location: ${state.pick.lat}, ${state.pick.lng}`;
      toast('Location pinned from GPS ✓');
    },
    () => toast('Could not read GPS — click the map instead', false),
  );
}

/* ------------------------------ data rendering --------------------------- */

async function refreshData() {
  if (state.loading) return;
  state.loading = true;
  try {
  const dashboard = await getJSON(`${API}/dashboard`);
  const { zones, incidents, analytics } = dashboard;
  state.zones = zones; state.reports = incidents; state.analytics = analytics;
  renderMapZoneInfo();

  // Stat chips
  $('#stat-total').textContent = incidents.length;
  if (analytics.total !== incidents.length) console.warn('Incident count mismatch:', { incidents: incidents.length, analytics: analytics.total });
  $('#stat-zones').textContent = zones.filter((z) => z.count > 0).length;
  $('#stat-critical').textContent = zones.filter((z) => z.band === 'high' || z.band === 'critical').length;
  const night = state.reports.filter((r) => { const h = new Date(r.ts).getHours(); return h >= 20 || h < 4; }).length;
  $('#stat-night').textContent = analytics.total ? Math.round((night / analytics.total) * 100) + '%' : '0%';

  drawZones(); drawMarkers(); drawHeat(); renderZoneList();
  if (state.tab === 'analytics') requestAnimationFrame(() => drawCharts(analytics));
  $('#connection').textContent = 'LIVE';
  $('#connection').className = 'connection live';
  } catch (err) {
    $('#connection').textContent = 'OFFLINE';
    $('#connection').className = 'connection offline';
    toast(err.message || 'Could not load dashboard.', false);
  } finally {
    state.loading = false;
  }
}

function renderMapZoneInfo() {
  const el = $('#map-zone-list');
  if (!el) return;

  el.innerHTML = state.zones.map((z, i) => `
    <div class="map-zone-row">
      <b>${i + 1}</b>
      <div>
        <div class="map-zone-name">${esc(z.name)}</div>
        <div class="map-zone-meta">${z.lat.toFixed(5)}, ${z.lng.toFixed(5)} · ${z.count} reports</div>
        <div class="map-zone-band">${esc(z.band)}</div>
      </div>
      <span class="map-zone-score" style="color:${BAND_COLOR[z.band]}">${z.score}</span>
    </div>`).join('');
}

function drawZones() {
  layers.zones.clearLayers();
  for (const z of state.zones) {
    L.circle([z.lat, z.lng], {
      radius: 300 + z.score * 14,       // bigger circle = higher risk
      color: BAND_COLOR[z.band], weight: 1.5, fillColor: BAND_COLOR[z.band],
      fillOpacity: 0.14, dashArray: '4 4',
    })
      .bindTooltip(`<b>${esc(z.name)}</b> · ${z.score}/100`, {
        permanent: true,
        direction: 'center',
        className: 'zone-label',
      })
      .bindPopup(`<b>${esc(z.name)} (${esc(z.np)})</b><br>Risk score: <b style="color:${BAND_COLOR[z.band]}">${z.score}/100 · ${z.band}</b><br>${z.count} reports in 30 days${z.peakHour !== null ? `<br>Peak hour: <b>${z.peakHour}:00</b>` : ''}<br>Click the zone row for more detail.`)
      .on('click', () => openZoneDetail(z))
      .addTo(layers.zones);
  }
}

function drawMarkers() {
  layers.markers.clearLayers();
  // keep the "report pin" if the user had picked one
  for (const r of state.reports.slice(-160)) {
    const m = TYPE_META[r.type];
    L.circleMarker([r.lat, r.lng], {
      radius: 5, color: '#0b1220', weight: 1, fillColor: m.color, fillOpacity: 0.95,
    })
      .bindPopup(`<b>${m.icon} ${m.label}</b><br>Location: ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}<br>${esc(r.note || 'No description')}<br><span class="muted">${timeAgo(r.ts)}</span>`)
      .on('click', () => openReportDetail(r))
      .addTo(layers.markers);
  }
}

function drawHeat() {
  layers.heat.clearLayers();
  // Heatmap is a visual layer; risk scores remain authoritative from /api/risk.
  const maxSeverity = Math.max(...Object.values(state.types).map((type) => type.severity), 1);
  const pts = state.reports.map((r) => [r.lat, r.lng, (state.types[r.type]?.severity || 0) / maxSeverity]);
  if (pts.length) L.heatLayer(pts, {
    radius: 26, blur: 16, maxZoom: 15, minOpacity: 0.35,
    gradient: { 0.2: '#1d4ed8', 0.4: '#22c55e', 0.6: '#eab308', 0.8: '#f97316', 1: '#ef4444' },
  }).addTo(layers.heat);
}

function renderZoneList() {
  $('#zone-list').innerHTML = state.zones.filter((z) => z.count > 0)
    .map((z, i) => `
      <li class="zone-item" data-z="${i}">
        <div><b>${i + 1}. ${esc(z.name)}</b> <span class="np-s">${esc(z.np)}</span><br>
          <small>${z.count} reports · ${z.last24h} today${z.peakHour !== null ? ` · peak ${z.peakHour}:00` : ''}</small></div>
        <span class="badge ${z.band}">${z.score}</span>
      </li>`)
    .join('');
  $('#zone-list').querySelectorAll('.zone-item').forEach((el) => {
    el.onclick = () => {
      const z = state.zones[+el.dataset.z];
      map.flyTo([z.lat, z.lng], 14);
    };
  });
}

function openZoneDetail(z) {
  $('#detail-title').textContent = z.name;
  $('#detail-subtitle').textContent = `${z.band.toUpperCase()} RISK · CURRENT SNAPSHOT`;
  $('#detail-body').innerHTML = `
    <div class="detail-grid">
      <div><span>Risk score</span><b style="color:${BAND_COLOR[z.band]}">${z.score}/100</b></div>
      <div><span>Reports · 30d</span><b>${z.count}</b></div>
      <div><span>Last 24h</span><b>${z.last24h}</b></div>
      <div><span>Peak hour</span><b>${z.peakHour === null ? '—' : String(z.peakHour).padStart(2,'0') + ':00'}</b></div>
    </div>
    <p class="detail-note">This is the live API snapshot used by the dashboard. Click “focus” to center the map on this zone.</p>
    <button class="btn secondary" id="detail-focus">Focus on map</button>`;
  $('#detail').classList.add('open');
  $('#detail-focus').onclick = () => { map.flyTo([z.lat, z.lng], 14); closeDetail(); };
}
function openReportDetail(r) {
  const m = TYPE_META[r.type] || { label: r.type, icon: '•' };
  const zone = state.zones.find(z => z.id === r.zone);
  $('#detail-title').textContent = m.label;
  $('#detail-subtitle').textContent = `INCIDENT · ${timeAgo(r.ts)}`;
  $('#detail-body').innerHTML = `
    <div class="detail-grid">
      <div><span>Zone</span><b>${esc(zone?.name || r.zone)}</b></div>
      <div><span>Type</span><b>${esc(m.label)}</b></div>
      <div><span>Latitude</span><b>${Number(r.lat).toFixed(5)}</b></div>
      <div><span>Longitude</span><b>${Number(r.lng).toFixed(5)}</b></div>
    </div>
    <p class="detail-note"><strong>Report:</strong> ${esc(r.note || 'No description provided.')}</p>`;
  $('#detail').classList.add('open');
}
function openAnalyticsDetail(title, html) {
  $('#detail-title').textContent = title;
  $('#detail-subtitle').textContent = 'ANALYTICS DETAIL';
  $('#detail-body').innerHTML = html;
  $('#detail').classList.add('open');
}
function closeDetail() { $('#detail').classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.id === 'detail-close' || e.target.id === 'detail-backdrop') closeDetail();
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

/* --------------------------------- charts -------------------------------- */

function drawCharts(a) {
  const canvases = ['chart-type', 'chart-hour', 'chart-trend'].map((id) => document.getElementById(id));
  if (!a || !a.byType || !Array.isArray(a.byHour) || !Array.isArray(a.byDay)) return;
  drawTypeChart(canvases[0], a.byType);
  drawHourChart(canvases[1], a.byHour);
  drawTrendChart(canvases[2], a.byDay);
}

function prepareCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(260, canvas.clientWidth || canvas.parentElement.clientWidth || 340);
  const height = 170;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawTypeChart(canvas, values) {
  canvas._hits = [];
  const { ctx, width, height } = prepareCanvas(canvas);
  const entries = Object.entries(values).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0) || 1;
  let angle = -Math.PI / 2;
  const cx = width / 2, cy = 72, radius = 48;
  entries.forEach(([type, value]) => {
    const next = angle + (Number(value) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, next);
    ctx.closePath();
    ctx.fillStyle = TYPE_META[type]?.color || '#64748b';
    ctx.fill();
    canvas._hits.push({ type, start: angle, end: next, cx, cy, radius });
    angle = next;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 29, 0, Math.PI * 2);
  ctx.fillStyle = '#0e1626';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e7edf7';
  ctx.font = '700 15px Segoe UI';
  ctx.fillText(total, cx, cy + 5);
  ctx.font = '10px Segoe UI';
  ctx.fillStyle = '#8ea0bf';
  ctx.fillText('reports', cx, cy + 20);

  let x = 12, y = 148;
  entries.forEach(([type, value]) => {
    const label = TYPE_META[type]?.label || type;
    ctx.fillStyle = TYPE_META[type]?.color || '#64748b';
    ctx.fillRect(x, y - 9, 8, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px Segoe UI';
    ctx.textAlign = 'left';
    ctx.fillText(label + ': ' + value, x + 12, y);
    x += Math.min(155, 30 + ctx.measureText(label + ': ' + value).width);
    if (x > width - 100) { x = 12; y += 15; }
  });
}

function drawHourChart(canvas, values) {
  canvas._hits = [];
  const { ctx, width, height } = prepareCanvas(canvas);
  const max = Math.max(...values.map(Number), 1);
  const left = 28, right = 8, top = 10, bottom = 28;
  const chartW = width - left - right, chartH = height - top - bottom;
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.fillStyle = '#8ea0bf';
  ctx.font = '9px Segoe UI';
  ctx.textAlign = 'center';
  for (let i = 0; i < 24; i++) {
    const x = left + (i + .5) * chartW / 24;
    const h = Number(values[i] || 0) / max * chartH;
    ctx.fillStyle = i >= 20 || i < 4 ? '#ef4444' : '#3b82f6';
    canvas._hits.push({ hour: i, x1: x - 7, x2: x + 7, y1: top + chartH - h, y2: top + chartH });
    ctx.fillRect(x - 3, top + chartH - h, 6, h);
    if (i % 3 === 0) {
      ctx.fillStyle = '#8ea0bf';
      ctx.fillText(i, x, height - 9);
    }
  }
  ctx.beginPath();
  ctx.moveTo(left, top + chartH + .5);
  ctx.lineTo(width - right, top + chartH + .5);
  ctx.stroke();
}

function drawTrendChart(canvas, values) {
  canvas._trendPoints = [];
  const { ctx, width, height } = prepareCanvas(canvas);
  const nums = values.map((d) => Number(d.count) || 0);
  const max = Math.max(...nums, 1);
  const left = 24, right = 10, top = 12, bottom = 25;
  const chartW = width - left - right, chartH = height - top - bottom;
  const points = nums.map((v, i) => ({
    x: left + (nums.length === 1 ? chartW / 2 : i * chartW / (nums.length - 1)),
    y: top + chartH - (v / max) * chartH,
  }));
  ctx.strokeStyle = '#f5a623';
  ctx.fillStyle = 'rgba(245,166,35,.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  ctx.lineTo(points[points.length - 1].x, top + chartH);
  ctx.lineTo(points[0].x, top + chartH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5a623';
  points.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#8ea0bf';
  ctx.font = '9px Segoe UI';
  ctx.textAlign = 'left';
  ctx.fillText('older', left, height - 8);
  ctx.textAlign = 'right';
  ctx.fillText('today', width - right, height - 8);
  canvas._trendPoints = points.map((p, i) => ({ x: p.x, data: values[i] }));
}

function chartPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width / (window.devicePixelRatio || 1),
    y: (event.clientY - rect.top) * canvas.height / rect.height / (window.devicePixelRatio || 1),
  };
}
function installChartInteractions() {
  const type = $('#chart-type'), hour = $('#chart-hour'), trend = $('#chart-trend');
  type.onclick = e => {
    const p = chartPoint(type, e);
    const hit = (type._hits || []).find(h => {
      const a = (Math.atan2(p.y-h.cy, p.x-h.cx) + Math.PI*2) % (Math.PI*2);
      const s = (h.start + Math.PI*2) % (Math.PI*2), n = (h.end + Math.PI*2) % (Math.PI*2);
      return Math.hypot(p.x-h.cx, p.y-h.cy) <= h.radius && (s <= n ? a >= s && a <= n : a >= s || a <= n);
    });
    if (hit) {
      const n = state.analytics.byType[hit.type] || 0;
      openAnalyticsDetail(TYPE_META[hit.type]?.label || hit.type, `<div class="detail-stat"><b>${n}</b><span>records</span></div><p class="detail-note">Share of dashboard records: ${(n / state.analytics.total * 100).toFixed(1)}%.</p>`);
    }
  };
  hour.onclick = e => {
    const p = chartPoint(hour, e);
    const hit = (hour._hits || []).find(h => p.x >= h.x1 && p.x <= h.x2 && p.y >= h.y1 && p.y <= h.y2);
    if (hit) openAnalyticsDetail(`Hour ${String(hit.hour).padStart(2,'0')}:00`, `<div class="detail-stat"><b>${state.analytics.byHour[hit.hour] || 0}</b><span>records</span></div><p class="detail-note">${hit.hour >= 20 || hit.hour < 4 ? 'Inside the dashboard night window (20:00–04:00).' : 'Outside the dashboard night window.'}</p>`);
  };
  trend.onclick = e => {
    const p = chartPoint(trend, e), pts = trend._trendPoints || [];
    if (!pts.length) return;
    const hit = pts.reduce((best, q, i) => Math.abs(q.x-p.x) < Math.abs(pts[best].x-p.x) ? i : best, 0);
    const d = pts[hit].data;
    openAnalyticsDetail(`Day ${d.day} of 30`, `<div class="detail-stat"><b>${d.count}</b><span>records</span></div><p class="detail-note">Daily count in the rolling 30-day dashboard snapshot.</p>`);
  };
  [type,hour,trend].forEach(c => c.onmouseenter = () => c.style.cursor = 'pointer');
}
installChartInteractions();

/* ------------------------------ interactions ----------------------------- */

// Tab switching
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  state.tab = btn.dataset.tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${state.tab}`));
  document.querySelector('#panel').scrollTop = 0;
  map.invalidateSize();
  layers.route.clearLayers();
  if (state.tab === 'analytics' && state.analytics) {
    requestAnimationFrame(() => drawCharts(state.analytics));
  }
});

// Anonymous report submission
$('#report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.pick) return toast('Please click the map to pin the location first', false);
  const body = {
    type: $('#f-type').value, when: $('#f-when').value,
    note: $('#f-note').value.trim(), lat: state.pick.lat, lng: state.pick.lng,
  };
  try {
    const res = await fetch(`${API}/incidents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toast('✓ Reported anonymously');
    $('#f-note').value = ''; state.pick = null;
    $('#picked-spot').classList.remove('set');
    $('#picked-spot').textContent = '📍 No location picked yet — click anywhere on the map';
    refreshData();
  } catch (err) { toast(err.message, false); }
});

// Layer toggles
$('#toggle-heat').onchange = (e) => (e.target.checked ? layers.heat.addTo(map) : map.removeLayer(layers.heat));
$('#toggle-markers').onchange = (e) => (e.target.checked ? layers.markers.addTo(map) : map.removeLayer(layers.markers));

/* --------------------------- patrol & allocation ------------------------- */

$('#p-generate').addEventListener('click', async () => {
  const button = $('#p-generate');
  button.disabled = true; button.textContent = 'Generating…';
  try {
  const station = encodeURIComponent($('#p-station').value);
  const stops = $('#p-stops').value;
  const officers = Math.max(2, Math.min(40, +$('#p-officers').value || 12));

  const [route, alloc] = await Promise.all([
    getJSON(`${API}/patrol?station=${station}&stops=${stops}`),
    getJSON(`${API}/allocation?officers=${officers}`),
  ]);
  drawRoute(route, alloc);
  } catch (err) { toast(err.message || 'Could not generate patrol plan.', false); }
  finally { button.disabled = false; button.textContent = 'Generate patrol plan'; }
});

function drawRoute(route, alloc) {
  layers.route.clearLayers();
  const pts = [{ lat: route.station.lat, lng: route.station.lng }, ...route.stops];

  // station marker
  L.marker([route.station.lat, route.station.lng], {
    icon: L.divIcon({ className: 'station-pin', html: '🚔', iconSize: [30, 30] }),
  }).bindTooltip(route.station.name).addTo(layers.route);

  // route polyline
  L.polyline(pts.map((p) => [p.lat, p.lng]), {
    color: '#f5a623', weight: 3.5, dashArray: '10 8', opacity: 0.95,
  }).addTo(layers.route);

  // numbered stop markers
  route.stops.forEach((s, i) => {
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'stop-pin', html: `<b>${i + 1}</b>`, iconSize: [26, 26] }),
    }).bindPopup(`<b>Stop ${i + 1}: ${esc(s.name)}</b><br>Risk ${s.score}/100 · ${s.band}<br>Leg: ${s.legKm} km from previous stop`)
      .addTo(layers.route);
  });

  map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.25));

  // route summary card
  $('#route-card').classList.remove('hidden');
  $('#route-card').innerHTML = `
    <h3>🚔 Route · ${esc(route.station.name.split('(')[0])}</h3>
    <ol>${route.stops.map((s, i) => `<li><b>${esc(s.name)}</b> — risk <span class="badge ${s.band}">${s.score}</span> <small>(+${s.legKm} km)</small></li>`).join('')}</ol>
    <div class="route-meta">📏 ${route.totalKm} km &nbsp;·&nbsp; ⏱️ ~${route.totalMin} min incl. 10 min/stop</div>`;

  // allocation table
  $('#alloc-card').classList.remove('hidden');
  $('#alloc-card').innerHTML = `
    <h3>👮 Officer allocation (${alloc.officers} on duty)</h3>
    <table><thead><tr><th>Zone</th><th>Officers</th><th>Window</th></tr></thead>
    <tbody>${alloc.zones.map((z) => `
      <tr><td>${esc(z.name)}</td><td><b>${z.officers}</b></td><td>${z.window}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">Proportional to live risk score; windows follow each zone's peak incident hour.</p>`;
  toast('Patrol plan generated ✓');
}

/* ---------------------------------- boot --------------------------------- */

(async function boot() {
  const meta = await getJSON(`${API}/config`);
  state.types = meta.types;
  $('#p-station').innerHTML = meta.stations
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  await refreshData();
  setInterval(refreshData, 60_000);
  window.addEventListener('resize', () => { if (state.tab === 'analytics') requestAnimationFrame(() => drawCharts(state.analytics)); });
})();
