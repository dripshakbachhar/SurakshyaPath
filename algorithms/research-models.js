// ============================================================================
// SurakshyaPath — Research Score Models
// ============================================================================
// Shared scoring models used by the research experiments.
// These models operate on the synthetic dataset's explicit severity values.
// ============================================================================

function normalize(scores) {
  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(
    Object.entries(scores).map(([zone, value]) => [
      zone,
      (value / max) * 100,
    ])
  );
}

function scoreModels(incidents, zoneNames) {
  const grouped = Object.fromEntries(
    zoneNames.map((name) => [name, []])
  );

  for (const incident of incidents) {
    grouped[incident.zone].push(incident);
  }

  const frequency = {};
  const severity = {};
  const frequencySeverity = {};
  const current = {};

  for (const [zone, records] of Object.entries(grouped)) {
    frequency[zone] = records.length;
    severity[zone] = records.length
      ? records.reduce((sum, record) => sum + record.severity, 0) / records.length
      : 0;
    frequencySeverity[zone] = records.reduce(
      (sum, record) => sum + record.severity,
      0
    );
    current[zone] = records.reduce(
      (sum, record) =>
        sum + record.severity * Math.max(0.15, 1 - record.ageDays / 30),
      0
    );
  }

  return {
    "frequency-only": normalize(frequency),
    "severity-only": normalize(severity),
    "frequency-severity": normalize(frequencySeverity),
    "current-severity-recency": normalize(current),
  };
}

module.exports = {
  normalize,
  scoreModels,
};
