/*
 * StaleList Triage for eBay — rule engine (pure functions).
 *
 * This module contains NO DOM access and NO network access so it can be
 * unit-tested in Node (see tests/rules.test.js) and reused verbatim by the
 * content script, the popup and the demo page.
 *
 * Verdicts:
 *   "end"       End candidate  — stale by the active rule, no protection hit
 *   "review"    Review         — stale-ish, or capped here by a soft rule
 *   "keep"      Keep           — not stale enough to act on
 *   "protected" Protected      — excluded by a protection rule (never flagged)
 *
 * Staleness score (0-100), intentionally simple and explainable:
 *   ageScore     = min(ageDays / 180, 1) * 50        -> 0..50 points
 *   viewScore    = views == 0            -> 30
 *                  views <= maxViews     -> 20
 *                  views <= maxViews * 3 -> 10
 *                  otherwise             -> 0
 *   watcherScore = watchers == 0 -> 20, 1..2 -> 5, >2 -> 0
 *   score = min(ageScore + viewScore + watcherScore, 100), rounded.
 * Protected listings always get score null (a score would invite action on
 * listings the user explicitly wants left alone).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SLT_RULES = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Presets use the vocabulary sellers themselves use (measured on Reddit,
  // Phase 0.5a): judge at ~30 days, end/relist at 60-90 days, consider
  // disposal at 6 months-1 year.
  const PRESETS = {
    standard: {
      id: "standard",
      label: "Standard 90-day",
      judgeFromDays: 30,
      endCandidateDays: 90,
      maxViewsForEnd: 5,
      priceFloor: 0,
    },
    gentle: {
      id: "gentle",
      label: "Gentle 180-day",
      judgeFromDays: 60,
      endCandidateDays: 180,
      maxViewsForEnd: 10,
      priceFloor: 0,
    },
  };

  // Free / Pro split. Free features are never moved behind the paywall later
  // (stated in store-listing.md); Pro only ADDS capabilities.
  const PLAN_LIMITS = {
    free: {
      presets: ["standard"],
      customRules: false,
      crossPageSelection: false,
      csvExport: false,
      ruleSaving: false,
      scoreVisible: false,
      maxFlags: 25,
    },
    pro: {
      presets: ["standard", "gentle"],
      customRules: true,
      crossPageSelection: true,
      csvExport: true,
      ruleSaving: true,
      scoreVisible: true,
      maxFlags: Infinity,
    },
  };

  function limitsFor(isPro) {
    return isPro ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
  }

  function stalenessScore(listing, rule) {
    const ageScore = Math.min(Math.max(listing.ageDays, 0) / 180, 1) * 50;
    let viewScore;
    if (listing.views === 0) viewScore = 30;
    else if (listing.views <= rule.maxViewsForEnd) viewScore = 20;
    else if (listing.views <= rule.maxViewsForEnd * 3) viewScore = 10;
    else viewScore = 0;
    const watcherScore = listing.watchers === 0 ? 20 : listing.watchers <= 2 ? 5 : 0;
    return Math.min(Math.round(ageScore + viewScore + watcherScore), 100);
  }

  /**
   * Evaluate one listing.
   * listing: { id, title, ageDays, views, watchers, qtySold, hasBids,
   *            price, isMultiQuantity }
   * Returns { verdict, score, reasons[], warnings[] }
   */
  function evaluateListing(listing, rule) {
    const reasons = [];
    const warnings = [];

    // --- Protection rules (always on, checked first) ---
    if (listing.qtySold > 0) {
      return { verdict: "protected", score: null, reasons: ["has sales (qty sold > 0)"], warnings };
    }
    if (listing.hasBids) {
      return { verdict: "protected", score: null, reasons: ["auction with bids"], warnings };
    }
    if (rule.priceFloor > 0 && listing.price < rule.priceFloor) {
      return { verdict: "protected", score: null, reasons: ["below price floor"], warnings };
    }

    if (listing.isMultiQuantity) warnings.push("multi-quantity listing: check stock count before ending");

    const score = stalenessScore(listing, rule);

    // --- Too young to judge ---
    if (listing.ageDays < rule.judgeFromDays) {
      return { verdict: "keep", score, reasons: [`younger than ${rule.judgeFromDays} days`], warnings };
    }

    const staleEnough =
      listing.ageDays >= rule.endCandidateDays &&
      listing.views <= rule.maxViewsForEnd &&
      listing.qtySold === 0;

    if (staleEnough) {
      // Watcher cap: a listing with watchers is never an End candidate.
      // Losing watchers is the #1 fear sellers named; cap at Review.
      if (listing.watchers > 0) {
        reasons.push("has watchers: capped at Review");
        return { verdict: "review", score, reasons, warnings };
      }
      reasons.push(`${listing.ageDays} days old, ${listing.views} views, no watchers, no sales`);
      return { verdict: "end", score, reasons, warnings };
    }

    // Past the judging age but not fully stale -> human review.
    if (listing.ageDays >= rule.judgeFromDays && (listing.views <= rule.maxViewsForEnd * 3 || listing.watchers === 0)) {
      reasons.push("past judging age with low engagement");
      return { verdict: "review", score, reasons, warnings };
    }

    return { verdict: "keep", score, reasons: ["engagement is acceptable"], warnings };
  }

  function evaluateAll(listings, rule) {
    return listings.map((l) => ({ listing: l, result: evaluateListing(l, rule) }));
  }

  function summarize(evaluated) {
    const s = { end: 0, review: 0, keep: 0, protected: 0, total: evaluated.length };
    for (const e of evaluated) s[e.result.verdict] += 1;
    return s;
  }

  /**
   * Detection guard. expected = listings the page claims to show,
   * detected = listings we successfully parsed. Below 80% we refuse to
   * render verdicts at all (fail loudly, never silently wrong).
   */
  function detectionGuard(detected, expected) {
    if (!expected || expected <= 0) {
      return { rate: detected > 0 ? 1 : 0, halted: detected === 0, reason: "no expected count" };
    }
    const rate = detected / expected;
    return { rate, halted: rate < 0.8, reason: rate < 0.8 ? "detection rate below 80%" : "ok" };
  }

  /** Apply the free-plan flag cap: returns evaluated list with `capped` marks. */
  function applyFlagCap(evaluated, isPro) {
    const max = limitsFor(isPro).maxFlags;
    if (max === Infinity) return evaluated.map((e) => ({ ...e, capped: false }));
    let flags = 0;
    return evaluated.map((e) => {
      const isFlag = e.result.verdict === "end" || e.result.verdict === "review";
      if (isFlag) {
        flags += 1;
        return { ...e, capped: flags > max };
      }
      return { ...e, capped: false };
    });
  }

  function toCsv(evaluated) {
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ["item_id", "title", "age_days", "views", "watchers", "qty_sold", "has_bids", "price", "multi_quantity", "verdict", "score", "reasons"];
    const lines = [head.join(",")];
    for (const e of evaluated) {
      const l = e.listing, r = e.result;
      lines.push([l.id, l.title, l.ageDays, l.views, l.watchers, l.qtySold, l.hasBids ? "yes" : "no", l.price, l.isMultiQuantity ? "yes" : "no", r.verdict, r.score === null ? "" : r.score, r.reasons.join("; ")].map(esc).join(","));
    }
    return lines.join("\n");
  }

  return { PRESETS, PLAN_LIMITS, limitsFor, stalenessScore, evaluateListing, evaluateAll, summarize, detectionGuard, applyFlagCap, toCsv };
});
