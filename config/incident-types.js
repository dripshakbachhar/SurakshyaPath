// SurakshyaPath — shared incident taxonomy
// Keep user-facing labels and live-dashboard severity weights in one place.

const INCIDENT_TYPES = Object.freeze({
  theft: Object.freeze({ severity: 5, label: 'Theft' }),
  suspicious: Object.freeze({ severity: 3, label: 'Suspicious Activity' }),
  harassment: Object.freeze({ severity: 7, label: 'Harassment' }),
  infrastructure: Object.freeze({ severity: 2, label: 'Infrastructure Issue' }),
});

module.exports = { INCIDENT_TYPES };
