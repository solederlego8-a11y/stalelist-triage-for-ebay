/*
 * StaleList Triage for eBay — content script.
 *
 * READ-ONLY by design: it reads the listing rows already rendered on the
 * page the user opened, draws badges, and (on explicit user click) checks
 * the page's own row checkboxes to ASSIST selection. It never clicks End /
 * Relist / Sell Similar buttons, never navigates pages on its own, never
 * runs in the background, and never sends listing data anywhere. The only
 * network use in the whole extension is license verification, which is
 * currently NOT CONNECTED (see config/license-config.js).
 *
 * Seller Hub's real DOM is UNVERIFIED (no seller account was available
 * during development). Extraction therefore does not depend on a single
 * selector: it primarily uses generic table-header mapping, with several
 * row-candidate fallbacks, plus a detection-rate guard that halts output
 * when parsing looks wrong.
 */
(function () {
  "use strict";
  if (window.__SLT_INIT__) return;
  window.__SLT_INIT__ = true;

  const R = window.SLT_RULES;
  const L = window.SLT_LICENSE;
  if (!R) return; // engine failed to load; stay silent rather than break the page

  // ---------- storage adapter (chrome.storage.local, localStorage on demo) ----------
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

  // ---------- parsing helpers ----------
  // Header synonyms include Japanese because Chrome's built-in page
  // translation rewrites Seller Hub / demo headers in the DOM (verified
  // 2026-11-01 on a real Chrome: Views→閲覧数, Watchers→ウォッチャー,
  // Quantity sold→販売数量, Days listed→出品日数 etc.). Without these,
  // column mapping silently fails and every row degrades to Keep.
  const HEADER_SYNONYMS = [
    ["title", ["title", "item title", "listing title", "アイテムタイトル", "商品タイトル", "タイトル"]],
    ["itemId", ["item id", "item number", "listing id", "アイテムid", "商品id", "アイテム番号"]],
    ["price", ["price", "current price", "buy it now price", "価格"]],
    ["views", ["views", "page views", "visits", "閲覧数", "ビュー数", "表示回数"]],
    ["watchers", ["watchers", "watch count", "ウォッチャー", "ウォッチ数"]],
    ["qtySold", ["quantity sold", "sold", "items sold", "sales", "販売数量", "販売数", "売上数"]],
    ["qtyAvailable", ["quantity", "available", "qty", "数量", "在庫数", "量"]],
    ["bids", ["bids", "bid count", "入札数", "入札"]],
    ["ageDays", ["days listed", "age (days)", "days active", "listing age", "出品日数", "掲載日数", "経過日数", "日数"]],
    ["startDate", ["start date", "listed date", "listing date", "date listed", "開始日", "出品日", "掲載日"]],
    ["format", ["format", "listing type", "type", "形式", "出品形式"]],
  ];

  function headerField(text) {
    const t = (text || "").trim().toLowerCase();
    for (const [field, syns] of HEADER_SYNONYMS) {
      if (syns.some((s) => t === s || t.startsWith(s + " ") || t.includes(s))) return field;
    }
    return null;
  }

  function num(text, fallback = 0) {
    if (text === null || text === undefined) return fallback;
    const m = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : fallback;
  }

  function money(text) {
    return num(text, 0);
  }

  function ageFromDate(text) {
    const d = new Date(text);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }

  // ---------- extraction strategies ----------
  // Strategy 1 (primary): a <table> whose header row exposes >=2 metric
  // columns. Strategy 2: any table with row checkboxes. Strategy 3:
  // elements carrying a data-item-id attribute.
  function extractRows() {
    const tables = Array.from(document.querySelectorAll("table"));
    let best = null;
    for (const table of tables) {
      const headerCells = table.querySelectorAll("thead th, tr:first-child th, tr:first-child td");
      const colMap = {};
      let metricCount = 0;
      headerCells.forEach((cell, idx) => {
        const f = headerField(cell.textContent);
        if (f) { colMap[f] = idx; if (["views", "watchers", "qtySold"].includes(f)) metricCount++; }
      });
      const bodyRows = Array.from(table.querySelectorAll("tbody tr")).filter((tr) => tr.querySelector("td"));
      if (bodyRows.length && metricCount >= 2) { best = { table, colMap, bodyRows, strategy: "table-headers" }; break; }
      if (!best && bodyRows.length && table.querySelector("input[type=checkbox]")) {
        best = { table, colMap, bodyRows, strategy: "table-checkbox" };
      }
    }
    if (best) return parseTableRows(best);

    // Strategy 3: data-item-id elements
    const tagged = Array.from(document.querySelectorAll("[data-item-id]"));
    if (tagged.length) {
      return {
        strategy: "data-item-id",
        rows: tagged.map((el) => ({ el, listing: parseLooseRow(el, el.getAttribute("data-item-id")) })),
      };
    }
    return { strategy: "none", rows: [] };
  }

  function parseTableRows({ colMap, bodyRows, strategy }) {
    const rows = [];
    bodyRows.forEach((tr, i) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      const get = (f) => (colMap[f] !== undefined && cells[colMap[f]] ? cells[colMap[f]].textContent.trim() : "");
      const titleCell = colMap.title !== undefined ? cells[colMap.title] : cells[1] || cells[0];
      const titleLink = titleCell ? titleCell.querySelector("a") : null;
      const title = titleLink ? titleLink.textContent.trim() : (titleCell ? titleCell.textContent.trim() : `Listing ${i + 1}`);
      let id = get("itemId").replace(/[^\d]/g, "");
      if (!id && titleLink) { const m = (titleLink.href || "").match(/(\d{9,})/); if (m) id = m[1]; }
      if (!id) id = "row-" + (i + 1);
      let age = colMap.ageDays !== undefined ? num(get("ageDays"), NaN) : NaN;
      if (Number.isNaN(age) && colMap.startDate !== undefined) age = ageFromDate(get("startDate"));
      if (Number.isNaN(age)) age = 0;
      const qtyAvail = colMap.qtyAvailable !== undefined ? num(get("qtyAvailable"), 1) : 1;
      const format = get("format").toLowerCase();
      rows.push({
        el: tr,
        listing: {
          id, title,
          ageDays: Math.round(age),
          views: Math.round(num(get("views"), 0)),
          watchers: Math.round(num(get("watchers"), 0)),
          qtySold: Math.round(num(get("qtySold"), 0)),
          hasBids: num(get("bids"), 0) > 0 || /auction|オークション/.test(format) && num(get("bids"), 0) > 0,
          price: money(get("price")),
          isMultiQuantity: qtyAvail > 1,
        },
      });
    });
    return { strategy, rows };
  }

  function parseLooseRow(el, id) {
    const t = el.textContent || "";
    const pick = (re) => { const m = t.match(re); return m ? num(m[1], 0) : 0; };
    return {
      id: id || "unknown", title: (el.querySelector("a")?.textContent || "Listing").trim(),
      ageDays: Math.round(pick(/(\d+)\s*days?\s*(listed|active|old)/i)),
      views: Math.round(pick(/(\d[\d,]*)\s*views/i)),
      watchers: Math.round(pick(/(\d[\d,]*)\s*watchers/i)),
      qtySold: Math.round(pick(/(\d+)\s*sold/i)),
      hasBids: /(\d+)\s*bids/i.test(t) && num((t.match(/(\d+)\s*bids/i) || [])[1], 0) > 0,
      price: money((t.match(/\$[\d,]+(\.\d{2})?/) || ["0"])[0]),
      isMultiQuantity: false,
    };
  }

  function expectedCount() {
    // Look for "1-48 of 1,234 results/listings" style text.
    const bodyText = (document.body.innerText || "").slice(0, 20000);
    const m = bodyText.match(/of\s+([\d,]+)\s+(results|listings|items)/i) || bodyText.match(/([\d,]+)\s+(results|listings|items)\b/i);
    if (m) return num(m[1], 0);
    return null; // unknown; guard falls back to detected-as-expected in panel
  }

  // ---------- badges ----------
  const VERDICT_STYLE = {
    end: { label: "End candidate", bg: "#fde8e8", fg: "#9b1c1c", row: "rgba(253,232,232,.55)" },
    review: { label: "Review", bg: "#fef3c7", fg: "#92400e", row: "rgba(254,243,199,.5)" },
    keep: { label: "Keep", bg: "#e5e7eb", fg: "#374151", row: "" },
    protected: { label: "Protected", bg: "#dbeafe", fg: "#1e40af", row: "rgba(219,234,254,.45)" },
  };

  function clearBadges() {
    document.querySelectorAll(".slt-badge").forEach((b) => b.remove());
    document.querySelectorAll("[data-slt-row]").forEach((tr) => { tr.style.background = ""; tr.removeAttribute("data-slt-row"); });
  }

  function renderBadges(parsedRows, evaluated, limits, isPro) {
    clearBadges();
    evaluated.forEach((e, i) => {
      const tr = parsedRows[i].el;
      const st = VERDICT_STYLE[e.result.verdict];
      tr.setAttribute("data-slt-row", e.result.verdict);
      if (st.row) tr.style.background = st.row;
      const badge = document.createElement("span");
      badge.className = "slt-badge";
      badge.style.cssText = `display:inline-block;margin:2px 4px;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:${st.bg};color:${st.fg};border:1px solid ${st.fg}33;white-space:nowrap;`;
      let text = e.capped ? "Over free limit" : st.label;
      if (!e.capped && isPro && limits.scoreVisible && e.result.score !== null) text += ` · ${e.result.score}`;
      if (!e.capped && e.result.warnings.length) text += " ⚠";
      badge.textContent = text;
      badge.title = (e.result.reasons.join("; ") + (e.result.warnings.length ? " | " + e.result.warnings.join("; ") : "")) || st.label;
      const target = tr.querySelector("td:nth-child(2)") || tr.querySelector("td") || tr;
      target.appendChild(badge);
    });
  }

  // ---------- panel ----------
  let panel, state = { isPro: false, rule: null, evaluated: null, parsed: null, guard: null };

  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }

  function buildPanel() {
    panel = el(`<div id="slt-panel" aria-label="StaleList Triage panel">
      <div class="slt-head"><strong>StaleList Triage</strong><span class="slt-sub">for eBay — read-only triage</span></div>
      <div class="slt-body">
        <label class="slt-label">Rule preset
          <select id="slt-preset">
            <option value="standard">Standard 90-day (Free)</option>
            <option value="gentle">Gentle 180-day (Pro)</option>
            <option value="custom">Custom rule (Pro)</option>
          </select>
        </label>
        <div id="slt-custom" class="slt-custom" hidden>
          <label>Judge from (days) <input id="slt-c-judge" type="number" min="0" value="30"></label>
          <label>End candidate from (days) <input id="slt-c-end" type="number" min="0" value="90"></label>
          <label>Max views for End <input id="slt-c-views" type="number" min="0" value="5"></label>
          <label>Price floor ($) <input id="slt-c-floor" type="number" min="0" value="0"></label>
        </div>
        <button id="slt-run" class="slt-btn primary">Run triage on this page</button>
        <div id="slt-diag" class="slt-note">Diagnostics: not run yet.</div>
        <div id="slt-halt" class="slt-halt" hidden>⚠ Detection looks unreliable, so triage output is stopped for safety. eBay may have changed the page layout.</div>
        <div id="slt-summary" class="slt-summary"></div>
        <button id="slt-select" class="slt-btn">Select all End candidates on this page</button>
        <button id="slt-save" class="slt-btn">Save selection across pages (Pro)</button>
        <div id="slt-saved" class="slt-note"></div>
        <button id="slt-csv" class="slt-btn">Export CSV (Pro)</button>
        <button id="slt-clear" class="slt-btn ghost">Clear saved selection</button>
        <div id="slt-plan" class="slt-note"></div>
        <div class="slt-note slt-fine">Read-only: this tool never ends, relists or edits listings. Free features will never be moved behind the paywall.</div>
      </div></div>`);
    document.body.appendChild(panel);
    panel.querySelector("#slt-run").addEventListener("click", runTriage);
    panel.querySelector("#slt-select").addEventListener("click", selectEndCandidates);
    panel.querySelector("#slt-save").addEventListener("click", saveSelectionAcrossPages);
    panel.querySelector("#slt-csv").addEventListener("click", exportCsv);
    panel.querySelector("#slt-clear").addEventListener("click", async () => { await store.set("slt_savedSelections", {}); refreshSavedNote(); });
    panel.querySelector("#slt-preset").addEventListener("change", (ev) => {
      panel.querySelector("#slt-custom").hidden = ev.target.value !== "custom";
    });
    refreshPlanNote();
    refreshSavedNote();
  }

  async function refreshPlanNote() {
    const rec = await store.get("slt_license");
    state.isPro = L ? L.isProFromRecord(rec) : false;
    const licCfg = L ? L.getConfig() : { connected: false };
    panel.querySelector("#slt-plan").textContent =
      `Plan: ${state.isPro ? "Pro (test mode)" : "Free"} · License verification: ${licCfg.connected ? "connected" : "not connected"}. ` +
      (state.isPro ? "" : "Pro unlocks custom rules, cross-page selection, CSV and scores via the toolbar popup.");
  }

  async function refreshSavedNote() {
    const saved = (await store.get("slt_savedSelections")) || {};
    const n = Object.keys(saved).length;
    panel.querySelector("#slt-saved").textContent = n ? `Saved across pages: ${n} listing(s).` : "Saved across pages: none.";
  }

  function currentRule() {
    const sel = panel.querySelector("#slt-preset").value;
    if (sel === "custom") {
      return {
        id: "custom", label: "Custom",
        judgeFromDays: num(panel.querySelector("#slt-c-judge").value, 30),
        endCandidateDays: num(panel.querySelector("#slt-c-end").value, 90),
        maxViewsForEnd: num(panel.querySelector("#slt-c-views").value, 5),
        priceFloor: num(panel.querySelector("#slt-c-floor").value, 0),
      };
    }
    return { ...R.PRESETS[sel] };
  }

  async function runTriage() {
    await refreshPlanNote();
    const limits = R.limitsFor(state.isPro);
    const sel = panel.querySelector("#slt-preset").value;
    if (!limits.presets.includes(sel) && sel !== "custom") {
      panel.querySelector("#slt-diag").textContent = "The Gentle preset is a Pro feature. Showing Standard instead.";
      panel.querySelector("#slt-preset").value = "standard";
    }
    if (sel === "custom" && !limits.customRules) {
      panel.querySelector("#slt-diag").textContent = "Custom rules are a Pro feature. Showing Standard instead.";
      panel.querySelector("#slt-preset").value = "standard";
    }
    const rule = currentRule();
    state.rule = rule;
    const parsed = extractRows();
    state.parsed = parsed;
    const expected = expectedCount() ?? parsed.rows.length;
    const guard = R.detectionGuard(parsed.rows.length, expected);
    state.guard = guard;
    panel.querySelector("#slt-diag").textContent =
      `Diagnostics (${parsed.strategy}): page shows ~${expected}, detected ${parsed.rows.length} (${Math.round(guard.rate * 100)}%).`;
    panel.querySelector("#slt-halt").hidden = !guard.halted;
    if (guard.halted) { clearBadges(); panel.querySelector("#slt-summary").innerHTML = ""; state.evaluated = null; return; }
    let evaluated = R.evaluateAll(parsed.rows.map((r) => r.listing), rule);
    evaluated = R.applyFlagCap(evaluated, state.isPro);
    state.evaluated = evaluated;
    renderBadges(parsed.rows, evaluated, limits, state.isPro);
    const s = R.summarize(evaluated);
    panel.querySelector("#slt-summary").innerHTML =
      `<span>End candidate: <b>${s.end}</b></span><span>Review: <b>${s.review}</b></span><span>Keep: <b>${s.keep}</b></span><span>Protected: <b>${s.protected}</b></span>`;
    if (!state.isPro) {
      const rec = await store.get("slt_customRuleNote");
      void rec;
    } else if (rule.id === "custom" && limits.ruleSaving) {
      await store.set("slt_customRule", rule);
    }
  }

  function selectEndCandidates() {
    if (!state.evaluated || !state.parsed) return;
    let n = 0;
    state.evaluated.forEach((e, i) => {
      if (e.result.verdict === "end" && !e.capped) {
        const cb = state.parsed.rows[i].el.querySelector("input[type=checkbox]");
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); n++; }
      }
    });
    panel.querySelector("#slt-diag").textContent = `Checked ${n} End candidate(s). Nothing was ended or relisted — review and use eBay's own buttons when you are ready.`;
  }

  async function saveSelectionAcrossPages() {
    if (!state.isPro) { panel.querySelector("#slt-diag").textContent = "Cross-page selection is a Pro feature."; return; }
    if (!state.evaluated || !state.parsed) return;
    const saved = (await store.get("slt_savedSelections")) || {};
    state.evaluated.forEach((e, i) => {
      const cb = state.parsed.rows[i].el.querySelector("input[type=checkbox]");
      if (cb && cb.checked) saved[e.listing.id] = { verdict: e.result.verdict, score: e.result.score, title: e.listing.title };
    });
    await store.set("slt_savedSelections", saved);
    refreshSavedNote();
  }

  function exportCsv() {
    if (!state.isPro) { panel.querySelector("#slt-diag").textContent = "CSV export is a Pro feature."; return; }
    if (!state.evaluated) return;
    const csv = R.toCsv(state.evaluated);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stalelist-triage.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function init() {
    if (document.getElementById("slt-panel")) return;
    buildPanel();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
