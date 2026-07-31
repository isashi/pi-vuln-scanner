import assert from "node:assert/strict";
import test from "node:test";
import { maxSeverity, normalizeSeverity, isAtLeast } from "../src/risk.ts";

test("normalizes common vulnerability severities", () => {
  assert.equal(normalizeSeverity("critical"), "critical");
  assert.equal(normalizeSeverity("moderate"), "medium");
  assert.equal(normalizeSeverity("unknown"), "info");
});

test("compares severities", () => {
  assert.equal(maxSeverity(["low", "critical", "medium"]), "critical");
  assert.equal(isAtLeast("high", "medium"), true);
  assert.equal(isAtLeast("low", "high"), false);
});
