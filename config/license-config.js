/*
 * License configuration — NOT CONNECTED.
 *
 * The payment provider account (Lemon Squeezy) has not been created yet, so
 * there is deliberately NO verification endpoint configured here. The
 * extension does not pretend otherwise: the popup and the panel both display
 * "License verification: not connected".
 *
 * To connect later:
 *   1. Create the Lemon Squeezy product + license-key issuing.
 *   2. Set `connected: true` and `verifyEndpoint` to the verification URL.
 *   3. Implement the real call in lib/license.js (verifyLicenseKey).
 *
 * TEST MODE (development only):
 *   When `testMode` is true, any key starting with "DEV-" is accepted
 *   LOCALLY so the Pro UI can be exercised during development.
 *   >>> Set `testMode: false` before submitting to the Chrome Web Store. <<<
 *   This flag is the single switch; store-listing.md and README.md both
 *   document the pre-submission checklist that includes flipping it.
 */
(function (root) {
  root.SLT_LICENSE_CONFIG = {
    connected: false,
    verifyEndpoint: null,
    testMode: true,
    testKeyPrefix: "DEV-",
  };
})(typeof self !== "undefined" ? self : globalThis);
