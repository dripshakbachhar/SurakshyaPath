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

const state = { reports: [], zones: [], pick: null, tab: 'report' };

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

const getJSON = async (url) => (await fetch(url)).json();
const decayOf = (ts) => Math.max(0.15, 1 - (Date.now() - ts) / (30 * DAY_MS));
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
  const [zones, reports, analytics] = await Promise.all([
    getJSON(`${API}/zones`), getJSON(`${API}/reports`), getJSON(`${API}/analytics`),
  ]);
  state.zones = zones; state.reports = reports;

  // Stat chips
  $('#stat-total').textContent = analytics.total;
  $('#stat-zones').textContent = zones.filter((z) => z.count > 0).length;
  $('#stat-critical').textContent = zones.filter((z) => z.band === 'high' || z.band === 'critical').length;
  $('#stat-night').textContent = analytics.nightShare + '%';

  drawZones(); drawMarkers(); drawHeat(); renderZoneList(); drawCharts(analytics);
}

function drawZones() {
  layers.zones.clearLayers();
  for (const z of state.zones) {
    L.circle([z.lat, z.lng], {
      radius: 300 + z.score * 14,       // bigger circle = higher risk
      color: BAND_COLOR[z.band], weight: 1.5, fillColor: BAND_COLOR[z.band],
      fillOpacity: 0.14, dashArray: '4 4',
    })
      .bindPopup(`<b>${esc(z.name)} (${esc(z.np)})</b><br>Risk score: <b style="color:${BAND_COLOR[z.band]}">${z.score}/100 · ${z.band}</b><br>${z.count} reports in 30 days${z.peakHour !== null ? `<br>Peak hour: <b>${z.peakHour}:00</b>` : ''}`)
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
      .bindPopup(`<b>${m.icon} ${m.label}</b><br>${esc(r.note || 'No description')}<br><span class="muted">${timeAgo(r.ts)}</span>`)
      .addTo(layers.markers);
  }
}

function drawHeat() {
  layers.heat.clearLayers();
  // weight each point by severity × recency decay — same idea as the backend score
  const pts = state.reports.map((r) => [r.lat, r.lng, TYPE_META[r.type] ? 0.4 + 0.6 * decayOf(r.ts) : 0.5]);
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

/* --------------------------------- charts -------------------------------- */

const charts = {};
function drawCharts(a) {
  const ticks = { color: '#8ea0bf', font: { size: 10 } };
  const grid = { color: 'rgba(255,255,255,.07)' };
  const mk = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); };

  mk('#chart-type', {
    type: 'doughnut',
    data: {
      labels: Object.keys(a.byType).map((t) => TYPE_META[t].label),
      datasets: [{ data: Object.values(a.byType), backgroundColor: Object.keys(a.byType).map((t) => TYPE_META[t].color), borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } } } }, cutout: '62%' },
  });

  mk('#chart-hour', {
    type: 'bar',
    data: { labels: [...Array(24)].map((_, h) => h),
      datasets: [{ data: a.byHour, backgroundColor: a.byHour.map((v, h) => (h >= 20 || h < 4 ? '#ef4444' : '#3b82f6')) }] },
    options: { plugins: { legend: { display: false } },
      scales: { x: { ticks, grid: { display: false } }, y: { ticks, grid, beginAtZero: true } } },
  });

  mk('#chart-trend', {
    type: 'line',
    data: { labels: a.byDay.map((d) => (d.day === 13 ? 'today' : `d-${13 - d.day}`)),
      datasets: [{ data: a.byDay.map((d) => d.count), borderColor: '#f5a623', backgroundColor: 'rgba(245,166,35,.15)', fill: true, tension: .35, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#8ea0bf', font: { size: 9 } }, grid: { display: false } }, y: { ticks, grid, beginAtZero: true } } },
  });
}

/* ------------------------------ interactions ----------------------------- */

// Tab switching
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  state.tab = btn.dataset.tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${state.tab}`));
  map.invalidateSize();
  layers.route.clearLayers();
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
    const res = await fetch(`${API}/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toast(`✓ Reported anonymously — logged under zone "${data.zone.name}"`);
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
  const station = $('#p-station').value;
  const stops = $('#p-stops').value;
  const officers = Math.max(2, Math.min(40, +$('#p-officers').value || 12));

  const [route, alloc] = await Promise.all([
    getJSON(`${API}/patrol?station=${station}&stops=${stops}`),
    getJSON(`${API}/allocation?officers=${officers}`),
  ]);
  drawRoute(route, alloc);
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
  const meta = await getJSON(`${API}/meta`);
  $('#p-station').innerHTML = meta.stations
    .map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  await refreshData();
  setInterval(refreshData, 60_000);   // keep the dashboard live
})();
