const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/domain/item-settlement-v2.js");
const { evaluate, validateRule, canUseV2 } = globalThis.LeagueItemSettlementV2;
const rule = (type = "multiply_match", value = 2, outcome = "win", subject = "target", scoreBelow = null) =>
  ({ version: 2, condition: { subject, outcome, scoreBelow }, effect: { type, value } });
const context = (overrides = {}) => ({
  baseMatchDelta: 10, beforeTotal: 90,
  actor: { outcome: "loss", preMatchTotal: 120 },
  target: { outcome: "win", preMatchTotal: 80 }, ...overrides
});
test("win-only multiplier never amplifies a loss", () => {
  assert.equal(evaluate(rule(), context()).pointsDelta, 10);
  const loss = context({ baseMatchDelta: -10, target: { outcome: "loss", preMatchTotal: 80 } });
  assert.equal(evaluate(rule(), loss).pointsDelta, 0);
  assert.equal(evaluate(rule("multiply_match", 2, "loss"), loss).pointsDelta, -10);
  assert.equal(evaluate(rule("multiply_match", 2, "any"), loss).pointsDelta, -10);
});
test("actor and target conditions are independent of the effect", () => {
  assert.equal(evaluate(rule("add_points", 5, "win", "actor"), context()).pointsDelta, 0);
  assert.equal(evaluate(rule("add_points", 5, "loss", "actor"), context()).pointsDelta, 5);
  assert.equal(evaluate(rule("add_points", 5, "win", "target"), context()).pointsDelta, 5);
});
test("configurable reset tests pre-match threshold but changes the current total", () => {
  assert.equal(evaluate(rule("set_total", 150, "win", "target", 100), context()).pointsDelta, 60);
  assert.equal(evaluate(rule("set_total", 150, "win", "target", 80), context()).pointsDelta, 0);
});
test("zero multiplier cancels either sign, without clearing total score", () => {
  assert.equal(evaluate(rule("multiply_match", 0, "any"), context()).pointsDelta, -10);
  assert.equal(evaluate(rule("multiply_match", 0, "any"), context({ baseMatchDelta: -10 })).pointsDelta, 10);
});
test("rounding is symmetric and matches PostgreSQL numeric half-away-from-zero", () => {
  assert.equal(evaluate(rule("multiply_match", 1.005), context({ baseMatchDelta: 1 })).pointsDelta, 0.01);
  assert.equal(evaluate(rule("multiply_match", 1.005), context({ baseMatchDelta: -1 })).pointsDelta, -0.01);
});
test("pending result and record only never create a score change", () => {
  assert.equal(evaluate(rule("add_points", 5, "any"), context({ target: { outcome: "pending" } })).pointsDelta, 0);
  assert.equal(evaluate(rule("record_only", null, "any"), context()).pointsDelta, 0);
});
test("strict contract rejects missing conditions, unknown fields and unsupported precision", () => {
  assert.throws(() => validateRule({ version: 2, effect: { type: "add_points", value: 5 } }));
  assert.throws(() => validateRule({ ...rule(), script: "run()" }));
  for (const value of [NaN, Infinity, "2", 101, 1.00001]) {
    assert.throws(() => validateRule(rule("multiply_match", value)));
  }
  assert.throws(() => evaluate(rule(), context({ beforeTotal: NaN })));
});
test("activation needs an explicit active future season and is not driven by the clock", () => {
  assert.equal(canUseV2({ status: "active", code: "2026-09", itemSettlementVersion: 2 }), false);
  assert.equal(canUseV2({ status: "active", code: "2026-10" }), false);
  assert.equal(canUseV2({ status: "closed", code: "2026-10", itemSettlementVersion: 2 }), false);
  assert.equal(canUseV2({ status: "active", code: "2026-10", itemSettlementVersion: 2 }), true);
});
