const fs=require("fs");
const path=require("path");

const dataDir=path.join(__dirname,"..","data");
const resultsDir=path.join(__dirname,"results","allocation");
const input=path.join(dataDir,"synthetic_incidents.csv");
if(!fs.existsSync(input)) require("../data/generate-synthetic");

const { ZONES } = require("../config/zones");
const zones=ZONES.map(({name,lat,lng})=>({name,lat,lng}));
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
const { scoreModels } = require("../algorithms/research-models");
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
const models=scoreModels(incidents,zones.map(z=>z.name));
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
