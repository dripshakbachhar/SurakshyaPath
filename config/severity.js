// ============================================================================
// SurakshyaPath — Research Severity Configuration
// ============================================================================
// The research dataset uses a deliberately separate relative severity scale.
// Keep it explicit so research weights are not accidentally confused with the
// live dashboard severity weights in server.js.
// ============================================================================

const RESEARCH_SEVERITY = {
  theft: 2,
  suspicious: 1,
  harassment: 3,
  infrastructure: 1,
};

module.exports = { RESEARCH_SEVERITY };
