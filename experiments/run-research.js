const { execFileSync } = require("node:child_process");

const steps = [
  ["research-experiments", "experiments/run-experiments.js"],
  ["patrol-experiments", "experiments/run-patrol-experiments.js"],
  ["allocation-experiments", "experiments/run-allocation-experiments.js"],
  ["robustness-experiments", "experiments/run-robustness-experiments.js"],
  ["summarize-results", "experiments/summarize-results.js"]
];

console.log("Running SurakshyaPath research pipeline...");

for (const [name, script] of steps) {
  console.log("\n> " + name);
  execFileSync(process.execPath, [script], { stdio: "inherit" });
}

console.log("\nResearch pipeline completed successfully.");
