const fs=require("fs");
const path=require("path");
const {computePatrol,routeDistance,twoOptOpenRoute}=require("../algorithms/routing");

const resultsDir=path.join(__dirname,"results","patrol");
const { ZONES }=require("../config/zones");
const zones=ZONES.map(({name,lat,lng})=>({name,lat,lng}));
const station={id:"mpr-ratna-park",name:"MPR Ratna Park",lat:27.705,lng:85.315};
const STOP_COUNT=5;
const { readCanonicalDataset }=require("../data/canonical-dataset");
const { nearestZone }=require("../data/live-incidents");
const { createExperimentProvenance }=require("./provenance");
const { scoreModels }=require("../algorithms/research-models");
function orderZones(scores){
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])
    .map(([name])=>zones.find(z=>z.name===name)).filter(Boolean);
}
const round=value=>Number(value.toFixed(2));

const dataset=readCanonicalDataset();
const incidents=dataset.records.map(record=>({
  severity:record.severity,ageDays:record.ageDays,
  zone:nearestZone(record.latitude,record.longitude).name
}));

const models=scoreModels(incidents,zones.map(z=>z.name)),rows=[],routeDetails={};

for(const [model,scores] of Object.entries(models)){
  const ranked=orderZones(scores);
  const modelZones=ranked.map((zone,index)=>({...zone,count:1,score:scores[zone.name],rank:index+1}));

  // The experiment first selects the five highest-priority zones for the model,
  // then compares the routing algorithm's nearest-neighbour order with 2-opt.
  // This measures route optimization under each model, not model superiority.
  const nearestNeighbour=computePatrol({station,zones:modelZones,stopCount:STOP_COUNT});
  const optimized=twoOptOpenRoute(station,nearestNeighbour.stops);

  const baselineOrder=nearestNeighbour.stops.map(s=>s.name);
  const optimizedOrder=optimized.stops.map(s=>s.name);
  const baselineKm=routeDistance(station,nearestNeighbour.stops);
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
  provenance:createExperimentProvenance({
    experimentId:"patrol-route-comparison",
    sourceDataset:{...dataset,zoneCount:zones.length},
    randomSeed:208304,
    modelConfiguration:{
      models:Object.keys(models),
      station,
      priorityZoneCount:STOP_COUNT,
      routeAlgorithm:"nearest-neighbour followed by open-route 2-opt",
      distanceMethod:"great-circle coordinate distance"
    },
    metrics:{
      nearestNeighbourDistance:{unit:"kilometres"},
      optimizedDistance:{unit:"kilometres"},
      distanceSaved:{unit:"kilometres"},
      distanceSavedPercent:{unit:"percent"}
    },
    exclusions:[`Only the ${STOP_COUNT} highest-priority zones per model are routed.`],
    warnings:["Distances are coordinate-based, not road-network travel estimates; outputs do not establish operational effectiveness."]
  }),
  station,
  stopCount:STOP_COUNT,
  models:routeDetails,
  comparison:"For each risk model, select its five highest-priority zones, generate the nearest-neighbour route, then measure changes from 2-opt optimization.",
  note:"Synthetic experiment only. Distances use great-circle distance between configured zone/station coordinates; this is not a road-network travel estimate. Results describe routing changes under the specified procedure and do not establish model superiority."
},null,2)+"\n");

console.log(`Generated patrol-route comparisons for ${incidents.length} synthetic incidents.`);
console.table(rows.map(r=>({model:r[0],baselineKm:r[3],optimizedKm:r[4],savedKm:r[5],savedPercent:r[6],orderChanged:r[7]})));
