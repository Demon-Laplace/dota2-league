import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const BUCKET = "opendota-match-screenshots";
const PROVIDER = "opendota";
const ASSET_KIND = "overview_screenshot";
const MATCH_SELECT = "match_id,season_id,match_no,match_date,winner_side,players";
const ASSET_SELECT = "id,match_id,season_id,dota_match_id,asset_status,storage_bucket,storage_path,source_url,captured_at,requested_at,last_requested_at,request_count,last_error,created_at,updated_at";
const SNAPSHOT_SELECT = "id,match_id,season_id,match_date,match_no,dota_match_id,provider,payload,source_url,screenshot_bucket,screenshot_path,captured_at,archive_status,archive_error,archived_at,archive_repository,archive_branch,archive_path,created_at,updated_at";
const DEFAULT_LEAGUE_ID = "19878";
const DEFAULT_SNAPSHOT_ARCHIVE_PREFIX = "data/opendota";
const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_DYNAMIC_SCAN_START_MINUTES = 20 * 60 + 30;
const BEIJING_FIRST_MATCH_FAST_SCAN_END_MINUTES = 22 * 60;
const BEIJING_DYNAMIC_SCAN_END_MINUTES = 24 * 60;
const BEIJING_SETTLEMENT_SCAN_MINUTES = 2 * 60;
const BEIJING_SETTLEMENT_SCAN_GRACE_MINUTES = 75;
const FIRST_MATCH_POLL_INTERVAL_SECONDS = [10 * 60, 5 * 60, 3 * 60];
const FOLLOWUP_MATCH_POLL_INTERVAL_SECONDS = [10 * 60, 5 * 60, 3 * 60];
const STEADY_MATCH_POLL_INTERVAL_SECONDS = 3 * 60;
const LATE_NO_MATCH_POLL_INTERVAL_SECONDS = 30 * 60;
const NEXT_MATCH_FIRST_SCAN_DELAY_SECONDS = 30 * 60;
const MIN_ESTIMATED_MATCH_DURATION_SECONDS = 30 * 60;
const DEFAULT_ESTIMATED_MATCH_DURATION_SECONDS = 45 * 60;
const MAX_ESTIMATED_MATCH_DURATION_SECONDS = 90 * 60;

class NoOfficialMatchRecordError extends Error {
  constructor(message = "无比赛记录") {
    super(message);
    this.name = "NoOfficialMatchRecordError";
  }
}

class DeferredScreenshotError extends Error {
  constructor(message = "等待下一次定时截图扫描") {
    super(message);
    this.name = "DeferredScreenshotError";
  }
}

function optionalEnv(name) {
  return String(process.env[name] || "").trim();
}

function requiredEnv(name) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseUrl() {
  const explicitUrl = optionalEnv("SUPABASE_URL");
  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");
  const projectId = optionalEnv("SUPABASE_PROJECT_ID");
  if (projectId) return `https://${projectId}.supabase.co`;
  throw new Error("Missing SUPABASE_URL or SUPABASE_PROJECT_ID.");
}

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const STEAM_WEB_API_KEY = optionalEnv("STEAM_WEB_API_KEY");
const DOTA_LEAGUE_ID = optionalEnv("DOTA_LEAGUE_ID") || DEFAULT_LEAGUE_ID;

function clampLimit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

function normalizeMatchId(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function normalizeDotaMatchId(value) {
  const normalized = String(value || "").trim();
  return /^[0-9]+$/.test(normalized) ? normalized : "";
}

function formatDateParts(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateString(dateText, days) {
  const [year, month, day] = String(dateText || "").split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + Number(days || 0));
  return formatDateParts(date);
}

function getNextMonthCode(monthCode) {
  const [year, month] = String(monthCode || "").split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return "";
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBeijingBusinessDateFromUnix(seconds) {
  const source = new Date(Number(seconds) * 1000);
  if (Number.isNaN(source.getTime())) return "";
  const beijing = new Date(source.toLocaleString("en-US", { timeZone: BEIJING_TIME_ZONE }));
  if (beijing.getHours() < 2) {
    beijing.setDate(beijing.getDate() - 1);
  }
  return formatDateParts(beijing);
}

function getBeijingWallClockDate(source = new Date()) {
  const date = source instanceof Date ? source : new Date(source);
  if (Number.isNaN(date.getTime())) return new Date(NaN);
  return new Date(date.toLocaleString("en-US", { timeZone: BEIJING_TIME_ZONE }));
}

function getBeijingBusinessDate(source = new Date()) {
  const beijing = getBeijingWallClockDate(source);
  if (Number.isNaN(beijing.getTime())) return "";
  if (beijing.getHours() < 2) {
    beijing.setDate(beijing.getDate() - 1);
  }
  return formatDateParts(beijing);
}

function getBeijingMinutesSinceMidnight(source = new Date()) {
  const beijing = getBeijingWallClockDate(source);
  if (Number.isNaN(beijing.getTime())) return -1;
  return beijing.getHours() * 60 + beijing.getMinutes();
}

function isBeijingSettlementScheduledWindow(source = new Date()) {
  const minutes = getBeijingMinutesSinceMidnight(source);
  return minutes >= BEIJING_SETTLEMENT_SCAN_MINUTES
    && minutes <= BEIJING_SETTLEMENT_SCAN_MINUTES + BEIJING_SETTLEMENT_SCAN_GRACE_MINUTES;
}

function isBeijingDynamicScanWindow(source = new Date()) {
  const minutes = getBeijingMinutesSinceMidnight(source);
  return minutes >= BEIJING_DYNAMIC_SCAN_START_MINUTES && minutes < BEIJING_DYNAMIC_SCAN_END_MINUTES;
}

function getSecondsUntilBeijingMinute(targetMinutes, source = new Date()) {
  const currentMinutes = getBeijingMinutesSinceMidnight(source);
  if (currentMinutes < 0) return 0;
  const beijing = getBeijingWallClockDate(source);
  const target = new Date(beijing);
  target.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0);
  if (target <= beijing) return 0;
  return Math.ceil((target.getTime() - beijing.getTime()) / 1000);
}

function formatBeijingClockFromUnix(seconds) {
  const beijing = getBeijingWallClockDate(new Date(Number(seconds) * 1000));
  if (Number.isNaN(beijing.getTime())) return "";
  const hour = String(beijing.getHours()).padStart(2, "0");
  const minute = String(beijing.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function clampEstimatedMatchDuration(seconds) {
  const parsed = Number(seconds);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ESTIMATED_MATCH_DURATION_SECONDS;
  return Math.min(
    Math.max(parsed, MIN_ESTIMATED_MATCH_DURATION_SECONDS),
    MAX_ESTIMATED_MATCH_DURATION_SECONDS,
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function getMonthUnixRange(monthCode) {
  const [yearText, monthText] = String(monthCode || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month code: ${monthCode}`);
  }

  const startMs = Date.UTC(year, month - 1, 0, 18, 0, 0);
  const endMs = Date.UTC(year, month, 0, 18, 0, 0);
  return {
    startSeconds: Math.floor(startMs / 1000),
    endSeconds: Math.floor(endMs / 1000),
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(new URL(path, SUPABASE_URL), {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.error || text || response.statusText;
    throw new Error(`Supabase request failed (${response.status}): ${message}`);
  }
  return payload;
}

async function getMatchById(matchId) {
  const rows = await supabaseRequest(`/rest/v1/v_match_detail?select=${MATCH_SELECT}&match_id=eq.${matchId}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getMatchesByIds(matchIds) {
  const ids = [...new Set(matchIds.filter(Boolean))];
  if (!ids.length) return [];
  return supabaseRequest(`/rest/v1/v_match_detail?select=${MATCH_SELECT}&match_id=in.(${ids.join(",")})`);
}

async function getMatchesForMonth(monthCode) {
  const nextMonthCode = getNextMonthCode(monthCode);
  if (!nextMonthCode) return [];
  const rows = await supabaseRequest(`/rest/v1/v_match_detail?select=${MATCH_SELECT}&match_date=gte.${monthCode}-01&match_date=lt.${nextMonthCode}-01&order=match_date.asc,match_no.asc`);
  return Array.isArray(rows) ? rows : [];
}

async function getAssetForMatchId(matchId) {
  const rows = await supabaseRequest(`/rest/v1/official_match_assets?select=${ASSET_SELECT}&match_id=eq.${matchId}&provider=eq.${PROVIDER}&asset_kind=eq.${ASSET_KIND}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getAssetsByMatchIds(matchIds) {
  const ids = [...new Set(matchIds.filter(Boolean))];
  if (!ids.length) return [];
  return supabaseRequest(`/rest/v1/official_match_assets?select=${ASSET_SELECT}&match_id=in.(${ids.join(",")})&provider=eq.${PROVIDER}&asset_kind=eq.${ASSET_KIND}`);
}

async function getQueuedAssets(limit) {
  return supabaseRequest(`/rest/v1/official_match_assets?select=${ASSET_SELECT}&asset_status=in.(requested,pending)&order=updated_at.asc&limit=${limit}`);
}

async function getSnapshotRowsByDate(matchDate) {
  const rows = await supabaseRequest(`/rest/v1/official_match_snapshots?select=${SNAPSHOT_SELECT}&match_date=eq.${matchDate}&order=match_no.asc.nullslast,created_at.asc`);
  return Array.isArray(rows) ? rows : [];
}

async function getSnapshotDatesForMonth(monthCode) {
  const nextMonthCode = getNextMonthCode(monthCode);
  if (!nextMonthCode) return [];
  const rows = await supabaseRequest(`/rest/v1/official_match_snapshots?select=match_date&match_date=gte.${monthCode}-01&match_date=lt.${nextMonthCode}-01&order=match_date.asc`);
  return [...new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.match_date || "").trim()).filter(Boolean))];
}

async function deleteSnapshotRowsByDate(matchDate) {
  await supabaseRequest(`/rest/v1/official_match_snapshots?match_date=eq.${matchDate}`, {
    method: "DELETE",
  });
}

async function markSnapshotArchiveError(matchDate, message) {
  await supabaseRequest(`/rest/v1/official_match_snapshots?match_date=eq.${matchDate}`, {
    method: "PATCH",
    body: {
      archive_status: "error",
      archive_error: String(message || "Unknown archive error").slice(0, 500),
    },
  }).catch((error) => {
    console.error(`Failed to mark snapshot archive error for ${matchDate}:`, error);
  });
}

async function saveAsset(match, fields) {
  const existing = await getAssetForMatchId(match.match_id);
  const payload = {
    match_id: match.match_id,
    season_id: match.season_id,
    provider: PROVIDER,
    asset_kind: ASSET_KIND,
    storage_bucket: BUCKET,
    ...fields,
  };

  if (existing?.id) {
    const rows = await supabaseRequest(`/rest/v1/official_match_assets?id=eq.${existing.id}`, {
      method: "PATCH",
      body: payload,
      prefer: "return=representation",
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  const rows = await supabaseRequest("/rest/v1/official_match_assets", {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function parseMatchPlayers(match) {
  if (Array.isArray(match?.players)) return match.players;
  if (typeof match?.players === "string") {
    try {
      const parsed = JSON.parse(match.players);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return [];
}

function getLocalMatchRosterSignature(match) {
  const teamAIds = [];
  const teamBIds = [];

  parseMatchPlayers(match).forEach((player) => {
    const playerId = String(player.player_id || player.id || "").trim();
    if (!playerId) return;
    const side = String(player.team || player.side || "").trim().toLowerCase();
    if (side === "a" || side === "radiant") {
      teamAIds.push(playerId);
    } else if (side === "b" || side === "dire") {
      teamBIds.push(playerId);
    }
  });

  if (!teamAIds.length || !teamBIds.length) return "";
  return [
    `A:${teamAIds.sort().join("|")}`,
    `B:${teamBIds.sort().join("|")}`,
  ].join("::");
}

async function getLocalMatchesForDate(match) {
  const matchDate = String(match.match_date || "").trim();
  const seasonId = String(match.season_id || "").trim();
  if (!matchDate || !seasonId) return [];
  return supabaseRequest(`/rest/v1/v_match_detail?select=${MATCH_SELECT}&season_id=eq.${seasonId}&match_date=eq.${matchDate}&order=match_no.asc`);
}

async function shouldRequireManualOfficialMatchAssociation(match, officialSameDayCount) {
  const localMatches = await getLocalMatchesForDate(match);
  if (localMatches.length === Number(officialSameDayCount)) return false;

  const targetSignature = getLocalMatchRosterSignature(match);
  if (!targetSignature) return false;

  const signatureCounts = new Map();
  localMatches.forEach((localMatch) => {
    const signature = getLocalMatchRosterSignature(localMatch);
    if (!signature) return;
    signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1);
  });

  return (signatureCounts.get(targetSignature) || 0) >= 2;
}

async function getLocalSteamAccountIds(match) {
  const playerIds = [
    ...new Set(
      parseMatchPlayers(match)
        .map((player) => String(player.player_id || player.id || "").trim())
        .filter(Boolean),
    ),
  ];

  if (!playerIds.length) return new Set();

  const rows = await supabaseRequest(`/rest/v1/player_external_accounts?select=player_id,provider_account_id&provider=eq.steam&player_id=in.(${playerIds.join(",")})`);
  return new Set(
    (rows || [])
      .map((row) => normalizeDotaMatchId(row.provider_account_id))
      .filter(Boolean),
  );
}

async function getLocalSteamAccountRows(match) {
  const playerIds = [
    ...new Set(
      parseMatchPlayers(match)
        .map((player) => String(player.player_id || player.id || "").trim())
        .filter(Boolean),
    ),
  ];

  if (!playerIds.length) return [];

  const rows = await supabaseRequest(`/rest/v1/player_external_accounts?select=player_id,provider_account_id&provider=eq.steam&player_id=in.(${playerIds.join(",")})`);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      player_id: String(row.player_id || "").trim(),
      account_id: normalizeDotaMatchId(row.provider_account_id),
    }))
    .filter((row) => row.player_id && row.account_id);
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.result?.error || payload?.error || response.statusText;
    throw new Error(`${label} failed (${response.status}): ${message}`);
  }
  return payload;
}

function buildMatchHistoryUrl(version, options = {}) {
  const url = new URL(`https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/${version}/`);
  url.searchParams.set("key", STEAM_WEB_API_KEY);
  url.searchParams.set("league_id", DOTA_LEAGUE_ID);
  url.searchParams.set("matches_requested", String(options.matchesRequested || 100));
  url.searchParams.set("format", "json");
  if (options.startAtMatchId) {
    url.searchParams.set("start_at_match_id", options.startAtMatchId);
  }
  return url;
}

function mapLeagueMatchSummary(match) {
  return {
    matchId: normalizeDotaMatchId(match?.match_id),
    startTime: Number.isFinite(Number(match?.start_time)) ? Number(match.start_time) : null,
    startDate: getBeijingBusinessDateFromUnix(match?.start_time),
  };
}

async function fetchLeagueMatchesForMonthVersion(monthCode, version) {
  const { startSeconds, endSeconds } = getMonthUnixRange(monthCode);
  let startAtMatchId = "";
  const collected = new Map();
  const maxPages = 12;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchJson(
      buildMatchHistoryUrl(version, { matchesRequested: 100, startAtMatchId }),
      "Valve match history",
    );
    const matches = Array.isArray(payload?.result?.matches) ? payload.result.matches : [];
    if (!matches.length) break;

    let oldestStartTime = Number.POSITIVE_INFINITY;
    let oldestMatchId = "";

    for (const rawMatch of matches) {
      const match = mapLeagueMatchSummary(rawMatch);
      if (match.matchId) oldestMatchId = match.matchId;
      if (Number.isFinite(match.startTime) && match.startTime > 0) {
        oldestStartTime = Math.min(oldestStartTime, match.startTime);
        if (match.startTime >= startSeconds && match.startTime < endSeconds && match.matchId) {
          collected.set(match.matchId, match);
        }
      }
    }

    if (Number.isFinite(oldestStartTime) && oldestStartTime < startSeconds) break;
    const nextStartAt = Number(oldestMatchId);
    if (!Number.isFinite(nextStartAt) || nextStartAt <= 1) break;
    startAtMatchId = String(nextStartAt - 1);
  }

  return [...collected.values()];
}

async function fetchLeagueMatchesForMonth(monthCode) {
  if (!STEAM_WEB_API_KEY) {
    throw new Error("STEAM_WEB_API_KEY is required to match local records to official Dota matches.");
  }

  let lastError = null;
  for (const version of ["v1", "V001"]) {
    try {
      return await fetchLeagueMatchesForMonthVersion(monthCode, version);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Valve match history failed.");
}

function buildMatchDetailsUrl(matchId, version) {
  const url = new URL(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/${version}/`);
  url.searchParams.set("key", STEAM_WEB_API_KEY);
  url.searchParams.set("match_id", matchId);
  url.searchParams.set("format", "json");
  return url;
}

function buildHeroListUrl() {
  const url = new URL("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1/");
  if (STEAM_WEB_API_KEY) {
    url.searchParams.set("key", STEAM_WEB_API_KEY);
  }
  url.searchParams.set("language", "en_us");
  url.searchParams.set("format", "json");
  return url;
}

function normalizeMatchDuration(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeMatchScore(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchOpenDotaDetails(matchId) {
  const payload = await fetchJson(new URL(`https://api.opendota.com/api/matches/${matchId}`), "OpenDota match details");
  return {
    matchId,
    radiantWin: Boolean(payload?.radiant_win),
    radiantScore: normalizeMatchScore(payload?.radiant_score),
    direScore: normalizeMatchScore(payload?.dire_score),
    players: Array.isArray(payload?.players) ? payload.players : [],
    startTime: Number.isFinite(Number(payload?.start_time)) ? Number(payload.start_time) : null,
    duration: normalizeMatchDuration(payload?.duration),
  };
}

async function fetchMatchDetails(matchId) {
  if (STEAM_WEB_API_KEY) {
    for (const version of ["v1", "V001"]) {
      try {
        const payload = await fetchJson(buildMatchDetailsUrl(matchId, version), "Valve match details");
        const result = payload?.result || {};
        if (Array.isArray(result.players)) {
          return {
            matchId: normalizeDotaMatchId(result.match_id) || matchId,
            radiantWin: Boolean(result.radiant_win),
            radiantScore: normalizeMatchScore(result.radiant_score),
            direScore: normalizeMatchScore(result.dire_score),
            players: result.players,
            startTime: Number.isFinite(Number(result.start_time)) ? Number(result.start_time) : null,
            duration: normalizeMatchDuration(result.duration),
          };
        }
      } catch (_error) {
        // Fall back to the next Valve version and then OpenDota.
      }
    }
  }

  return fetchOpenDotaDetails(matchId);
}

let heroNameMapPromise = null;

async function getHeroNameMap() {
  if (!heroNameMapPromise) {
    heroNameMapPromise = (async () => {
      try {
        const payload = await fetchJson(buildHeroListUrl(), "Valve hero list");
        const heroes = Array.isArray(payload?.result?.heroes) ? payload.result.heroes : [];
        const map = new Map();
        heroes.forEach((hero) => {
          const id = Number(hero?.id);
          const name = String(hero?.localized_name || "").trim();
          if (Number.isInteger(id) && name) {
            map.set(id, name);
          }
        });
        return map;
      } catch (error) {
        console.warn("Unable to load Dota hero names:", error);
        return new Map();
      }
    })();
  }
  return heroNameMapPromise;
}

function normalizeAccountId(value) {
  const accountId = Number(value);
  if (!Number.isInteger(accountId) || accountId <= 0 || accountId >= 4294967295) return "";
  return String(accountId);
}

function getPlayerSide(playerSlot) {
  const slot = Number(playerSlot);
  if (!Number.isInteger(slot)) return "";
  return slot < 128 ? "radiant" : "dire";
}

function getSlotNo(playerSlot) {
  const slot = Number(playerSlot);
  if (!Number.isInteger(slot)) return null;
  return (slot & 0b111) + 1;
}

function normalizeKdaValue(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getCandidateAccountIds(details) {
  return new Set(
    (details.players || [])
      .map((player) => String(player.account_id || "").trim())
      .filter((accountId) => /^[0-9]+$/.test(accountId)),
  );
}

function getWinnerSideFromDetails(details) {
  return details.radiantWin ? "radiant" : "dire";
}

function normalizeOfficialPlayer(player, heroNameMap) {
  const playerSlot = Number(player?.player_slot);
  const heroId = Number(player?.hero_id);
  const side = getPlayerSide(playerSlot);
  const slotNo = getSlotNo(playerSlot);
  return {
    accountId: normalizeAccountId(player?.account_id),
    playerSlot: Number.isInteger(playerSlot) ? playerSlot : null,
    side,
    slotNo,
    heroId: Number.isInteger(heroId) ? heroId : null,
    heroName: Number.isInteger(heroId) ? heroNameMap.get(heroId) || null : null,
    kills: normalizeKdaValue(player?.kills),
    deaths: normalizeKdaValue(player?.deaths),
    assists: normalizeKdaValue(player?.assists),
  };
}

function getLocalPlayerSide(player) {
  const side = String(player?.side || player?.team || "").trim().toLowerCase();
  if (side === "a" || side === "radiant") return "radiant";
  if (side === "b" || side === "dire") return "dire";
  return "";
}

function getLocalPlayerSlotNo(player, fallbackIndex) {
  const explicitSlot = Number(player?.slot_no ?? player?.team_slot);
  return Number.isInteger(explicitSlot) && explicitSlot > 0 ? explicitSlot : fallbackIndex + 1;
}

async function buildOfficialMatchSnapshotPayload(match, dotaMatchId, details, asset = {}) {
  const heroNameMap = await getHeroNameMap();
  const localAccountRows = await getLocalSteamAccountRows(match);
  const accountByPlayerId = new Map(localAccountRows.map((row) => [row.player_id, row.account_id]));
  const officialPlayers = (details.players || [])
    .map((player) => normalizeOfficialPlayer(player, heroNameMap))
    .sort((a, b) => {
      const sideOrder = (a.side === "radiant" ? 0 : 1) - (b.side === "radiant" ? 0 : 1);
      if (sideOrder !== 0) return sideOrder;
      return Number(a.slotNo ?? 99) - Number(b.slotNo ?? 99);
    });
  const officialByAccountId = new Map(officialPlayers.map((player) => [player.accountId, player]).filter(([accountId]) => Boolean(accountId)));
  const officialBySideSlot = new Map(officialPlayers.map((player) => [`${player.side}:${player.slotNo}`, player]).filter(([, player]) => player.side && player.slotNo));
  const localPlayers = parseMatchPlayers(match);
  const players = localPlayers.map((player, index) => {
    const playerId = String(player.player_id || player.id || "").trim();
    const side = getLocalPlayerSide(player);
    const slotNo = getLocalPlayerSlotNo(player, index);
    const accountId = accountByPlayerId.get(playerId) || "";
    const officialPlayer = (accountId ? officialByAccountId.get(accountId) : null)
      || officialBySideSlot.get(`${side}:${slotNo}`)
      || null;

    return {
      playerId,
      displayName: String(player.display_name || "").trim() || null,
      side,
      slotNo,
      accountId: accountId || officialPlayer?.accountId || null,
      heroId: officialPlayer?.heroId ?? null,
      heroName: officialPlayer?.heroName ?? null,
      kills: officialPlayer?.kills ?? null,
      deaths: officialPlayer?.deaths ?? null,
      assists: officialPlayer?.assists ?? null,
    };
  });

  return {
    version: 1,
    provider: PROVIDER,
    assetKind: ASSET_KIND,
    capturedAt: asset.captured_at || new Date().toISOString(),
    match: {
      matchId: match.match_id,
      seasonId: match.season_id,
      matchNo: match.match_no ?? null,
      matchDate: match.match_date || null,
      dotaMatchId,
      sourceUrl: `https://www.opendota.com/matches/${dotaMatchId}`,
      startTime: details.startTime ?? null,
      duration: details.duration ?? null,
      radiantWin: Boolean(details.radiantWin),
      winnerSide: getWinnerSideFromDetails(details),
      radiantScore: details.radiantScore ?? null,
      direScore: details.direScore ?? null,
    },
    screenshot: {
      bucket: asset.storage_bucket || BUCKET,
      path: asset.storage_path || null,
      sourceUrl: asset.source_url || `https://www.opendota.com/matches/${dotaMatchId}`,
    },
    players,
    officialPlayers,
  };
}

async function saveOfficialMatchSnapshot(match, dotaMatchId, details, asset = {}) {
  const normalizedDotaMatchId = normalizeDotaMatchId(dotaMatchId);
  if (!match?.match_id || !match?.season_id || !match?.match_date || !normalizedDotaMatchId) return null;
  const payload = await buildOfficialMatchSnapshotPayload(match, normalizedDotaMatchId, details, asset);
  const sourceUrl = `https://www.opendota.com/matches/${normalizedDotaMatchId}`;
  const rows = await supabaseRequest("/rest/v1/official_match_snapshots?on_conflict=match_id,provider", {
    method: "POST",
    body: {
      match_id: match.match_id,
      season_id: match.season_id,
      match_date: match.match_date,
      match_no: match.match_no ?? null,
      dota_match_id: normalizedDotaMatchId,
      provider: PROVIDER,
      payload,
      source_url: sourceUrl,
      screenshot_bucket: asset.storage_bucket || BUCKET,
      screenshot_path: asset.storage_path || null,
      captured_at: asset.captured_at || new Date().toISOString(),
      archive_status: "pending",
      archive_error: null,
      archived_at: null,
      archive_repository: null,
      archive_branch: null,
      archive_path: null,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function ensureOfficialMatchSnapshot(match, dotaMatchId, asset = {}) {
  const normalizedDotaMatchId = normalizeDotaMatchId(dotaMatchId);
  if (!normalizedDotaMatchId) return null;
  try {
    const details = await fetchMatchDetails(normalizedDotaMatchId);
    return await saveOfficialMatchSnapshot(match, normalizedDotaMatchId, details, asset);
  } catch (error) {
    console.warn(`Match ${match?.match_id || "unknown"}: failed to save structured OpenDota snapshot:`, error);
    return null;
  }
}

const officialMatchTimingDetailsCache = new Map();

async function getOfficialMatchTimingDetails(matchSummary = {}) {
  const matchId = normalizeDotaMatchId(matchSummary.matchId);
  if (!matchId) return null;
  if (officialMatchTimingDetailsCache.has(matchId)) {
    return officialMatchTimingDetailsCache.get(matchId);
  }

  const fallbackStartSeconds = Number.isFinite(Number(matchSummary.startTime))
    ? Number(matchSummary.startTime)
    : null;

  try {
    const details = await fetchMatchDetails(matchId);
    const startSeconds = Number.isFinite(Number(details.startTime))
      ? Number(details.startTime)
      : fallbackStartSeconds;
    const durationSeconds = normalizeMatchDuration(details.duration);
    const timing = {
      matchId,
      startSeconds,
      durationSeconds,
      endSeconds: Number.isFinite(startSeconds) && Number.isFinite(durationSeconds)
        ? startSeconds + durationSeconds
        : null,
    };
    officialMatchTimingDetailsCache.set(matchId, timing);
    return timing;
  } catch (error) {
    console.warn(`Unable to read official match timing for ${matchId}:`, error);
    if (!Number.isFinite(fallbackStartSeconds)) return null;
    return {
      matchId,
      startSeconds: fallbackStartSeconds,
      durationSeconds: null,
      endSeconds: fallbackStartSeconds + DEFAULT_ESTIMATED_MATCH_DURATION_SECONDS,
    };
  }
}

async function getOfficialDayTiming(matchDate) {
  const monthCode = String(matchDate || "").slice(0, 7);
  const timing = {
    matchDate,
    officialCount: null,
    matches: [],
    firstMatchId: "",
    firstStartSeconds: null,
    firstDurationSeconds: null,
    firstEndSeconds: null,
    latestMatchId: "",
    latestStartSeconds: null,
    latestDurationSeconds: null,
    latestEndSeconds: null,
  };

  try {
    const sameDayMatches = (await fetchLeagueMatchesForMonth(monthCode))
      .filter((candidate) => candidate.startDate === matchDate)
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));

    timing.matches = sameDayMatches;
    timing.officialCount = sameDayMatches.length;
    const firstMatch = sameDayMatches[0] || null;
    if (firstMatch?.matchId) {
      timing.firstMatchId = firstMatch.matchId;
      const firstTiming = await getOfficialMatchTimingDetails(firstMatch);
      if (firstTiming) {
        timing.firstStartSeconds = firstTiming.startSeconds;
        timing.firstDurationSeconds = firstTiming.durationSeconds;
        timing.firstEndSeconds = firstTiming.endSeconds;
      }
    }

    const latestMatch = sameDayMatches[sameDayMatches.length - 1] || null;
    if (latestMatch?.matchId) {
      timing.latestMatchId = latestMatch.matchId;
      const latestTiming = await getOfficialMatchTimingDetails(latestMatch);
      if (latestTiming) {
        timing.latestStartSeconds = latestTiming.startSeconds;
        timing.latestDurationSeconds = latestTiming.durationSeconds;
        timing.latestEndSeconds = latestTiming.endSeconds;
      }
    }
  } catch (error) {
    console.warn(`Unable to estimate official match timing for ${matchDate}:`, error);
  }

  return timing;
}

async function getOfficialDayTimingForOptions(matchDate, options = {}) {
  if (!options.dayTimingCache) {
    options.dayTimingCache = new Map();
  }
  if (!options.dayTimingCache.has(matchDate)) {
    options.dayTimingCache.set(matchDate, await getOfficialDayTiming(matchDate));
  }
  return options.dayTimingCache.get(matchDate);
}

function shouldUseSmartSchedule(options = {}) {
  return options.eventName === "schedule"
    && !options.matchId
    && String(options.scheduleMode || "smart").toLowerCase() !== "off";
}

async function getEstimatedTargetReadySeconds(match, timing) {
  const matchNo = Number(match?.match_no);
  if (!Number.isInteger(matchNo) || matchNo <= 1) return null;

  const previousOfficialMatch = timing?.matches?.[matchNo - 2] || null;
  if (!previousOfficialMatch) return null;
  const previousTiming = await getOfficialMatchTimingDetails(previousOfficialMatch);
  const previousStartSeconds = Number(previousTiming?.startSeconds);
  if (!Number.isFinite(previousStartSeconds) || previousStartSeconds <= 0) return null;

  const previousDurationSeconds = clampEstimatedMatchDuration(previousTiming?.durationSeconds);
  const previousEndSeconds = Number.isFinite(Number(previousTiming?.endSeconds))
    ? Number(previousTiming.endSeconds)
    : previousStartSeconds + previousDurationSeconds;

  return previousEndSeconds + NEXT_MATCH_FIRST_SCAN_DELAY_SECONDS;
}

async function getScheduledTargetDeferReason(target, options = {}) {
  if (!shouldUseSmartSchedule(options)) return "";
  if (target.asset?.dota_match_id) return "";

  const matchDate = String(target.match?.match_date || "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(matchDate)) return "";
  if (matchDate !== getBeijingBusinessDate(options.now)) return "";
  if (isBeijingSettlementScheduledWindow(options.now)) return "";

  const timing = await getOfficialDayTimingForOptions(matchDate, options);
  if (timing.officialCount === 0) {
    return `等待 ${matchDate} 官方第一场比赛记录公开。`;
  }

  const matchNo = Number(target.match?.match_no);
  if (Number.isInteger(matchNo) && matchNo > 0 && Number(timing.officialCount || 0) < matchNo) {
    return `等待 ${matchDate} 官方第 ${matchNo} 场比赛记录公开。`;
  }

  const readySeconds = await getEstimatedTargetReadySeconds(target.match, timing);
  const nowSeconds = Math.floor(options.now.getTime() / 1000);
  if (readySeconds && nowSeconds < readySeconds) {
    const readyClock = formatBeijingClockFromUnix(readySeconds);
    return `根据上一场结束时间估算，${readyClock || "稍后"} 后再抓取本场记录。`;
  }

  return "";
}

function shouldDeferNoOfficialRecord(match, options = {}) {
  if (!shouldUseSmartSchedule(options)) return false;

  const matchDate = String(match?.match_date || "").trim();
  if (matchDate !== getBeijingBusinessDate(options.now)) return false;
  return !isBeijingSettlementScheduledWindow(options.now);
}

async function findOfficialDotaMatchId(match) {
  const matchDate = String(match.match_date || "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(matchDate)) {
    throw new Error(`Match ${match.match_id} has no usable match_date.`);
  }

  const monthCode = matchDate.slice(0, 7);
  const localAccountIds = await getLocalSteamAccountIds(match);
  const sameDayMatches = (await fetchLeagueMatchesForMonth(monthCode))
    .filter((candidate) => candidate.startDate === matchDate)
    .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));

  if (!sameDayMatches.length) {
    throw new NoOfficialMatchRecordError("无比赛记录");
  }

  if (await shouldRequireManualOfficialMatchAssociation(match, sameDayMatches.length)) {
    throw new Error(
      `Manual association required for ${matchDate}: official count ${sameDayMatches.length} differs from local count, and multiple local matches share the same two rosters.`,
    );
  }

  if (localAccountIds.size < 4 && sameDayMatches.length !== 1) {
    throw new Error(`Only ${localAccountIds.size} local Steam account mappings are available; at least 4 are required to disambiguate ${sameDayMatches.length} same-day matches.`);
  }

  const scored = [];
  for (const [index, candidate] of sameDayMatches.entries()) {
    const details = await fetchMatchDetails(candidate.matchId);
    const candidateAccountIds = getCandidateAccountIds(details);
    const overlap = [...localAccountIds].filter((accountId) => candidateAccountIds.has(accountId)).length;
    const winnerMatches = String(match.winner_side || "").toLowerCase() === getWinnerSideFromDetails(details);
    const orderMatches = Number(match.match_no) === index + 1;

    scored.push({
      matchId: candidate.matchId,
      overlap,
      winnerMatches,
      orderMatches,
      score: overlap * 4 + (winnerMatches ? 2 : 0) + (orderMatches ? 1 : 0),
    });
  }

  scored.sort((a, b) => b.score - a.score || b.overlap - a.overlap || String(a.matchId).localeCompare(String(b.matchId)));
  const best = scored[0];
  const second = scored[1];
  const requiredOverlap = localAccountIds.size >= 4 ? Math.min(localAccountIds.size, 6) : localAccountIds.size;

  if (localAccountIds.size >= 4 && best.overlap < requiredOverlap) {
    throw new Error(`Best official match candidate ${best.matchId} only matched ${best.overlap}/${localAccountIds.size} local Steam accounts.`);
  }

  if (second && best.score === second.score && best.overlap === second.overlap) {
    throw new Error(`Ambiguous official match candidates for ${matchDate}: ${best.matchId}, ${second.matchId}.`);
  }

  if (localAccountIds.size < 4 && sameDayMatches.length === 1 && best.overlap < localAccountIds.size) {
    throw new Error(`The only same-day official match ${best.matchId} did not match all available local Steam accounts.`);
  }

  return best.matchId;
}

async function getOpenDotaOverviewScreenshotClip(page) {
  return page.evaluate(() => {
    const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const findTextElement = (label) => [...document.querySelectorAll("body *")]
      .filter((node) => normalizeText(node.textContent) === label)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return (leftRect.height * leftRect.width) - (rightRect.height * rightRect.width);
      })[0] || null;
    const getSectionBottom = (heading) => {
      if (!heading) return 0;
      const headingText = normalizeText(heading.textContent);
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const headingRect = heading.getBoundingClientRect();
      let bestRect = headingRect;

      for (let node = heading; node && node !== document.body; node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.width < viewportWidth * 0.42) continue;
        if (rect.height < 120 || rect.height > 1200) continue;
        if (!normalizeText(node.textContent).includes(headingText)) continue;
        if (!bestRect.height || rect.height < bestRect.height || bestRect.height < 120) {
          bestRect = rect;
        }
      }

      return Math.max(bestRect.bottom, headingRect.bottom + 360);
    };

    const radiantHeading = findTextElement("Radiant - Overview");
    if (!radiantHeading) return null;
    const direHeading = findTextElement("Dire - Overview");
    const radiantRect = radiantHeading.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1500;
    const documentHeight = Math.max(
      document.documentElement.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      viewportHeight
    );
    const topInViewport = Math.max(0, radiantRect.top - 16);
    const top = Math.max(0, scrollY + topInViewport);
    const direBottom = direHeading
      ? scrollY + getSectionBottom(direHeading) + 16
      : top + 1500;
    const maxVisibleHeight = Math.max(1, viewportHeight - topInViewport - 8);
    const wantedHeight = Math.max(900, direBottom - top);
    const height = Math.max(1, Math.min(maxVisibleHeight, documentHeight - top, wantedHeight));

    return {
      x: 0,
      y: Math.round(top),
      width: Math.round(viewportWidth),
      height: Math.round(height),
    };
  }).catch(() => null);
}

async function captureOpenDotaScreenshot(browser, dotaMatchId, outputPath) {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 2200 },
    deviceScaleFactor: 2,
  });

  try {
    await page.goto(`https://www.opendota.com/matches/${dotaMatchId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const overviewHeading = page.getByText("Radiant - Overview").first();
    await overviewHeading.waitFor({ timeout: 45000 }).catch(() => {});
    await overviewHeading.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      window.scrollTo(0, Math.max(0, window.scrollY + rect.top - 16));
    }).catch(() => overviewHeading.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(2500);
    const clip = await getOpenDotaOverviewScreenshotClip(page);
    const screenshotOptions = {
      path: outputPath,
      fullPage: false,
      type: "jpeg",
      quality: 94,
    };
    if (clip) {
      screenshotOptions.clip = clip;
    }
    await page.screenshot(screenshotOptions);
  } finally {
    await page.close();
  }
}

function getChromiumLaunchOptions() {
  const executablePath = optionalEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH")
    || optionalEnv("CHROMIUM_EXECUTABLE_PATH");
  return executablePath
    ? { headless: true, executablePath }
    : { headless: true };
}

function getScreenshotContentType(storagePath) {
  return /\.png$/i.test(storagePath) ? "image/png" : "image/jpeg";
}

async function uploadScreenshot(storagePath, filePath) {
  const bytes = await readFile(filePath);
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": getScreenshotContentType(storagePath),
      "Cache-Control": "60",
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storage upload failed (${response.status}): ${text || response.statusText}`);
  }
}

async function markAssetError(match, message) {
  await saveAsset(match, {
    asset_status: "error",
    last_error: String(message || "Unknown error").slice(0, 500),
    last_requested_at: new Date().toISOString(),
  });
}

async function markTargetsError(targets, message) {
  for (const target of targets) {
    await markAssetError(target.match, message).catch((error) => {
      console.error(`Failed to mark asset error for ${target.match.match_id}:`, error);
    });
  }
}

async function processMatch(browser, target, options) {
  const match = target.match;
  const asset = target.asset || await getAssetForMatchId(match.match_id);

  if (asset?.storage_path && asset.asset_status === "available" && !options.force) {
    await ensureOfficialMatchSnapshot(match, asset.dota_match_id, asset);
    console.log(`Match ${match.match_id}: screenshot already exists at ${asset.storage_path}.`);
    return { skipped: true };
  }

  let dotaMatchId = normalizeDotaMatchId(asset?.dota_match_id);
  if (!dotaMatchId) {
    try {
      dotaMatchId = await findOfficialDotaMatchId(match);
    } catch (error) {
      if (error instanceof NoOfficialMatchRecordError && shouldDeferNoOfficialRecord(match, options)) {
        throw new DeferredScreenshotError("等待官方比赛记录公开，保留到下一次定时扫描。");
      }
      throw error;
    }
  }
  const sourceUrl = `https://www.opendota.com/matches/${dotaMatchId}`;
  await saveAsset(match, {
    dota_match_id: dotaMatchId,
    asset_status: "pending",
    source_url: sourceUrl,
    last_error: null,
  });

  const storagePath = `${String(match.match_date || new Date().toISOString().slice(0, 10)).slice(0, 7)}/${dotaMatchId}.jpg`;
  const outputPath = `/tmp/opendota-${match.match_id}-${dotaMatchId}.jpg`;
  await captureOpenDotaScreenshot(browser, dotaMatchId, outputPath);
  await uploadScreenshot(storagePath, outputPath);
  const savedAsset = await saveAsset(match, {
    dota_match_id: dotaMatchId,
    asset_status: "available",
    storage_path: storagePath,
    source_url: sourceUrl,
    captured_at: new Date().toISOString(),
    last_error: null,
  });
  await ensureOfficialMatchSnapshot(match, dotaMatchId, savedAsset || {
    storage_bucket: BUCKET,
    storage_path: storagePath,
    source_url: sourceUrl,
    captured_at: new Date().toISOString(),
  });

  console.log(`Match ${match.match_id}: uploaded OpenDota screenshot ${storagePath}.`);
  return { skipped: false, storagePath };
}

function normalizeArchiveDate(value) {
  const normalized = String(value || "").trim();
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(normalized) ? normalized : "";
}

function normalizeArchiveMonth(value) {
  const normalized = String(value || "").trim();
  return /^[0-9]{4}-[0-9]{2}$/.test(normalized) ? normalized : "";
}

function getDefaultSnapshotArchiveDate(now = new Date()) {
  const beijing = getBeijingWallClockDate(now);
  if (Number.isNaN(beijing.getTime())) return "";
  beijing.setDate(beijing.getDate() - 1);
  return formatDateParts(beijing);
}

function getSnapshotArchivePrefix(options = {}) {
  const prefix = String(options.snapshotArchivePrefix || DEFAULT_SNAPSHOT_ARCHIVE_PREFIX)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return prefix || DEFAULT_SNAPSHOT_ARCHIVE_PREFIX;
}

function getSnapshotArchiveIndexPath(matchDate, options = {}) {
  const prefix = getSnapshotArchivePrefix(options);
  const monthCode = String(matchDate || "").slice(0, 7);
  return `${prefix}/${monthCode}/${matchDate}.index.json`;
}

function getSnapshotArchiveBlobPath(matchDate, _sha256, options = {}) {
  const prefix = getSnapshotArchivePrefix(options);
  const monthCode = String(matchDate || "").slice(0, 7);
  return `${prefix}/${monthCode}/snapshots/${matchDate}.json.gz`;
}

function getSnapshotArchivePath(matchDate, options = {}) {
  return getSnapshotArchiveIndexPath(matchDate, options);
}

function buildSnapshotArchivePayload(matchDate, rows, options = {}) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    matchDate,
    provider: PROVIDER,
    source: "official_match_snapshots",
    storageBuckets: {
      matchScreenshots: BUCKET,
      siteBackgrounds: "site-backgrounds",
    },
    matches: rows.map((row) => ({
      matchId: row.match_id,
      seasonId: row.season_id,
      matchDate: row.match_date,
      matchNo: row.match_no ?? null,
      dotaMatchId: row.dota_match_id,
      sourceUrl: row.source_url,
      screenshot: {
        bucket: row.screenshot_bucket || BUCKET,
        path: row.screenshot_path || null,
      },
      capturedAt: row.captured_at,
      payload: row.payload || {},
    })),
    archive: {
      repository: options.githubRepository || null,
      branch: options.snapshotArchiveBranch || null,
      indexPath: getSnapshotArchiveIndexPath(matchDate, options),
    },
  };
}

function createSnapshotArchiveBundle(matchDate, rows, options = {}) {
  const payload = buildSnapshotArchivePayload(matchDate, rows, options);
  const jsonBuffer = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const gzipBuffer = gzipSync(jsonBuffer, { level: 9 });
  const sha256 = createHash("sha256").update(gzipBuffer).digest("hex");
  const blobPath = getSnapshotArchiveBlobPath(matchDate, sha256, options);
  const indexPath = getSnapshotArchiveIndexPath(matchDate, options);
  const index = {
    version: 1,
    matchDate,
    provider: PROVIDER,
    immutable: false,
    encoding: "json+gzip",
    compression: "gzip",
    sha256,
    byteLength: gzipBuffer.length,
    uncompressedByteLength: jsonBuffer.length,
    matchCount: rows.length,
    generatedAt: payload.generatedAt,
    path: blobPath,
    repository: options.githubRepository || null,
    branch: options.snapshotArchiveBranch || null,
  };
  return {
    payload,
    jsonBuffer,
    gzipBuffer,
    sha256,
    blobPath,
    indexPath,
    index,
  };
}

function getGithubApiHeaders(options = {}) {
  const token = String(options.githubToken || "").trim();
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN; cannot archive OpenDota snapshots to GitHub.");
  }
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchGithubContentSha(repository, path, branch, options = {}) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://api.github.com/repos/${repository}/contents/${encodedPath}`);
  if (branch) {
    url.searchParams.set("ref", branch);
  }
  const response = await fetch(url, {
    headers: getGithubApiHeaders(options),
  });
  if (response.status === 404) return "";
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`GitHub content lookup failed (${response.status}): ${payload?.message || response.statusText}`);
  }
  return String(payload?.sha || "");
}

async function putGithubContentFile(path, contentBuffer, message, options = {}) {
  const repository = String(options.githubRepository || "").trim();
  const branch = String(options.snapshotArchiveBranch || "main").trim();
  if (!repository) {
    throw new Error("Missing GITHUB_REPOSITORY; cannot archive OpenDota snapshots to GitHub.");
  }

  const sha = await fetchGithubContentSha(repository, path, branch, options);
  if (sha && options.skipExisting === true) {
    console.log(`GitHub archive object already exists at ${path}; keeping existing immutable content.`);
    return { skipped: true, sha };
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${encodedPath}`, {
    method: "PUT",
    headers: getGithubApiHeaders(options),
    body: JSON.stringify({
      message,
      content: Buffer.from(contentBuffer).toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`GitHub archive write failed (${response.status}): ${result?.message || response.statusText}`);
  }
  return result;
}

async function putGithubJsonFile(path, payload, message, options = {}) {
  return putGithubContentFile(
    path,
    Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8"),
    message,
    options
  );
}

async function archiveSnapshotDate(matchDate, options = {}) {
  const rows = await getSnapshotRowsByDate(matchDate);
  if (!rows.length) {
    console.log(`No structured OpenDota snapshots to archive for ${matchDate}.`);
    return { matchDate, archived: false, count: 0 };
  }

  const bundle = createSnapshotArchiveBundle(matchDate, rows, options);
  await putGithubContentFile(
    bundle.blobPath,
    bundle.gzipBuffer,
    `archive: OpenDota snapshots ${matchDate}`,
    options
  );
  await putGithubJsonFile(
    bundle.indexPath,
    bundle.index,
    `archive: OpenDota snapshot index ${matchDate}`,
    options
  );
  await deleteSnapshotRowsByDate(matchDate);
  console.log(`Archived ${rows.length} structured OpenDota snapshot(s) for ${matchDate} to ${bundle.blobPath}; index ${bundle.indexPath}.`);
  return { matchDate, archived: true, count: rows.length, path: bundle.indexPath, blobPath: bundle.blobPath };
}

async function getSnapshotArchiveDates(options = {}) {
  const archiveDate = normalizeArchiveDate(options.snapshotArchiveDate);
  if (archiveDate) return [archiveDate];

  const archiveMonth = normalizeArchiveMonth(options.snapshotArchiveMonth);
  if (archiveMonth) return getSnapshotDatesForMonth(archiveMonth);

  if (options.eventName === "schedule" && isBeijingSettlementScheduledWindow(options.now || new Date())) {
    const defaultDate = getDefaultSnapshotArchiveDate(options.now || new Date());
    return defaultDate ? [defaultDate] : [];
  }

  return [];
}

async function archiveOfficialMatchSnapshots(options = {}) {
  const dates = await getSnapshotArchiveDates(options);
  if (!dates.length) {
    if (options.snapshotArchiveOnly) {
      console.log("No structured OpenDota snapshot archive target date found.");
    }
    return;
  }

  for (const matchDate of dates) {
    try {
      await archiveSnapshotDate(matchDate, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markSnapshotArchiveError(matchDate, message);
      throw error;
    }
  }
}

async function buildTargets(options) {
  if (options.matchId) {
    const match = await getMatchById(options.matchId);
    if (!match) throw new Error(`Match ${options.matchId} not found.`);
    return [{ match, asset: await getAssetForMatchId(options.matchId) }];
  }

  const targets = [];
  const seenMatchIds = new Set();
  const deferredTargets = [];
  const queuedAssets = await getQueuedAssets(Math.min(options.limit * 3, 50));
  const queuedMatchIds = queuedAssets.map((asset) => asset.match_id).filter(Boolean);
  const queuedMatches = new Map((await getMatchesByIds(queuedMatchIds)).map((match) => [match.match_id, match]));

  for (const asset of queuedAssets) {
    const match = queuedMatches.get(asset.match_id);
    if (match) {
      const target = { match, asset };
      const deferReason = await getScheduledTargetDeferReason(target, options);
      if (deferReason) {
        deferredTargets.push({ matchId: match.match_id, reason: deferReason });
        console.log(`Match ${match.match_id}: ${deferReason}`);
      } else {
        targets.push(target);
        seenMatchIds.add(match.match_id);
      }
    }
    if (targets.length >= options.limit) {
      options.deferredTargets = deferredTargets;
      return targets;
    }
  }

  const archiveMonth = normalizeArchiveMonth(options.snapshotArchiveMonth);
  if (archiveMonth && targets.length < options.limit) {
    const monthMatches = await getMatchesForMonth(archiveMonth);
    const monthAssets = new Map((await getAssetsByMatchIds(monthMatches.map((match) => match.match_id))).map((asset) => [asset.match_id, asset]));
    for (const match of monthMatches) {
      if (!match?.match_id || seenMatchIds.has(match.match_id)) continue;
      const asset = monthAssets.get(match.match_id) || null;
      if (!asset?.dota_match_id && !asset?.storage_path) continue;
      targets.push({ match, asset });
      seenMatchIds.add(match.match_id);
      if (targets.length >= options.limit) break;
    }
  }

  options.deferredTargets = deferredTargets;
  return targets;
}

async function processTargets(targets, options) {
  const failures = [];
  let deferredCount = 0;
  let browser = null;

  try {
    browser = await chromium.launch(getChromiumLaunchOptions());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markTargetsError(targets, `浏览器启动失败：${message}`);
    throw error;
  }

  try {
    for (const target of targets) {
      try {
        await processMatch(browser, target, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof DeferredScreenshotError) {
          console.log(`Match ${target.match.match_id}: ${message}`);
          deferredCount += 1;
          continue;
        }
        failures.push({ matchId: target.match.match_id, message });
        console.error(`Match ${target.match.match_id}: ${message}`);
        await markAssetError(target.match, message).catch((markError) => {
          console.error(`Failed to mark asset error for ${target.match.match_id}:`, markError);
        });
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  if (failures.length && options.matchId) {
    throw new Error(failures.map((failure) => `${failure.matchId}: ${failure.message}`).join("\n"));
  }

  if (failures.length) {
    console.warn(`${failures.length} screenshot target(s) failed; errors were saved to official_match_assets.last_error.`);
  }

  return {
    failureCount: failures.length,
    deferredCount,
    processedCount: Math.max(targets.length - failures.length - deferredCount, 0),
  };
}

async function runProcessingPass(options) {
  options.now = new Date();
  options.deferredTargets = [];
  options.dayTimingCache = new Map();

  const targets = await buildTargets(options);
  if (!targets.length) {
    if (options.deferredTargets.length) {
      console.log(`${options.deferredTargets.length} OpenDota screenshot target(s) deferred to a later scheduled scan.`);
    } else {
      console.log("No OpenDota screenshots need processing.");
    }
    return {
      targetCount: 0,
      processedCount: 0,
      deferredCount: options.deferredTargets.length,
      failureCount: 0,
    };
  }

  console.log(`Processing ${targets.length} OpenDota screenshot target(s).`);
  const result = await processTargets(targets, options);
  return {
    targetCount: targets.length,
    ...result,
  };
}

function getPollIntervalFromSequence(sequence, retryIndex) {
  if (retryIndex < sequence.length) return sequence[retryIndex];
  return STEADY_MATCH_POLL_INTERVAL_SECONDS;
}

async function getNextDynamicScanDelaySeconds(options, state) {
  const now = options.now || new Date();
  const secondsUntilEnd = getSecondsUntilBeijingMinute(BEIJING_DYNAMIC_SCAN_END_MINUTES, now);
  if (secondsUntilEnd <= 0) return 0;

  const matchDate = getBeijingBusinessDate(now);
  const timing = await getOfficialDayTimingForOptions(matchDate, options);
  const officialCount = Number(timing?.officialCount || 0);
  const previousSeenCount = Number(state.seenOfficialCount || 0);
  const minutes = getBeijingMinutesSinceMidnight(now);
  let delaySeconds = 0;

  if (officialCount > previousSeenCount) {
    state.seenOfficialCount = officialCount;
    state.retryIndex = 0;

    const latestEndSeconds = Number(timing.latestEndSeconds);
    const nextFirstScanSeconds = Number.isFinite(latestEndSeconds)
      ? latestEndSeconds + NEXT_MATCH_FIRST_SCAN_DELAY_SECONDS
      : null;
    const nowSeconds = Math.floor(now.getTime() / 1000);

    if (nextFirstScanSeconds && nextFirstScanSeconds > nowSeconds) {
      delaySeconds = nextFirstScanSeconds - nowSeconds;
      console.log(`Official match ${officialCount} detected. Next scan starts around ${formatBeijingClockFromUnix(nextFirstScanSeconds)} Beijing time.`);
    } else {
      delaySeconds = getPollIntervalFromSequence(FOLLOWUP_MATCH_POLL_INTERVAL_SECONDS, state.retryIndex);
      state.retryIndex += 1;
    }
  } else if (officialCount === 0 && minutes >= BEIJING_FIRST_MATCH_FAST_SCAN_END_MINUTES) {
    delaySeconds = LATE_NO_MATCH_POLL_INTERVAL_SECONDS;
    state.retryIndex = 0;
  } else {
    const sequence = officialCount === 0
      ? FIRST_MATCH_POLL_INTERVAL_SECONDS
      : FOLLOWUP_MATCH_POLL_INTERVAL_SECONDS;
    delaySeconds = getPollIntervalFromSequence(sequence, state.retryIndex);
    state.retryIndex += 1;

    if (officialCount === 0 && minutes < BEIJING_FIRST_MATCH_FAST_SCAN_END_MINUTES) {
      const secondsUntilSlowWindow = getSecondsUntilBeijingMinute(BEIJING_FIRST_MATCH_FAST_SCAN_END_MINUTES, now);
      if (secondsUntilSlowWindow > 0) {
        delaySeconds = Math.min(delaySeconds, secondsUntilSlowWindow);
      }
    }
  }

  if (delaySeconds >= secondsUntilEnd) return 0;
  return Math.max(1, delaySeconds);
}

function shouldUseDynamicScheduledLoop(options) {
  return shouldUseSmartSchedule(options) && isBeijingDynamicScanWindow(options.now || new Date());
}

async function runDynamicScheduledLoop(options) {
  const state = {
    seenOfficialCount: 0,
    retryIndex: 0,
  };

  while (isBeijingDynamicScanWindow(new Date())) {
    await runProcessingPass(options);
    const delaySeconds = await getNextDynamicScanDelaySeconds(options, state);
    if (delaySeconds <= 0) break;
    const nextScanAt = new Date(Date.now() + delaySeconds * 1000);
    console.log(`Next adaptive OpenDota scan in ${Math.round(delaySeconds / 60)} minute(s), around ${formatBeijingClockFromUnix(Math.floor(nextScanAt.getTime() / 1000))} Beijing time.`);
    await wait(delaySeconds * 1000);
  }

  console.log("Adaptive Beijing evening OpenDota scan finished.");
}

async function main() {
  const options = {
    matchId: normalizeMatchId(optionalEnv("SCREENSHOT_MATCH_ID") || optionalEnv("MATCH_ID")),
    limit: clampLimit(optionalEnv("SCREENSHOT_LIMIT"), 20),
    force: isTruthy(optionalEnv("SCREENSHOT_FORCE")),
    scheduleMode: optionalEnv("SCREENSHOT_SCHEDULE_MODE") || "smart",
    eventName: optionalEnv("GITHUB_EVENT_NAME"),
    githubToken: optionalEnv("GITHUB_TOKEN"),
    githubRepository: optionalEnv("GITHUB_REPOSITORY"),
    snapshotArchiveBranch: optionalEnv("SNAPSHOT_ARCHIVE_BRANCH") || optionalEnv("GITHUB_REF_NAME") || "main",
    snapshotArchivePrefix: optionalEnv("SNAPSHOT_ARCHIVE_PREFIX") || DEFAULT_SNAPSHOT_ARCHIVE_PREFIX,
    snapshotArchiveDate: optionalEnv("SNAPSHOT_ARCHIVE_DATE"),
    snapshotArchiveMonth: optionalEnv("SNAPSHOT_ARCHIVE_MONTH"),
    snapshotArchiveOnly: isTruthy(optionalEnv("SNAPSHOT_ARCHIVE_ONLY")),
    now: new Date(),
    deferredTargets: [],
    dayTimingCache: new Map(),
  };

  if (options.snapshotArchiveOnly) {
    await archiveOfficialMatchSnapshots(options);
    return;
  }

  if (shouldUseDynamicScheduledLoop(options)) {
    await runDynamicScheduledLoop(options);
    return;
  }

  await runProcessingPass(options);
  await archiveOfficialMatchSnapshots(options);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
