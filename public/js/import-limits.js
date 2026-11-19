'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SurakshyaImportLimits = api;
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const MAX_IMPORT_PAYLOAD_BYTES = 4 * 1024 * 1024;
  function payloadByteLength(payload) {
    return new TextEncoder().encode(payload).byteLength;
  }
  function isPayloadWithinLimit(payload) {
    return payloadByteLength(payload) <= MAX_IMPORT_PAYLOAD_BYTES;
  }
  return Object.freeze({ MAX_IMPORT_PAYLOAD_BYTES, payloadByteLength, isPayloadWithinLimit });
}));
