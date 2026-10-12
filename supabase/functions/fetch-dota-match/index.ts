/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireUser,
} from "../_shared/client.ts";

type FetchDotaMatchBody = {
  matchId?: string | number | null;
  leagueId?: string | number | null;
  monthCode?: string | null;
  seasonId?: string | null;
};

type ValveMatchSummary = {
  match_id?: number | string;
  match_seq_num?: number | string;
  start_time?: number;
  lobby_type?: number;
  radiant_team_id?: number;
  dire_team_id?: number;
  players?: ValveMatchPlayer[];
};

type ValveMatchPlayer = {
  account_id?: number;
  player_slot?: number;
  hero_id?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  personaname?: string;
  name?: string;
};

type ValveMatchResult = {
  match_id?: number | string;
  start_time?: number;
  duration?: number;
  radiant_score?: number;
  dire_score?: number;
  radiant_win?: boolean;
  players?: ValveMatchPlayer[];
  error?: string;
};

class UpstreamApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamApiError";
    this.status = status;
  }
}

function normalizeMatchId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error("请输入有效的 Dota 2 比赛 ID。");
  }
  return normalized;
}

function normalizeLeagueId(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error("请输入有效的 Dota 2 联赛 ID。");
  }
  return normalized;
}

function normalizeMonthCode(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  if (!/^[0-9]{4}-[0-9]{2}$/.test(normalized)) {
    throw new Error("月份格式必须为 YYYY-MM。");
  }

  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("月份格式必须为 YYYY-MM。");
  }
  return normalized;
}

function normalizeAccountId(value: unknown) {
  const accountId = Number(value);
  if (!Number.isInteger(accountId) || accountId <= 0 || accountId >= 4294967295) {
    return null;
  }
  return String(accountId);
}

function getPlayerSide(playerSlot: number | undefined) {
  if (!isValidPlayerSlot(playerSlot)) return null;
  return playerSlot < 128 ? "radiant" : "dire";
}

function getSlotNo(playerSlot: number | undefined) {
  if (!isValidPlayerSlot(playerSlot)) return null;
  return (playerSlot & 0b111) + 1;
}

function isValidPlayerSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && ((value >= 0 && value <= 4) || (value >= 128 && value <= 132));
}

function validateMatchResult(result: ValveMatchResult, matchId: string) {
  if (result?.error) throw new Error(`比赛接口返回错误：${result.error}`);
  if (String(result?.match_id || "") !== matchId) throw new Error("比赛接口返回的比赛 ID 不一致。");
  if (typeof result.radiant_win !== "boolean") throw new Error("比赛接口未返回有效胜负，不能导入。");
  if (!Number.isFinite(result.start_time) || Number(result.start_time) <= 0) {
    throw new Error("比赛接口未返回有效开始时间。");
  }
  const players = result.players;
  if (!Array.isArray(players) || players.length !== 10
    || players.some((player) => !isValidPlayerSlot(player?.player_slot))
    || new Set(players.map((player) => player.player_slot)).size !== 10) {
    throw new Error("比赛数据必须包含双方各 5 名选手及有效的唯一位置。");
  }
}

function unixSecondsToIso(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

async function fetchJson(url: URL, label = "API") {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.result?.error || payload?.error || response.statusText;
    throw new UpstreamApiError(`${label} 请求失败（HTTP ${response.status}）：${message}`, response.status);
  }
  if (!payload || typeof payload !== "object") throw new Error(`${label} 返回了无效 JSON。`);
  return payload;
}

function buildMatchDetailsUrl(apiKey: string, matchId: string, version: "v1" | "V001") {
  const url = new URL(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/${version}/`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("match_id", matchId);
  url.searchParams.set("format", "json");
  return url;
}

function buildMatchHistoryUrl(
  apiKey: string,
  leagueId: string,
  version: "v1" | "V001",
  options: { matchesRequested?: number; startAtMatchId?: string } = {},
) {
  const url = new URL(`https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/${version}/`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("league_id", leagueId);
  url.searchParams.set("matches_requested", String(options.matchesRequested || 20));
  if (options.startAtMatchId) {
    url.searchParams.set("start_at_match_id", options.startAtMatchId);
  }
  url.searchParams.set("format", "json");
  return url;
}

async function fetchMatchDetails(apiKey: string, matchId: string) {
  const urls = [
    buildMatchDetailsUrl(apiKey, matchId, "v1"),
    buildMatchDetailsUrl(apiKey, matchId, "V001"),
  ];
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const payload = await fetchJson(url, "Valve API");
      validateMatchResult(payload?.result, matchId);
      return { payload, source: "steam_dota2" };
    } catch (error) {
      lastError = error;
      if (error instanceof UpstreamApiError && error.status < 500 && error.status !== 429) {
        throw error;
      }
    }
  }

  if (lastError) {
    const fallbackPayload = await fetchOpenDotaMatchDetails(matchId);
    validateMatchResult(fallbackPayload.result, matchId);
    return {
      payload: fallbackPayload,
      source: "opendota_public",
      fallbackReason: "Valve 官方接口暂时无法返回完整比赛数据，已改用 OpenDota 公开缓存。",
    };
  }

  throw lastError instanceof Error ? lastError : new Error("读取 Dota 2 比赛数据失败。");
}

function getMonthUnixRange(monthCode: string) {
  const [yearText, monthText] = monthCode.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startMs = Date.UTC(year, month - 1, 0, 18, 0, 0);
  const endMs = Date.UTC(year, month, 0, 18, 0, 0);
  return {
    startSeconds: Math.floor(startMs / 1000),
    endSeconds: Math.floor(endMs / 1000),
  };
}

function mapLeagueMatchSummary(match: ValveMatchSummary) {
  return {
    matchId: String(match.match_id || "").trim(),
    matchSeqNum: match.match_seq_num ? String(match.match_seq_num) : null,
    startTime: Number.isFinite(Number(match.start_time)) ? Number(match.start_time) : null,
    startTimeIso: unixSecondsToIso(match.start_time),
    lobbyType: Number.isInteger(Number(match.lobby_type)) ? Number(match.lobby_type) : null,
    radiantTeamId: Number.isInteger(Number(match.radiant_team_id)) ? Number(match.radiant_team_id) : null,
    direTeamId: Number.isInteger(Number(match.dire_team_id)) ? Number(match.dire_team_id) : null,
  };
}

function getLeagueHistoryMatches(payload: { result?: { status?: number; error?: string; matches?: ValveMatchSummary[] } }) {
  if (!payload.result || payload.result.error
    || (payload.result.status !== undefined && payload.result.status !== 1)
    || !Array.isArray(payload.result.matches)) {
    throw new Error("Valve 联赛列表接口未返回有效比赛列表。");
  }
  return payload.result.matches;
}

async function fetchLeagueMatchesForVersion(
  apiKey: string,
  leagueId: string,
  version: "v1" | "V001",
  monthCode = "",
) {
  if (!monthCode) {
    const payload = await fetchJson(buildMatchHistoryUrl(apiKey, leagueId, version), "Valve API");
    const matches = getLeagueHistoryMatches(payload);
    return matches
      .map(mapLeagueMatchSummary)
      .filter((match: { matchId: string }) => /^[0-9]+$/.test(match.matchId));
  }

  const { startSeconds, endSeconds } = getMonthUnixRange(monthCode);
  const collected = new Map<string, ReturnType<typeof mapLeagueMatchSummary>>();
  let startAtMatchId = "";
  const maxPages = 12;
  let reachedEnd = false;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchJson(
      buildMatchHistoryUrl(apiKey, leagueId, version, {
        matchesRequested: 100,
        startAtMatchId,
      }),
      "Valve API",
    );
    const matches = getLeagueHistoryMatches(payload);
    if (!matches.length) { reachedEnd = true; break; }

    let oldestStartTime = Number.POSITIVE_INFINITY;
    let oldestMatchId = "";

    matches.forEach((match: ValveMatchSummary) => {
      const matchId = String(match.match_id || "").trim();
      const startTime = Number(match.start_time);
      if (/^[0-9]+$/.test(matchId)) {
        oldestMatchId = matchId;
      }
      if (Number.isFinite(startTime) && startTime > 0) {
        oldestStartTime = Math.min(oldestStartTime, startTime);
        if (startTime >= startSeconds && startTime < endSeconds && /^[0-9]+$/.test(matchId)) {
          collected.set(matchId, mapLeagueMatchSummary(match));
        }
      }
    });

    if (Number.isFinite(oldestStartTime) && oldestStartTime < startSeconds) { reachedEnd = true; break; }
    if (!/^[1-9][0-9]*$/.test(oldestMatchId)) throw new Error("Valve 联赛列表缺少有效分页 ID。");
    const nextStartAt = BigInt(oldestMatchId) - 1n;
    if (nextStartAt <= 0n) { reachedEnd = true; break; }
    if (startAtMatchId && nextStartAt >= BigInt(startAtMatchId)) {
      throw new Error("Valve 联赛列表分页没有前进，请稍后重试。");
    }
    startAtMatchId = String(nextStartAt);
  }

  if (!reachedEnd) throw new Error("联赛历史超过本次读取上限，未能获取完整月份，请缩小查询范围或使用快照。");

  return [...collected.values()];
}

async function fetchLeagueMatches(apiKey: string, leagueId: string, monthCode = "") {
  const urls = [
    "v1",
    "V001",
  ];
  let lastError: unknown = null;

  for (const version of urls) {
    try {
      return await fetchLeagueMatchesForVersion(apiKey, leagueId, version as "v1" | "V001", monthCode);
    } catch (error) {
      lastError = error;
      if (error instanceof UpstreamApiError && error.status < 500 && error.status !== 429) {
        throw error;
      }
    }
  }

  if (lastError instanceof UpstreamApiError) {
    throw new Error(`Valve 官方接口暂时无法返回联赛 ${leagueId}${monthCode ? ` ${monthCode}` : ""} 的比赛列表（HTTP ${lastError.status}）。`);
  }

  throw lastError instanceof Error ? lastError : new Error("读取 Dota 2 联赛数据失败。");
}

async function fetchOpenDotaMatchDetails(matchId: string) {
  const url = new URL(`https://api.opendota.com/api/matches/${matchId}`);
  const payload = await fetchJson(url, "OpenDota API");
  const players = Array.isArray(payload?.players) ? payload.players : [];

  return {
    result: {
      match_id: payload?.match_id || matchId,
      start_time: payload?.start_time,
      duration: payload?.duration,
      radiant_win: payload?.radiant_win,
      radiant_score: payload?.radiant_score,
      dire_score: payload?.dire_score,
      players: players.map((player: ValveMatchPlayer) => ({
        account_id: player.account_id,
        player_slot: player.player_slot,
        hero_id: player.hero_id,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        personaname: player.personaname,
      })),
    },
  };
}

async function fetchHeroNameMap(apiKey: string) {
  const heroesUrl = new URL("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v1/");
  heroesUrl.searchParams.set("key", apiKey);
  heroesUrl.searchParams.set("language", "en_us");
  heroesUrl.searchParams.set("format", "json");

  try {
    const payload = await fetchJson(heroesUrl);
    const heroes = Array.isArray(payload?.result?.heroes) ? payload.result.heroes : [];
    const heroNameMap = new Map<number, string>();
    heroes.forEach((hero: { id?: number; localized_name?: string }) => {
      const id = Number(hero.id);
      const name = typeof hero.localized_name === "string" ? hero.localized_name : "";
      if (Number.isInteger(id) && name) {
        heroNameMap.set(id, name);
      }
    });
    return heroNameMap;
  } catch (_error) {
    return new Map<number, string>();
  }
}

async function handleFetchDotaMatchRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const clientResult = createUserScopedClient(req);
  if ("error" in clientResult) return clientResult.error;

  const userResult = await requireUser(clientResult.supabase);
  if ("error" in userResult) return userResult.error;

  const bodyResult = await parseJson<FetchDotaMatchBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const body = bodyResult.data ?? {};
  const seasonId = String(body.seasonId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonId)) {
    return jsonResponse({ error: "请提供有效赛季 ID。" }, { status: 400 });
  }
  {
    const { data: canSubmit, error } = await clientResult.supabase.rpc("can_submit_matches", {
      p_season_id: seasonId,
    });

    if (error) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }

    if (!canSubmit) {
      return jsonResponse({ error: "当前账号无权为该赛季导入比赛。" }, { status: 403 });
    }
  }

  const apiKey = Deno.env.get("STEAM_WEB_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "缺少 STEAM_WEB_API_KEY，无法读取 Valve 官方比赛数据。" }, { status: 500 });
  }

  const rawMatchId = String(body.matchId ?? "").trim();
  const rawLeagueId = String(body.leagueId ?? "").trim();
  if (!rawMatchId && rawLeagueId) {
    let leagueId = "";
    let monthCode = "";
    try {
      leagueId = normalizeLeagueId(rawLeagueId);
      monthCode = normalizeMonthCode(body.monthCode);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "联赛参数无效。" }, { status: 400 });
    }
    try {
      const matches = await fetchLeagueMatches(apiKey, leagueId, monthCode);
      return jsonResponse({ source: "steam_dota2", leagueId, monthCode: monthCode || null, matches });
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : "读取 Dota 2 联赛数据失败。",
      }, { status: 502 });
    }
  }

  let matchId = "";
  try {
    matchId = normalizeMatchId(rawMatchId);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "比赛 ID 无效。" }, { status: 400 });
  }

  try {
    const heroNameMapPromise = fetchHeroNameMap(apiKey);
    const matchDetails = await fetchMatchDetails(apiKey, matchId);
    const matchPayload = matchDetails.payload;
    const heroNameMap = await heroNameMapPromise;
    const result = (matchPayload?.result || {}) as ValveMatchResult;

    if (result.error) {
      return jsonResponse({ error: `Valve API 返回错误：${result.error}` }, { status: 400 });
    }

    if (!Array.isArray(result.players) || result.players.length !== 10) {
      return jsonResponse({ error: "Valve 返回的比赛数据不包含完整 10 名选手。" }, { status: 400 });
    }

    const accountIds = [
      ...new Set(
        result.players
          .map((player) => normalizeAccountId(player.account_id))
          .filter((accountId): accountId is string => Boolean(accountId)),
      ),
    ];

    const localPlayerByAccountId = new Map<string, { playerId: string; displayName: string }>();
    if (seasonId && accountIds.length) {
      const serviceClient = createServiceRoleClient();
      const { data: accountRows, error: accountError } = await serviceClient
        .from("player_external_accounts")
        .select("provider_account_id, player_id, players(display_name)")
        .eq("provider", "steam")
        .in("provider_account_id", accountIds);

      if (accountError) {
        return jsonResponse({ error: accountError.message }, { status: 400 });
      }

      const mappedPlayerIds = [...new Set((accountRows || []).map((row) => row.player_id).filter(Boolean))];
      const activePlayerIds = new Set<string>();
      if (mappedPlayerIds.length) {
        const { data: membershipRows, error: membershipError } = await serviceClient
          .from("season_memberships")
          .select("player_id, join_status")
          .eq("season_id", seasonId)
          .in("player_id", mappedPlayerIds);

        if (membershipError) {
          return jsonResponse({ error: membershipError.message }, { status: 400 });
        }

        (membershipRows || [])
          .filter((row) => row.join_status === "active" || row.join_status === "captain")
          .forEach((row) => activePlayerIds.add(row.player_id));
      }

      (accountRows || []).forEach((row) => {
        if (!activePlayerIds.has(row.player_id)) return;
        localPlayerByAccountId.set(row.provider_account_id, {
          playerId: row.player_id,
          displayName: row.players?.display_name || "未知选手",
        });
      });
    }

    const players = result.players
      .map((player) => {
        const accountId = normalizeAccountId(player.account_id);
        const playerSlot = Number(player.player_slot);
        const heroId = Number(player.hero_id);
        const localPlayer = accountId ? localPlayerByAccountId.get(accountId) : null;
        const externalDisplayName = String(player.personaname || player.name || "").trim() || null;
        return {
          provider: "steam",
          accountId,
          steamAccountId: accountId,
          externalDisplayName,
          playerSlot: Number.isInteger(playerSlot) ? playerSlot : null,
          side: getPlayerSide(player.player_slot),
          slotNo: getSlotNo(player.player_slot),
          heroId: Number.isInteger(heroId) ? heroId : null,
          heroName: Number.isInteger(heroId) ? heroNameMap.get(heroId) || null : null,
          kills: Number.isInteger(player.kills) ? player.kills : null,
          deaths: Number.isInteger(player.deaths) ? player.deaths : null,
          assists: Number.isInteger(player.assists) ? player.assists : null,
          matchedPlayerId: localPlayer?.playerId || null,
          matchedDisplayName: localPlayer?.displayName || null,
        };
      })
      .sort((a, b) => {
        const sideOrder = (a.side === "radiant" ? 0 : 1) - (b.side === "radiant" ? 0 : 1);
        if (sideOrder !== 0) return sideOrder;
        return Number(a.slotNo ?? 99) - Number(b.slotNo ?? 99);
      });

    return jsonResponse({
      source: matchDetails.source,
      fallbackReason: matchDetails.fallbackReason || null,
      matchId: String(result.match_id || matchId),
      startTime: Number.isFinite(Number(result.start_time)) ? Number(result.start_time) : null,
      startTimeIso: unixSecondsToIso(result.start_time),
      duration: Number.isFinite(Number(result.duration)) ? Number(result.duration) : null,
      radiantScore: Number.isInteger(result.radiant_score) ? result.radiant_score : null,
      direScore: Number.isInteger(result.dire_score) ? result.dire_score : null,
      radiantWin: Boolean(result.radiant_win),
      winnerSide: result.radiant_win ? "radiant" : "dire",
      players,
      matchedCount: players.filter((player) => player.matchedPlayerId).length,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "读取 Dota 2 比赛数据失败。",
    }, { status: 502 });
  }
}

Deno.serve(async (req: Request) => {
  try {
    return await handleFetchDotaMatchRequest(req);
  } catch (_error) {
    return jsonResponse({ error: "比赛抓取服务暂时不可用。" }, { status: 500 });
  }
});
