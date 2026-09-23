const fs=require("fs");
const path=require("path");

const dataDir=path.join(__dirname,"..","data");
const resultsDir=path.join(__dirname,"results","allocation");
const input=path.join(dataDir,"synthetic_incidents.csv");
if(!fs.existsSync(input)) require("../data/generate-synthetic");

const zones=[
  {name:"Thamel",lat:27.715,lng:85.312},{name:"Kalimati",lat:27.700,lng:85.283},
  {name:"New Baneshwor",lat:27.691,lng:85.342},{name:"Chabahil",lat:27.718,lng:85.347},
  {name:"Koteshwor",lat:27.678,lng:85.347},{name:"Balaju",lat:27.735,lng:85.291},
  {name:"Patan",lat:27.676,lng:85.325},{name:"Gongabu",lat:27.735,lng:85.312},
  {name:"Kirtipur",lat:27.678,lng:85.277},{name:"Bouddha",lat:27.721,lng:85.362}
];
const OFFICER_COUNTS=[6,12,20];

function parseCsv(text){
  const lines=text.trim().split(/\r?\n/),headers=lines.shift().split(",");
  return lines.map(line=>{const values=line.split(",");return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
function nearestZone(lat,lng){
  let best=zones[0],bestD=Infinity;
  for(const zone of zones){const d=Math.hypot(lat-zone.lat,lng-zone.lng);if(d<bestD){best=zone;bestD=d;}}
  return best.name;
}
function normalize(scores){
  const max=Math.max(...Object.values(scores),1);
  return Object.fromEntries(Object.entries(scores).map(([z,v])=>[z,(v/max)*100]));
}
function scoreModels(incidents){
  const grouped=Object.fromEntries(zones.map(z=>[z.name,[]]));
  for(const incident of incidents) grouped[incident.zone].push(incident);
  const frequency={},severity={},frequencySeverity={},current={};
  for(const [zone,records] of Object.entries(grouped)){
    frequency[zone]=records.length;
    severity[zone]=records.length?records.reduce((s,r)=>s+r.severity,0)/records.length:0;
    frequencySeverity[zone]=records.reduce((s,r)=>s+r.severity,0);
    current[zone]=records.reduce((s,r)=>s+r.severity*Math.max(0.15,1-r.ageDays/30),0);
  }
  return {
    "frequency-only":normalize(frequency),
    "severity-only":normalize(severity),
    "frequency-severity":normalize(frequencySeverity),
    "current-severity-recency":normalize(current)
  };
}
function largestRemainder(scores,officers){
  const total=Object.values(scores).reduce((s,v)=>s+v,0)||1;
  const shares=Object.fromEntries(Object.entries(scores).map(([z,v])=>[z,v/total*officers]));
  const assigned=Object.fromEntries(Object.entries(shares).map(([z,v])=>[z,Math.floor(v)]));
  let remaining=officers-Object.values(assigned).reduce((s,v)=>s+v,0);
  Object.entries(shares).map(([zone,share])=>({zone,remainder:share%1}))
    .sort((a,b)=>b.remainder-a.remainder)
    .slice(0,remaining)
    .forEach(item=>assigned[item.zone]++);
  return {assigned,shares};
}
const round=n=>Number(n.toFixed(4));
const incidents=parseCsv(fs.readFileSync(input,"utf8")).map(r=>({
  severity:Number(r.severity),ageDays:Number(r.age_days),
  zone:nearestZone(Number(r.latitude),Number(r.longitude))
}));
const models=scoreModels(incidents);
const rows=[],modelSummary={};
for(const [model,scores] of Object.entries(models)){
  modelSummary[model]={};
  for(const officers of OFFICER_COUNTS){
    const result=largestRemainder(scores,officers);
    modelSummary[model][officers]=result.assigned;
    for(const zone of zones){
      rows.push([model,officers,zone.name,round(scores[zone.name]),result.assigned[zone.name],round(result.shares[zone.name])]);
    }
  }
}
fs.mkdirSync(resultsDir,{recursive:true});
const csv=[
 "model,officers,zone,normalized_risk,assigned_officers,ideal_share",
 ...rows.map(r=>r.join(","))
].join("\n")+"\n";
fs.writeFileSync(path.join(resultsDir,"allocation-comparison.csv"),csv);
fs.writeFileSync(path.join(resultsDir,"allocation-summary.json"),JSON.stringify({
 dataset:"deterministic synthetic Shrawan 2083 Kathmandu Valley dataset",
 officerCounts:OFFICER_COUNTS,
 method:"largest-remainder proportional allocation using normalized risk scores",
 models:modelSummary,
 note:"Synthetic experiment only. Officer allocations are algorithm outputs, not real staffing recommendations."
},null,2)+"\n");
console.log(`Generated resource-allocation comparisons for ${incidents.length} synthetic incidents.`);
console.table(rows.filter(r=>r[1]===12).map(r=>({model:r[0],zone:r[2],risk:r[3],officers:r[4]})));
