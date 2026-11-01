(function () {
  "use strict";
  const L = window.SLT_LICENSE;
  const statusEl = document.getElementById("lic-status");
  const keyEl = document.getElementById("lic-key");
  const msgEl = document.getElementById("lic-msg");

  const store = {
    async get(key) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const out = await chrome.storage.local.get(key);
        return out[key];
      }
      try { const v = localStorage.getItem("slt:" + key); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
    },
    async set(key, value) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [key]: value });
        return;
      }
      try { localStorage.setItem("slt:" + key, JSON.stringify(value)); } catch {}
    },
  };

  async function refresh() {
    const cfg = L.getConfig();
    const rec = await store.get("slt_license");
    const pro = L.isProFromRecord(rec);
    if (rec && rec.key) keyEl.value = rec.key;
    statusEl.textContent =
      `License verification: ${cfg.connected ? "connected" : "NOT CONNECTED (development build)"}. ` +
      `Current plan: ${pro ? "Pro (local test mode)" : "Free"}.` +
      (cfg.testMode ? " Test mode is ON: keys starting with DEV- unlock Pro locally." : "");
  }

  document.getElementById("lic-save").addEventListener("click", async () => {
    const key = keyEl.value.trim();
    const res = await L.verifyLicenseKey(key);
    await store.set("slt_license", { key, verified: res.pro && res.status === "verified", status: res.status, savedAt: Date.now() });
    if (res.status === "test-mode") msgEl.textContent = "Test mode: Pro unlocked locally. This is not a real license check.";
    else if (res.status === "not-connected") msgEl.textContent = "License verification is not connected yet, so this key could not be verified. No request was sent anywhere.";
    else msgEl.textContent = "Saved.";
    refresh();
  });

  document.getElementById("lic-clear").addEventListener("click", async () => {
    await store.set("slt_license", null);
    keyEl.value = "";
    msgEl.textContent = "License cleared. You are on the Free plan.";
    refresh();
  });

  refresh();
})();
