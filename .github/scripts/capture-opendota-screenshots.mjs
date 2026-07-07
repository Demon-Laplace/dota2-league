import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const BUCKET = "opendota-match-screenshots";
const PROVIDER = "opendota";
const ASSET_KIND = "overview_screenshot";
const MATCH_SELECT = "match_id,season_id,match_no,match_date,winner_side,players";
const ASSET_SELECT = "id,match_id,season_id,dota_match_id,asset_status,storage_bucket,storage_path,source_url,captured_at,requested_at,last_requested_at,request_count,last_error,created_at,updated_at";
const DEFAULT_LEAGUE_ID = "19878";

class NoOfficialMatchRecordError extends Error {
  constructor(message = "无比赛记录") {
    super(message);
    this.name = "NoOfficialMatchRecordError";
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

function getBeijingBusinessDateFromUnix(seconds) {
  const source = new Date(Number(seconds) * 1000);
  if (Number.isNaN(source.getTime())) return "";
  const beijing = new Date(source.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  if (beijing.getHours() < 2) {
    beijing.setDate(beijing.getDate() - 1);
  }
  return formatDateParts(beijing);
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

async function getAssetForMatchId(matchId) {
  const rows = await supabaseRequest(`/rest/v1/official_match_assets?select=${ASSET_SELECT}&match_id=eq.${matchId}&provider=eq.${PROVIDER}&asset_kind=eq.${ASSET_KIND}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getQueuedAssets(limit) {
  return supabaseRequest(`/rest/v1/official_match_assets?select=${ASSET_SELECT}&asset_status=in.(requested,pending)&order=updated_at.asc&limit=${limit}`);
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

async function fetchOpenDotaDetails(matchId) {
  const payload = await fetchJson(new URL(`https://api.opendota.com/api/matches/${matchId}`), "OpenDota match details");
  return {
    matchId,
    radiantWin: Boolean(payload?.radiant_win),
    players: Array.isArray(payload?.players) ? payload.players : [],
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
            players: result.players,
          };
        }
      } catch (_error) {
        // Fall back to the next Valve version and then OpenDota.
      }
    }
  }

  return fetchOpenDotaDetails(matchId);
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

async function captureOpenDotaScreenshot(browser, dotaMatchId, outputPath) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 1,
  });

  try {
    await page.goto(`https://www.opendota.com/matches/${dotaMatchId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.getByText("Radiant - Overview").first().waitFor({ timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: outputPath, fullPage: true });
  } finally {
    await page.close();
  }
}

async function uploadScreenshot(storagePath, filePath) {
  const bytes = await readFile(filePath);
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "image/png",
      "Cache-Control": "3600",
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

async function processMatch(browser, target, options) {
  const match = target.match;
  const asset = target.asset || await getAssetForMatchId(match.match_id);

  if (asset?.storage_path && asset.asset_status === "available" && !options.force) {
    console.log(`Match ${match.match_id}: screenshot already exists at ${asset.storage_path}.`);
    return { skipped: true };
  }

  const dotaMatchId = normalizeDotaMatchId(asset?.dota_match_id) || await findOfficialDotaMatchId(match);
  const sourceUrl = `https://www.opendota.com/matches/${dotaMatchId}`;
  await saveAsset(match, {
    dota_match_id: dotaMatchId,
    asset_status: "pending",
    source_url: sourceUrl,
    last_error: null,
  });

  const storagePath = `${String(match.match_date || new Date().toISOString().slice(0, 10)).slice(0, 7)}/${dotaMatchId}.png`;
  const outputPath = `/tmp/opendota-${match.match_id}-${dotaMatchId}.png`;
  await captureOpenDotaScreenshot(browser, dotaMatchId, outputPath);
  await uploadScreenshot(storagePath, outputPath);
  await saveAsset(match, {
    dota_match_id: dotaMatchId,
    asset_status: "available",
    storage_path: storagePath,
    source_url: sourceUrl,
    captured_at: new Date().toISOString(),
    last_error: null,
  });

  console.log(`Match ${match.match_id}: uploaded OpenDota screenshot ${storagePath}.`);
  return { skipped: false, storagePath };
}

async function buildTargets(options) {
  if (options.matchId) {
    const match = await getMatchById(options.matchId);
    if (!match) throw new Error(`Match ${options.matchId} not found.`);
    return [{ match, asset: await getAssetForMatchId(options.matchId) }];
  }

  const targets = [];
  const queuedAssets = await getQueuedAssets(options.limit);
  const queuedMatchIds = queuedAssets.map((asset) => asset.match_id).filter(Boolean);
  const queuedMatches = new Map((await getMatchesByIds(queuedMatchIds)).map((match) => [match.match_id, match]));

  for (const asset of queuedAssets) {
    const match = queuedMatches.get(asset.match_id);
    if (match) targets.push({ match, asset });
    if (targets.length >= options.limit) return targets;
  }

  return targets;
}

async function main() {
  const options = {
    matchId: normalizeMatchId(optionalEnv("SCREENSHOT_MATCH_ID") || optionalEnv("MATCH_ID")),
    limit: clampLimit(optionalEnv("SCREENSHOT_LIMIT"), 20),
    force: isTruthy(optionalEnv("SCREENSHOT_FORCE")),
  };

  const targets = await buildTargets(options);
  if (!targets.length) {
    console.log("No OpenDota screenshots need processing.");
    return;
  }

  console.log(`Processing ${targets.length} OpenDota screenshot target(s).`);
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  try {
    for (const target of targets) {
      try {
        await processMatch(browser, target, options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ matchId: target.match.match_id, message });
        console.error(`Match ${target.match.match_id}: ${message}`);
        await markAssetError(target.match, message).catch((markError) => {
          console.error(`Failed to mark asset error for ${target.match.match_id}:`, markError);
        });
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length && options.matchId) {
    throw new Error(failures.map((failure) => `${failure.matchId}: ${failure.message}`).join("\n"));
  }

  if (failures.length) {
    console.warn(`${failures.length} screenshot target(s) failed; errors were saved to official_match_assets.last_error.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
