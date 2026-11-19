'use strict';

const API='/api';
const TYPE_META={
  theft:{label:'Theft / Pickpocketing',icon:'💼',color:'#f5a623'},
  suspicious:{label:'Suspicious Activity',icon:'🕵️',color:'#a78bfa'},
  harassment:{label:'Harassment',icon:'🆘',color:'#ef4444'},
  infrastructure:{label:'Infrastructure Issue',icon:'⚠️',color:'#38bdf8'}
};
const BAND_COLOR={low:'#22c55e',moderate:'#eab308',high:'#f97316',critical:'#ef4444'};
const Temporal=window.SurakshyaTemporal;
const ImportLimits=window.SurakshyaImportLimits;
const IMPORT_LIMIT_MIB=ImportLimits.MAX_IMPORT_PAYLOAD_BYTES/(1024*1024);
const state={reports:[],zones:[],types:{},analytics:null,stats:null,intelligence:null,dataQuality:null,dataset:null,storage:null,datasetKey:null,importDraft:null,datasetResearch:null,pick:null,tab:'overview',loading:false,mobileMapVisible:false};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeLabel=type=>state.types[type]?.label||TYPE_META[type]?.label||type;
function syncTypeMetadata(){
  const colors=['#f5a623','#a78bfa','#ef4444','#38bdf8','#22c55e','#eab308','#f97316'];
  Object.entries(state.types).forEach(([id,type],index)=>{
    if(!TYPE_META[id])TYPE_META[id]={icon:'•',color:colors[index%colors.length]};
    TYPE_META[id].label=type.label||id;
  });
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const timeAgo=ts=>{const h=Math.floor(Math.max(0,Date.now()-Number(ts))/3600000);return h<1?'less than 1h ago':h<24?h+'h ago':Math.floor(h/24)+'d ago';};
function eventTimeLabel(record){
  const time=Temporal.resolveTime(record);
  if(time.precision==='instant'){
    const utc=new Date(time.start).toISOString().replace('T',' ').slice(0,16)+' UTC';
    return `${timeAgo(time.start)} · ${utc}`;
  }
  if(time.precision==='date'){
    const date=new Date(time.start).toISOString().slice(0,10);
    return time.origin==='synthetic'?`Simulation date · ${date} UTC`:`Date only · ${date} UTC`;
  }
  if(time.precision==='range'){
    const labels={now:'past hour',today:'today (UTC)',week:'past 7 days',month:'past 30 days'};
    return `Approx. ${labels[time.window]||'time range'}`;
  }
  return 'Event time unknown';
}
function recentCountLabel(zone){
  return zone.last24h===null?'24h count unavailable':`${zone.last24h} records · 24h`;
}
let lastSuccessfulRefresh=null,detailReturnFocus=null;
function toast(message,ok=true){const t=$('#toast');if(!t)return;t.textContent=message;t.className='toast show '+(ok?'ok':'err');clearTimeout(t._timer);t._timer=setTimeout(()=>t.className='toast',3200);}
async function getJSON(url,options={}){const res=await fetch(url,{headers:{Accept:'application/json',...(options.headers||{})},...options});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data;}
function setMobileMapVisible(visible){
  const isMobile=window.matchMedia('(max-width: 760px)').matches;
  state.mobileMapVisible=isMobile&&visible;
  $('.workspace').classList.toggle('map-focused',state.mobileMapVisible);
  const toggle=$('#mobile-view-toggle');
  toggle.setAttribute('aria-expanded',String(state.mobileMapVisible));
  toggle.textContent=state.mobileMapVisible?(state.tab==='report'?'Show report form':'Show dashboard'):'Show map';
  if(state.mobileMapVisible)requestAnimationFrame(()=>{invalidateMapSize();drawHeat();});
}

const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([27.7054,85.3243],12);
function invalidateMapSize(){const el=$('#map');if(el.clientWidth&&el.clientHeight)map.invalidateSize();}
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
const layers={heat:L.layerGroup().addTo(map),markers:L.layerGroup().addTo(map),zones:L.layerGroup().addTo(map),route:L.layerGroup().addTo(map)};
let defaultView={center:[27.7054,85.3243],zoom:12};

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
function drawMarkers(){layers.markers.clearLayers();state.reports.slice(-120).forEach(r=>{const m=TYPE_META[r.type]||{label:state.types[r.type]?.label||r.type,icon:'•',color:'#94a3b8'};L.circleMarker([r.lat,r.lng],{radius:4.5,color:'#17384b',weight:1,fillColor:m.color,fillOpacity:.82}).bindTooltip(`${m.icon} ${esc(m.label)} · ${esc(eventTimeLabel(r))}`).on('click',()=>openReportDetail(r)).addTo(layers.markers);});}
function drawHeat(){layers.heat.clearLayers();const mapEl=$('#map');if(!mapEl.clientWidth||!mapEl.clientHeight)return;const strengths=state.reports.map(r=>Number(state.types[r.type]?.useRecordSeverity?r.severity:state.types[r.type]?.severity)||0),max=Math.max(...strengths,1);const points=state.reports.map((r,i)=>[r.lat,r.lng,strengths[i]/max]);if(points.length)L.heatLayer(points,{radius:22,blur:24,max:8,maxZoom:15,minOpacity:.12,gradient:{.2:'#477bb1',.4:'#328b87',.6:'#75a77b',.8:'#d69a4c',1:'#c95648'}}).addTo(layers.heat);}
function renderMapZones(){const el=$('#map-zone-list');if(!el)return;const zones=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,5);el.innerHTML=zones.map((z,i)=>`<button class="map-zone-row" data-zone="${esc(z.id)}"><span class="rank">${i+1}</span><span><b>${esc(z.name)}</b><small>${z.count} records · ${esc(recentCountLabel(z))}</small></span><strong style="color:${BAND_COLOR[z.band]}">${z.score}</strong></button>`).join('');el.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>focusZone(b.dataset.zone));}
function focusZone(id){const z=state.zones.find(x=>x.id===id);if(!z)return;const mapEl=$('#map');if(!mapEl.clientWidth||!mapEl.clientHeight){setMobileMapVisible(true);requestAnimationFrame(()=>requestAnimationFrame(()=>focusZone(id)));return;}map.flyTo([z.lat,z.lng],14,{duration:.6});openZoneDetail(z);}
$('#map-reset').onclick=()=>map.setView(defaultView.center,defaultView.zoom,{duration:.5});

function openZoneDetail(z){
  const peak=z.peakHour===null?'Unavailable':`${String(z.peakHour).padStart(2,'0')}:00 UTC`;
  const excluded=(z.temporalCoverage?.ambiguous||0)+(z.temporalCoverage?.unknown||0);
  const recent=z.last24hCoverage||{};
  const recentNote=z.last24h===null
    ? `The 24-hour count is unavailable: ${recent.unknown||0} records have unknown time and ${recent.ambiguous||0} overlap the window boundary.`
    : 'The count uses time ranges wholly within the last 24 hours (UTC).';
  $('#detail-title').textContent=z.name;
  $('#detail-subtitle').textContent=`${String(z.band).toUpperCase()} RISK · LIVE DASHBOARD SNAPSHOT`;
  $('#detail-body').innerHTML=`<div class="detail-grid"><div><span>Risk score</span><b style="color:${BAND_COLOR[z.band]}">${z.score}/100</b></div><div><span>Records · 30d</span><b>${z.count}</b></div><div><span>Records · last 24h</span><b>${z.last24h===null?'Unavailable':z.last24h}</b></div><div><span>Peak event hour</span><b>${peak}</b></div></div><p class="muted small">${esc(recentNote)}${z.peakHour===null?' Hourly analysis requires exact, non-synthetic timestamps.':''}${excluded?` ${excluded} records were excluded from the 30-day score because their time was unknown or boundary-ambiguous.`:''}</p><div class="detail-section"><h3>About this score</h3><p>This score comes from the severity × recency model and the current dashboard records. It is for exploration, not a forecast or operational recommendation.</p></div><button class="btn secondary" id="detail-focus">Focus this zone on map</button>`;
  openDetail();
  $('#detail-focus').onclick=()=>{map.flyTo([z.lat,z.lng],14,{duration:.6});closeDetail();};
}
function openReportDetail(r){const m=TYPE_META[r.type]||{label:typeLabel(r.type),icon:'•'};const z=state.zones.find(x=>x.id===r.zone);$('#detail-title').textContent=m.label;$('#detail-subtitle').textContent=`RECORD · ${eventTimeLabel(r)}`;$('#detail-body').innerHTML=`<div class="detail-grid"><div><span>Zone</span><b>${esc(z?.name||r.zone)}</b></div><div><span>Type</span><b>${esc(m.label)}</b></div><div><span>Latitude</span><b>${Number(r.lat).toFixed(5)}</b></div><div><span>Longitude</span><b>${Number(r.lng).toFixed(5)}</b></div></div><div class="detail-section"><h3>Report text</h3><p>${esc(r.note||'No description provided.')}</p></div>`;openDetail();}
function openAnalyticsDetail(title,html){$('#detail-title').textContent=title;$('#detail-subtitle').textContent='ANALYTICS DETAIL';$('#detail-body').innerHTML=html;openDetail();}
function openDetail(){const d=$('#detail');detailReturnFocus=document.activeElement;d.classList.add('open');d.setAttribute('aria-hidden','false');$('#detail-close').focus();}
function closeDetail(){const d=$('#detail');d.classList.remove('open');d.setAttribute('aria-hidden','true');if(detailReturnFocus?.isConnected)detailReturnFocus.focus();detailReturnFocus=null;}
$('#detail-close').onclick=closeDetail;$('#detail-backdrop').onclick=closeDetail;document.addEventListener('keydown',e=>{
  const detail=$('#detail');
  if(!detail.classList.contains('open'))return;
  if(e.key==='Escape'){closeDetail();return;}
  if(e.key!=='Tab')return;
  const focusable=[...detail.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!focusable.length){e.preventDefault();$('#detail-close').focus();return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(!detail.contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});

function renderTypeChart(values){const root=$('#chart-type');if(!root)return;const entries=Object.entries(values||{}).filter(([,v])=>Number(v)>0),total=entries.reduce((s,[,v])=>s+Number(v),0)||1;let cursor=0;const segments=entries.map(([type,v])=>{const share=Number(v)/total,dash=share*100,offset=-(cursor/total*100);cursor+=Number(v);return{type,value:Number(v),dash,offset};});const circles=segments.map(s=>`<circle class="donut-ring" data-type="${esc(s.type)}" cx="70" cy="70" r="50" pathLength="100" stroke="${TYPE_META[s.type]?.color||'#64748b'}" stroke-width="18" stroke-dasharray="${s.dash} ${100-s.dash}" stroke-dashoffset="${s.offset}" aria-label="${esc(TYPE_META[s.type]?.label||s.type)}: ${s.value}" tabindex="0"></circle>`).join('');root.innerHTML=`<div class="donut-wrap"><div class="donut-svg"><svg viewBox="0 0 140 140" role="img" aria-label="Incidents by type">${circles}</svg><div class="donut-hole"><b>${total}</b><span>reports</span></div></div><div class="chart-legend">${segments.map(s=>`<button data-type="${esc(s.type)}"><i style="background:${TYPE_META[s.type]?.color||'#64748b'}"></i><span>${esc(TYPE_META[s.type]?.label||s.type)}</span><b>${s.value}</b></button>`).join('')}</div></div>`;const openType=type=>{const n=Number(values[type]||0);openAnalyticsDetail(TYPE_META[type]?.label||type,`<div class="detail-stat"><b>${n}</b><span>records</span></div><p>Share of dashboard records: ${(n/total*100).toFixed(1)}%.</p>`);};root.querySelectorAll('[data-type]').forEach(b=>{b.onclick=()=>openType(b.dataset.type);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')openType(b.dataset.type);};});}
function renderHourChart(values,coverage){const root=$('#chart-hour');if(!root)return;const excluded=coverage?.hourlyExcludedRecords??0;const exclusions=Object.entries(coverage?.hourlyExcludedByPrecision||{}).map(([kind,count])=>`${count} ${kind.replace(':',' ')}`).join(', ');if(!Array.isArray(values)){root.innerHTML=`<p class="muted">Unavailable — no exact, non-synthetic event timestamps support an hour-of-day analysis. ${excluded} records excluded${exclusions?`: ${esc(exclusions)}`:''}.</p>`;return;}const max=Math.max(...values.map(Number),1);root.innerHTML=`<div class="bar-chart">${values.map((v,h)=>`<button class="bar" data-hour="${h}" title="${String(h).padStart(2,'0')}:00 UTC · ${v} records"><span style="height:${Math.max(3,Number(v)/max*100)}%;background:${h>=20||h<4?'#ef4444':'#3b82f6'}"></span><small>${h%3===0?h:''}</small></button>`).join('')}</div><p class="muted small">${coverage?.hourlyEligibleRecords??0} exact-time records shown; ${excluded} records excluded from hourly analysis${exclusions?` (${esc(exclusions)})`:''}.</p>`;root.querySelectorAll('[data-hour]').forEach(b=>b.onclick=()=>{const h=Number(b.dataset.hour),n=Number(values[h]||0);openAnalyticsDetail(`Hour ${String(h).padStart(2,'0')} UTC`,`<div class="detail-stat"><b>${n}</b><span>records</span></div><p>${h>=20||h<4?'This hour falls inside the dashboard night window (20:00–04:00 UTC).':'This hour falls outside the dashboard night window.'}</p>`);});}
function renderTrendChart(values,coverage){const root=$('#chart-trend');if(!root)return;const nums=values.map(d=>Number(d.count)||0),max=Math.max(...nums,1);root.innerHTML=`<div class="trend-chart">${values.map((d,i)=>`<button class="trend-point" data-index="${i}" title="${esc(d.date)} UTC · ${d.count} records" style="left:${nums.length===1?50:i/(nums.length-1)*100}%;bottom:${nums[i]/max*82+8}%"><span></span></button>`).join('')}<div class="trend-line"></div><div class="axis"><span>${esc(values[0]?.date||'')}</span><span>today · UTC</span></div></div>${coverage?.dailyExcludedRecords?`<p class="muted small">${coverage.dailyExcludedRecords} records with missing, unknown, or multi-day timing were excluded from daily bins.</p>`:''}`;root.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{const d=values[Number(b.dataset.index)];openAnalyticsDetail(`${d.date} UTC`,`<div class="detail-stat"><b>${d.count}</b><span>records</span></div><p>Records assigned to this UTC calendar date. Unknown or multi-day time ranges are not assigned to a single date.</p>`);});}
function drawCharts(a){if(a){renderTypeChart(a.byType);renderHourChart(a.byHour,a.temporalCoverage);renderTrendChart(a.byDay,a.temporalCoverage);}}

function renderIntelligence(){
  const i=state.intelligence;
  const status=$('#intelligence-status');
  if(!status)return;
  if(!i){
    status.textContent='Intelligence unavailable';
    status.className='intel-status error';
    return;
  }
  status.textContent=i.status==='SUCCESS'?'ANALYSIS READY':i.status.replaceAll('_',' ');
  status.className='intel-status '+String(i.status).toLowerCase();
  $('#intelligence-summary').innerHTML=`<div class="intel-card"><span>Analytical status</span><b>${esc(i.summary)}</b><small>${esc(i.modelType)} · ${esc(i.modelVersion)}</small></div><div class="intel-metrics"><div><span>Evidence</span><b>${i.dataCoverage?.analyzedRecords??0}</b><small>validated 30-day records</small></div><div><span>Coverage</span><b>${Math.round((i.confidence||0)*100)}%</b><small>evidence-coverage indicator</small></div><div><span>Trend</span><b>${esc(i.trend?.direction||'—')}</b><small>7-day vs prior 7-day</small></div></div>`;
  $('#intelligence-patterns').innerHTML=(i.patterns||[]).map(p=>`<div class="intel-row">• ${esc(p)}</div>`).join('')||'<div class="intel-row muted">No validated pattern available.</div>';
  $('#intelligence-recommendations').innerHTML=(i.recommendations||[]).map(r=>`<div class="intel-row"><b>${esc(r.zone||'System')}</b><span>${esc(r.reason)}</span></div>`).join('')||'<div class="intel-row muted">No recommendation is supported by the current evidence.</div>';
  const q=state.dataQuality||{};
  const precision=Object.entries(q.temporalCoverage?.precisionByOrigin||{}).map(([kind,count])=>`${count} ${kind.replace(':',' ')}`).join(', ')||'not available';
  const rejectionReasons=[...new Set((q.rejectedSamples||[]).flatMap(sample=>sample.reasons||[]))];
  $('#intelligence-evidence').innerHTML=`<div class="intel-evidence-grid"><span>Received <b>${q.recordsReceived??0}</b></span><span>Accepted <b>${q.recordsAccepted??0}</b></span><span>Rejected <b>${q.recordsRejected??0}</b></span><span>Quality <b>${Math.round((q.qualityScore||0)*100)}%</b></span></div><p>Timestamp precision: ${esc(precision)}. Exact-hour eligible: ${q.temporalCoverage?.eventHourEligibleRecords??0}. Event-time metrics use UTC.</p>${rejectionReasons.length?`<p>Rejection reasons (sample): ${rejectionReasons.map(esc).join('; ')}.</p>`:''}<p>${(i.limitations||[]).map(esc).join(' ')}</p>`;
}
function renderResearchSummary(summary){
  const labels={
    'frequency-only':'Frequency-only',
    'severity-only':'Severity-only',
    'frequency-severity':'Frequency × severity',
    'current-severity-recency':'Severity × recency'
  };
  const tbody=$('#research-results');
  const rankResults=summary.risk||[],allocationResults=summary.allocation||[],patrolResults=summary.patrol||[];
  tbody.innerHTML=rankResults.map(result=>{
    const allocation=allocationResults.find(item=>item.model===result.model);
    const patrol=patrolResults.find(item=>item.model===result.model);
    return `<tr><th scope="row">${esc(labels[result.model]||result.model)}</th><td>${esc(result.top_zone)}</td><td>${Number(result.zones_with_rank_change)}</td><td>${Number(allocation?.zones_with_changed_allocation??0)} / 10</td><td>${Number(patrol?.optimized_km??0).toFixed(2)} km</td></tr>`;
  }).join('');
  const severityRank=rankResults.find(result=>result.model==='severity-only');
  const severityAllocation=allocationResults.find(result=>result.model==='severity-only');
  const status=$('#research-results-status');
  status.textContent=`Stored canonical results loaded · ${summary.sourceDataset?.id||'canonical-synthetic-benchmark-v1'} · seed 208304 · frequency-only reference · ${rankResults.length} models`;
  status.className='research-results-status';
  $('#research-highlight').textContent=`In the canonical scenario, severity-only re-ranked ${severityRank?.zones_with_rank_change??0} of 10 zones and changed the 12-officer allocation in ${severityAllocation?.zones_with_changed_allocation??0} zones.`;
  $('#research-highlight').hidden=false;
}

async function refreshData(){
  if(state.loading)return;
  state.loading=true;
  try{
    const dashboard=await getJSON(`${API}/dashboard`);
    const nextDataset=dashboard.dataset||{mode:'demo',name:'Synthetic dashboard demo',records:dashboard.incidents?.length||0};
    const nextKey=`${nextDataset.mode}:${nextDataset.id||nextDataset.name}:${nextDataset.importedAt||''}`;
    const datasetChanged=state.datasetKey!==nextKey;
    if(datasetChanged){
      state.datasetResearch=null;
      $('#dataset-research-table-wrap').classList.add('hidden');
      $('#dataset-research-summary').hidden=true;
      $('#dataset-research-methods').classList.add('hidden');
    }
    state.dataset=nextDataset;state.datasetKey=nextKey;
    if(dashboard.types){state.types=dashboard.types;syncTypeMetadata();}
    if(Array.isArray(dashboard.stations)){
      const selected=$('#p-station').value;
      $('#p-station').innerHTML=dashboard.stations.map(station=>`<option value="${esc(station.id)}">${esc(station.name)}</option>`).join('');
      if(dashboard.stations.some(station=>station.id===selected))$('#p-station').value=selected;
    }
    state.reports=Array.isArray(dashboard.incidents)?dashboard.incidents:[];
    state.zones=Array.isArray(dashboard.zones)?dashboard.zones:[];
    state.analytics=dashboard.analytics||null;
    state.stats=dashboard.stats||null;
    state.intelligence=dashboard.intelligence||null;
    state.dataQuality=dashboard.dataQuality||null;
    state.storage=dashboard.storage||{writable:true};
    updateDatasetUI();renderOverview();updateStats();renderIntelligence();renderMapZones();drawZones();drawMarkers();drawHeat();renderZoneList();
    if(datasetChanged&&state.zones.length){
      const bounds=L.latLngBounds(state.zones.map(zone=>[zone.lat,zone.lng]));
      if(bounds.isValid()){
        map.fitBounds(bounds.pad(.18),{animate:false});
        const center=bounds.getCenter();
        defaultView={center:[center.lat,center.lng],zoom:map.getZoom()};
      }
    }
    if(state.tab==='analytics')requestAnimationFrame(()=>drawCharts(state.analytics));
    $('#connection').textContent='Online';$('#connection').className='connection live';
    lastSuccessfulRefresh=new Date();
    const updated=$('#data-updated');
    updated.textContent=`Updated ${lastSuccessfulRefresh.toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})} UTC`;
    updated.title=`Dashboard data updated ${lastSuccessfulRefresh.toLocaleString('en-GB',{timeZone:'UTC'})} UTC`;
    $('#overview-updated').textContent=updated.textContent;
  }catch(err){
    $('#connection').textContent='Offline';$('#connection').className='connection offline';
    const updated=$('#data-updated');
    updated.textContent=lastSuccessfulRefresh?`Stale · updated ${lastSuccessfulRefresh.toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})} UTC`:'No data loaded';
    updated.title=lastSuccessfulRefresh?`Last successful update ${lastSuccessfulRefresh.toLocaleString('en-GB',{timeZone:'UTC'})} UTC`:'The dashboard has not loaded data yet.';
    toast(err.message||'Could not load dashboard.',false);
  }
  finally{state.loading=false;}
}
function renderOverview(){
  const top=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,5);
  const root=$('#overview-zones');
  root.innerHTML=top.map(z=>`<button class="mini-zone" data-zone="${esc(z.id)}"><span><b>${esc(z.name)}</b><small>${z.count} reports · ${esc(z.band)} risk</small></span><strong style="color:${BAND_COLOR[z.band]}">${z.score}</strong></button>`).join('');
  root.querySelectorAll('[data-zone]').forEach(button=>button.onclick=()=>{
    if(window.matchMedia('(max-width: 760px)').matches){
      setTab('risk');setMobileMapVisible(true);
      requestAnimationFrame(()=>focusZone(button.dataset.zone));
    }else focusZone(button.dataset.zone);
  });
  const dataset=state.dataset||{};
  $('#overview-dataset-name').textContent=dataset.name||'Dashboard dataset';
  $('#overview-dataset-detail').textContent=`${Number(dataset.records||0).toLocaleString()} records · ${dataset.zones||0} zones`;
  $('#overview-dataset-description').textContent=dataset.mode==='imported'
    ? 'The map and activity below use your imported dataset. Imported results are descriptive and depend on the quality and provenance of the source data.'
    : 'The map and activity below show the synthetic demo snapshot, including reports submitted through this app. Import a separate dataset from Datasets.';
  $('.dashboard-note').innerHTML=dataset.mode==='imported'
    ? 'Imported dashboard data is separate from the fixed research experiment. The canonical synthetic results remain in <button type="button" class="inline-link" data-go="research">Research</button>.'
    : 'This live view can include reports submitted through the app. Fixed synthetic experiment results are in <button type="button" class="inline-link" data-go="research">Research</button>.';
}
function updateDatasetUI(){
  const dataset=state.dataset||{};
  const imported=dataset.mode==='imported';
  const storage=state.storage||{writable:true};
  const readOnly=storage.writable===false ||
    (storage.operatingMode !== undefined && storage.operatingMode !== 'local-research');
  const modeLabel=storage.operatingMode==='public-read-only'
    ? 'Public read-only'
    : storage.operatingMode==='unsupported'
      ? 'Read-only · unsupported configuration'
      : 'Local research · shared on this host';
  const reportDisabled=imported||readOnly;
  const reportTab=$('#tab-report');
  reportTab.disabled=reportDisabled;
  reportTab.title=readOnly?(storage.reason||'Community reports are disabled because persistent storage is unavailable.'):imported?'Community reporting is available only in the synthetic demo workspace.':'';
  $('#report-form').querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=reportDisabled);
  $('#report-storage-note').hidden=!readOnly;
  $('#report-storage-note').textContent=readOnly?(storage.reason||'Community reporting is disabled because persistent storage is unavailable.'):'';
  $('.dashboard-action[data-go="report"]').classList.toggle('hidden',reportDisabled);
  $('#dataset-current').innerHTML=`<span>Active dashboard dataset</span><b>${esc(dataset.name||'Synthetic dashboard demo')}</b><small>${Number(dataset.records||0).toLocaleString()} records · ${dataset.zones||0} zones · ${imported?'Imported data':'Synthetic demo'} · ${esc(dataset.id||'synthetic-dashboard-v1')}</small><small>Mode: ${esc(modeLabel)}</small>${readOnly?`<small>Read-only mode: ${esc(storage.reason||'persistent writes are disabled.')}</small>`:''}`;
  $('#use-demo-data').classList.toggle('hidden',!imported);
  $('#use-saved-import').classList.toggle('hidden',imported||!dataset.hasImportedDataset);
  $('#use-demo-data').disabled=readOnly;
  $('#use-saved-import').disabled=readOnly;
  $('#dataset-form').querySelectorAll('input,select,button').forEach(control=>{
    if(readOnly)control.disabled=true;
    else if(control.id!=='dataset-import-button')control.disabled=false;
  });
  if(readOnly){
    $('#dataset-import-status').textContent=storage.reason||'Dataset imports are disabled because persistent storage is unavailable.';
    $('#dataset-import-status').className='dataset-import-status error';
  }
  $('#dataset-research-run').disabled=!imported;
  if(!state.datasetResearch){
    $('#dataset-research-status').textContent=imported
      ? 'Ready to compare this imported dataset against the four research scoring models.'
      : 'Import and activate a dataset to run a dataset-specific comparison.';
    $('#dataset-research-status').className='research-results-status';
  }
}
function renderDatasetResearch(result){
  const labels={
    'frequency-only':'Frequency-only',
    'severity-only':'Severity-only',
    'frequency-severity':'Frequency × severity',
    'current-severity-recency':'Severity × recency'
  };
  $('#dataset-research-results').innerHTML=result.rows.map(row=>{const available=row.availability!=='UNAVAILABLE';const label=`${labels[row.model]||row.model}${row.availability==='PARTIAL'?' · partial':''}`;return `<tr><th scope="row">${esc(label)}</th><td>${available?esc(row.topZone):'Unavailable'}</td><td>${available?`${row.zonesReRanked} / ${row.zoneCount}`:'—'}</td><td>${available?`${row.allocationChanges} / ${row.zoneCount}`:'—'}</td><td>${available?`${Number(row.nearestNeighbourKm).toFixed(2)} km`:'—'}</td><td>${available?`${Number(row.twoOptKm).toFixed(2)} km`:'—'}</td></tr>`;}).join('');
  const coverage=result.dataset.temporalCoverage;
  $('#dataset-research-summary').textContent=`Source ${result.dataset.id} · ${Number(result.dataset.records).toLocaleString()} imported records across ${result.dataset.zones} zones and ${result.dataset.categories.length} categories. The severity × recency model used ${coverage.recencyEligibleRecords} records; ${coverage.recencyExcludedRecords} with unknown or future timing were excluded. These results do not replace or modify the canonical synthetic experiment.`;
  $('#dataset-research-summary').hidden=false;
  $('#dataset-research-methods').textContent=`${result.methods.scoring} ${result.methods.allocation} ${result.methods.routing} ${result.methods.robustness}`;
  $('#dataset-research-methods').classList.remove('hidden');
  $('#dataset-research-table-wrap').classList.remove('hidden');
  $('#dataset-research-status').textContent=`Dataset comparison complete · ${new Date(result.dataset.importedAt).toLocaleString('en-GB',{timeZone:'UTC'})} UTC`;
  $('#dataset-research-status').className='research-results-status';
  state.datasetResearch=result;
}
$('#dataset-research-run').addEventListener('click',async()=>{
  const button=$('#dataset-research-run');
  button.disabled=true;button.textContent='Running comparison…';
  $('#dataset-research-status').textContent='Calculating model rankings, allocations, and routes…';
  try{
    const result=await getJSON(`${API}/dataset/research`);
    renderDatasetResearch(result);
  }catch(error){
    $('#dataset-research-status').textContent=error.message||'Dataset comparison failed.';
    $('#dataset-research-status').className='research-results-status error';
    toast(error.message||'Dataset comparison failed.',false);
  }finally{
    button.disabled=state.dataset?.mode!=='imported';
    button.textContent='Run dataset comparison';
  }
});
const IMPORT_FIELDS=[
  {id:'map-zone',key:'zone',required:true,match:/^zone$|zone.?name|district|area/i},
  {id:'map-category',key:'category',required:true,match:/category|incident.?type|^type$|event/i},
  {id:'map-latitude',key:'latitude',required:true,match:/latitude|^lat$/i},
  {id:'map-longitude',key:'longitude',required:true,match:/longitude|^lng$|^lon$/i},
  {id:'map-date',key:'date',required:true,match:/timestamp|date|datetime|created.?at|occurred/i},
  {id:'map-severity',key:'severity',required:false,match:/severity|weight|score/i}
];
function importMapping(){
  return Object.fromEntries(IMPORT_FIELDS.map(field=>[field.key,$(`#${field.id}`).value]));
}
function validateImportDraft(){
  const status=$('#dataset-import-status'),button=$('#dataset-import-button');
  if(state.storage?.writable===false || (state.storage?.operatingMode !== undefined && state.storage.operatingMode !== 'local-research')){
    status.textContent=state.storage.reason||'Dataset imports are disabled because persistent storage is unavailable.';
    status.className='dataset-import-status error';
    button.disabled=true;
    return;
  }
  if(!state.importDraft){button.disabled=true;return;}
  try{
    const records=DatasetImport.mapRecords(state.importDraft.records,importMapping());
    const name=$('#dataset-name').value.trim();
    if(!name)throw new Error('Enter a dataset name.');
    const body=JSON.stringify({name,records});
    const bodyBytes=ImportLimits.payloadByteLength(body);
    if(bodyBytes>ImportLimits.MAX_IMPORT_PAYLOAD_BYTES){
      throw new Error(`Mapped dataset request is ${(bodyBytes/(1024*1024)).toFixed(2)} MiB; the API limit is ${IMPORT_LIMIT_MIB} MiB.`);
    }
    status.textContent=`Ready to import ${records.length.toLocaleString()} validated records.`;
    status.className='dataset-import-status success';
    button.disabled=false;
  }catch(error){
    status.textContent=error.message;
    status.className='dataset-import-status error';
    button.disabled=true;
  }
}
function renderDatasetPreview(headers,records){
  const preview=$('#dataset-preview');
  const visible=headers.slice(0,6);
  const rows=records.slice(0,3);
  preview.innerHTML=`<div class="dataset-preview-heading">Preview · ${records.length.toLocaleString()} rows</div><div class="research-table-wrap"><table class="research-table"><thead><tr>${visible.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${visible.map(header=>`<td>${esc(row[header]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${headers.length>visible.length?'<small>Showing the first 6 columns.</small>':''}`;
}
$('#dataset-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  state.importDraft=null;
  $('#dataset-mapping').classList.add('hidden');
  $('#dataset-import-button').disabled=true;
  $('#dataset-import-status').textContent='';
  if(!file)return;
  if(file.size>ImportLimits.MAX_IMPORT_PAYLOAD_BYTES){
    $('#dataset-import-status').textContent=`Files are limited to ${IMPORT_LIMIT_MIB} MiB. The mapped JSON request must also fit within the same API limit.`;
    $('#dataset-import-status').className='dataset-import-status error';
    return;
  }
  const format=file.name.toLowerCase().split('.').pop();
  if(!['csv','json'].includes(format)){
    $('#dataset-import-status').textContent='Choose a .csv or .json file.';
    $('#dataset-import-status').className='dataset-import-status error';
    return;
  }
  try{
    const content=await file.text();
    const parsed=format==='csv'?DatasetImport.parseCsv(content):DatasetImport.parseJson(content);
    if(parsed.records.length>50000)throw new Error('Imports are limited to 50,000 records.');
    state.importDraft={format,records:parsed.records};
    if(!$('#dataset-name').value.trim())$('#dataset-name').value=file.name.replace(/\.[^.]+$/,'').slice(0,80);
    for(const field of IMPORT_FIELDS){
      const select=$(`#${field.id}`);
      const options=field.required?'<option value="">Select a column</option>':'<option value="">Not provided (default 1)</option>';
      select.innerHTML=options+parsed.headers.map(header=>`<option value="${esc(header)}">${esc(header)}</option>`).join('');
      const suggested=parsed.headers.find(header=>field.match.test(header));
      if(suggested)select.value=suggested;
    }
    renderDatasetPreview(parsed.headers,parsed.records);
    $('#dataset-mapping').classList.remove('hidden');
    validateImportDraft();
  }catch(error){
    $('#dataset-import-status').textContent=error.message||'Could not read the selected file.';
    $('#dataset-import-status').className='dataset-import-status error';
  }
});
IMPORT_FIELDS.forEach(field=>$(`#${field.id}`).addEventListener('change',validateImportDraft));
$('#dataset-name').addEventListener('input',validateImportDraft);
$('#dataset-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!state.importDraft||state.storage?.writable===false || (state.storage?.operatingMode !== undefined && state.storage.operatingMode !== 'local-research'))return;
  const button=$('#dataset-import-button');
  button.disabled=true;button.textContent='Importing…';
  try{
    const records=DatasetImport.mapRecords(state.importDraft.records,importMapping());
    const body=JSON.stringify({name:$('#dataset-name').value.trim(),records});
    if(!ImportLimits.isPayloadWithinLimit(body))throw new Error(`Mapped dataset request exceeds the ${IMPORT_LIMIT_MIB} MiB API limit.`);
    const result=await getJSON(`${API}/dataset/import`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body
    });
    $('#dataset-import-status').textContent=`${result.dataset.records.toLocaleString()} records imported as “${result.dataset.name}”.`;
    $('#dataset-import-status').className='dataset-import-status success';
    toast('Dataset imported and made active.');
    await refreshData();
    state.importDraft=null;
    $('#dataset-file').value='';
    $('#dataset-mapping').classList.add('hidden');
    $('#dataset-import-button').disabled=true;
    button.textContent='Import and analyze';
  }catch(error){
    $('#dataset-import-status').textContent=error.message||'Dataset import failed.';
    $('#dataset-import-status').className='dataset-import-status error';
    toast(error.message||'Dataset import failed.',false);
    button.disabled=false;
    button.textContent='Import and analyze';
  }
});
$('#use-demo-data').addEventListener('click',async()=>{
  const button=$('#use-demo-data');button.disabled=true;
  try{
    await getJSON(`${API}/dataset/use-demo`,{method:'POST'});
    await refreshData();
    toast('Synthetic demo restored. Your imported dataset is saved.');
  }catch(error){toast(error.message||'Could not switch datasets.',false);}
  finally{button.disabled=false;}
});
$('#use-saved-import').addEventListener('click',async()=>{
  const button=$('#use-saved-import');button.disabled=true;
  try{
    await getJSON(`${API}/dataset/use-imported`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({datasetId:state.dataset?.importedDatasetId})
    });
    await refreshData();
    toast('Saved imported dataset restored.');
  }catch(error){toast(error.message||'Could not restore the imported dataset.',false);}
  finally{button.disabled=false;}
});
function updateStats(){
  const stats=state.stats||{};
  $('#stat-total').textContent=stats.total??state.reports.length;
  $('#stat-zones').textContent=stats.activeZones??state.zones.filter(zone=>zone.count>0).length;
  $('#stat-critical').textContent=stats.highRiskZones??state.zones.filter(zone=>zone.band==='high'||zone.band==='critical').length;
  const recent=state.analytics?.last24h;
  $('#stat-recent').textContent=recent===null||recent===undefined?'—':recent;
  const recentCoverage=state.analytics?.temporalCoverage?.windows?.last24h;
  $('#stat-recent').title=recent===null||recent===undefined?`Unavailable: ${recentCoverage?.unknown??0} unknown and ${recentCoverage?.ambiguous??0} boundary-ambiguous records affect the last-24-hour window.`:'Count of records whose supported time interval is wholly within the last 24 hours (UTC).';
}
function renderZoneList(){const el=$('#zone-list');if(!el)return;const zones=[...state.zones].sort((a,b)=>Number(b.score)-Number(a.score));el.innerHTML=zones.map(z=>`<li><button class="zone-item" data-zone="${esc(z.id)}"><span><b>${esc(z.name)}</b><small>${z.count} records · ${esc(recentCountLabel(z))} · peak ${z.peakHour===null?'unavailable':String(z.peakHour).padStart(2,'0')+':00 UTC'}</small></span><strong class="badge ${esc(z.band)}">${z.score}</strong></button></li>`).join('');el.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>focusZone(b.dataset.zone));}
function setTab(tab){state.tab=tab;$$('.tab').forEach(b=>{const selected=b.dataset.tab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});$$('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${tab}`));const researchView=tab==='research';$('.workspace').classList.toggle('research-mode',researchView);document.body.classList.toggle('research-view',researchView);setMobileMapVisible(false);$('#panel').scrollTop=0;invalidateMapSize();if(tab==='analytics'&&state.analytics)requestAnimationFrame(()=>drawCharts(state.analytics));$('#map-mode').textContent=tab==='report'?'Click anywhere on the map to pin a report.':'Select a zone or report marker for details.';}
$('#tabs').onclick=e=>{const button=e.target.closest('.tab');if(button)setTab(button.dataset.tab);};
$('#tabs').onkeydown=e=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
  const tabs=$$('#tabs .tab:not(:disabled)'),current=tabs.indexOf(document.activeElement);
  if(current<0)return;
  e.preventDefault();
  const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].focus();setTab(tabs[next].dataset.tab);
};
$$('[data-stat]').forEach(button=>button.onclick=()=>setTab(button.dataset.stat==='total'?'overview':button.dataset.stat==='recent'?'analytics':'risk'));
$('#mobile-view-toggle').onclick=()=>setMobileMapVisible(!state.mobileMapVisible);
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)setTab(b.dataset.go);});

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
function restorePatrolPlan(){try{const saved=JSON.parse(localStorage.getItem(PATROL_STORAGE_KEY)||'null');if(!saved?.route||!saved?.alloc)return;if(saved.station&&[...$('#p-station').options].some(o=>o.value===saved.station))$('#p-station').value=saved.station;if(saved.stops)$('#p-stops').value=saved.stops;if(saved.officers)$('#p-officers').value=saved.officers;drawRoute(saved.route,saved.alloc,false);}catch{localStorage.removeItem(PATROL_STORAGE_KEY);}}

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
function drawRoute(route,alloc,announce=true){
  layers.route.clearLayers();
  const pts=[{lat:route.station.lat,lng:route.station.lng},...route.stops];
  L.marker([route.station.lat,route.station.lng],{icon:L.divIcon({className:'station-pin',html:'🚔',iconSize:[30,30]})}).bindTooltip(route.station.name).addTo(layers.route);
  L.polyline(pts.map(p=>[p.lat,p.lng]),{color:'#f5a623',weight:4,dashArray:'10 8',opacity:.95}).addTo(layers.route);
  route.stops.forEach((s,i)=>L.marker([s.lat,s.lng],{icon:L.divIcon({className:'stop-pin',html:`<b>${i+1}</b>`,iconSize:[26,26]})}).on('click',()=>openAnalyticsDetail(`Patrol stop ${i+1}: ${s.name}`,`<div class="detail-grid"><div><span>Risk</span><b>${s.score}/100</b></div><div><span>Band</span><b>${esc(s.band)}</b></div><div><span>Leg</span><b>${s.legKm} km</b></div><div><span>Zone</span><b>${esc(s.name)}</b></div></div>`)).addTo(layers.route));
  map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lng])).pad(.25));$('#route-card').classList.remove('hidden');
  $('#route-card').innerHTML=`<div class="result-heading"><h3>🚔 Route from ${esc(route.station.name)}</h3><button class="ghost-btn" id="route-focus">Focus route</button></div><ol>${route.stops.map((s,i)=>`<li><button class="route-stop" data-stop="${i}"><b>${esc(s.name)}</b><span>risk ${s.score} · +${s.legKm} km</span></button></li>`).join('')}</ol><div class="route-meta">📏 ${route.totalKm} km · ⏱ ~${route.totalMin} min including stops</div>`;
  $('#alloc-card').classList.remove('hidden');$('#alloc-card').innerHTML=`<div class="result-heading"><h3>👮 Officer allocation</h3><span class="result-pill">${alloc.officers} on duty</span></div><div class="allocation-list">${alloc.zones.map(z=>`<button class="allocation-row" data-zone="${esc(z.id||z.name)}"><span><b>${esc(z.name)}</b><small>${z.window?esc(z.window):'Time window unavailable: no exact event hour'}</small></span><strong>${z.officers}</strong></button>`).join('')}</div><p class="muted small">Allocation is proportional to the current risk score. Time windows are shown only when supported by exact, non-synthetic event timestamps.</p>`;
  $('#route-focus').onclick=()=>map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lng])).pad(.25));
  $('#route-card').querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>map.flyTo([route.stops[Number(b.dataset.stop)].lat,route.stops[Number(b.dataset.stop)].lng],14,{duration:.5}));
  $('#alloc-card').querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{const z=state.zones.find(x=>x.id===b.dataset.zone||x.name===b.dataset.zone);if(z)openZoneDetail(z);});
  if(announce)toast('Patrol plan generated.');
}

(async function boot(){
  try{
    try{
      const summary=await getJSON(`${API}/research/summary`);
      renderResearchSummary(summary);
    }catch(error){
      $('#research-results-status').textContent=`Stored research results could not be loaded: ${error.message}`;
      $('#research-results-status').className='research-results-status error';
      $('#research-highlight').textContent='The stored canonical experiment summary is unavailable.';
    }
    const meta=await getJSON(`${API}/config`);
    state.types=meta.types||{};
    $('#p-station').innerHTML=(meta.stations||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    await refreshData();restorePatrolPlan();
    const requestedTab=new URLSearchParams(location.search).get('tab');
    const startTab=['overview','datasets','report','risk','patrol','analytics','research'].includes(requestedTab)?requestedTab:'overview';
    setTab(startTab);setInterval(refreshData,60000);
    window.addEventListener('resize',()=>{invalidateMapSize();drawHeat();if(state.tab==='analytics')requestAnimationFrame(()=>drawCharts(state.analytics));});
    document.addEventListener('visibilitychange',async()=>{if(!document.hidden)await refreshData();});
    $('#picked-spot').addEventListener('dblclick',useMyLocation);
  }catch(err){$('#connection').textContent='Offline';$('#connection').className='connection offline';$('#data-updated').textContent='Dashboard unavailable';$('#data-updated').title='The dashboard could not connect to its data service.';$('#overview-updated').textContent='Data unavailable';toast(err.message||'Application failed to initialise.',false);}
})();
