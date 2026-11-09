const EVENT_TIME_ZONE = 'Asia/Kathmandu';
const DAY_MS = 86400000;

/**
 * Event-hour analysis requires a minute-precision event timestamp.
 * Legacy records with unknown provenance are accepted only when they do not
 * identify themselves as synthetic or as coarse-window community reports.
 */
function hasEventHourPrecision(incident) {
  if (!incident || typeof incident !== 'object') return false;

  const timestamp = Number(incident.ts);
  if (!Number.isFinite(timestamp)) return false;

  if (incident.eventTimePrecision !== undefined && incident.eventTimePrecision !== null) {
    return incident.eventTimePrecision === 'MINUTE';
  }

  if (
    incident.dataStatus === 'SYNTHETIC' ||
    incident.sourceType === 'simulation' ||
    incident.sourceType === 'community-report'
  ) {
    return false;
  }

  return true;
}

function getEventHour(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return null;

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value));

  const hour = Number(formatted);
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : null;
}

function getAgeDays(incident, now = Date.now()) {
  if (
    incident &&
    incident.ageDays !== undefined &&
    incident.ageDays !== null &&
    Number.isFinite(Number(incident.ageDays))
  ) {
    return Math.max(0, Number(incident.ageDays));
  }

  const timestamp = Number(incident?.ts);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now - timestamp) / DAY_MS);
}

module.exports = {
  EVENT_TIME_ZONE,
  DAY_MS,
  hasEventHourPrecision,
  getEventHour,
  getAgeDays
};
