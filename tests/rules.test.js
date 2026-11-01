/* Unit tests for the pure rule engine. Run: node --test tests/  (no dependencies) */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../lib/rules.js");

const std = R.PRESETS.standard;
const base = { id: "1", title: "x", ageDays: 0, views: 0, watchers: 0, qtySold: 0, hasBids: false, price: 20, isMultiQuantity: false };
const L = (over) => ({ ...base, ...over });

test("90+ days, 0 views, 0 watchers, 0 sold -> End candidate", () => {
  const r = R.evaluateListing(L({ ageDays: 120, views: 0, watchers: 0 }), std);
  assert.equal(r.verdict, "end");
  assert.ok(r.score >= 70, `score should be high, got ${r.score}`);
});

test("watchers present caps at Review, never End", () => {
  const r = R.evaluateListing(L({ ageDays: 200, views: 0, watchers: 3 }), std);
  assert.equal(r.verdict, "review");
});

test("sales history -> Protected regardless of staleness", () => {
  const r = R.evaluateListing(L({ ageDays: 400, views: 0, qtySold: 2 }), std);
  assert.equal(r.verdict, "protected");
  assert.equal(r.score, null);
});

test("auction with bids -> Protected", () => {
  const r = R.evaluateListing(L({ ageDays: 400, views: 0, hasBids: true }), std);
  assert.equal(r.verdict, "protected");
});

test("below user price floor -> Protected", () => {
  const rule = { ...std, priceFloor: 50 };
  const r = R.evaluateListing(L({ ageDays: 400, views: 0, price: 20 }), rule);
  assert.equal(r.verdict, "protected");
});

test("multi-quantity listing gets a warning badge note", () => {
  const r = R.evaluateListing(L({ ageDays: 130, views: 0, isMultiQuantity: true }), std);
  assert.equal(r.verdict, "end");
  assert.ok(r.warnings.some((w) => w.includes("multi-quantity")));
});

test("younger than 30 days -> Keep even with zero views", () => {
  const r = R.evaluateListing(L({ ageDays: 10, views: 0 }), std);
  assert.equal(r.verdict, "keep");
});

test("past judging age with low engagement -> Review", () => {
  const r = R.evaluateListing(L({ ageDays: 45, views: 1, watchers: 0 }), std);
  assert.equal(r.verdict, "review");
});

test("healthy engagement past 90 days -> Keep", () => {
  const r = R.evaluateListing(L({ ageDays: 95, views: 40, watchers: 5 }), std);
  assert.equal(r.verdict, "keep");
});

test("Gentle preset: 120 days is not yet an End candidate", () => {
  const r = R.evaluateListing(L({ ageDays: 120, views: 0, watchers: 0 }), R.PRESETS.gentle);
  assert.notEqual(r.verdict, "end");
  const r2 = R.evaluateListing(L({ ageDays: 200, views: 0, watchers: 0 }), R.PRESETS.gentle);
  assert.equal(r2.verdict, "end");
});

test("score is capped at 100 and protected listings have null score", () => {
  const s = R.stalenessScore(L({ ageDays: 9999, views: 0, watchers: 0 }), std);
  assert.equal(s, 100);
});

test("detection guard: below 80% halts, at/above passes", () => {
  assert.equal(R.detectionGuard(7, 10).halted, true);
  assert.equal(R.detectionGuard(8, 10).halted, false);
  assert.equal(R.detectionGuard(10, 10).halted, false);
  assert.equal(R.detectionGuard(0, 0).halted, true);
});

test("free plan flag cap marks items beyond 25 flags", () => {
  const many = Array.from({ length: 30 }, (_, i) => L({ id: String(i), ageDays: 120, views: 0 }));
  const evaluated = R.applyFlagCap(R.evaluateAll(many, std), false);
  assert.equal(evaluated.filter((e) => e.capped).length, 5);
  const proEvaluated = R.applyFlagCap(R.evaluateAll(many, std), true);
  assert.equal(proEvaluated.filter((e) => e.capped).length, 0);
});

test("free plan limits: no custom rules, no CSV, no cross-page, Standard only", () => {
  const f = R.limitsFor(false);
  assert.deepEqual(f.presets, ["standard"]);
  assert.equal(f.customRules, false);
  assert.equal(f.csvExport, false);
  assert.equal(f.crossPageSelection, false);
  const p = R.limitsFor(true);
  assert.equal(p.csvExport, true);
  assert.equal(p.scoreVisible, true);
});

test("CSV export includes header and verdicts", () => {
  const evaluated = R.evaluateAll([L({ ageDays: 120, views: 0, title: "a,b" })], std);
  const csv = R.toCsv(evaluated);
  assert.ok(csv.startsWith("item_id,title,"));
  assert.ok(csv.includes("end"));
  assert.ok(csv.includes('"a,b"')); // quoting works
});

test("summary counts add up", () => {
  const evaluated = R.evaluateAll([
    L({ ageDays: 120, views: 0 }),
    L({ ageDays: 5 }),
    L({ ageDays: 400, qtySold: 1 }),
  ], std);
  const s = R.summarize(evaluated);
  assert.equal(s.end + s.review + s.keep + s.protected, 3);
});
