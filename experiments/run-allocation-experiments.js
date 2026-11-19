const fs=require("fs");
const path=require("path");

const resultsDir=path.join(__dirname,"results","allocation");

const { ZONES }=require("../config/zones");
const { computeAllocation }=require("../algorithms/allocation");
const { scoreModels }=require("../algorithms/research-models");
const { readCanonicalDataset }=require("../data/canonical-dataset");
const { nearestZone }=require("../data/live-incidents");
const { createExperimentProvenance }=require("./provenance");

const zones=ZONES.map(({name,lat,lng})=>({name,lat,lng}));
const OFFICER_COUNTS=[6,12,20];

const round=n=>Number(n.toFixed(4));

const dataset=readCanonicalDataset();
const incidents=dataset.records.map(record=>({
  severity:record.severity,ageDays:record.ageDays,
  zone:nearestZone(record.latitude,record.longitude).name
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
  provenance:createExperimentProvenance({
    experimentId:"resource-allocation-comparison",
    sourceDataset:{...dataset,zoneCount:ZONES.length},
    randomSeed:208304,
    modelConfiguration:{
      models:Object.keys(models),
      budgets:OFFICER_COUNTS,
      allocationMethod:"largest remainder",
      scoreNormalization:"maximum zone score is 100"
    },
    metrics:{
      allocatedUnits:{unit:"units"},
      budgetTotal:{unit:"units per model and budget"}
    },
    exclusions:[],
    warnings:["Allocations are mathematical experiment outputs, not validated real-world resource plans."]
  }),
  officerCounts:OFFICER_COUNTS,
  method:"computeAllocation: largest-remainder proportional allocation using normalized risk scores",
  models:modelSummary,
  note:"Synthetic experiment only. Officer allocations are algorithm outputs, not real staffing recommendations."
},null,2)+"\n");

console.log(`Generated resource-allocation comparisons for ${incidents.length} synthetic incidents.`);
console.table(rows.filter(r=>r[1]===12).map(r=>({model:r[0],zone:r[2],risk:r[3],officers:r[4]})));
