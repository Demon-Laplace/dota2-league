const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../src/domain/match-records.js");
require("../src/domain/number-format.js");
require("../src/domain/streaks.js");
require("../src/domain/leaderboard-analytics.js");
const { normalizeMatchRecordFromView } = globalThis.LeagueMatchRecords;
const { getActiveStreakMaps } = globalThis.LeagueStreaks;
const match = (n, winner, side = "dire") => ({
  match_no: n, match_date: "2026-09-20", winner_side: winner,
  players: [{ player_id: "p", side }]
});
test("five recent losses survive the preceding win and unordered input", () => {
  const rows = [match(50, "dire"), ...[51,54,55,56,57].map(n => match(n, "radiant"))];
  const before = JSON.stringify(rows);
  const result = getActiveStreakMaps(rows);
  assert.equal(result.losses.get("p"), 5);
  assert.equal(result.wins.has("p"), false);
  assert.equal(JSON.stringify(rows), before);
});
test("latest win stops old losses; absent players and pending results do not count", () => {
  const rows = [match(1,"radiant"), match(2,"radiant"), match(3,"radiant"), match(4,"dire"),
    { ...match(5,"radiant"), players: [] }, match(6,null)];
  const result = getActiveStreakMaps(rows);
  assert.equal(result.losses.size, 0);
  assert.equal(result.wins.size, 0);
});
test("normalization supports database and legacy formats without mutating records", () => {
  const row = match(1,"radiant","radiant");
  const normalized = normalizeMatchRecordFromView(row);
  assert.equal(normalized.winner_team,"A");
  assert.equal(normalized.players[0].team,"A");
  assert.equal(row.players[0].side,"radiant");
  assert.equal(getActiveStreakMaps([normalized],1).wins.get("p"),1);
});
test("Chinese labels and analytics remain independent of browser globals", () => {
  assert.equal(globalThis.LeagueNumberFormat.formatChineseCardinalNumber(5),"五");
  assert.equal(globalThis.LeagueNumberFormat.formatChineseCardinalNumber(21),"二十一");
  assert.equal(globalThis.LeagueAnalytics.getWinRateNumber(null,3,4),75);
  assert.equal(globalThis.LeagueAnalytics.getNemesisMap([],[]).size,0);
});
