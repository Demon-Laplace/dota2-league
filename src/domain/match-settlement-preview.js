(() => {
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  function calculateBaseRows({
    players = [], winnerTeam = "", winPoints = 0, lossPoints = 0,
    participationPoints = 0, powerGapStep = 0, powerGapDelta = 0,
    teamPowerTotals = {},
  } = {}) {
    const step = Math.max(Math.trunc(finite(powerGapStep)), 0);
    const gapDelta = Math.max(finite(powerGapDelta), 0);
    return players.map(player => {
      const playerId = player.player_id || player.id || "";
      const team = player.team || "";
      const opponent = team === "A" ? "B" : "A";
      const ownPower = Number(teamPowerTotals[team]);
      const opponentPower = Number(teamPowerTotals[opponent]);
      const powersReady = Number.isFinite(ownPower) && Number.isFinite(opponentPower);
      const resultPoints = !winnerTeam ? 0 : team === winnerTeam ? finite(winPoints) : finite(lossPoints);
      const powerAdjustment = !winnerTeam || !powersReady || step <= 0 || gapDelta === 0 || ownPower === opponentPower
        ? 0
        : Math.floor(Math.abs(ownPower - opponentPower) / step) * gapDelta * (ownPower > opponentPower ? -1 : 1);
      return {
        playerId, team,
        playerName: player.display_name || player.name || "未知选手",
        result: !winnerTeam ? "pending" : team === winnerTeam ? "win" : "loss",
        resultPoints,
        participationPoints: winnerTeam ? finite(participationPoints) : 0,
        powerAdjustment,
        baseDelta: winnerTeam ? finite(participationPoints) + resultPoints + powerAdjustment : 0,
        powersReady,
      };
    });
  }
  function applyLegacyEffects(baseRows = [], effects = [], currentTotals = new Map()) {
    const effectsByPlayer = new Map();
    for (const effect of effects) {
      const playerId = effect.targetPlayerId || "";
      if (!effectsByPlayer.has(playerId)) effectsByPlayer.set(playerId, []);
      effectsByPlayer.get(playerId).push(effect);
    }
    return baseRows.map(row => {
      const entries = effectsByPlayer.get(row.playerId) || [];
      let itemDelta = 0;
      let reset = null;
      const details = [];
      for (const effect of entries) {
        if (effect.appliedSpecialToken === "@") {
          reset = effect;
          continue;
        }
        const delta = row.baseDelta * (finite(effect.appliedMultiplier) - 1);
        itemDelta += delta;
        details.push({ label: effect.itemLabel, delta, kind: "multiplier" });
      }
      if (reset) {
        const currentTotal = Number(currentTotals.get(row.playerId));
        if (row.result === "win" && Number.isFinite(currentTotal) && currentTotal < 100) {
          const resetDelta = 100 - (currentTotal + row.baseDelta + itemDelta);
          itemDelta += resetDelta;
          details.push({ label: reset.itemLabel, delta: resetDelta, kind: "reset" });
        } else {
          details.push({ label: reset.itemLabel, delta: 0, kind: "reset_pending" });
        }
      }
      return { ...row, itemDelta, finalDelta: row.baseDelta + itemDelta, effects: details };
    });
  }
  globalThis.LeagueMatchSettlementPreview = Object.freeze({ calculateBaseRows, applyLegacyEffects });
})();
