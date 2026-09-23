'use strict';

const API='/api';
const TYPE_META={
  theft:{label:'Theft / Pickpocketing',icon:'💼',color:'#f5a623'},
  suspicious:{label:'Suspicious Activity',icon:'🕵️',color:'#a78bfa'},
  harassment:{label:'Harassment',icon:'🆘',color:'#ef4444'},
  infrastructure:{label:'Infrastructure Issue',icon:'⚠️',color:'#38bdf8'}
};
const BAND_COLOR={low:'#22c55e',moderate:'#eab308',high:'#f97316',critical:'#ef4444'};
const state={reports:[],zones:[],types:{},analytics:null,stats:null,pick:null,tab:'overview',loading:false};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const timeAgo=ts=>{const h=Math.floor((Date.now()-Number(ts))/3600000);return h<1?'just now':h<24?h+'h ago':Math.floor(h/24)+'d ago';};
function toast(message,ok=true){const t=$('#toast');if(!t)return;t.textContent=message;t.className='toast show '+(ok?'ok':'err');clearTimeout(t._timer);t._timer=setTimeout(()=>t.className='toast',3200);}
async function getJSON(url,options={}){const res=await fetch(url,{headers:{Accept:'application/json',...(options.headers||{})},...options});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data;}

const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([27.7054,85.3243],12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:18}).addTo(map);
const layers={heat:L.layerGroup().addTo(map),markers:L.layerGroup().addTo(map),zones:L.layerGroup().addTo(map),route:L.layerGroup().addTo(map)};
const defaultView={center:[27.7054,85.3243],zoom:12};

map.on('click',e=>{
  if(state.tab!=='report'){
    const nearest=state.zones.reduce((best,z)=>{const d=map.distance(e.latlng,[z.lat,z.lng]);return !best||d<best.d?{z,d}:best;},null);
    if(nearest&&nearest.d<1600)openZoneDetail(nearest.z);
    return;
  }
  state.pick={lat:+e.latlng.lat.toFixed(5),lng:+e.latlng.lng.toFixed(5)};showPickedSpot();
});
function showPickedSpot(){const el=$('#picked-spot');if(!el||!state.pick)return;el.classList.add('set');el.innerHTML=`<span>📍 Pinned: <b>${state.pick.lat}, ${state.pick.lng}</b></span><button type="button" class="mini" id="clear-pick">Clear</button>`;$('#clear-pick').onclick=()=>{state.pick=null;el.classList.remove('set');el.textContent='📍 Click the map to choose a location.';};map.flyTo([state.pick.lat,state.pick.lng],14,{duration:.5});}
function useMyLocation(){if(!navigator.geolocation)return toast('Geolocation is not available.',false);navigator.geolocation.getCurrentPosition(pos=>{state.pick={lat:+pos.coords.latitude.toFixed(5),lng:+pos.coords.longitude.toFixed(5)};showPickedSpot();toast('Location pinned from GPS.');},()=>toast('Could not read GPS. Click the map instead.',false),{enableHighAccuracy:false,timeout:7000});}

function drawZones(){layers.zones.clearLayers();state.zones.forEach(z=>{const color=BAND_COLOR[z.band]||BAND_COLOR.low;L.circle([z.lat,z.lng],{radius:350+Number(z.score||0)*12,color,weight:2,fillColor:color,fillOpacity:.12,dashArray:'5 5'}).bindTooltip(`<b>${esc(z.name)}</b><br><span>${z.score}/100 · ${esc(z.band)}</span>`,{direction:'top',className:'zone-label'}).on('click',()=>openZoneDetail(z)).addTo(layers.zones);});}
function drawMarkers(){layers.markers.clearLayers();state.reports.slice(-180).forEach(r=>{const m=TYPE_META[r.type]||{label:r.type,icon:'•',color:'#94a3b8'};L.circleMarker([r.lat,r.lng],{radius:6,color:'#0b1220',weight:1.5,fillColor:m.color,fillOpacity:.95}).bindTooltip(`${m.icon} ${esc(m.label)} · ${timeAgo(r.ts)}`).on('click',()=>openReportDetail(r)).addTo(layers.markers);});}
function drawHeat(){layers.heat.clearLayers();const max=Math.max(...Object.values(state.types).map(t=>Number(t.severity)||0),1);const points=state.reports.map(r=>[r.lat,r.lng,(Number(state.types[r.type]?.severity)||0)/max]);if(points.length)L.heatLayer(points,{radius:28,blur:18,maxZoom:15,minOpacity:.34,gradient:{.2:'#1d4ed8',.4:'#22c55e',.6:'#eab308',.8:'#f97316',1:'#ef4444'}}).addTo(layers.heat);}
function renderMapZones(){const el=$('#map-zone-list');if(!el)return;const zones=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,7);el.innerHTML=zones.map((z,i)=>`<button class="map-zone-row" data-zone="${esc(z.id)}"><span class="rank">${i+1}</span><span><b>${esc(z.name)}</b><small>${z.count} reports · ${z.last24h} today</small></span><strong style="color:${BAND_COLOR[z.band]}">${z.score}</strong></button>`).join('');el.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>focusZone(b.dataset.zone));}
function focusZone(id){const z=state.zones.find(x=>x.id===id);if(!z)return;map.flyTo([z.lat,z.lng],14,{duration:.6});openZoneDetail(z);}
$('#map-reset').onclick=()=>map.setView(defaultView.center,defaultView.zoom,{duration:.5});

function openZoneDetail(z){$('#detail-title').textContent=z.name;$('#detail-subtitle').textContent=`${String(z.band).toUpperCase()} RISK · LIVE BACKEND SNAPSHOT`;$('#detail-body').innerHTML=`<div class="detail-grid"><div><span>Risk score</span><b style="color:${BAND_COLOR[z.band]}">${z.score}/100</b></div><div><span>Reports · 30d</span><b>${z.count}</b></div><div><span>Last 24h</span><b>${z.last24h}</b></div><div><span>Peak hour</span><b>${z.peakHour===null?'—':String(z.peakHour).padStart(2,'0')+':00'}</b></div></div><div class="detail-section"><h3>Interpretation</h3><p>This zone is ranked by the same risk model that drives the map, zone list and patrol planner.</p></div><button class="btn secondary" id="detail-focus">Focus this zone on map</button>`;openDetail();$('#detail-focus').onclick=()=>{map.flyTo([z.lat,z.lng],14,{duration:.6});closeDetail();};}
function openReportDetail(r){const m=TYPE_META[r.type]||{label:r.type,icon:'•'};const z=state.zones.find(x=>x.id===r.zone);$('#detail-title').textContent=m.label;$('#detail-subtitle').textContent=`INCIDENT · ${timeAgo(r.ts)}`;$('#detail-body').innerHTML=`<div class="detail-grid"><div><span>Zone</span><b>${esc(z?.name||r.zone)}</b></div><div><span>Type</span><b>${esc(m.label)}</b></div><div><span>Latitude</span><b>${Number(r.lat).toFixed(5)}</b></div><div><span>Longitude</span><b>${Number(r.lng).toFixed(5)}</b></div></div><div class="detail-section"><h3>Report text</h3><p>${esc(r.note||'No description provided.')}</p></div>`;openDetail();}
function openAnalyticsDetail(title,html){$('#detail-title').textContent=title;$('#detail-subtitle').textContent='ANALYTICS DETAIL';$('#detail-body').innerHTML=html;openDetail();}
function openDetail(){const d=$('#detail');d.classList.add('open');d.setAttribute('aria-hidden','false');$('#detail-close').focus();}
function closeDetail(){const d=$('#detail');d.classList.remove('open');d.setAttribute('aria-hidden','true');}
$('#detail-close').onclick=closeDetail;$('#detail-backdrop').onclick=closeDetail;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});

function renderTypeChart(values){const root=$('#chart-type');if(!root)return;const entries=Object.entries(values||{}).filter(([,v])=>Number(v)>0),total=entries.reduce((s,[,v])=>s+Number(v),0)||1;let cursor=0;const segments=entries.map(([type,v])=>{const share=Number(v)/total,dash=share*100,offset=-(cursor/total*100);cursor+=Number(v);return{type,value:Number(v),dash,offset};});const circles=segments.map(s=>`<circle class="donut-ring" data-type="${esc(s.type)}" cx="70" cy="70" r="50" pathLength="100" stroke="${TYPE_META[s.type]?.color||'#64748b'}" stroke-width="18" stroke-dasharray="${s.dash} ${100-s.dash}" stroke-dashoffset="${s.offset}" aria-label="${esc(TYPE_META[s.type]?.label||s.type)}: ${s.value}" tabindex="0"></circle>`).join('');root.innerHTML=`<div class="donut-wrap"><div class="donut-svg"><svg viewBox="0 0 140 140" role="img" aria-label="Incidents by type">${circles}</svg><div class="donut-hole"><b>${total}</b><span>reports</span></div></div><div class="chart-legend">${segments.map(s=>`<button data-type="${esc(s.type)}"><i style="background:${TYPE_META[s.type]?.color||'#64748b'}"></i><span>${esc(TYPE_META[s.type]?.label||s.type)}</span><b>${s.value}</b></button>`).join('')}</div></div>`;const openType=type=>{const n=Number(values[type]||0);openAnalyticsDetail(TYPE_META[type]?.label||type,`<div class="detail-stat"><b>${n}</b><span>records</span></div><p>Share of dashboard records: ${(n/total*100).toFixed(1)}%.</p>`);};root.querySelectorAll('[data-type]').forEach(b=>{b.onclick=()=>openType(b.dataset.type);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')openType(b.dataset.type);};});}
function renderHourChart(values){const root=$('#chart-hour');if(!root)return;const max=Math.max(...values.map(Number),1);root.innerHTML=`<div class="bar-chart">${values.map((v,h)=>`<button class="bar" data-hour="${h}" title="${h}:00 · ${v} records"><span style="height:${Math.max(3,Number(v)/max*100)}%;background:${h>=20||h<4?'#ef4444':'#3b82f6'}"></span><small>${h%3===0?h:''}</small></button>`).join('')}</div>`;root.querySelectorAll('[data-hour]').forEach(b=>b.onclick=()=>{const h=Number(b.dataset.hour),n=Number(values[h]||0);openAnalyticsDetail(`Hour ${String(h).padStart(2,'0')}:00`,`<div class="detail-stat"><b>${n}</b><span>records</span></div><p>${h>=20||h<4?'This hour falls inside the dashboard night window (20:00–04:00).':'This hour falls outside the dashboard night window.'}</p>`);});}
function renderTrendChart(values){const root=$('#chart-trend');if(!root)return;const nums=values.map(d=>Number(d.count)||0),max=Math.max(...nums,1);root.innerHTML=`<div class="trend-chart">${values.map((d,i)=>`<button class="trend-point" data-index="${i}" style="left:${nums.length===1?50:i/(nums.length-1)*100}%;bottom:${nums[i]/max*82+8}%"><span></span></button>`).join('')}<div class="trend-line"></div><div class="axis"><span>older</span><span>today</span></div></div>`;root.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{const d=values[Number(b.dataset.index)];openAnalyticsDetail(`Day ${d.day} of 30`,`<div class="detail-stat"><b>${d.count}</b><span>records</span></div><p>Daily count in the rolling 30-day dashboard snapshot.</p>`);});}
function drawCharts(a){if(a){renderTypeChart(a.byType);renderHourChart(a.byHour);renderTrendChart(a.byDay);}}

function renderOverview(){const high=state.stats?.highRiskZones??state.zones.filter(z=>z.band==='high'||z.band==='critical').length;const top=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,5);$('#overview-cards').innerHTML=[['Total records',state.stats?.total??state.reports.length,'all records'],['High-risk zones',high,'high + critical'],['Last 24h',state.analytics?.last24h??0,'recent records'],['30-day records',state.analytics?.last30d??0,'model window']].map(x=>`<button class="overview-card"><span>${esc(x[0])}</span><b>${x[1]}</b><small>${esc(x[2])}</small></button>`).join('');$('#overview-zones').innerHTML=top.map(z=>`<button class="mini-zone" data-zone="${esc(z.id)}"><span><b>${esc(z.name)}</b><small>${z.count} reports · ${esc(z.band)}</small></span><strong style="color:${BAND_COLOR[z.band]}">${z.score}</strong></button>`).join('');$('#overview-zones').querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>focusZone(b.dataset.zone));}

async function refreshData(){
  if(state.loading)return;
  state.loading=true;
  try{
    const dashboard=await getJSON(`${API}/dashboard`);
    state.reports=Array.isArray(dashboard.incidents)?dashboard.incidents:[];
    state.zones=Array.isArray(dashboard.zones)?dashboard.zones:[];
    state.analytics=dashboard.analytics||null;
    state.stats=dashboard.stats||null;
    renderOverview();renderMapZones();drawZones();drawMarkers();drawHeat();renderZoneList();updateStats();
    if(state.tab==='analytics')requestAnimationFrame(()=>drawCharts(state.analytics));
    $('#connection').textContent='LIVE';$('#connection').className='connection live';
  }catch(err){$('#connection').textContent='OFFLINE';$('#connection').className='connection offline';toast(err.message||'Could not load dashboard.',false);}
  finally{state.loading=false;}
}
function renderZoneList(){const el=$('#zone-list');if(!el)return;const zones=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score));el.innerHTML=zones.map(z=>`<li><button class="zone-item" data-zone="${esc(z.id)}"><span><b>${esc(z.name)}</b><small>${z.count} reports · ${z.last24h} today · peak ${z.peakHour===null?'—':String(z.peakHour).padStart(2,'0')+':00'}</small></span><strong class="badge ${esc(z.band)}">${z.score}</strong></button></li>`).join('');el.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>focusZone(b.dataset.zone));}
function updateStats(){const s=state.stats||{};$('#stat-total').textContent=s.total??state.reports.length;$('#stat-zones').textContent=s.activeZones??state.zones.filter(z=>z.count>0).length;$('#stat-critical').textContent=s.highRiskZones??state.zones.filter(z=>z.band==='high'||z.band==='critical').length;$('#stat-night').textContent=(s.nightShare??0)+'%';}

function setTab(tab){state.tab=tab;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${tab}`));$('#panel').scrollTop=0;map.invalidateSize();if(tab==='analytics'&&state.analytics)requestAnimationFrame(()=>drawCharts(state.analytics));$('#map-mode').textContent=tab==='report'?'Click anywhere on the map to pin an anonymous report.':'Click a zone or incident marker to open more information.';}
$('#tabs').onclick=e=>{const b=e.target.closest('.tab');if(b)setTab(b.dataset.tab);};document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)setTab(b.dataset.go);});$$('[data-stat]').forEach(b=>b.onclick=()=>setTab(b.dataset.stat==='total'?'overview':b.dataset.stat==='night'?'analytics':'risk'));

$('#report-form').onsubmit=async e=>{
  e.preventDefault();if(!state.pick)return toast('Pick a location on the map first.',false);
  const button=e.submitter;button.disabled=true;button.textContent='Submitting…';
  try{
    await getJSON(`${API}/incidents`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:$('#f-type').value,when:$('#f-when').value,note:$('#f-note').value.trim(),lat:state.pick.lat,lng:state.pick.lng})});
    $('#f-note').value='';state.pick=null;$('#picked-spot').classList.remove('set');$('#picked-spot').textContent='📍 Click the map to choose a location.';
    toast('Report submitted anonymously.');await refreshData();
  }catch(err){toast(err.message,false);}
  finally{button.disabled=false;button.textContent='Submit anonymous report';}
};

$('#toggle-heat').onchange=e=>e.target.checked?layers.heat.addTo(map):map.removeLayer(layers.heat);
$('#toggle-markers').onchange=e=>e.target.checked?layers.markers.addTo(map):map.removeLayer(layers.markers);

const PATROL_STORAGE_KEY='surakshyaPath.patrolPlan.v1';
function savePatrolPlan(route,alloc,station,stops,officers){try{localStorage.setItem(PATROL_STORAGE_KEY,JSON.stringify({route,alloc,station,stops,officers}));}catch{}}
function restorePatrolPlan(){try{const saved=JSON.parse(localStorage.getItem(PATROL_STORAGE_KEY)||'null');if(!saved?.route||!saved?.alloc)return;if(saved.station&&[...$('#p-station').options].some(o=>o.value===saved.station))$('#p-station').value=saved.station;if(saved.stops)$('#p-stops').value=saved.stops;if(saved.officers)$('#p-officers').value=saved.officers;drawRoute(saved.route,saved.alloc);}catch{localStorage.removeItem(PATROL_STORAGE_KEY);}}

$('#p-generate').onclick=async()=>{
  const button=$('#p-generate');button.disabled=true;button.textContent='Generating…';
  try{
    const station=$('#p-station').value,stops=clamp(Number($('#p-stops').value)||5,1,10),officers=clamp(Number($('#p-officers').value)||12,2,40);
    const [route,alloc]=await Promise.all([getJSON(`${API}/patrol?station=${encodeURIComponent(station)}&stops=${stops}`),getJSON(`${API}/allocation?officers=${officers}`)]);
    $('#p-station').value=station;$('#p-stops').value=stops;$('#p-officers').value=officers;
    savePatrolPlan(route,alloc,station,stops,officers);drawRoute(route,alloc);
  }catch(err){toast(err.message||'Could not generate patrol plan.',false);}
  finally{button.disabled=false;button.textContent='Generate patrol plan';}
};
function drawRoute(route,alloc){
  layers.route.clearLayers();
  const pts=[{lat:route.station.lat,lng:route.station.lng},...route.stops];
  L.marker([route.station.lat,route.station.lng],{icon:L.divIcon({className:'station-pin',html:'🚔',iconSize:[30,30]})}).bindTooltip(route.station.name).addTo(layers.route);
  L.polyline(pts.map(p=>[p.lat,p.lng]),{color:'#f5a623',weight:4,dashArray:'10 8',opacity:.95}).addTo(layers.route);
  route.stops.forEach((s,i)=>L.marker([s.lat,s.lng],{icon:L.divIcon({className:'stop-pin',html:`<b>${i+1}</b>`,iconSize:[26,26]})}).on('click',()=>openAnalyticsDetail(`Patrol stop ${i+1}: ${s.name}`,`<div class="detail-grid"><div><span>Risk</span><b>${s.score}/100</b></div><div><span>Band</span><b>${esc(s.band)}</b></div><div><span>Leg</span><b>${s.legKm} km</b></div><div><span>Zone</span><b>${esc(s.name)}</b></div></div>`)).addTo(layers.route));
  map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lng])).pad(.25));$('#route-card').classList.remove('hidden');
  $('#route-card').innerHTML=`<div class="result-heading"><h3>🚔 Route from ${esc(route.station.name)}</h3><button class="ghost-btn" id="route-focus">Focus route</button></div><ol>${route.stops.map((s,i)=>`<li><button class="route-stop" data-stop="${i}"><b>${esc(s.name)}</b><span>risk ${s.score} · +${s.legKm} km</span></button></li>`).join('')}</ol><div class="route-meta">📏 ${route.totalKm} km · ⏱ ~${route.totalMin} min including stops</div>`;
  $('#alloc-card').classList.remove('hidden');$('#alloc-card').innerHTML=`<div class="result-heading"><h3>👮 Officer allocation</h3><span class="result-pill">${alloc.officers} on duty</span></div><div class="allocation-list">${alloc.zones.map(z=>`<button class="allocation-row" data-zone="${esc(z.id||z.name)}"><span><b>${esc(z.name)}</b><small>${esc(z.window)}</small></span><strong>${z.officers}</strong></button>`).join('')}</div><p class="muted small">Allocation is proportional to the current risk score and uses the same zone model as the map.</p>`;
  $('#route-focus').onclick=()=>map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lng])).pad(.25));
  $('#route-card').querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>map.flyTo([route.stops[Number(b.dataset.stop)].lat,route.stops[Number(b.dataset.stop)].lng],14,{duration:.5}));
  $('#alloc-card').querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{const z=state.zones.find(x=>x.id===b.dataset.zone||x.name===b.dataset.zone);if(z)openZoneDetail(z);});
  toast('Patrol plan generated.');
}

(async function boot(){
  try{
    const meta=await getJSON(`${API}/config`);
    state.types=meta.types||{};
    $('#p-station').innerHTML=(meta.stations||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    await refreshData();restorePatrolPlan();setTab('overview');setInterval(refreshData,60000);
    window.addEventListener('resize',()=>{map.invalidateSize();if(state.tab==='analytics')requestAnimationFrame(()=>drawCharts(state.analytics));});
    document.addEventListener('visibilitychange',async()=>{if(!document.hidden)await refreshData();});
    $('#picked-spot').addEventListener('dblclick',useMyLocation);
  }catch(err){toast(err.message||'Application failed to initialise.',false);}
})();
