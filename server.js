// ============================================================================
// SurakshyaPath — Express Server
// ============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const { ZONES } = require('./config/zones');
const { computeZones: computeZonesFromModel } = require('./algorithms/risk');
const { computePatrol: computePatrolFromModel } = require('./algorithms/routing');
const { computeAllocation: computeAllocationFromModel } = require('./algorithms/allocation');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req,res,next) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','geolocation=(self)');
  if(req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.static(path.join(__dirname,'public')));

const STATIONS=[
  {id:'mpr-ratna-park',name:'MPR Ratna Park',lat:27.705,lng:85.315},
  {id:'baneshwor',name:'Baneshwor',lat:27.691,lng:85.335},
  {id:'chabahil',name:'Chabahil',lat:27.717,lng:85.348}
];
const TYPES={
  theft:{severity:5,label:'Theft'},
  suspicious:{severity:3,label:'Suspicious Activity'},
  harassment:{severity:7,label:'Harassment'},
  infrastructure:{severity:2,label:'Infrastructure Issue'}
};
const DAY_MS=86400000;
const DATA_FILE=path.join(__dirname,'data','incidents.json');

function createSeededRandom(seed){
  let state=seed>>>0;
  return ()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
}
function rand(min,max,random=Math.random){return random()*(max-min)+min;}
function weightedPick(items,random=Math.random){
  let value=random()*items.reduce((s,i)=>s+i.weight,0);
  for(const item of items){if((value-=item.weight)<=0)return item.name;}
  return items.at(-1).name;
}
const seedProfiles=[
  {name:'Resident',weight:55},{name:'Student',weight:25},
  {name:'Business Owner',weight:15},{name:'Visitor',weight:5}
];
const sampleNotes={
  theft:['Phone reported missing near a crowded area.','Bag reported missing.','Possible theft reported by resident.'],
  suspicious:['Suspicious activity reported near a public area.','Resident reported unusual activity.','Unidentified activity observed.'],
  harassment:['Harassment reported by resident.','Verbal harassment reported.','Unsafe interaction reported.'],
  infrastructure:['Broken streetlight reported.','Damaged public infrastructure reported.','Poor lighting reported.']
};

function seedIncidents(){
  const incidents=[],random=createSeededRandom(208304);
  const zoneIds=ZONES.map(z=>z.id),typeIds=Object.keys(TYPES);
  for(let i=0;i<180;i++){
    const type=typeIds[Math.floor(random()*typeIds.length)];
    const zone=zoneIds[Math.floor(random()*zoneIds.length)];
    const z=ZONES.find(x=>x.id===zone);
    incidents.push({
      id:`seed-${i+1}`,zone,type,ts:Math.round(Date.now()-random()*30*DAY_MS),
      reporter:weightedPick(seedProfiles,random),
      note:sampleNotes[type][Math.floor(random()*sampleNotes[type].length)],
      lat:z.lat+rand(-.002,.002,random),lng:z.lng+rand(-.002,.002,random)
    });
  }
  return incidents;
}
function load(){
  try{return fs.existsSync(DATA_FILE)?JSON.parse(fs.readFileSync(DATA_FILE,'utf8')):null;}
  catch(error){console.error('Failed to load incident data:',error);return null;}
}
function save(data){
  try{
    fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});
    fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2));
  }catch(error){console.error('Failed to save incident data:',error);}
}
let incidents=load()||seedIncidents();
let riskCache=null;
const RISK_CACHE_MS=60000;
save(incidents);

const reportWindow=new Map();
function allowReport(ip){
  const now=Date.now(),recent=(reportWindow.get(ip)||[]).filter(t=>now-t<60000);
  if(recent.length>=12){reportWindow.set(ip,recent);return false;}
  recent.push(now);reportWindow.set(ip,recent);return true;
}
function validCoordinate(n,min,max){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;}
function incidentTimestamp(when){
  const now=Date.now();
  if(when==='today')return now-3*60*60*1000;
  if(when==='week')return now-3*DAY_MS;
  return now;
}
function nearestZone(lat,lng){
  let best=null,bestDistance=Infinity;
  for(const zone of ZONES){
    const distance=(zone.lat-lat)**2+(zone.lng-lng)**2;
    if(distance<bestDistance){bestDistance=distance;best=zone;}
  }
  return best;
}
function snapshotNow(){return Math.floor(Date.now()/60000)*60000;}
function computeZones(){
  const now=snapshotNow();
  if(riskCache&&now-riskCache.at<RISK_CACHE_MS)return riskCache.zones;
  riskCache={at:now,zones:computeZonesFromModel({zones:ZONES,incidents,types:TYPES,days:30,now})};
  return riskCache.zones;
}
function computePatrol(stationId,stopCount=5){
  const station=STATIONS.find(s=>s.id===stationId)||STATIONS[0];
  return computePatrolFromModel({station,zones:computeZones(),stopCount});
}
function computeAllocation(officers=12){
  return computeAllocationFromModel({zones:computeZones(),officers});
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'SurakshyaPath'}));
app.get('/api/config',(req,res)=>res.json({zones:ZONES,stations:STATIONS,types:TYPES}));
app.get('/api/incidents',(req,res)=>res.json(incidents));

app.post('/api/incidents',(req,res)=>{
  const {lat,lng,type,note}=req.body;
  if(!validCoordinate(lat,27.55,27.85)||!validCoordinate(lng,85.15,85.55)||!TYPES[type])
    return res.status(400).json({error:'Invalid location or incident type.'});
  if(!allowReport(req.ip))
    return res.status(429).json({error:'Too many reports. Please try again later.'});

  const zone=nearestZone(lat,lng);
  const incident={
    id:`incident-${Date.now()}-${Math.floor(Math.random()*10000)}`,
    zone:zone.id,type,ts:incidentTimestamp(req.body.when),reporter:'Anonymous',
    note:typeof note==='string'?note.trim().slice(0,280)||sampleNotes[type][0]:sampleNotes[type][0],
    lat:Number(lat.toFixed(5)),lng:Number(lng.toFixed(5))
  };
  incidents.push(incident);
  save(incidents);
  riskCache=null;
  res.status(201).json(incident);
});

app.get('/api/risk',(req,res)=>res.json(computeZones()));
app.get('/api/patrol',(req,res)=>{
  const station=req.query.station||STATIONS[0].id;
  const stops=Math.max(1,Math.min(10,Number.isFinite(Number(req.query.stops))?Number(req.query.stops):5));
  res.json(computePatrol(station,stops));
});
app.get('/api/allocation',(req,res)=>{
  const officers=Math.max(2,Math.min(40,Number.isFinite(Number(req.query.officers))?Number(req.query.officers):12));
  res.json(computeAllocation(officers));
});

function buildAnalytics(source,now=Date.now()){
  const recent=source.filter(i=>now-i.ts>=0);
  const last24h=recent.filter(i=>now-i.ts<DAY_MS).length;
  const last7d=recent.filter(i=>now-i.ts<7*DAY_MS).length;
  const last30d=recent.filter(i=>now-i.ts<30*DAY_MS).length;
  const byType={},byHour=Array(24).fill(0),byDay=Array.from({length:30},(_,i)=>({day:i+1,count:0}));
  for(const incident of recent){
    byType[incident.type]=(byType[incident.type]||0)+1;
    byHour[new Date(incident.ts).getHours()]++;
    const ageDays=Math.floor((now-incident.ts)/DAY_MS);
    if(ageDays<30)byDay[29-ageDays].count++;
  }
  return {total:recent.length,last24h,last7d,last30d,byType,byHour,byDay};
}
function buildStats(source,now){
  const window=source.filter(i=>now-i.ts>=0&&now-i.ts<30*DAY_MS);
  const activeZones=new Set(window.map(i=>i.zone)).size;
  const zones=computeZonesFromModel({zones:ZONES,incidents:source,types:TYPES,days:30,now});
  const highRiskZones=zones.filter(z=>z.band==='high'||z.band==='critical').length;
  const night=window.filter(i=>{const h=new Date(i.ts).getHours();return h>=20||h<4}).length;
  return {total:source.length,activeZones,highRiskZones,nightShare:window.length?Math.round(night/window.length*100):0};
}
app.get('/api/analytics',(req,res)=>res.json(buildAnalytics(incidents)));

app.get('/api/dashboard',(req,res)=>{
  const snapshot=incidents.slice();
  const now=snapshotNow();
  const zones=computeZonesFromModel({zones:ZONES,incidents:snapshot,types:TYPES,days:30,now});
  res.json({incidents:snapshot,zones,analytics:buildAnalytics(snapshot,now),stats:buildStats(snapshot,now)});
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`SurakshyaPath running on port ${PORT}`));
