const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/domain/item-rules.js");
const rules = globalThis.LeagueItemRules;
test("effect grouping uses each candidate once, reset wins priority and input remains unchanged", () => {
  const a = { id: "a", score_delta_stack_rules: [{ itemCatalogId: "b", multiplier: 5 }, { itemCatalogId: "c", specialToken: "@", multiplier: 0 }] };
  const candidates = [a, { id: "b" }, { id: "c" }].map(itemEntry => ({
    targetPlayerId: "p", targetTeam: "A", itemEntry, itemLabel: itemEntry.id,
    appliedMultiplier: 2, appliedSpecialToken: "", isConsumed: false
  }));
  const original = JSON.stringify(candidates);
  const groups = rules.resolveItemEffectGroups(new Map([["p", candidates]]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].itemLabel, "a + c");
  assert.equal(groups[0].appliedSpecialToken, "@");
  assert.equal(groups[1].itemLabel, "b");
  assert.equal(JSON.stringify(candidates), original);
  assert.deepEqual(rules.resolveItemEffectGroups(new Map([["p", candidates]])), groups);
});
test("existing catalog effects round trip through explicit editor types", () => {
  for (const value of [0, 1, 2, -1, 0.5, 3.75]) {
    const decoded = rules.decodeEffect({ score_delta_multiplier: value });
    const encoded = rules.encodeEffect(decoded.type, decoded.value);
    assert.equal(encoded.score_delta_multiplier, value);
    assert.equal(encoded.score_delta_special, null);
  }
  assert.equal(rules.decodeEffect({ score_delta_special: "@" }).type, "reset");
  assert.equal(rules.decodeEffect({ config: { score_delta_special: "@" } }).type, "reset");
  assert.equal(rules.encodeEffect("reset").score_delta_special, "@");
});
test("record only is neutral and cannot participate in stacks", () => {
  const item = { score_delta_multiplier: 0, score_delta_special: "@",
    config: { match_resolution_mode: "record_only" },
    score_delta_stack_rules: [{ itemCatalogId: "other", multiplier: 5 }] };
  assert.equal(rules.decodeEffect(item).type, "record");
  assert.deepEqual(rules.getItemCatalogScoreStackRules(item), []);
  assert.equal(rules.encodeEffect("record").score_delta_multiplier, 1);
});
test("invalid and unsupported effects fail instead of silently creating zero effects", () => {
  for (const value of ["abc", "@", Infinity, "NaN"]) {
    assert.throws(() => rules.encodeEffect("multiply", value));
  }
  assert.throws(() => rules.encodeEffect("arbitrary_script", 3));
});
test("stack normalization preserves reset, deduplicates, excludes self and is immutable", () => {
  const original = [{ itemCatalogId: "a", multiplier: 2 }, { itemCatalogId: "b", specialToken: "@", multiplier: 0 },
    { itemCatalogId: "b", multiplier: 3 }];
  const before = JSON.stringify(original);
  assert.deepEqual(rules.normalizeItemScoreStackRules(original, "a"), [{ itemCatalogId: "b", multiplier: 0, specialToken: "@" }]);
  assert.equal(JSON.stringify(original), before);
  assert.equal(rules.getItemScoreMultiplierPriority(0, "@"), Infinity);
});
test("combination rules depend on catalog IDs rather than names", () => {
  const a = { id: "a", name: "renamed", score_delta_stack_rules: [{ itemCatalogId: "b", multiplier: 4 }] };
  assert.deepEqual(rules.getItemCatalogScoreStackMultiplier(a, { id: "b", name: "anything" }), { multiplier: 4, specialToken: "" });
  assert.equal(rules.getItemCatalogScoreStackMultiplier(a, a), null);
});
test("preview distinguishes total score reset from match delta cancellation", () => {
  assert.match(rules.previewEffect("reset"), /赛前总分低于 100/);
  assert.match(rules.previewEffect("cancel"), /不清空/);
  assert.match(rules.previewEffect("multiply", 2), /20/);
  assert.match(rules.previewEffect("multiply", "bad"), /有效倍率/);
});
