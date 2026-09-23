const fs=require("fs");
const path=require("path");

const dataDir=path.join(__dirname,"..","data");
const resultsDir=path.join(__dirname,"results","allocation");
const input=path.join(dataDir,"synthetic_incidents.csv");
if(!fs.existsSync(input)) require("../data/generate-synthetic");

const { ZONES }=require("../config/zones");
const { computeAllocation }=require("../algorithms/allocation");
const { scoreModels }=require("../algorithms/research-models");

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
    const allocation=computeAllocation({
      officers,
      zones:zones.map(zone=>({
        ...zone,
        count:incidents.filter(i=>i.zone===zone.name).length,
        score:scores[zone.name],
        peakHour:null
      }))
    });
    modelSummary[model][officers]=Object.fromEntries(
      allocation.zones.map(zone=>[zone.name,zone.officers])
    );
    for(const zone of zones){
      const allocated=modelSummary[model][officers][zone.name]||0;
      const totalScore=Object.values(scores).reduce((sum,value)=>sum+value,0)||1;
      rows.push([
        model,officers,zone.name,round(scores[zone.name]),
        allocated,round(scores[zone.name]/totalScore*officers)
      ]);
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
  method:"computeAllocation: largest-remainder proportional allocation using normalized risk scores",
  models:modelSummary,
  note:"Synthetic experiment only. Officer allocations are algorithm outputs, not real staffing recommendations."
},null,2)+"\n");

console.log(`Generated resource-allocation comparisons for ${incidents.length} synthetic incidents.`);
console.table(rows.filter(r=>r[1]===12).map(r=>({model:r[0],zone:r[2],risk:r[3],officers:r[4]})));
