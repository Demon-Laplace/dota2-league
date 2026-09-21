// Pure domain utilities: no DOM, storage, network, or application state.
(function (root) {
"use strict";
function parseRecentMatchPlayers(players) {
  if (!players) return [];
  if (Array.isArray(players)) return players;
  if (typeof players === "string") {
    try {
      return JSON.parse(players);
    } catch {
      return [];
    }
  }
  return [];
}

function mapWinnerSideToTeam(value) {
  if (value === "radiant" || value === "A") return "A";
  if (value === "dire" || value === "B") return "B";
  return "";
}

function mapWinnerTeamToSide(value) {
  if (value === "A" || value === "radiant") return "radiant";
  if (value === "B" || value === "dire") return "dire";
  return null;
}

function mapSideToTeam(value) {
  return value === "radiant" ? "A" : value === "dire" ? "B" : value || "";
}

function normalizeSeasonRankNo(rankNo) {
  const value = Number(rankNo);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function normalizeMatchExhibitionFlag(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function normalizeMatchRecordFromView(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const players = parseRecentMatchPlayers(row.players).map((player) => ({
    ...player,
    player_id: player.player_id || player.user_id || player.id || "",
    team: mapSideToTeam(player.team || player.side),
    rank_no_snapshot: normalizeSeasonRankNo(player.rank_no_snapshot ?? player.player_rank_snapshot),
    power_value_snapshot: player.power_value_snapshot == null ? null : Number(player.power_value_snapshot),
    score_change: Number.isFinite(Number(player.score_change)) ? Number(player.score_change) : 0,
    hero_name: player.hero_name || null,
    kills: player.kills ?? null,
    deaths: player.deaths ?? null,
    assists: player.assists ?? null,
  }));

  return {
    match_id: row.match_id || row.id || "",
    match_day_id: row.match_day_id || null,
    season_id: row.season_id || null,
    match_no: Number.isFinite(Number(row.match_no)) ? Number(row.match_no) : null,
    match_date: row.match_date || "",
    day_is_active: Boolean(row.day_is_active),
    winner_team: row.winner_team || mapWinnerSideToTeam(row.winner_side),
    note: row.note ?? row.notes ?? "",
    created_at: row.created_at || row.submitted_at || row.approved_at || "",
    players,
    double_downs: row.double_downs || metadata.double_downs || [],
    is_exhibition: normalizeMatchExhibitionFlag(metadata.is_exhibition),
    status: row.status || "",
  };
}

function hasRecordedWinner(value) {
  return value === "A" || value === "B";
}
root.LeagueMatchRecords = Object.freeze({ parseRecentMatchPlayers, mapWinnerSideToTeam, mapWinnerTeamToSide, mapSideToTeam, normalizeSeasonRankNo, normalizeMatchExhibitionFlag, normalizeMatchRecordFromView, hasRecordedWinner });
})(globalThis);

