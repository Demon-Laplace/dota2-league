// Read-only leaderboard analytics. Explicit inputs; no page or database access.
(function (root) {
"use strict";
const { hasRecordedWinner, parseRecentMatchPlayers } = root.LeagueMatchRecords;
function getWinRateNumber(value, wins = 0, gamesPlayed = 0) {
  const hasExplicitValue = !(
    value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "")
  );
  const numericValue = hasExplicitValue ? Number(value) : Number.NaN;
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : (Number(gamesPlayed ?? 0) > 0 ? (Number(wins ?? 0) / Number(gamesPlayed ?? 0)) * 100 : 0);
  return Math.max(0, Math.min(100, resolvedValue));
}

function getPlayerWinRateMap(data) {
  const map = new Map();
  (data || []).forEach((player) => {
    const playerId = player.player_id || player.id;
    if (!playerId) return;
    map.set(playerId, getWinRateNumber(player.win_rate, player.wins, player.games_played));
  });
  return map;
}

function getTeammateAffinityLeaders(data, matches, minSharedGames = 8, threshold = 12) {
  const overallWinRateMap = getPlayerWinRateMap(data);
  const pairMap = new Map();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;
    const players = parseRecentMatchPlayers(match.players);

    ["A", "B"].forEach((teamKey) => {
      const teamPlayers = players.filter((player) => player.team === teamKey);
      teamPlayers.forEach((subject) => {
        const subjectId = subject.player_id || subject.id;
        if (!subjectId) return;
        teamPlayers.forEach((mate) => {
          const mateId = mate.player_id || mate.id;
          if (!mateId || mateId === subjectId) return;
          const key = `${subjectId}__${mateId}`;
          const current = pairMap.get(key) || { games: 0, wins: 0 };
          current.games += 1;
          if (teamKey === match.winner_team) current.wins += 1;
          pairMap.set(key, current);
        });
      });
    });
  });

  const influence = new Map();
  pairMap.forEach((stat, key) => {
    if (stat.games < minSharedGames) return;
    const [subjectId, mateId] = key.split("__");
    const mateOverallRate = overallWinRateMap.get(mateId);
    if (!Number.isFinite(mateOverallRate)) return;
    const pairRate = (stat.wins / stat.games) * 100;
    const delta = pairRate - mateOverallRate;
    const current = influence.get(subjectId) || { weightedDelta: 0, totalGames: 0 };
    current.weightedDelta += delta * stat.games;
    current.totalGames += stat.games;
    influence.set(subjectId, current);
  });

  let luckiest = null;
  let unluckiest = null;
  influence.forEach((value, playerId) => {
    if (!value.totalGames) return;
    const averageDelta = value.weightedDelta / value.totalGames;
    if (!luckiest || averageDelta > luckiest.averageDelta) {
      luckiest = { playerId, averageDelta };
    }
    if (!unluckiest || averageDelta < unluckiest.averageDelta) {
      unluckiest = { playerId, averageDelta };
    }
  });

  return {
    luckyId: luckiest && luckiest.averageDelta >= threshold ? luckiest.playerId : "",
    unluckyId: unluckiest && unluckiest.averageDelta <= -threshold ? unluckiest.playerId : "",
  };
}

function getNemesisMap(_data, matches, minHeadToHeadGames = 8, minDelta = 25) {
  const duelMap = new Map();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;
    const players = parseRecentMatchPlayers(match.players);
    const teamA = players.filter((player) => player.team === "A");
    const teamB = players.filter((player) => player.team === "B");

    teamA.forEach((playerA) => {
      const playerAId = playerA.player_id || playerA.id;
      if (!playerAId) return;
      teamB.forEach((playerB) => {
        const playerBId = playerB.player_id || playerB.id;
        if (!playerBId) return;

        const aKey = `${playerAId}__${playerBId}`;
        const aStat = duelMap.get(aKey) || { games: 0, wins: 0 };
        aStat.games += 1;
        if (match.winner_team === "A") aStat.wins += 1;
        duelMap.set(aKey, aStat);

        const bKey = `${playerBId}__${playerAId}`;
        const bStat = duelMap.get(bKey) || { games: 0, wins: 0 };
        bStat.games += 1;
        if (match.winner_team === "B") bStat.wins += 1;
        duelMap.set(bKey, bStat);
      });
    });
  });

  const nemesisMap = new Map();
  duelMap.forEach((stat, key) => {
    if (stat.games < minHeadToHeadGames) return;
    const [playerId, opponentId] = key.split("__");
    const duelRate = (stat.wins / stat.games) * 100;
    const delta = duelRate - 50;
    if (delta < minDelta) return;

    const currentList = nemesisMap.get(playerId) || [];
    currentList.push({ opponentId, delta, games: stat.games, winRate: duelRate });
    nemesisMap.set(playerId, currentList);
  });

  nemesisMap.forEach((entries, playerId) => {
    nemesisMap.set(
      playerId,
      [...entries].sort((a, b) => {
        if (b.delta !== a.delta) return b.delta - a.delta;
        if (b.games !== a.games) return b.games - a.games;
        return String(a.opponentId).localeCompare(String(b.opponentId));
      })
    );
  });

  return nemesisMap;
}

function getSideSpecialistMap(matches, minTotalGames = 11, minPerSideGames = 4, minDelta = 22, minSideWinRate = 58) {
  const sideMap = new Map();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;
    const players = parseRecentMatchPlayers(match.players);

    players.forEach((player) => {
      const playerId = player.player_id || player.id;
      const team = player.team === "A" ? "A" : (player.team === "B" ? "B" : "");
      if (!playerId || !team) return;

      const current = sideMap.get(playerId) || {
        A: { games: 0, wins: 0 },
        B: { games: 0, wins: 0 },
      };
      current[team].games += 1;
      if (team === match.winner_team) current[team].wins += 1;
      sideMap.set(playerId, current);
    });
  });

  const result = new Map();
  sideMap.forEach((entry, playerId) => {
    const radiantGames = Number(entry.A?.games || 0);
    const direGames = Number(entry.B?.games || 0);
    const totalGames = radiantGames + direGames;
    if (totalGames < minTotalGames || radiantGames < minPerSideGames || direGames < minPerSideGames) return;

    const radiantRate = radiantGames > 0 ? (Number(entry.A?.wins || 0) / radiantGames) * 100 : 0;
    const direRate = direGames > 0 ? (Number(entry.B?.wins || 0) / direGames) * 100 : 0;
    const delta = radiantRate - direRate;

    if (delta >= minDelta && radiantRate >= minSideWinRate) {
      result.set(playerId, { side: "A", delta, radiantRate, direRate });
      return;
    }

    if (delta <= -minDelta && direRate >= minSideWinRate) {
      result.set(playerId, { side: "B", delta, radiantRate, direRate });
    }
  });

  return result;
}

function getGoldenTouchPlayerIds(matches) {
  const bonusMap = new Map();

  (matches || []).forEach((match) => {
    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player.player_id || player.id;
      if (!playerId) return;
      const itemEffectDelta = Number(player.item_effect_delta ?? 0);
      if (!Number.isFinite(itemEffectDelta) || itemEffectDelta === 0) return;
      bonusMap.set(playerId, Number((bonusMap.get(playerId) || 0) + itemEffectDelta));
    });
  });

  let highest = 0;
  bonusMap.forEach((value) => {
    if (value > highest) highest = value;
  });
  if (highest <= 0) return new Set();
  return new Set(
    [...bonusMap.entries()]
      .filter(([, value]) => value === highest)
      .map(([playerId]) => playerId)
  );
}

function getSuperDoublePlayerIds(matches) {
  const penaltyMap = new Map();

  (matches || []).forEach((match) => {
    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player.player_id || player.id;
      if (!playerId) return;
      const itemEffectDelta = Number(player.item_effect_delta ?? 0);
      if (!Number.isFinite(itemEffectDelta) || itemEffectDelta === 0) return;
      penaltyMap.set(playerId, Number((penaltyMap.get(playerId) || 0) - itemEffectDelta));
    });
  });

  let highest = 0;
  penaltyMap.forEach((value) => {
    if (value > highest) highest = value;
  });
  if (highest <= 0) return new Set();
  return new Set(
    [...penaltyMap.entries()]
      .filter(([, value]) => value === highest)
      .map(([playerId]) => playerId)
  );
}

function getAdjustedWinRateNumber(wins = 0, games = 0) {
  const resolvedGames = Math.max(Math.trunc(Number(games) || 0), 0);
  const resolvedWins = Math.max(Math.trunc(Number(wins) || 0), 0);
  return getWinRateNumber(((resolvedWins + 1) / (resolvedGames + 2)) * 100, resolvedWins + 1, resolvedGames + 2);
}
root.LeagueAnalytics = Object.freeze({ getWinRateNumber, getPlayerWinRateMap, getTeammateAffinityLeaders, getNemesisMap, getSideSpecialistMap, getGoldenTouchPlayerIds, getSuperDoublePlayerIds, getAdjustedWinRateNumber });
})(globalThis);

