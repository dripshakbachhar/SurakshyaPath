const fs=require("fs");
const path=require("path");
const {computePatrol,haversine}=require("../algorithms/routing");

const dataDir=path.join(__dirname,"..","data");
const resultsDir=path.join(__dirname,"results","patrol");
const input=path.join(dataDir,"synthetic_incidents.csv");
if(!fs.existsSync(input)) require("../data/generate-synthetic");

const { ZONES }=require("../config/zones");
const zones=ZONES.map(({name,lat,lng})=>({name,lat,lng}));
const station={id:"mpr-ratna-park",name:"MPR Ratna Park",lat:27.705,lng:85.315};
const STOP_COUNT=5;

function parseCsv(text){
  const lines=text.trim().split(/\r?\n/),headers=lines.shift().split(",");
  return lines.map(line=>{const values=line.split(",");return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
function nearestZone(lat,lng){
  let best=zones[0],bestD=Infinity;
  for(const zone of zones){const d=Math.hypot(lat-zone.lat,lng-zone.lng);if(d<bestD){best=zone;bestD=d;}}
  return best.name;
}
const { scoreModels }=require("../algorithms/research-models");
function orderZones(scores){
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])
    .map(([name])=>zones.find(z=>z.name===name)).filter(Boolean);
}
function routeDistance(stops){
  let current=station,total=0;
  for(const stop of stops){total+=haversine(current,stop);current=stop;}
  return total;
}
function twoOptOpenRoute(stops){
  let best=[...stops],bestDistance=routeDistance(best),improved=true;
  while(improved){
    improved=false;
    for(let i=0;i<best.length-1;i++){
      for(let j=i+1;j<best.length;j++){
        const candidate=[...best.slice(0,i),...best.slice(i,j+1).reverse(),...best.slice(j+1)];
        const distance=routeDistance(candidate);
        if(distance+1e-9<bestDistance){best=candidate;bestDistance=distance;improved=true;}
      }
    }
  }
  return {stops:best,totalKm:bestDistance};
}
const round=value=>Number(value.toFixed(2));

const incidents=parseCsv(fs.readFileSync(input,"utf8")).map(r=>({
  severity:Number(r.severity),ageDays:Number(r.age_days),
  zone:nearestZone(Number(r.latitude),Number(r.longitude))
}));

const models=scoreModels(incidents,zones.map(z=>z.name)),rows=[],routeDetails={};

for(const [model,scores] of Object.entries(models)){
  const ranked=orderZones(scores);
  const modelZones=ranked.map((zone,index)=>({...zone,count:1,score:scores[zone.name],rank:index+1}));

  // The experiment first selects the five highest-priority zones for the model,
  // then compares the routing algorithm's nearest-neighbour order with 2-opt.
  // This measures route optimization under each model, not model superiority.
  const nearestNeighbour=computePatrol({station,zones:modelZones,stopCount:STOP_COUNT});
  const optimized=twoOptOpenRoute(nearestNeighbour.stops);

  const baselineOrder=nearestNeighbour.stops.map(s=>s.name);
  const optimizedOrder=optimized.stops.map(s=>s.name);
  const baselineKm=routeDistance(nearestNeighbour.stops);
  const optimizedKm=optimized.totalKm;
  const savingsKm=baselineKm-optimizedKm;
  const changedOrder=baselineOrder.some((n,i)=>n!==optimizedOrder[i]);

  if(optimizedKm>baselineKm+1e-9) throw new Error(`2-opt increased route distance for ${model}`);

  routeDetails[model]={
    priorityZones:baselineOrder,
    nearestNeighbourOrder:baselineOrder,
    optimizedOrder,
    nearestNeighbourKm:round(baselineKm),
    optimizedKm:round(optimizedKm),
    savingsKm:round(savingsKm),
    savingsPercent:round(savingsKm/baselineKm*100),
    changedOrder
  };

  rows.push([
    model,
    baselineOrder.join(" > "),
    optimizedOrder.join(" > "),
    round(baselineKm),
    round(optimizedKm),
    round(savingsKm),
    round(savingsKm/baselineKm*100),
    changedOrder?"yes":"no"
  ]);
}

fs.mkdirSync(resultsDir,{recursive:true});
const csv=[
  ["model","nearest_neighbour_route","two_opt_route","nearest_neighbour_km","two_opt_km","distance_saved_km","distance_saved_percent","route_order_changed"].join(","),
  ...rows.map(row=>row.map(value=>{const text=String(value);return text.includes(",")?JSON.stringify(text):text;}).join(","))
].join("\n")+"\n";

fs.writeFileSync(path.join(resultsDir,"route-comparison.csv"),csv);
fs.writeFileSync(path.join(resultsDir,"route-comparison.json"),JSON.stringify({
  dataset:"deterministic synthetic Shrawan 2083 Kathmandu Valley dataset",
  station,
  stopCount:STOP_COUNT,
  models:routeDetails,
  comparison:"For each risk model, select its five highest-priority zones, generate the nearest-neighbour route, then measure changes from 2-opt optimization.",
  note:"Synthetic experiment only. Distances use great-circle distance between configured zone/station coordinates; this is not a road-network travel estimate. Results describe routing changes under the specified procedure and do not establish model superiority."
},null,2)+"\n");

console.log(`Generated patrol-route comparisons for ${incidents.length} synthetic incidents.`);
console.table(rows.map(r=>({model:r[0],baselineKm:r[3],optimizedKm:r[4],savedKm:r[5],savedPercent:r[6],orderChanged:r[7]})));
