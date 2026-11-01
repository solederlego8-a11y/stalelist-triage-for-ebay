/*
 * License handling — honest stub.
 *
 * verifyLicenseKey() NEVER claims success against a server that does not
 * exist. While config.connected is false it returns
 * { status: "not-connected", pro: false } for real keys, and only the
 * explicit local test mode (config.testMode, keys prefixed "DEV-") unlocks
 * Pro for development. Storage is chrome.storage.local when available,
 * localStorage on the demo page.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SLT_LICENSE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function getConfig() {
    return (typeof self !== "undefined" && self.SLT_LICENSE_CONFIG) || { connected: false, testMode: false, testKeyPrefix: "DEV-" };
  }

  async function verifyLicenseKey(key) {
    const cfg = getConfig();
    if (!key || typeof key !== "string") return { status: "empty", pro: false };
    if (cfg.testMode && key.startsWith(cfg.testKeyPrefix)) {
      return { status: "test-mode", pro: true, note: "Local test mode only. Not a real license check." };
    }
    if (!cfg.connected) {
      return { status: "not-connected", pro: false, note: "License verification is not connected yet." };
    }
    // Real verification would POST { key } to cfg.verifyEndpoint here.
    // Intentionally unimplemented until the provider account exists.
    return { status: "not-connected", pro: false, note: "Endpoint configured but verification not implemented." };
  }

  /** Effective Pro state from a stored license record. */
  function isProFromRecord(record) {
    if (!record || !record.key) return false;
    const cfg = getConfig();
    if (cfg.testMode && record.key.startsWith(cfg.testKeyPrefix)) return true;
    return record.verified === true && cfg.connected === true;
  }

  return { verifyLicenseKey, isProFromRecord, getConfig };
});
