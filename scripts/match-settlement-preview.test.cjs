const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/domain/match-settlement-preview.js");
const { calculateBaseRows, applyLegacyEffects } = globalThis.LeagueMatchSettlementPreview;
const players = [
  { id: "a", team: "A", display_name: "A" },
  { id: "b", team: "B", display_name: "B" },
];
test("preview mirrors result, participation and power-gap composition", () => {
  const rows = calculateBaseRows({
    players, winnerTeam: "A", winPoints: 3, lossPoints: -3, participationPoints: 1,
    powerGapStep: 5, powerGapDelta: 2, teamPowerTotals: { A: 20, B: 10 },
  });
  assert.equal(rows[0].baseDelta, 0);
  assert.equal(rows[1].baseDelta, 2);
});
test("pending result previews no score change", () => {
  const rows = calculateBaseRows({ players, winnerTeam: "", participationPoints: 5 });
  assert.deepEqual(rows.map(row => row.baseDelta), [0, 0]);
});
test("legacy item multipliers compose against the same base match delta", () => {
  const base = calculateBaseRows({ players, winnerTeam: "A", winPoints: 10, lossPoints: -10 });
  const rows = applyLegacyEffects(base, [
    { targetPlayerId: "a", itemLabel: "double", appliedMultiplier: 2, appliedSpecialToken: "" },
    { targetPlayerId: "b", itemLabel: "cancel", appliedMultiplier: 0, appliedSpecialToken: "" },
  ]);
  assert.equal(rows[0].finalDelta, 20);
  assert.equal(rows[1].finalDelta, 0);
});
test("reset effect runs after ordinary item deltas and reaches total 100", () => {
  const base = calculateBaseRows({ players, winnerTeam: "A", winPoints: 10, lossPoints: -10 });
  const rows = applyLegacyEffects(base, [
    { targetPlayerId: "a", itemLabel: "double", appliedMultiplier: 2, appliedSpecialToken: "" },
    { targetPlayerId: "a", itemLabel: "reset", appliedMultiplier: 0, appliedSpecialToken: "@" },
  ], new Map([["a", 70]]));
  assert.equal(rows[0].finalDelta, 30);
  assert.equal(rows[0].effects.at(-1).kind, "reset");
});
