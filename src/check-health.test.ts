import { test } from "node:test";
import assert from "node:assert/strict";
import { assessHealth } from "./check-health.ts";

test("zero current records always fails", () => {
  assert.equal(assessHealth(7600, 0).ok, false);
  assert.equal(assessHealth(null, 0).ok, false);
});

test("no prior snapshot (bootstrap) passes", () => {
  assert.equal(assessHealth(null, 7600).ok, true);
  assert.equal(assessHealth(0, 7600).ok, true);
});

test("a sharp drop fails (breakage, not a real change)", () => {
  assert.equal(assessHealth(7600, 6000).ok, false); // ~21% drop
  assert.equal(assessHealth(7600, 100).ok, false);
});

test("normal week-to-week movement and growth pass", () => {
  assert.equal(assessHealth(7600, 7590).ok, true); // tiny drop
  assert.equal(assessHealth(7600, 7800).ok, true); // growth
  assert.equal(assessHealth(7600, 6900).ok, true); // ~9% drop, just under default
});

test("threshold is configurable", () => {
  assert.equal(assessHealth(1000, 900, 0.05).ok, false); // 10% drop > 5% limit
  assert.equal(assessHealth(1000, 900, 0.2).ok, true); // 10% drop < 20% limit
});
