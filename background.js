/*
 * Service worker — intentionally minimal.
 * The extension does no background work: no polling, no scheduled runs,
 * no data collection. This worker exists only so the manifest has a
 * stable entry point for future install-time defaults.
 */
chrome.runtime.onInstalled.addListener(() => {
  // No defaults to seed in the MVP. Saved selections and license state are
  // created lazily by the content script / popup via chrome.storage.local.
});
