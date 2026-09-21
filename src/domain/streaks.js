// Latest consecutive results. Inputs and outputs are independent of the UI.
(function (root) {
"use strict";
const { mapSideToTeam, parseRecentMatchPlayers, hasRecordedWinner } = root.LeagueMatchRecords;
function sortMatchesNewestFirstForStreaks(matches = []) {
  return [...(Array.isArray(matches) ? matches : [])].sort((a, b) => {
    const aDate = String(a?.match_date || "");
    const bDate = String(b?.match_date || "");
    if (aDate !== bDate) return bDate.localeCompare(aDate, "zh-CN");

    const aMatchNo = Number(a?.match_no ?? NaN);
    const bMatchNo = Number(b?.match_no ?? NaN);
    if (Number.isFinite(aMatchNo) || Number.isFinite(bMatchNo)) {
      if (!Number.isFinite(aMatchNo)) return 1;
      if (!Number.isFinite(bMatchNo)) return -1;
      if (aMatchNo !== bMatchNo) return bMatchNo - aMatchNo;
    }

    return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
  });
}

function getActiveStreakMaps(matches, minStreak = 3) {
  const states = new Map();
  for (const match of sortMatchesNewestFirstForStreaks(matches)) {
    const winner = mapSideToTeam(match?.winner_team || match?.winner_side);
    if (!hasRecordedWinner(winner)) continue;
    for (const player of parseRecentMatchPlayers(match.players)) {
      const id = String(player.player_id || player.id || "").trim();
      const team = mapSideToTeam(player.team || player.side);
      if (!id || !hasRecordedWinner(team)) continue;
      const result = team === winner ? "win" : "lose";
      const state = states.get(id);
      if (!state) states.set(id, { result, count: 1, finished: false });
      else if (!state.finished) {
        if (state.result === result) state.count += 1;
        else state.finished = true;
      }
    }
  }
  const wins = new Map();
  const losses = new Map();
  for (const [id, state] of states) {
    if (state.count >= minStreak) {
      (state.result === "win" ? wins : losses).set(id, state.count);
    }
  }
  return { wins, losses };
}
root.LeagueStreaks = Object.freeze({ getActiveStreakMaps });
})(globalThis);

