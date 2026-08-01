const RUNTIME_CONFIG = window.__DOTA2SYS_CONFIG__ || {};
const DEFAULT_PROJECT_ID = "klxkkwwszqtgeuozwtkw";
const APP_CONFIG = {
  projectId: String(RUNTIME_CONFIG.projectId ?? DEFAULT_PROJECT_ID).trim(),
  supabaseUrl: String(
    RUNTIME_CONFIG.supabaseUrl
      ?? `https://${String(RUNTIME_CONFIG.projectId ?? DEFAULT_PROJECT_ID).trim()}.supabase.co`
  ).trim(),
  supabaseAnonKey: String(
    RUNTIME_CONFIG.supabaseAnonKey
      ?? RUNTIME_CONFIG.anonKey
      ?? "sb_publishable_p0PhuEVU0rOuZDIaCi3mKg_ekZFSHfx"
  ).trim(),
};
const SITE_COPY = window.__DOTA2SYS_SITE_COPY__ || {};
const BACKGROUND_IMAGE_STORAGE_KEY = "nd_dota_site_background_image_v1";
const BACKGROUND_IMAGE_SETTINGS_STORAGE_KEY = "nd_dota_site_background_settings_v2";
const BACKGROUND_IMAGE_STORAGE_BUCKET = "site-backgrounds";
const BACKGROUND_IMAGE_STORAGE_OBJECT_SEPARATOR = "__";
const BACKGROUND_IMAGE_THUMBNAIL_PREFIX = "thumbnails/";
const BACKGROUND_IMAGE_THUMBNAIL_WIDTH = 960;
const BACKGROUND_IMAGE_THUMBNAIL_HEIGHT = 540;
const BACKGROUND_IMAGE_THUMBNAIL_QUALITY = 0.82;
const BACKGROUND_IMAGE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT = 42;
const MIN_BACKGROUND_BRIGHTNESS_PERCENT = 20;
const MAX_BACKGROUND_BRIGHTNESS_PERCENT = 100;
const DEFAULT_BACKGROUND_IMAGE_ID = "bg_21607b0db69e6d93";
const GITHUB_REPOSITORY_FULL_NAME = "Demon-Laplace/dota2-league";
const GITHUB_REPOSITORY_STORAGE_SNAPSHOT_URL = `https://raw.githubusercontent.com/${GITHUB_REPOSITORY_FULL_NAME}/main/assets/github-repository-storage.json`;
const GITHUB_PAGES_REPOSITORY_RECOMMENDED_LIMIT_BYTES = 1024 * 1024 * 1024;
const GITHUB_STORAGE_DAILY_CACHE_KEY = "nd_dota_github_storage_daily_v1";
const SUPABASE_DATABASE_USAGE_QUOTA_BYTES = 500 * 1024 * 1024;
const SUPABASE_SYSTEM_USAGE_DAILY_CACHE_STORAGE_KEY = "nd_dota_supabase_system_usage_daily_v3";
const SEASON_BASE_SPONSOR_AMOUNT = 20;
const LIFETIME_REWARD_EXTRA_DISPLAY_THRESHOLD = 100;
const SEASON_ROLLOVER_REQUIRED_SCORER_CONFIRMATIONS = 1;
let ADMIN_BACKGROUND_IMAGE_OPTIONS = [];
let ADMIN_BACKGROUND_IMAGE_IDS = new Set(ADMIN_BACKGROUND_IMAGE_OPTIONS.map((option) => option.id));
let githubRepositoryStorageDisplayText = "读取中";
let githubRepositoryStorageRefreshPromise = null;
let supabaseSystemUsageDisplayText = "数据库：读取中";
let supabaseSystemUsageRefreshKey = "";
let supabaseSystemUsageRefreshPromise = null;

function readSiteCopy(path, fallback = undefined) {
  if (!path) return fallback;
  const value = String(path)
    .split(".")
    .reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), SITE_COPY);
  return value === undefined ? fallback : value;
}

function copyText(path, fallback = "") {
  const value = readSiteCopy(path, fallback);
  return typeof value === "string" ? value : fallback;
}

function normalizeBackgroundAssetId(id = "") {
  const normalized = String(id || "").trim();
  if (!normalized || normalized.length > 80) return "";
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(normalized) ? normalized : "";
}

function normalizeBackgroundAssetFilename(filename = "") {
  const normalized = String(filename).trim();
  if (!normalized || normalized.includes("/") || normalized.includes("\\")) return "";
  return /\.(?:jpe?g|png|webp)$/i.test(normalized) ? normalized : "";
}

function normalizeBackgroundStorageObjectName(name = "") {
  const normalized = String(name || "").trim();
  if (!normalized || normalized.includes("\\") || normalized.includes("/")) return "";
  if (!/\.(?:jpe?g|png|webp)$/i.test(normalized)) return "";
  return normalized;
}

function normalizeBackgroundThumbnailObjectName(name = "") {
  const normalized = String(name || "").trim();
  if (!normalized.startsWith(BACKGROUND_IMAGE_THUMBNAIL_PREFIX)) return "";
  const filename = normalized.slice(BACKGROUND_IMAGE_THUMBNAIL_PREFIX.length);
  if (!filename || filename.includes("/") || filename.includes("\\")) return "";
  if (!/\.(?:jpe?g|png|webp)\.jpg$/i.test(filename)) return "";
  return normalized;
}

function getBackgroundThumbnailObjectName(objectName = "") {
  const normalizedName = normalizeBackgroundStorageObjectName(objectName);
  return normalizedName ? `${BACKGROUND_IMAGE_THUMBNAIL_PREFIX}${normalizedName}.jpg` : "";
}

function getBackgroundStoragePublicUrl(objectName = "") {
  const normalizedName = normalizeBackgroundStorageObjectName(objectName) || normalizeBackgroundThumbnailObjectName(objectName);
  if (!normalizedName) return "";
  const { data } = db.storage.from(BACKGROUND_IMAGE_STORAGE_BUCKET).getPublicUrl(normalizedName);
  return data?.publicUrl || "";
}

function getBackgroundStorageObjectVersion(entry) {
  return String(entry?.updated_at || entry?.created_at || "").trim();
}

function appendBackgroundUrlVersion(url = "", version = "") {
  const normalizedUrl = String(url || "").trim();
  const normalizedVersion = String(version || "").trim();
  if (!normalizedUrl || !normalizedVersion) return normalizedUrl;
  return `${normalizedUrl}${normalizedUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(normalizedVersion)}`;
}

function createStorageBackgroundImageOption(entry, thumbnailObjectVersions = new Map()) {
  const objectName = normalizeBackgroundStorageObjectName(entry?.name);
  if (!objectName) return null;

  const separatorIndex = objectName.indexOf(BACKGROUND_IMAGE_STORAGE_OBJECT_SEPARATOR);
  if (separatorIndex <= 0) return null;

  const id = normalizeBackgroundAssetId(objectName.slice(0, separatorIndex));
  const filename = normalizeBackgroundAssetFilename(objectName.slice(separatorIndex + BACKGROUND_IMAGE_STORAGE_OBJECT_SEPARATOR.length));
  if (!id || !filename) return null;

  const publicUrl = appendBackgroundUrlVersion(
    getBackgroundStoragePublicUrl(objectName),
    getBackgroundStorageObjectVersion(entry)
  );
  if (!publicUrl) return null;
  const thumbnailObjectName = getBackgroundThumbnailObjectName(objectName);
  const thumbnailUrl = thumbnailObjectVersions.has(thumbnailObjectName)
    ? appendBackgroundUrlVersion(getBackgroundStoragePublicUrl(thumbnailObjectName), thumbnailObjectVersions.get(thumbnailObjectName))
    : "";

  return {
    id,
    filename,
    objectName,
    thumbnailObjectName,
    url: publicUrl,
    previewUrl: thumbnailUrl || publicUrl,
    source: "storage",
  };
}

function setAdminBackgroundImageOptions(options = []) {
  const normalizedOptions = Array.isArray(options) ? options : [];
  ADMIN_BACKGROUND_IMAGE_OPTIONS = normalizedOptions;
  ADMIN_BACKGROUND_IMAGE_IDS = new Set(normalizedOptions.map((option) => option.id));
}

async function loadStorageBackgroundThumbnailObjectVersions() {
  try {
    const { data, error } = await db.storage
      .from(BACKGROUND_IMAGE_STORAGE_BUCKET)
      .list("thumbnails", {
        limit: 1000,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).reduce((versions, entry) => {
      const objectName = normalizeBackgroundThumbnailObjectName(`${BACKGROUND_IMAGE_THUMBNAIL_PREFIX}${entry?.name || ""}`);
      if (objectName) {
        versions.set(objectName, getBackgroundStorageObjectVersion(entry));
      }
      return versions;
    }, new Map());
  } catch (error) {
    console.warn("读取 Supabase 背景缩略图失败。", error);
    return new Map();
  }
}

async function loadStorageBackgroundImageOptions() {
  try {
    const [thumbnailObjectVersions, listResult] = await Promise.all([
      loadStorageBackgroundThumbnailObjectVersions(),
      db.storage
        .from(BACKGROUND_IMAGE_STORAGE_BUCKET)
        .list("", {
          limit: 1000,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        }),
    ]);
    const { data, error } = listResult;
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map((entry) => createStorageBackgroundImageOption(entry, thumbnailObjectVersions))
      .filter(Boolean);
  } catch (error) {
    console.warn("读取 Supabase 背景图片失败。", error);
    return [];
  }
}

async function loadAdminBackgroundImageOptions() {
  const storageOptions = await loadStorageBackgroundImageOptions();
  setAdminBackgroundImageOptions(storageOptions);
  return ADMIN_BACKGROUND_IMAGE_OPTIONS;
}

function formatCopyText(path, replacements = {}, fallback = "") {
  const template = copyText(path, fallback);
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const replacement = replacements[key];
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
}

function getDefaultBackgroundImageSettings() {
  return {
    fallbackBackgroundId: "",
    manualSeasonKey: "",
    manualBackgroundId: "",
    finalDayBackgroundId: "",
    backgroundBrightness: DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT,
    automaticChampionAppliedSeasonKey: "",
    automaticFinalDayAppliedKey: "",
    playerBackgrounds: {},
  };
}

function normalizeBackgroundBrightnessPercent(value, fallback = DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(
    Math.max(Math.round(numericValue), MIN_BACKGROUND_BRIGHTNESS_PERCENT),
    MAX_BACKGROUND_BRIGHTNESS_PERCENT
  );
}

function getAdminBackgroundOptionById(id = "") {
  const normalizedId = normalizeBackgroundAssetId(id);
  if (!normalizedId) return null;
  return ADMIN_BACKGROUND_IMAGE_OPTIONS.find((option) => option.id === normalizedId) || null;
}

function getAdminBackgroundOptionByUrl(url = "") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return null;
  const exactMatch = ADMIN_BACKGROUND_IMAGE_OPTIONS.find((option) => option.url === normalizedUrl);
  if (exactMatch) return exactMatch;

  const legacyFilename = normalizeBackgroundAssetFilename(decodeURIComponent(normalizedUrl.split("/").pop() || ""));
  if (!legacyFilename) return null;
  return ADMIN_BACKGROUND_IMAGE_OPTIONS.find((option) => option.filename === legacyFilename) || null;
}

function getAdminBackgroundOptionByStoredRef(ref = "") {
  return getAdminBackgroundOptionById(ref) || getAdminBackgroundOptionByUrl(ref);
}

function getCurrentBackgroundSeasonKey(season = activeSeason) {
  return String(season?.id || season?.code || getSeasonMonthBadgeText(season) || "").trim();
}

function normalizeBackgroundImageSettings(settings = {}) {
  const normalized = getDefaultBackgroundImageSettings();
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return normalized;
  }

  const fallbackOption = getAdminBackgroundOptionByStoredRef(settings.fallbackBackgroundId || settings.backgroundId || "");
  const manualOption = getAdminBackgroundOptionByStoredRef(settings.manualBackgroundId || "");
  const finalDayOption = getAdminBackgroundOptionByStoredRef(settings.finalDayBackgroundId || "");
  normalized.fallbackBackgroundId = fallbackOption?.id || "";
  normalized.manualSeasonKey = String(settings.manualSeasonKey || "").trim();
  normalized.manualBackgroundId = manualOption?.id || "";
  normalized.finalDayBackgroundId = finalDayOption?.id || "";
  normalized.backgroundBrightness = normalizeBackgroundBrightnessPercent(settings.backgroundBrightness);
  normalized.automaticChampionAppliedSeasonKey = String(settings.automaticChampionAppliedSeasonKey || "").trim();
  normalized.automaticFinalDayAppliedKey = String(settings.automaticFinalDayAppliedKey || "").trim();

  const playerBackgrounds = settings.playerBackgrounds && typeof settings.playerBackgrounds === "object" && !Array.isArray(settings.playerBackgrounds)
    ? settings.playerBackgrounds
    : {};
  Object.entries(playerBackgrounds).forEach(([playerId, backgroundRef]) => {
    const normalizedPlayerId = String(playerId || "").trim();
    const option = getAdminBackgroundOptionByStoredRef(backgroundRef);
    if (normalizedPlayerId && option?.id) {
      normalized.playerBackgrounds[normalizedPlayerId] = option.id;
    }
  });

  return normalized;
}

function readLocalBackgroundImageSettings() {
  let settings = getDefaultBackgroundImageSettings();
  try {
    const raw = window.localStorage.getItem(BACKGROUND_IMAGE_SETTINGS_STORAGE_KEY);
    if (raw) {
      settings = normalizeBackgroundImageSettings(JSON.parse(raw));
    }
  } catch (_error) {
    settings = getDefaultBackgroundImageSettings();
  }

  if (!settings.fallbackBackgroundId) {
    try {
      const legacyUrl = window.localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY) || "";
      const legacyOption = getAdminBackgroundOptionByUrl(legacyUrl);
      if (legacyOption?.id) {
        settings.fallbackBackgroundId = legacyOption.id;
      }
    } catch (_error) {
      // Ignore legacy storage failures.
    }
  }

  return settings;
}

function writeLocalBackgroundImageSettings(settings = {}) {
  const normalized = normalizeBackgroundImageSettings(settings);
  try {
    window.localStorage.setItem(BACKGROUND_IMAGE_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    const fallbackOption = getAdminBackgroundOptionById(normalized.fallbackBackgroundId);
    if (fallbackOption?.url) {
      window.localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, fallbackOption.url);
    } else {
      window.localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
    }
  } catch (_error) {
    // Ignore storage failures and keep the selected background for this session.
  }
  return normalized;
}

function setBackgroundImageSettingsCache(settings = {}, { writeLocal = true } = {}) {
  const normalized = normalizeBackgroundImageSettings(settings);
  backgroundImageSettingsCache = normalized;
  applyBackgroundBrightness(normalized.backgroundBrightness);
  if (writeLocal) {
    writeLocalBackgroundImageSettings(normalized);
  }
  return normalized;
}

function readBackgroundImageSettings() {
  if (backgroundImageSettingsCache) {
    return normalizeBackgroundImageSettings(backgroundImageSettingsCache);
  }
  return setBackgroundImageSettingsCache(readLocalBackgroundImageSettings(), { writeLocal: false });
}

function isMissingSharedBackgroundSettingsError(error) {
  const message = getErrorMessage(error);
  return Boolean(
    error?.code === "PGRST202"
    || isMissingPublicTableError(error, "site_settings")
    || message.includes("get_site_background_settings")
    || message.includes("set_site_background_settings")
  );
}

async function loadSharedBackgroundImageSettings() {
  try {
    const { data, error } = await db.rpc("get_site_background_settings");
    if (error) throw error;
    return setBackgroundImageSettingsCache(data || {}, { writeLocal: true });
  } catch (error) {
    if (!isMissingSharedBackgroundSettingsError(error)) {
      console.warn("读取共享背景设置失败。", error);
    }
    return readBackgroundImageSettings();
  }
}

async function writeBackgroundImageSettings(settings = {}) {
  const normalized = normalizeBackgroundImageSettings(settings);
  const { data, error } = await db.rpc("set_site_background_settings", {
    p_settings: normalized,
  });
  if (error) throw error;
  return setBackgroundImageSettingsCache(data || normalized, { writeLocal: true });
}

async function updateBackgroundImageSettings(updater) {
  const current = readBackgroundImageSettings();
  const draft = typeof updater === "function" ? updater({ ...current, playerBackgrounds: { ...current.playerBackgrounds } }) : current;
  return writeBackgroundImageSettings(draft || current);
}

function formatCssImageUrl(url = "") {
  const safeUrl = String(url).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `url("${safeUrl}")`;
}

function applyBackgroundImageUrl(url = "") {
  const normalizedUrl = String(url || "").trim();
  document.documentElement.style.setProperty(
    "--app-bg-image",
    normalizedUrl ? formatCssImageUrl(normalizedUrl) : "none"
  );
  currentBackgroundImageUrl = normalizedUrl;
  currentBackgroundImageId = getAdminBackgroundOptionByUrl(normalizedUrl)?.id || "";
}

function applyBackgroundImageOption(option) {
  applyBackgroundImageUrl(option?.url || "");
  currentBackgroundImageId = option?.id || "";
}

function applyBackgroundBrightness(value = DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT) {
  currentBackgroundBrightness = normalizeBackgroundBrightnessPercent(value);
  document.documentElement.style.setProperty(
    "--app-bg-brightness",
    String(currentBackgroundBrightness / 100)
  );
}

function isLastFiveDaysOfMonth(dateText = getBeijingBusinessDateString()) {
  const match = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const lastDay = new Date(year, month, 0).getDate();
  return day >= Math.max(1, lastDay - 4) && day <= lastDay;
}

function hasPlayerBackgroundSettings(settings = readBackgroundImageSettings()) {
  return Object.keys(settings.playerBackgrounds || {}).length > 0;
}

function getPlayerBackgroundMappedOption(playerId = "", settings = readBackgroundImageSettings()) {
  const backgroundId = settings.playerBackgrounds?.[String(playerId || "").trim()] || "";
  return getAdminBackgroundOptionById(backgroundId);
}

function getPlayerIdByDisplayName(displayName = "") {
  const normalizedName = stripPlayerNameMeta(displayName).trim();
  if (!normalizedName) return "";
  const candidates = [
    ...(allPlayersDirectory || []),
    ...(seasonPlayers || []),
  ];
  const match = candidates.find((player) =>
    stripPlayerNameMeta(player?.display_name || "").trim() === normalizedName
  );
  return match?.id || "";
}

function getPreviousSeasonChampionCacheEntry() {
  if (!activeSeason?.id) return null;
  const previousSeason = getPreviousSeasonForLeaderboard();
  if (!previousSeason?.code) return null;

  const fixedEntry = FIXED_SEASON_CHAMPIONS.find((entry) => entry.seasonCode === previousSeason.code);
  if (fixedEntry?.championName) {
    return {
      seasonCode: fixedEntry.seasonCode,
      seasonName: previousSeason.name || fixedEntry.seasonCode,
      championName: fixedEntry.championName,
      playerId: getPlayerIdByDisplayName(fixedEntry.championName),
      source: "fixed",
    };
  }

  return normalizeCachedChampionEntry(previousSeason, readSeasonChampionCache()[previousSeason.code]);
}

function getChampionDedicatedBackgroundOption(settings = readBackgroundImageSettings()) {
  if (!hasPlayerBackgroundSettings(settings)) return null;
  const championEntry = getPreviousSeasonChampionCacheEntry();
  if (!championEntry?.championName && !championEntry?.playerId) return null;

  const mappedById = getPlayerBackgroundMappedOption(championEntry.playerId, settings);
  if (mappedById) return mappedById;

  const mappedByName = getPlayerBackgroundMappedOption(getPlayerIdByDisplayName(championEntry.championName), settings);
  return mappedByName || null;
}

function getFinalDayAutomaticBackgroundKey(dateText = getBeijingBusinessDateString()) {
  const monthMatch = String(dateText || "").match(/^(\d{4}-\d{2})-\d{2}$/);
  if (!monthMatch) return "";
  return `${getCurrentBackgroundSeasonKey() || "no-season"}:${monthMatch[1]}`;
}

function getPreferredBackgroundOption() {
  const settings = readBackgroundImageSettings();
  const finalDayOption = getAdminBackgroundOptionById(settings.finalDayBackgroundId);
  const finalDayAutomaticKey = getFinalDayAutomaticBackgroundKey();
  if (
    finalDayOption
    && finalDayAutomaticKey
    && isLastFiveDaysOfMonth()
    && settings.automaticFinalDayAppliedKey !== finalDayAutomaticKey
  ) {
    return { option: finalDayOption, source: "final_day" };
  }

  const currentSeasonKey = getCurrentBackgroundSeasonKey();
  const manualOption = getAdminBackgroundOptionById(settings.manualBackgroundId);
  if (manualOption && settings.manualSeasonKey && settings.manualSeasonKey === currentSeasonKey) {
    return { option: manualOption, source: "manual" };
  }

  const championOption = getChampionDedicatedBackgroundOption(settings);
  if (
    championOption
    && currentSeasonKey
    && settings.automaticChampionAppliedSeasonKey !== currentSeasonKey
  ) {
    return { option: championOption, source: "champion" };
  }

  const fallbackOption = getAdminBackgroundOptionById(settings.fallbackBackgroundId);
  if (fallbackOption) {
    return { option: fallbackOption, source: "fallback" };
  }

  return { option: null, source: "" };
}

function applyPreferredBackgroundImage() {
  const resolved = getPreferredBackgroundOption();
  if (!resolved.option) return null;
  applyBackgroundImageOption(resolved.option);
  return resolved.option;
}

let backgroundChampionLookupPromise = null;
let backgroundChampionLookupSeasonKey = "";

async function markAutomaticBackgroundApplied(resolved) {
  if (!resolved?.option || !["champion", "final_day"].includes(resolved.source)) return;

  const currentSeasonKey = getCurrentBackgroundSeasonKey();
  const nextSettings = {
    ...readBackgroundImageSettings(),
    manualSeasonKey: currentSeasonKey,
    manualBackgroundId: resolved.option.id,
  };
  if (resolved.source === "champion") {
    nextSettings.automaticChampionAppliedSeasonKey = currentSeasonKey;
  } else {
    nextSettings.automaticFinalDayAppliedKey = getFinalDayAutomaticBackgroundKey();
  }

  setBackgroundImageSettingsCache(nextSettings, { writeLocal: true });
  if (!isCurrentRoleAdmin()) return;

  try {
    await writeBackgroundImageSettings(nextSettings);
  } catch (error) {
    console.warn("保存一次性自动背景状态失败。", error);
  }
}

async function applyResolvedAutomaticBackground(resolved) {
  if (!resolved?.option) return null;
  applyBackgroundImageOption(resolved.option);
  await markAutomaticBackgroundApplied(resolved);
  return resolved.option;
}

async function resolvePreviousChampionForBackground() {
  if (!activeSeason?.id || !hasPlayerBackgroundSettings()) return null;
  const previousSeason = getPreviousSeasonForLeaderboard();
  if (!previousSeason?.id || !previousSeason?.code) return null;

  const cachedEntry = getPreviousSeasonChampionCacheEntry();
  if (cachedEntry?.playerId || cachedEntry?.championName) {
    return cachedEntry;
  }

  const rows = sortLeaderboardPlayers(await loadPrizeDistributionLeaderboardRows(previousSeason.id));
  const champion = rows[0] || null;
  if (!champion) return null;

  const entry = {
    seasonCode: previousSeason.code,
    seasonName: previousSeason.name || previousSeason.code,
    championName: stripPlayerNameMeta(champion.display_name || "未知选手") || "未知选手",
    playerId: champion.player_id || champion.id || "",
    score: Number.isFinite(Number(champion.score)) ? Number(champion.score) : null,
  };

  const cache = readSeasonChampionCache();
  cache[previousSeason.code] = {
    seasonId: previousSeason.id,
    seasonName: entry.seasonName,
    championName: entry.championName,
    playerId: entry.playerId,
    score: entry.score,
    cachedAt: Date.now(),
  };
  writeSeasonChampionCache(cache);
  return entry;
}

async function refreshAutomaticBackgroundImage({ allowChampionLookup = false } = {}) {
  const resolved = getPreferredBackgroundOption();
  await applyResolvedAutomaticBackground(resolved);
  if (
    !allowChampionLookup
    || (resolved.option && resolved.source !== "fallback")
    || isLastFiveDaysOfMonth()
    || !hasPlayerBackgroundSettings()
  ) {
    return resolved.option;
  }

  const lookupKey = getCurrentBackgroundSeasonKey();
  if (!lookupKey) return resolved.option;
  if (backgroundChampionLookupPromise && backgroundChampionLookupSeasonKey === lookupKey) {
    await backgroundChampionLookupPromise;
    return applyResolvedAutomaticBackground(getPreferredBackgroundOption());
  }

  backgroundChampionLookupSeasonKey = lookupKey;
  backgroundChampionLookupPromise = resolvePreviousChampionForBackground()
    .catch((error) => {
      console.warn("读取上一赛季冠军背景失败。", error);
      return null;
    })
    .finally(() => {
      backgroundChampionLookupPromise = null;
    });

  await backgroundChampionLookupPromise;
  return applyResolvedAutomaticBackground(getPreferredBackgroundOption());
}

async function applyFirstAvailableBackgroundImage() {
  const preferredOption = applyPreferredBackgroundImage();
  if (preferredOption?.url) {
    return preferredOption.url;
  }

  const firstOption = getAdminBackgroundOptionById(DEFAULT_BACKGROUND_IMAGE_ID) || ADMIN_BACKGROUND_IMAGE_OPTIONS[0] || null;
  if (firstOption?.url) {
    applyBackgroundImageOption(firstOption);
    return firstOption.url;
  }

  applyBackgroundImageUrl("");
  return null;
}

function applyStaticSiteCopy() {
  document.querySelectorAll("[data-copy]").forEach((node) => {
    node.textContent = copyText(node.dataset.copy, node.textContent || "");
  });
  document.querySelectorAll("[data-copy-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", copyText(node.dataset.copyPlaceholder, node.getAttribute("placeholder") || ""));
  });
  document.querySelectorAll("[data-copy-title]").forEach((node) => {
    node.setAttribute("title", copyText(node.dataset.copyTitle, node.getAttribute("title") || ""));
  });
  document.querySelectorAll("[data-copy-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", copyText(node.dataset.copyAriaLabel, node.getAttribute("aria-label") || ""));
  });
}

const TEAM_SIZE = 5;
const LOADING_SCREEN_MIN_MS = 250;
const DEFERRED_HOME_DATA_TIMEOUT_MS = 320;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCORE_DETAIL_RECENT_MATCH_DAY_COUNT = 3;
const HARDCORE_TAG_MIN_GAMES = 10;
const HARDCORE_TAG_LOVE_CAP_GAMES = 20;
const HARDCORE_TAG_WIN_RATE_MAX = 40;
const HARDCORE_TAG_QUANTILE = 0.35;
const HARDCORE_TAG_SHOW_THRESHOLD = 0.35;
const LEADERBOARD_COMPACT_STORAGE_KEY = "nd_dota_leaderboard_compact_v1";
const RECENT_MATCH_SEASON_OPEN_STORAGE_KEY = "nd_dota_recent_match_seasons_open_v1";
const SEASON_PLAYER_POWER_CACHE_STORAGE_KEY = "nd_dota_season_player_power_cache_v1";
const HOME_LEADERBOARD_CACHE_STORAGE_KEY = "nd_dota_home_leaderboard_cache_v1";
const HOME_PLAYER_DIRECTORY_CACHE_STORAGE_KEY = "nd_dota_home_player_directory_cache_v1";
const SEASON_CHAMPION_CACHE_STORAGE_KEY = "nd_dota_season_champions_v2";
const ADMIN_HISTORY_REPAIR_WINDOW_MS = 15 * 60 * 1000;
const LIFETIME_REWARD_TOTALS_STORAGE_KEY = "nd_dota_lifetime_reward_totals_v1";
const ACCESS_SESSION_STORAGE_KEY = "nd_dota_access_session_v2";
const ACCESS_UI_HIDDEN_STORAGE_KEY = "nd_dota_access_ui_hidden_v1";
const DEVICE_ID_STORAGE_KEY = "nd_dota_device_id_v1";
const MOBILE_LAYOUT_MEDIA_QUERY = "(max-width: 720px)";
const RECENT_MATCH_DRAG_THRESHOLD_PX = 12;
const RECENT_MATCH_SWAP_OVERLAP_RATIO = 0.72;
const RECENT_MATCH_SEASON_PAGE_SIZE = 1000;
const HOME_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const PLAYER_RELATION_MIN_GAMES_INPUT_MIN = 1;
const PLAYER_RELATION_MIN_GAMES_DEFAULT = 3;
const PLAYER_RELATION_ALL_SEASONS_MIN_GAMES_MAX = 18;
const PLAYER_RELATION_ALL_SEASONS_VALUE = "__all__";
const PLAYER_RELATION_LADDER_ZONE_LIMIT = 16;
const PLAYER_RELATION_LADDER_PORTRAIT_ZONE_LIMIT = 4;
const PLAYER_RELATION_LADDER_ZONE_ROWS = 4;
const PLAYER_RELATION_LADDER_ZONE_COLUMNS = 4;
const PLAYER_RELATION_LADDER_NODE_WIDTH_PX = 152;
const PLAYER_RELATION_LADDER_COLUMN_GAP_PX = 3;
const PLAYER_RELATION_LADDER_EDGE_GAP_PX = 16;
const CHAMPION_BASE_SEASON_CODE = "2026-03";
const FIXED_SEASON_CHAMPIONS = [
  { seasonCode: "2026-03", championName: "苏神" },
  { seasonCode: "2026-04", championName: "海参" },
];
const ACCESS_ROLE_LABELS = {
  admin: copyText("runtime.accessRoleLabels.admin", "管理员"),
  scorekeeper: copyText("runtime.accessRoleLabels.scorekeeper", "记分员"),
  scorer: copyText("runtime.accessRoleLabels.scorer", "记分员"),
};

const db = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

function isMobileViewport() {
  return window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches;
}

function getErrorMessage(error) {
  return String(error?.message || error?.details || error?.hint || "未知错误");
}

function isMissingPublicTableError(error, tableName = "") {
  const message = getErrorMessage(error);
  if (error?.code === "PGRST205") {
    return !tableName || message.includes(`public.${tableName}`);
  }
  return Boolean(
    tableName
    && (
      message.includes(`public.${tableName}`)
      || message.includes(`relation "${tableName}" does not exist`)
      || message.includes(`relation 'public.${tableName}' does not exist`)
    )
  );
}

function getLatestSchemaMigrationHint(error) {
  const message = getErrorMessage(error);
  if (
    message.includes("p_is_exhibition")
    || message.includes("record_match_result(p_dire_player_ids")
    || message.includes("record_match_result_backfill(p_dire_player_ids")
    || message.includes("update_match_result(p_dire_player_ids")
  ) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260506120000_exhibition_match_rules.sql。";
  }
  if (message.includes("set_season_match_point_rules")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501110000_power_adjusted_match_scoring.sql。";
  }
  if (message.includes("recalculate_season_scores")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501110000_power_adjusted_match_scoring.sql。";
  }
  if (message.includes("recalculate_all_scores")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501105000_recalculate_all_scores.sql。";
  }
  if (message.includes("reorder_matches_within_day")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501104000_reorder_matches_within_day.sql。";
  }
  if (message.includes("mark_exported_season_archived") || message.includes("is_season_match_record_editable")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260609120000_preserve_exported_season_archives.sql。";
  }
  if (
    message.includes("season_item_catalog_settings")
    || (message.includes("reward_donations") && (message.includes("season_id") || message.includes("source_key")))
  ) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501081000_normalize_item_purchase_rewards.sql。";
  }
  if (message.includes("reward_donations_category_check") || message.includes("signup_fee")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260508103000_add_signup_fee_reward_category.sql。";
  }
  if (message.includes("score_delta_special")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501122000_item_score_special_token_at.sql。";
  }
  if (message.includes("item_catalog_score_stacks") || message.includes("score_delta_multiplier")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501120000_item_score_multipliers_and_stacks.sql。";
  }
  if (message.includes("grant_player_item_inventory")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501113000_manual_item_inventory_actions.sql。";
  }
  if (message.includes("revoke_player_item_inventory") || message.includes("get_item_inventory_activity_log")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501150000_item_inventory_revoke_and_activity_log.sql。";
  }
  if (
    message.includes("重置效果只可用于本场胜方的积分变动")
    || message.includes("仅当胜负积分低于赛季初始分时")
    || message.includes("当前胜负积分已回到赛季初始分，无需使用重置效果道具")
  ) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260501135000_allow_reset_item_on_losing_side_noop.sql。";
  }
  if (message.includes("v_player_teammate_stats") || message.includes("v_player_opponent_stats")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260512103000_add_player_relationship_stats_views.sql。";
  }
  if (message.includes("season_participation_point_rules") || message.includes("set_season_participation_point_rules")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260531150000_update_participation_point_rule_syntax.sql。";
  }
  if (message.includes("win_loss_score") || message.includes("bonus_score")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260530180000_split_bonus_score_and_fractional_item_views.sql。";
  }
  if (
    message.includes("deactivate_player_quick")
    || message.includes("admin_list_inactive_players")
    || message.includes("admin_restore_player_quick")
    || message.includes("admin_delete_player_permanently")
  ) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260603120000_player_visibility_management.sql。";
  }
  if (message.includes("manual_score_adjustments") || message.includes("revoke_manual_score_adjustment")) {
    return "请先在 Supabase 执行最新 SQL，至少应用已修改过的 20260501000000_core_schema.sql 和 20260509110000_manual_score_anchor_to_match_day_tail.sql。";
  }
  if (message.includes("match_days") || message.includes("match_day_attendance_notes")) {
    return "请先在 Supabase 执行最新 SQL，至少应用 20260510121327_restore_match_day_attendance_tables.sql。";
  }
  return "";
}

function showBlockingAlert(message) {
  const text = String(message || "").trim();
  if (!text) return;
  showGlobalToast(text, true);
}

function buildMatchOperationFailureMessage(prefix, error) {
  const errorMessage = getErrorMessage(error);
  const migrationHint = getLatestSchemaMigrationHint(error);
  return `${prefix}：${errorMessage}${migrationHint ? `。${migrationHint}` : ""}`;
}

function reportMatchOperationFailure(target, message) {
  if (target === "backfill") {
    setBackfillMessage(message, true);
  } else {
    setMatchMessage(message, true);
  }
  setMessage(message, true);
  showBlockingAlert(message);
}

function readOpenRecentMatchSeasons() {
  try {
    const raw = window.localStorage.getItem(RECENT_MATCH_SEASON_OPEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch (_error) {
    return new Set();
  }
}

function writeOpenRecentMatchSeasons() {
  try {
    window.localStorage.setItem(
      RECENT_MATCH_SEASON_OPEN_STORAGE_KEY,
      JSON.stringify([...openRecentMatchSeasons].filter(Boolean))
    );
  } catch (_error) {
    // Ignore storage failures and fall back to in-memory state.
  }
}

function readSeasonPlayerPowerCache() {
  try {
    const raw = window.localStorage.getItem(SEASON_PLAYER_POWER_CACHE_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Map();
    return new Map(Object.entries(parsed));
  } catch (_error) {
    return new Map();
  }
}

function writeSeasonPlayerPowerCache() {
  try {
    const entries = [...seasonPlayerPowerCache.entries()].slice(-1200);
    window.localStorage.setItem(
      SEASON_PLAYER_POWER_CACHE_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch (_error) {
    // Ignore storage failures and keep the in-memory cache for this session.
  }
}

function readLocalJsonStorage(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function writeLocalJsonStorage(key, payload) {
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (_error) {
    // Ignore storage failures and keep the in-memory state for this session.
  }
}

function removeLocalStorageKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_error) {
    // Ignore storage failures and continue with the in-memory state.
  }
}

function isFreshHomeCacheSnapshot(snapshot, maxAgeMs = HOME_CACHE_MAX_AGE_MS) {
  const cachedAt = Number(snapshot?.cachedAt ?? 0);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt <= maxAgeMs;
}

const loadingScreen = document.getElementById("loadingScreen");
const globalToast = document.getElementById("globalToast");
const systemPromptModal = document.getElementById("systemPromptModal");
const systemPromptBackdrop = document.getElementById("systemPromptBackdrop");
const systemPromptTitle = document.getElementById("systemPromptTitle");
const systemPromptBody = document.getElementById("systemPromptBody");
const systemPromptInputWrap = document.getElementById("systemPromptInputWrap");
const systemPromptInputLabel = document.getElementById("systemPromptInputLabel");
const systemPromptInput = document.getElementById("systemPromptInput");
const systemPromptCancelBtn = document.getElementById("systemPromptCancelBtn");
const systemPromptConfirmBtn = document.getElementById("systemPromptConfirmBtn");
const lastUpdatedText = document.getElementById("lastUpdatedText");
const brandMonthBadge = document.getElementById("brandMonthBadge");
const leaderboardSeasonSelect = document.getElementById("leaderboardSeasonSelect");
const loadingBrandMonth = document.getElementById("loadingBrandMonth");
const homeStealthToggle = document.getElementById("homeStealthToggle");
const signupPlayerGrid = document.getElementById("signupPlayerGrid");
const signupEmpty = document.getElementById("signupEmpty");
const messageEl = document.getElementById("message");
const openAuthModalBtn = document.getElementById("openAuthModalBtn");
const signOutBtn = document.getElementById("signOutBtn");
const seasonToggleBtn = document.getElementById("seasonToggleBtn");
const adminSecretTrigger = null;
const adminLogoTrigger = null;
const scorerModeBtn = document.getElementById("scorerModeBtn");
const adminModeBtn = document.getElementById("adminModeBtn");
const scorerPanel = document.getElementById("scorerPanel");
const adminPanel = document.getElementById("adminPanel");
const closeScorerPanelBtn = document.getElementById("closeScorerPanelBtn");
const closeAdminPanelBtn = document.getElementById("closeAdminPanelBtn");
const scorerExitModeBtn = document.getElementById("scorerExitModeBtn");
const adminExitModeBtn = document.getElementById("adminExitModeBtn");
const scorerPanelSummary = document.getElementById("scorerPanelSummary");
const adminPanelSummary = document.getElementById("adminPanelSummary");
const adminHistoryRepairToggleBtn = document.getElementById("adminHistoryRepairToggleBtn");
const adminHistoryRepairControls = document.getElementById("adminHistoryRepairControls");
const adminHistoryRepairSeasonSelect = document.getElementById("adminHistoryRepairSeasonSelect");
const adminHistoryRepairReasonInput = document.getElementById("adminHistoryRepairReasonInput");
const adminStartHistoryRepairBtn = document.getElementById("adminStartHistoryRepairBtn");
const adminStopHistoryRepairBtn = document.getElementById("adminStopHistoryRepairBtn");
const adminHistoryRepairStatus = document.getElementById("adminHistoryRepairStatus");
const scorerMembersCount = document.getElementById("scorerMembersCount");
const scorerMembersList = document.getElementById("scorerMembersList");
const scorerOpenManualScoreBtn = document.getElementById("scorerOpenManualScoreBtn");
const scorerRecalculateScoresBtn = document.getElementById("scorerRecalculateScoresBtn");
const scorerClearQueueBtn = document.getElementById("scorerClearQueueBtn");
const scorerSeasonInitialScoreInput = document.getElementById("scorerSeasonInitialScoreInput");
const scorerSaveSeasonInitialScoreBtn = document.getElementById("scorerSaveSeasonInitialScoreBtn");
const scorerSeasonWinPointsInput = document.getElementById("scorerSeasonWinPointsInput");
const scorerSeasonLossPointsInput = document.getElementById("scorerSeasonLossPointsInput");
const scorerSeasonPowerGapStepInput = document.getElementById("scorerSeasonPowerGapStepInput");
const scorerSeasonPowerGapDeltaInput = document.getElementById("scorerSeasonPowerGapDeltaInput");
const scorerSaveSeasonMatchPointsBtn = document.getElementById("scorerSaveSeasonMatchPointsBtn");
const scorerSeasonExhibitionWinPointsInput = document.getElementById("scorerSeasonExhibitionWinPointsInput");
const scorerSeasonExhibitionLossPointsInput = document.getElementById("scorerSeasonExhibitionLossPointsInput");
const scorerSeasonExhibitionPowerGapStepInput = document.getElementById("scorerSeasonExhibitionPowerGapStepInput");
const scorerSeasonExhibitionPowerGapDeltaInput = document.getElementById("scorerSeasonExhibitionPowerGapDeltaInput");
const scorerSaveSeasonExhibitionMatchPointsBtn = document.getElementById("scorerSaveSeasonExhibitionMatchPointsBtn");
const scorerFullSignOutBtn = document.getElementById("scorerFullSignOutBtn");
const scorerManualScoreModal = document.getElementById("scorerManualScoreModal");
const scorerManualScoreBackdrop = document.getElementById("scorerManualScoreBackdrop");
const closeScorerManualScoreBtn = document.getElementById("closeScorerManualScoreBtn");
const scorerManualScoreChips = document.getElementById("scorerManualScoreChips");
const scorerManualScoreAmountInput = document.getElementById("scorerManualScoreAmountInput");
const scorerManualScoreNoteInput = document.getElementById("scorerManualScoreNoteInput");
const scorerManualScoreHint = document.getElementById("scorerManualScoreHint");
const scorerManualScoreMessage = document.getElementById("scorerManualScoreMessage");
const scorerManualScoreHistoryList = document.getElementById("scorerManualScoreHistoryList");
const scorerManualScoreHistoryEmpty = document.getElementById("scorerManualScoreHistoryEmpty");
const scorerDeathFingerBtn = document.getElementById("scorerDeathFingerBtn");
const scorerHealingHandBtn = document.getElementById("scorerHealingHandBtn");
const adminOpenManualScoreBtn = document.getElementById("adminOpenManualScoreBtn");
const adminManualScoreModal = document.getElementById("adminManualScoreModal");
const adminManualScoreBackdrop = document.getElementById("adminManualScoreBackdrop");
const closeAdminManualScoreBtn = document.getElementById("closeAdminManualScoreBtn");
const adminManualScoreChips = document.getElementById("adminManualScoreChips");
const adminManualScoreAmountInput = document.getElementById("adminManualScoreAmountInput");
const adminManualScoreNoteInput = document.getElementById("adminManualScoreNoteInput");
const adminManualScoreHint = document.getElementById("adminManualScoreHint");
const adminManualScoreMessage = document.getElementById("adminManualScoreMessage");
const adminManualScoreHistoryList = document.getElementById("adminManualScoreHistoryList");
const adminManualScoreHistoryEmpty = document.getElementById("adminManualScoreHistoryEmpty");
const adminDeathFingerBtn = document.getElementById("adminDeathFingerBtn");
const adminHealingHandBtn = document.getElementById("adminHealingHandBtn");
const scorerActionLogsList = document.getElementById("scorerActionLogsList");
const scorerActionLogsEmpty = document.getElementById("scorerActionLogsEmpty");
const adminActionLogsList = document.getElementById("adminActionLogsList");
const adminActionLogsEmpty = document.getElementById("adminActionLogsEmpty");
const adminAddScorerSelect = document.getElementById("adminAddScorerSelect");
const adminAddScorerBtn = document.getElementById("adminAddScorerBtn");
const adminIdentityEmailSelect = document.getElementById("adminIdentityEmailSelect");
const adminIdentityEmailOptions = document.getElementById("adminIdentityEmailOptions");
const adminIdentityUsernameInput = document.getElementById("adminIdentityUsernameInput");
const adminSaveIdentityBtn = document.getElementById("adminSaveIdentityBtn");
const scorerOpenSeasonRulesBtn = document.getElementById("scorerOpenSeasonRulesBtn");
const scorerOpenPowerManagementBtn = document.getElementById("scorerOpenPowerManagementBtn");
const scorerOpenPlayerManagementBtn = document.getElementById("scorerOpenPlayerManagementBtn");
const scorerOpenLogsBtn = document.getElementById("scorerOpenLogsBtn");
const scorerOpenItemHistoryBtn = document.getElementById("scorerOpenItemHistoryBtn");
const scorerQuickAddPlayerInput = document.getElementById("scorerQuickAddPlayerInput");
const scorerQuickAddPlayerBtn = document.getElementById("scorerQuickAddPlayerBtn");
const scorerRenamePlayerChips = document.getElementById("scorerRenamePlayerChips");
const scorerRenamePlayerInput = document.getElementById("scorerRenamePlayerInput");
const scorerRenamePlayerBtn = document.getElementById("scorerRenamePlayerBtn");
const scorerDeactivatePlayerBtn = document.getElementById("scorerDeactivatePlayerBtn");
const scorerItemNameInput = document.getElementById("scorerItemNameInput");
const scorerItemDonationInput = document.getElementById("scorerItemDonationInput");
const scorerItemMatchIconSelect = document.getElementById("scorerItemMatchIconSelect");
const scorerItemMatchTargets = document.getElementById("scorerItemMatchTargets");
const scorerItemResolutionModeSelect = document.getElementById("scorerItemResolutionModeSelect");
const scorerItemScoreMultiplierInput = document.getElementById("scorerItemScoreMultiplierInput");
const scorerItemStackTargets = document.getElementById("scorerItemStackTargets");
const scorerItemStackMultiplierList = document.getElementById("scorerItemStackMultiplierList");
const scorerItemInitialQuantityInput = document.getElementById("scorerItemInitialQuantityInput");
const scorerSaveItemBtn = document.getElementById("scorerSaveItemBtn");
const scorerResetItemBtn = document.getElementById("scorerResetItemBtn");
const scorerItemCatalogToggleBtn = document.getElementById("scorerItemCatalogToggleBtn");
const scorerItemCatalogEditorPanel = document.getElementById("scorerItemCatalogEditorPanel");
const scorerItemCatalogList = document.getElementById("scorerItemCatalogList");
const adminOpenSeasonRulesBtn = document.getElementById("adminOpenSeasonRulesBtn");
const adminOpenPowerManagementBtn = document.getElementById("adminOpenPowerManagementBtn");
const adminOpenPlayerManagementBtn = document.getElementById("adminOpenPlayerManagementBtn");
const adminOpenLogsBtn = document.getElementById("adminOpenLogsBtn");
const adminOpenItemHistoryBtn = document.getElementById("adminOpenItemHistoryBtn");
const adminQuickAddPlayerInput = document.getElementById("adminQuickAddPlayerInput");
const adminQuickAddPlayerBtn = document.getElementById("adminQuickAddPlayerBtn");
const adminRenamePlayerChips = document.getElementById("adminRenamePlayerChips");
const adminRenamePlayerInput = document.getElementById("adminRenamePlayerInput");
const adminRenamePlayerBtn = document.getElementById("adminRenamePlayerBtn");
const adminDeactivatePlayerBtn = document.getElementById("adminDeactivatePlayerBtn");
const adminInactivePlayersBlock = document.getElementById("adminInactivePlayersBlock");
const adminInactivePlayerChips = document.getElementById("adminInactivePlayerChips");
const adminRestorePlayerBtn = document.getElementById("adminRestorePlayerBtn");
const adminHardDeletePlayerBtn = document.getElementById("adminHardDeletePlayerBtn");
const adminItemNameInput = document.getElementById("adminItemNameInput");
const adminItemDonationInput = document.getElementById("adminItemDonationInput");
const adminItemMatchIconSelect = document.getElementById("adminItemMatchIconSelect");
const adminItemMatchTargets = document.getElementById("adminItemMatchTargets");
const adminItemResolutionModeSelect = document.getElementById("adminItemResolutionModeSelect");
const adminItemScoreMultiplierInput = document.getElementById("adminItemScoreMultiplierInput");
const adminItemStackTargets = document.getElementById("adminItemStackTargets");
const adminItemStackMultiplierList = document.getElementById("adminItemStackMultiplierList");
const adminItemInitialQuantityInput = document.getElementById("adminItemInitialQuantityInput");
const adminSaveItemBtn = document.getElementById("adminSaveItemBtn");
const adminResetItemBtn = document.getElementById("adminResetItemBtn");
const adminItemCatalogToggleBtn = document.getElementById("adminItemCatalogToggleBtn");
const adminItemCatalogEditorPanel = document.getElementById("adminItemCatalogEditorPanel");
const adminItemCatalogList = document.getElementById("adminItemCatalogList");
const scorerPanelMessage = document.getElementById("scorerPanelMessage");
const adminPanelMessage = document.getElementById("adminPanelMessage");
const adminClearQueueBtn = document.getElementById("adminClearQueueBtn");
const adminClearTodayPlayersBtn = document.getElementById("adminClearTodayPlayersBtn");
const adminResetSeasonRow = document.getElementById("adminResetSeasonRow");
const adminResetSeasonBtn = document.getElementById("adminResetSeasonBtn");
const adminExportSeasonRow = document.getElementById("adminExportSeasonRow") || document.getElementById("adminResetSeasonRow");
const adminExportSeasonSelect = document.getElementById("adminExportSeasonSelect");
const adminExportSeasonBtn = document.getElementById("adminExportSeasonBtn");
const adminExportSeasonModal = document.getElementById("adminExportSeasonModal");
const adminExportSeasonBackdrop = document.getElementById("adminExportSeasonBackdrop");
const closeAdminExportSeasonBtn = document.getElementById("closeAdminExportSeasonBtn");
const adminConfirmExportSeasonBtn = document.getElementById("adminConfirmExportSeasonBtn");
const adminExportSeasonMessage = document.getElementById("adminExportSeasonMessage");
const adminPrizeDistributionBtn = document.getElementById("adminPrizeDistributionBtn");
const adminPrizeDistributionModal = document.getElementById("adminPrizeDistributionModal");
const adminPrizeDistributionBackdrop = document.getElementById("adminPrizeDistributionBackdrop");
const closeAdminPrizeDistributionBtn = document.getElementById("closeAdminPrizeDistributionBtn");
const adminPrizeDistributionSeedInput = document.getElementById("adminPrizeDistributionSeedInput");
const adminRunPrizeDistributionBtn = document.getElementById("adminRunPrizeDistributionBtn");
const adminCopyPrizeDistributionBtn = document.getElementById("adminCopyPrizeDistributionBtn");
const adminPrizeDistributionMessage = document.getElementById("adminPrizeDistributionMessage");
const adminPrizeDistributionResult = document.getElementById("adminPrizeDistributionResult");
const adminParticipationRulesBtn = document.getElementById("adminParticipationRulesBtn");
const adminParticipationRulesModal = document.getElementById("adminParticipationRulesModal");
const adminParticipationRulesBackdrop = document.getElementById("adminParticipationRulesBackdrop");
const closeAdminParticipationRulesBtn = document.getElementById("closeAdminParticipationRulesBtn");
const adminParticipationRulesSeasonLabel = document.getElementById("adminParticipationRulesSeasonLabel");
const adminParticipationRulesInput = document.getElementById("adminParticipationRulesInput");
const adminSaveParticipationRulesBtn = document.getElementById("adminSaveParticipationRulesBtn");
const adminParticipationRulesMessage = document.getElementById("adminParticipationRulesMessage");
const adminBackgroundPickerBtn = document.getElementById("adminBackgroundPickerBtn");
const adminBackgroundPickerModal = document.getElementById("adminBackgroundPickerModal");
const adminBackgroundPickerBackdrop = document.getElementById("adminBackgroundPickerBackdrop");
const closeAdminBackgroundPickerBtn = document.getElementById("closeAdminBackgroundPickerBtn");
const adminBackgroundOptions = document.getElementById("adminBackgroundOptions");
const adminBackgroundPreviewImage = document.getElementById("adminBackgroundPreviewImage");
const adminBackgroundBrightnessInput = document.getElementById("adminBackgroundBrightnessInput");
const adminBackgroundBrightnessValue = document.getElementById("adminBackgroundBrightnessValue");
const adminApplyBackgroundBtn = document.getElementById("adminApplyBackgroundBtn");
const adminSetFinalDayBackgroundBtn = document.getElementById("adminSetFinalDayBackgroundBtn");
const adminPlayerBackgroundSettingsBtn = document.getElementById("adminPlayerBackgroundSettingsBtn");
const adminBackgroundUploadInput = document.getElementById("adminBackgroundUploadInput");
const adminPlayerBackgroundSettings = document.getElementById("adminPlayerBackgroundSettings");
const adminPlayerBackgroundPlayerSelect = document.getElementById("adminPlayerBackgroundPlayerSelect");
const adminSavePlayerBackgroundBtn = document.getElementById("adminSavePlayerBackgroundBtn");
const adminClearPlayerBackgroundBtn = document.getElementById("adminClearPlayerBackgroundBtn");
const adminPlayerBackgroundList = document.getElementById("adminPlayerBackgroundList");
const adminBackgroundPickerMessage = document.getElementById("adminBackgroundPickerMessage");
const adminRecalculateScoresBtn = document.getElementById("adminRecalculateScoresBtn");
const adminClearScorerRememberBtn = document.getElementById("adminClearScorerRememberBtn");
const adminSeasonInitialScoreInput = document.getElementById("adminSeasonInitialScoreInput");
const adminSaveSeasonInitialScoreBtn = document.getElementById("adminSaveSeasonInitialScoreBtn");
const adminSeasonWinPointsInput = document.getElementById("adminSeasonWinPointsInput");
const adminSeasonLossPointsInput = document.getElementById("adminSeasonLossPointsInput");
const adminSeasonPowerGapStepInput = document.getElementById("adminSeasonPowerGapStepInput");
const adminSeasonPowerGapDeltaInput = document.getElementById("adminSeasonPowerGapDeltaInput");
const adminSaveSeasonMatchPointsBtn = document.getElementById("adminSaveSeasonMatchPointsBtn");
const adminSeasonExhibitionWinPointsInput = document.getElementById("adminSeasonExhibitionWinPointsInput");
const adminSeasonExhibitionLossPointsInput = document.getElementById("adminSeasonExhibitionLossPointsInput");
const adminSeasonExhibitionPowerGapStepInput = document.getElementById("adminSeasonExhibitionPowerGapStepInput");
const adminSeasonExhibitionPowerGapDeltaInput = document.getElementById("adminSeasonExhibitionPowerGapDeltaInput");
const adminSaveSeasonExhibitionMatchPointsBtn = document.getElementById("adminSaveSeasonExhibitionMatchPointsBtn");
const adminFullSignOutBtn = document.getElementById("adminFullSignOutBtn");
const adminSaveRankLabelsBtn = document.getElementById("adminSaveRankLabelsBtn");
const seasonPlayersPanel = document.getElementById("seasonPlayersPanel");
const seasonPanelTitle = document.getElementById("seasonPanelTitle");
const seasonPlayersCount = document.getElementById("seasonPlayersCount");
const seasonPlayersList = document.getElementById("seasonPlayersList");
const seasonPlayersEmpty = document.getElementById("seasonPlayersEmpty");
const scorerRankLabelEditors = document.getElementById("scorerRankLabelEditors");
const scorerSaveRankLabelsBtn = document.getElementById("scorerSaveRankLabelsBtn");
const adminRankLabelEditors = document.getElementById("adminRankLabelEditors");
const seasonRewardTotal = document.getElementById("seasonRewardTotal");
const rewardPanel = document.getElementById("rewardPanel");
const closeRewardPanelBtn = document.getElementById("closeRewardPanelBtn");
const rewardEntryShell = rewardPanel?.querySelector(".reward-entry-shell") || null;
const rewardPlayerPicker = document.getElementById("rewardPlayerPicker");
const rewardExtraInput = document.getElementById("rewardExtraInput");
const addRewardBtn = document.getElementById("addRewardBtn");
const rewardMinimumHint = document.getElementById("rewardMinimumHint");
const rewardMessageEl = document.getElementById("rewardMessage");
const rewardLogsList = document.getElementById("rewardLogsList");
const rewardLogsEmpty = document.getElementById("rewardLogsEmpty");
const resetSeasonBtn = document.getElementById("resetSeasonBtn");
const startMatchDayBtn = document.getElementById("startMatchDayBtn");
const matchStartTimeInput = document.getElementById("matchStartTimeInput");
const matchDayStatus = document.getElementById("matchDayStatus");
const matchStartTimeDisplay = document.getElementById("matchStartTimeDisplay");
const matchDayInfo = document.getElementById("matchDayInfo");
const signupAllBtn = document.getElementById("signupAllBtn");
const confirmQueueBtn = document.getElementById("confirmQueueBtn");
const clearQueueBtn = document.getElementById("clearQueueBtn");
const queueList = document.getElementById("queueList");
const queueEmpty = document.getElementById("queueEmpty");
const todayPlayersSection = document.getElementById("todayPlayersSection");
const todayPlayersList = document.getElementById("todayPlayersList");
const todayPlayersEmpty = document.getElementById("todayPlayersEmpty");
const todayPlayersCount = document.getElementById("todayPlayersCount");
const matchDaySection = document.getElementById("matchDaySection");
const leaderboardCard = document.getElementById("leaderboardCard");
const recentMatchesSection = document.getElementById("recentMatchesSection");
const leaderboardCompactBtn = document.getElementById("leaderboardCompactBtn");
const leaderboardPowerViewBtn = document.getElementById("leaderboardPowerViewBtn");
const leaderboardParticipationViewBtn = document.getElementById("leaderboardParticipationViewBtn");
const leaderboardChampionsBtn = document.getElementById("leaderboardChampionsBtn");
const leaderboardLifetimeRewardsBtn = document.getElementById("leaderboardLifetimeRewardsBtn");
const leaderboardCopyBtn = document.getElementById("leaderboardCopyBtn");
const leaderboardScoreSortBtn = document.getElementById("leaderboardScoreSortBtn");
const leaderboardBody = document.getElementById("leaderboardBody");
const leaderboardPowerViewModal = document.getElementById("leaderboardPowerViewModal");
const leaderboardParticipationViewModal = document.getElementById("leaderboardParticipationViewModal");
const leaderboardChampionsModal = document.getElementById("leaderboardChampionsModal");
const leaderboardLifetimeRewardsModal = document.getElementById("leaderboardLifetimeRewardsModal");
const leaderboardPowerViewBackdrop = document.getElementById("leaderboardPowerViewBackdrop");
const leaderboardParticipationViewBackdrop = document.getElementById("leaderboardParticipationViewBackdrop");
const leaderboardChampionsBackdrop = document.getElementById("leaderboardChampionsBackdrop");
const leaderboardLifetimeRewardsBackdrop = document.getElementById("leaderboardLifetimeRewardsBackdrop");
const closeLeaderboardPowerViewBtn = document.getElementById("closeLeaderboardPowerViewBtn");
const closeLeaderboardParticipationViewBtn = document.getElementById("closeLeaderboardParticipationViewBtn");
const closeLeaderboardChampionsBtn = document.getElementById("closeLeaderboardChampionsBtn");
const closeLeaderboardLifetimeRewardsBtn = document.getElementById("closeLeaderboardLifetimeRewardsBtn");
const leaderboardPowerViewCount = document.getElementById("leaderboardPowerViewCount");
const leaderboardPowerViewList = document.getElementById("leaderboardPowerViewList");
const leaderboardPowerViewEmpty = document.getElementById("leaderboardPowerViewEmpty");
const leaderboardParticipationViewCount = document.getElementById("leaderboardParticipationViewCount");
const leaderboardParticipationViewList = document.getElementById("leaderboardParticipationViewList");
const leaderboardParticipationViewEmpty = document.getElementById("leaderboardParticipationViewEmpty");
const leaderboardChampionsStatus = document.getElementById("leaderboardChampionsStatus");
const leaderboardChampionsList = document.getElementById("leaderboardChampionsList");
const leaderboardChampionsEmpty = document.getElementById("leaderboardChampionsEmpty");
const leaderboardLifetimeRewardsList = document.getElementById("leaderboardLifetimeRewardsList");
const leaderboardLifetimeRewardsEmpty = document.getElementById("leaderboardLifetimeRewardsEmpty");
const playerRelationModal = document.getElementById("playerRelationModal");
const playerRelationBackdrop = document.getElementById("playerRelationBackdrop");
const closePlayerRelationBtn = document.getElementById("closePlayerRelationBtn");
const playerRelationViewToggleBtn = document.getElementById("playerRelationViewToggleBtn");
const playerRelationSeasonSelect = document.getElementById("playerRelationSeasonSelect");
const playerRelationMinGamesInput = document.getElementById("playerRelationMinGamesInput");
const playerRelationPlayerChips = document.getElementById("playerRelationPlayerChips");
const playerRelationOverviewSection = document.getElementById("playerRelationOverviewSection");
const playerRelationSummary = document.getElementById("playerRelationSummary");
const playerRelationTeammateMeta = document.getElementById("playerRelationTeammateMeta");
const playerRelationOpponentMeta = document.getElementById("playerRelationOpponentMeta");
const playerRelationTeammateChart = document.getElementById("playerRelationTeammateChart");
const playerRelationOpponentChart = document.getElementById("playerRelationOpponentChart");
const playerRelationTablePanel = document.getElementById("playerRelationTablePanel");
const playerRelationTableBody = document.getElementById("playerRelationTableBody");
const playerRelationTableHint = document.getElementById("playerRelationTableHint");
const playerRelationMessage = document.getElementById("playerRelationMessage");
const openMatchFormBtn = document.getElementById("openMatchFormBtn");
const scorerFinishTodayMatchDayBtn = document.getElementById("scorerFinishTodayMatchDayBtn");
const adminFinishTodayMatchDayBtn = document.getElementById("adminFinishTodayMatchDayBtn");
const finishTodayMatchDayButtons = [
  scorerFinishTodayMatchDayBtn,
  adminFinishTodayMatchDayBtn,
].filter(Boolean);
const openBackfillFormBtn = document.getElementById("openBackfillFormBtn");
const closeMatchFormBtn = document.getElementById("closeMatchFormBtn");
const closeBackfillFormBtn = document.getElementById("closeBackfillFormBtn");
const matchFormPanel = document.getElementById("matchFormPanel");
const backfillFormPanel = document.getElementById("backfillFormPanel");
const matchMessageEl = document.getElementById("matchMessage");
const backfillMessageEl = document.getElementById("backfillMessage");
const teamAFields = document.getElementById("teamAFields");
const teamBFields = document.getElementById("teamBFields");
const backfillTeamAFields = document.getElementById("backfillTeamAFields");
const backfillTeamBFields = document.getElementById("backfillTeamBFields");
const matchTeamADoubleSlot = document.getElementById("matchTeamADoubleSlot");
const matchTeamBDoubleSlot = document.getElementById("matchTeamBDoubleSlot");
const backfillTeamADoubleSlot = document.getElementById("backfillTeamADoubleSlot");
const backfillTeamBDoubleSlot = document.getElementById("backfillTeamBDoubleSlot");
const winnerSelect = document.getElementById("winnerSelect");
const backfillWinnerSelect = document.getElementById("backfillWinnerSelect");
const winnerToggleHint = document.getElementById("winnerToggleHint");
const backfillWinnerToggleHint = document.getElementById("backfillWinnerToggleHint");
const matchExhibitionToggleBtn = document.getElementById("matchExhibitionToggleBtn");
const backfillExhibitionToggleBtn = document.getElementById("backfillExhibitionToggleBtn");
const matchNoteInput = document.getElementById("matchNote");
const matchDoublePanel = document.getElementById("matchDoublePanel");
const backfillSeasonSelect = document.getElementById("backfillSeasonSelect");
const backfillDateShell = document.getElementById("backfillDateShell");
const backfillDateInput = document.getElementById("backfillDateInput");
const backfillMatchNoteInput = document.getElementById("backfillMatchNote");
const backfillDoublePanel = document.getElementById("backfillDoublePanel");
const recordMatchBtn = document.getElementById("recordMatchBtn");
const recordBackfillBtn = document.getElementById("recordBackfillBtn");
const recentMatchesList = document.getElementById("recentMatchesList");
const recentMatchesEmpty = document.getElementById("recentMatchesEmpty");
const heroPickerModal = document.getElementById("heroPickerModal");
const heroPickerBackdrop = document.getElementById("heroPickerBackdrop");
const closeHeroPickerBtn = document.getElementById("closeHeroPickerBtn");
const heroPickerTitle = document.getElementById("heroPickerTitle");
const heroPickerSubtitle = document.getElementById("heroPickerSubtitle");
const heroSearchInput = document.getElementById("heroSearchInput");
const heroSearchSuggestions = document.getElementById("heroSearchSuggestions");
const heroSelect = document.getElementById("heroSelect");
const saveHeroBtn = document.getElementById("saveHeroBtn");
const clearHeroBtn = document.getElementById("clearHeroBtn");
const heroPickerMessage = document.getElementById("heroPickerMessage");
const accessModal = document.getElementById("accessModal");
const accessModalBackdrop = document.getElementById("accessModalBackdrop");
const closeAccessModalBtn = document.getElementById("closeAccessModalBtn");
const accessModalTitle = document.getElementById("accessModalTitle");
const accessModalHint = document.getElementById("accessModalHint");
const accessScorerPickerTitle = document.getElementById("accessScorerPickerTitle");
const accessScorerPickerHint = document.getElementById("accessScorerPickerHint");
const accessPasswordInput = null;
const authUsernameInput = document.getElementById("authUsernameInput");
const authPasswordInput = document.getElementById("authPasswordInput");
const accessScorerPicker = document.getElementById("accessScorerPicker");
const accessScorerSelect = document.getElementById("accessScorerSelect");
const accessScorerChips = document.getElementById("accessScorerChips");
const confirmAccessBtn = document.getElementById("confirmAccessBtn");
const accessMessage = document.getElementById("accessMessage");
const scoreDetailModal = document.getElementById("scoreDetailModal");
const scoreDetailBackdrop = document.getElementById("scoreDetailBackdrop");
const closeScoreDetailBtn = document.getElementById("closeScoreDetailBtn");
const scoreDetailTitle = document.getElementById("scoreDetailTitle");
const scoreDetailSubtitle = document.getElementById("scoreDetailSubtitle");
const scoreDetailSummary = document.getElementById("scoreDetailSummary");
const scoreDetailList = document.getElementById("scoreDetailList");
const scoreDetailMessage = document.getElementById("scoreDetailMessage");
const scorerSeasonRuleModal = document.getElementById("scorerSeasonRuleModal");
const scorerSeasonRuleBackdrop = document.getElementById("scorerSeasonRuleBackdrop");
const closeScorerSeasonRuleBtn = document.getElementById("closeScorerSeasonRuleBtn");
const adminSeasonRuleModal = document.getElementById("adminSeasonRuleModal");
const adminSeasonRuleBackdrop = document.getElementById("adminSeasonRuleBackdrop");
const closeAdminSeasonRuleBtn = document.getElementById("closeAdminSeasonRuleBtn");
const scorerPowerModal = document.getElementById("scorerPowerModal");
const scorerPowerBackdrop = document.getElementById("scorerPowerBackdrop");
const closeScorerPowerBtn = document.getElementById("closeScorerPowerBtn");
const adminPowerModal = document.getElementById("adminPowerModal");
const adminPowerBackdrop = document.getElementById("adminPowerBackdrop");
const closeAdminPowerBtn = document.getElementById("closeAdminPowerBtn");
const scorerPlayerManagementModal = document.getElementById("scorerPlayerManagementModal");
const scorerPlayerManagementBackdrop = document.getElementById("scorerPlayerManagementBackdrop");
const closeScorerPlayerManagementBtn = document.getElementById("closeScorerPlayerManagementBtn");
const adminPlayerManagementModal = document.getElementById("adminPlayerManagementModal");
const adminPlayerManagementBackdrop = document.getElementById("adminPlayerManagementBackdrop");
const closeAdminPlayerManagementBtn = document.getElementById("closeAdminPlayerManagementBtn");
const scorerItemCatalogModal = document.getElementById("scorerItemCatalogModal");
const scorerItemCatalogBackdrop = document.getElementById("scorerItemCatalogBackdrop");
const closeScorerItemCatalogBtn = document.getElementById("closeScorerItemCatalogBtn");
const scorerItemCatalogTitle = document.getElementById("scorerItemCatalogTitle");
const adminItemCatalogModal = document.getElementById("adminItemCatalogModal");
const adminItemCatalogBackdrop = document.getElementById("adminItemCatalogBackdrop");
const closeAdminItemCatalogBtn = document.getElementById("closeAdminItemCatalogBtn");
const adminItemCatalogTitle = document.getElementById("adminItemCatalogTitle");
const scorerActionLogsModal = document.getElementById("scorerActionLogsModal");
const scorerActionLogsBackdrop = document.getElementById("scorerActionLogsBackdrop");
const closeScorerActionLogsBtn = document.getElementById("closeScorerActionLogsBtn");
const adminActionLogsModal = document.getElementById("adminActionLogsModal");
const adminActionLogsBackdrop = document.getElementById("adminActionLogsBackdrop");
const closeAdminActionLogsBtn = document.getElementById("closeAdminActionLogsBtn");
const itemInventoryLogsModal = document.getElementById("itemInventoryLogsModal");
const itemInventoryLogsBackdrop = document.getElementById("itemInventoryLogsBackdrop");
const closeItemInventoryLogsBtn = document.getElementById("closeItemInventoryLogsBtn");
const itemInventoryLogsTitle = document.getElementById("itemInventoryLogsTitle");
const itemInventoryLogsList = document.getElementById("itemInventoryLogsList");
const itemInventoryLogsEmpty = document.getElementById("itemInventoryLogsEmpty");
const deleteMatchConfirmModal = document.getElementById("deleteMatchConfirmModal");
const deleteMatchConfirmBackdrop = document.getElementById("deleteMatchConfirmBackdrop");
const cancelDeleteMatchBtn = document.getElementById("cancelDeleteMatchBtn");
const confirmDeleteMatchBtn = document.getElementById("confirmDeleteMatchBtn");

let seasonPlayers = [];
let todayPlayers = [];
let queueEntries = [];
let activeSeason = null;
let activeMatchDay = null;
let allSeasons = [];
let backfillPlayers = [];
let backfillPlayersSeasonId = "";
let allPlayersDirectory = [];
let inactivePlayersDirectory = [];
let inactivePlayersStatus = "idle";
let scorerManualScoreSelectedIds = new Set();
let resolveDeleteMatchConfirmation = null;
let adminManualScoreSelectedIds = new Set();
let manualScoreHistoryEntries = [];
let manualScoreHistoryStatus = "idle";
let manualScoreTotalsByPlayerId = new Map();
let leaderboardPlayers = [];
let leaderboardDisplaySeasonName = "";
let leaderboardDisplaySeasonId = null;
let leaderboardManualSeasonId = "";
let leaderboardSortMode = "total";
let leaderboardChampions = [];
let leaderboardChampionsStatusText = "";
let isLeaderboardChampionsLoading = false;
let lifetimeRewardTotalsByKey = new Map();
let lifetimeRewardTotalsUpdatedAt = 0;
let lifetimeRewardTotalsBootstrapped = false;
let lifetimeRewardTotalsProcessedSeasonIds = new Set();
let isLifetimeRewardTotalsLoading = false;
let isHomeStealthMode = false;
let currentBackgroundImageUrl = "";
let currentBackgroundImageId = "";
let currentBackgroundBrightness = DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT;
let backgroundImageSettingsCache = null;
let adminBackgroundDraftId = "";
let adminBackgroundBrightnessDraft = DEFAULT_BACKGROUND_BRIGHTNESS_PERCENT;
let adminBackgroundPreviewContextText = "";
let adminBackgroundPreviewPlayerId = "";
let adminPlayerBackgroundSettingsOpen = false;
let adminBackgroundUploadInProgress = false;
let participationPointsTable = [];
let participationPointsTableBySeasonId = new Map();
let rewardLogs = [];
let seasonActionLogs = [];
let itemInventoryLogRows = [];
let itemInventoryLogStatus = "idle";
let itemInventoryLogMode = "scorer";
let itemInventoryLogSelectedPlayerId = "";
let rewardCardUsageSummary = new Map();
let itemCatalogEntries = [];
let itemCatalogUsageSummaryByItem = new Map();
let itemCatalogUsageSummaryStatus = "idle";
let itemCatalogUsageSummaryPendingKey = "";
let itemCatalogUsageSummaryPendingPromise = null;
let itemCatalogPendingPlayerAction = null;
let itemCatalogActionPendingKey = "";
let seasonItemCatalogSettingsAvailable = true;
let itemCatalogScoreRulesAvailable = true;
const seasonPowerDraftState = {
  scorer: null,
  admin: null,
};
const seasonPowerDraftCommitTimers = {
  scorer: new Map(),
  admin: new Map(),
};
const selectedRenamePlayerIds = {
  scorer: "",
  admin: "",
};
let selectedInactivePlayerId = "";
const itemCatalogEditingIds = {
  scorer: "",
  admin: "",
};
const itemCatalogEditorOpen = {
  scorer: false,
  admin: false,
};
let seasonPlayerRewardTotal = 0;
let externalRewardTotal = 0;
let recentMatchesData = [];
let recentMatchDaysData = [];
let recentMatchAttendanceNotesData = [];
let recentMatchDayGroupsData = [];
let recentMatchDragState = null;
let recentMatchLoadedSeasonIds = new Set();
let recentMatchLoadingSeasonIds = new Set();
let recentMatchSeasonLoadErrors = new Map();
let recentMatchSeasonLoadPromises = new Map();
let dialogFocusRestoreElement = null;
let seasonPlayerPowerCache = readSeasonPlayerPowerCache();
let adminManagedAccounts = [];
let adminAvailableAuthEmails = [];
let adminEditingIdentityId = "";
let openRecentMatchGroups = new Set();
let openRecentMatchSeasons = readOpenRecentMatchSeasons();
let matchDayAttendanceSelectedIdsByGroup = new Map();
let openMatchDayAttendanceGroups = new Set();
let rewardSelectedPlayerId = "";
let seasonSignupFeePaidPlayerIds = new Set();
let rewardLogsLoadedSeasonId = "";
let rewardSummarySortSnapshot = {
  seasonId: "",
  orderByPlayerId: new Map(),
};
let deferredInitPromise = null;
let hasScheduledDeferredInit = false;
let isMatchFormOpen = false;
let isBackfillFormOpen = false;
let isSeasonPanelOpen = false;
let isRewardPanelOpen = false;
let isScorerPanelOpen = false;
let isAdminPanelOpen = false;
let isAdminHistoryRepairControlsOpen = false;
let adminHistoryRepairState = {
  seasonId: "",
  reason: "",
  expiresAt: 0,
};
let isLeaderboardCompact = false;
let editingMatchId = null;
let isMatchExhibition = false;
let isBackfillExhibition = false;
let latestPrizeDistributionText = "";
const playerRelationDataCache = new Map();
let playerRelationState = {
  playerId: "",
  seasonId: PLAYER_RELATION_ALL_SEASONS_VALUE,
  minGames: PLAYER_RELATION_MIN_GAMES_DEFAULT,
  manualAllSeasonsMinGames: null,
  viewMode: "overview",
  sortKey: "win_rate",
  sortDirection: "desc",
  teammateRows: [],
  opponentRows: [],
  isLoading: false,
};
let matchTeamSelections = {
  teamA: [],
  teamB: [],
};
let backfillTeamSelections = {
  teamA: [],
  teamB: [],
};
let matchHeroAssignments = {};
let backfillHeroAssignments = {};
let matchKdaAssignments = {};
let backfillKdaAssignments = {};
const ITEM_MATCH_TARGET_DEFINITIONS = [
  { value: "self", label: "自己", group: "single" },
  { value: "ally", label: "队友(单人)", group: "single" },
  { value: "opponent", label: "对手(单人)", group: "single" },
  { value: "own_team", label: "己方团队", group: "team" },
  { value: "enemy_team", label: "对方团队", group: "team" },
];
const ITEM_MATCH_TARGET_OPTIONS = new Set(ITEM_MATCH_TARGET_DEFINITIONS.map((option) => option.value));
const ITEM_MATCH_TARGET_LABELS = new Map(ITEM_MATCH_TARGET_DEFINITIONS.map((option) => [option.value, option.label]));
const ITEM_MATCH_TARGET_GROUPS = new Map(ITEM_MATCH_TARGET_DEFINITIONS.map((option) => [option.value, option.group]));
const ITEM_MATCH_ICON_OPTIONS = [
  { value: "◉", label: "圆形金币" },
  { value: "⇄", label: "左右互换" },
  { value: "↻", label: "刷新" },
  { value: "●", label: "黑色圆形" },
  { value: "◆", label: "菱形" },
  { value: "✦", label: "星芒" },
];
const DEFAULT_ITEM_MATCH_ICON = ITEM_MATCH_ICON_OPTIONS[0].value;
const LEGACY_MATCH_ITEM_IDS = {
  personal: "__legacy_personal_double__",
  team: "__legacy_team_double__",
};

function createEmptyTeamDoubleConfig(itemCatalogId = "") {
  return {
    itemCatalogId,
    targetTeam: "",
    paymentMode: "solo",
    userPlayerId: "",
  };
}

function createEmptyDoubleState() {
  return {
    teamA: [],
    teamB: [],
    singles: [],
  };
}

let matchDoubleState = createEmptyDoubleState();
let backfillDoubleState = createEmptyDoubleState();
let teamDoublePickerOpen = {
  match: { A: "", B: "" },
  backfill: { A: "", B: "" },
};
let singleDoublePickerOpen = {
  match: {},
  backfill: {},
};
let roleMembers = [];
let seasonEndConfirmations = [];
let seasonEndFeatureAvailable = true;
let currentAccessSession = {
  role: "viewer",
  memberId: "",
  playerId: "",
};
let authSession = null;
let authProfile = null;
let authAccessRole = null;
let isAccessUiHidden = false;
let managedAccounts = [];
let accessModalMode = "auth";
let heroPickerState = null;
let realtimeChannel = null;
let refreshTimer = null;
let restDayBoundaryTimer = null;
let toastTimer = null;
let toastHideTimer = null;
let activeSystemPrompt = null;
const TOAST_VISIBLE_DURATION_MS = 5000;
const TOAST_HIDE_TRANSITION_MS = 220;
let refreshFlushPromise = null;
let placeholderEnsureAttemptKey = "";
let scoreDetailSeasonCache = new Map();
let scoreDetailState = null;
let scoreDetailFilterMode = "all";
const loadingStartedAt = Date.now();
const REFRESH_DEBOUNCE_MS = 700;
const REFRESH_SELF_SUPPRESS_MS = 1200;
const DOTA_HEROES = [
  "Abaddon", "Alchemist", "Ancient Apparition", "Anti-Mage", "Arc Warden", "Axe",
  "Bane", "Batrider", "Beastmaster", "Bloodseeker", "Bounty Hunter", "Brewmaster",
  "Bristleback", "Broodmother", "Centaur Warrunner", "Chaos Knight", "Chen", "Clinkz",
  "Clockwerk", "Crystal Maiden", "Dark Seer", "Dark Willow", "Dawnbreaker", "Dazzle",
  "Death Prophet", "Disruptor", "Doom", "Dragon Knight", "Drow Ranger", "Earth Spirit",
  "Earthshaker", "Elder Titan", "Ember Spirit", "Enchantress", "Enigma", "Faceless Void",
  "Grimstroke", "Gyrocopter", "Hoodwink", "Huskar", "Invoker", "Io", "Jakiro",
  "Juggernaut", "Keeper of the Light", "Kez", "Kunkka", "Largo", "Legion Commander", "Leshrac",
  "Lich", "Lifestealer", "Lina", "Lion", "Lone Druid", "Luna", "Lycan", "Magnus",
  "Marci", "Mars", "Medusa", "Meepo", "Mirana", "Monkey King", "Morphling", "Muerta",
  "Naga Siren", "Nature's Prophet", "Necrophos", "Night Stalker", "Nyx Assassin",
  "Ogre Magi", "Omniknight", "Oracle", "Outworld Destroyer", "Pangolier", "Phantom Assassin",
  "Phantom Lancer", "Phoenix", "Primal Beast", "Puck", "Pudge", "Pugna", "Queen of Pain",
  "Razor", "Riki", "Ringmaster", "Rubick", "Sand King", "Shadow Demon", "Shadow Fiend",
  "Shadow Shaman", "Silencer", "Skywrath Mage", "Slardar", "Slark", "Snapfire", "Sniper",
  "Spectre", "Spirit Bear", "Spirit Breaker", "Storm Spirit", "Sven", "Techies", "Templar Assassin",
  "Terrorblade", "Tidehunter", "Timbersaw", "Tinker", "Tiny", "Treant Protector",
  "Troll Warlord", "Tusk", "Underlord", "Undying", "Ursa", "Vengeful Spirit", "Venomancer",
  "Viper", "Visage", "Void Spirit", "Warlock", "Weaver", "Windranger", "Winter Wyvern",
  "Witch Doctor", "Wraith King", "Zeus"
];
const HERO_NAME_ZH = {
  "Abaddon": "亚巴顿",
  "Alchemist": "炼金术士",
  "Ancient Apparition": "远古冰魄",
  "Anti-Mage": "敌法师",
  "Arc Warden": "天穹守望者",
  "Axe": "斧王",
  "Bane": "祸乱之源",
  "Batrider": "蝙蝠骑士",
  "Beastmaster": "兽王",
  "Bloodseeker": "血魔",
  "Bounty Hunter": "赏金猎人",
  "Brewmaster": "酒仙",
  "Bristleback": "刚背兽",
  "Broodmother": "育母蜘蛛",
  "Centaur Warrunner": "半人马战行者",
  "Chaos Knight": "混沌骑士",
  "Chen": "陈",
  "Clinkz": "克林克兹",
  "Clockwerk": "发条技师",
  "Crystal Maiden": "水晶室女",
  "Dark Seer": "黑暗贤者",
  "Dark Willow": "邪影芳灵",
  "Dawnbreaker": "破晓辰星",
  "Dazzle": "戴泽",
  "Death Prophet": "死亡先知",
  "Disruptor": "干扰者",
  "Doom": "末日使者",
  "Dragon Knight": "龙骑士",
  "Drow Ranger": "卓尔游侠",
  "Earth Spirit": "大地之灵",
  "Earthshaker": "撼地者",
  "Elder Titan": "上古巨神",
  "Ember Spirit": "灰烬之灵",
  "Enchantress": "魅惑魔女",
  "Enigma": "谜团",
  "Faceless Void": "虚空假面",
  "Grimstroke": "天涯墨客",
  "Gyrocopter": "矮人直升机",
  "Hoodwink": "森海飞霞",
  "Huskar": "哈斯卡",
  "Invoker": "祈求者",
  "Io": "艾欧",
  "Jakiro": "杰奇洛",
  "Juggernaut": "主宰",
  "Keeper of the Light": "光之守卫",
  "Kez": "凯",
  "Kunkka": "昆卡",
  "Largo": "朗戈",
  "Legion Commander": "军团指挥官",
  "Leshrac": "拉席克",
  "Lich": "巫妖",
  "Lifestealer": "噬魂鬼",
  "Lina": "莉娜",
  "Lion": "莱恩",
  "Lone Druid": "德鲁伊",
  "Luna": "露娜",
  "Lycan": "狼人",
  "Magnus": "马格纳斯",
  "Marci": "玛西",
  "Mars": "玛尔斯",
  "Medusa": "美杜莎",
  "Meepo": "米波",
  "Mirana": "米拉娜",
  "Monkey King": "齐天大圣",
  "Morphling": "变体精灵",
  "Muerta": "琼英碧灵",
  "Naga Siren": "娜迦海妖",
  "Nature's Prophet": "先知",
  "Necrophos": "瘟疫法师",
  "Night Stalker": "暗夜魔王",
  "Nyx Assassin": "司夜刺客",
  "Ogre Magi": "食人魔魔法师",
  "Omniknight": "全能骑士",
  "Oracle": "神谕者",
  "Outworld Destroyer": "殁境神蚀者",
  "Pangolier": "石鳞剑士",
  "Phantom Assassin": "幻影刺客",
  "Phantom Lancer": "幻影长矛手",
  "Phoenix": "凤凰",
  "Primal Beast": "兽",
  "Puck": "帕克",
  "Pudge": "帕吉",
  "Pugna": "帕格纳",
  "Queen of Pain": "痛苦女王",
  "Razor": "剃刀",
  "Riki": "力丸",
  "Ringmaster": "百戏大王",
  "Rubick": "拉比克",
  "Sand King": "沙王",
  "Shadow Demon": "暗影恶魔",
  "Shadow Fiend": "影魔",
  "Shadow Shaman": "暗影萨满",
  "Silencer": "沉默术士",
  "Skywrath Mage": "天怒法师",
  "Slardar": "斯拉达",
  "Slark": "斯拉克",
  "Snapfire": "电炎绝手",
  "Sniper": "狙击手",
  "Spectre": "幽鬼",
  "Spirit Bear": "灵熊",
  "Spirit Breaker": "裂魂人",
  "Storm Spirit": "风暴之灵",
  "Sven": "斯温",
  "Techies": "工程师",
  "Templar Assassin": "圣堂刺客",
  "Terrorblade": "恐怖利刃",
  "Tidehunter": "潮汐猎人",
  "Timbersaw": "伐木机",
  "Tinker": "修补匠",
  "Tiny": "小小",
  "Treant Protector": "树精卫士",
  "Troll Warlord": "巨魔战将",
  "Tusk": "巨牙海民",
  "Underlord": "孽主",
  "Undying": "不朽尸王",
  "Ursa": "熊战士",
  "Vengeful Spirit": "复仇之魂",
  "Venomancer": "剧毒术士",
  "Viper": "冥界亚龙",
  "Visage": "维萨吉",
  "Void Spirit": "虚无之灵",
  "Warlock": "术士",
  "Weaver": "编织者",
  "Windranger": "风行者",
  "Winter Wyvern": "寒冬飞龙",
  "Witch Doctor": "巫医",
  "Wraith King": "冥魂大帝",
  "Zeus": "宙斯"
};
const HERO_PINYIN_INITIALS = {
  "Abaddon": "ybd",
  "Alchemist": "ljs",
  "Ancient Apparition": "ygyp",
  "Anti-Mage": "dfs",
  "Arc Warden": "tqswz",
  "Axe": "fw",
  "Bane": "hlzy",
  "Batrider": "bfqs",
  "Beastmaster": "sw",
  "Bloodseeker": "xm",
  "Bounty Hunter": "sjlr",
  "Brewmaster": "jx",
  "Bristleback": "gbs",
  "Broodmother": "ymzz",
  "Centaur Warrunner": "brmzxz",
  "Chaos Knight": "hdqs",
  "Chen": "c",
  "Clinkz": "klkz",
  "Clockwerk": "fzjs",
  "Crystal Maiden": "sjsn",
  "Dark Seer": "haxs",
  "Dark Willow": "xyfl",
  "Dawnbreaker": "pccx",
  "Dazzle": "dz",
  "Death Prophet": "swxz",
  "Disruptor": "grz",
  "Doom": "mrsz",
  "Dragon Knight": "lqs",
  "Drow Ranger": "zeyx",
  "Earth Spirit": "ddzl",
  "Earthshaker": "hdz",
  "Elder Titan": "sgjs",
  "Ember Spirit": "hjzl",
  "Enchantress": "hhnv",
  "Enigma": "mt",
  "Faceless Void": "kxjm",
  "Grimstroke": "tymk",
  "Gyrocopter": "arzsj",
  "Hoodwink": "shfx",
  "Huskar": "hsk",
  "Invoker": "qqz",
  "Io": "ao",
  "Jakiro": "jjl",
  "Juggernaut": "zz",
  "Keeper of the Light": "gzsws",
  "Kez": "k",
  "Kunkka": "kk",
  "Legion Commander": "jtzhg",
  "Leshrac": "lxk",
  "Lich": "wy",
  "Lifestealer": "shg",
  "Lina": "ln",
  "Lion": "le",
  "Lone Druid": "dlr",
  "Luna": "ln",
  "Lycan": "lr",
  "Magnus": "mgns",
  "Marci": "mx",
  "Mars": "mes",
  "Medusa": "mds",
  "Meepo": "mp",
  "Mirana": "mln",
  "Monkey King": "qtds",
  "Morphling": "btjl",
  "Muerta": "qybl",
  "Naga Siren": "njhy",
  "Nature's Prophet": "xz",
  "Necrophos": "wyfs",
  "Night Stalker": "aymw",
  "Nyx Assassin": "syck",
  "Ogre Magi": "srmfs",
  "Omniknight": "qnqs",
  "Oracle": "syz",
  "Outworld Destroyer": "mjsyz",
  "Pangolier": "slys",
  "Phantom Assassin": "hyck",
  "Phantom Lancer": "hycms",
  "Phoenix": "fh",
  "Primal Beast": "yss",
  "Puck": "pk",
  "Pudge": "pj",
  "Pugna": "pgn",
  "Queen of Pain": "tknw",
  "Razor": "td",
  "Riki": "lw",
  "Ringmaster": "bxdw",
  "Rubick": "lbk",
  "Sand King": "sw",
  "Shadow Demon": "ayem",
  "Shadow Fiend": "ym",
  "Shadow Shaman": "aysm",
  "Silencer": "cmss",
  "Skywrath Mage": "tnfs",
  "Slardar": "sld",
  "Slark": "slk",
  "Snapfire": "dyjsh",
  "Sniper": "jjs",
  "Spectre": "yg",
  "Spirit Bear": "lx",
  "Spirit Breaker": "lhr",
  "Storm Spirit": "fbzl",
  "Sven": "sw",
  "Techies": "gcs",
  "Templar Assassin": "stck",
  "Terrorblade": "kbl",
  "Tidehunter": "cxlr",
  "Timbersaw": "fmj",
  "Tinker": "xbj",
  "Tiny": "xx",
  "Treant Protector": "sjws",
  "Troll Warlord": "jmzj",
  "Tusk": "jyhm",
  "Underlord": "nz",
  "Undying": "bxsw",
  "Ursa": "xzs",
  "Vengeful Spirit": "fczh",
  "Venomancer": "jds",
  "Viper": "mjyl",
  "Visage": "wsj",
  "Void Spirit": "xwzl",
  "Warlock": "ss",
  "Weaver": "bzz",
  "Windranger": "fxz",
  "Winter Wyvern": "hdfl",
  "Witch Doctor": "wy",
  "Wraith King": "mhdd",
  "Zeus": "zs"
};
const HERO_ALIASES = {
  "Ancient Apparition": ["冰魂"],
  "Beastmaster": ["兽王"],
  "Bounty Hunter": ["赏金"],
  "Clockwerk": ["发条"],
  "Dark Willow": ["小仙女"],
  "Death Prophet": ["死灵龙", "死亡"],
  "Earth Spirit": ["土猫"],
  "Earthshaker": ["小牛"],
  "Elder Titan": ["大牛"],
  "Ember Spirit": ["火猫"],
  "Faceless Void": ["虚空"],
  "Gyrocopter": ["飞机"],
  "Hoodwink": ["小松鼠"],
  "Invoker": ["卡尔"],
  "Juggernaut": ["剑圣"],
  "Largo": ["青蛙"],
  "Lifestealer": ["小狗"],
  "Lone Druid": ["熊德"],
  "Mirana": ["白虎"],
  "Morphling": ["水人"],
  "Nature's Prophet": ["先知"],
  "Night Stalker": ["夜魔"],
  "Nyx Assassin": ["小强"],
  "Outworld Destroyer": ["黑鸟"],
  "Phantom Assassin": ["幻刺"],
  "Phantom Lancer": ["幻长矛", "猴子幻象"],
  "Puck": ["仙女龙"],
  "Pudge": ["屠夫"],
  "Queen of Pain": ["女王"],
  "Riki": ["隐刺"],
  "Sand King": ["蝎子"],
  "Shadow Fiend": ["影魔", "魂守"],
  "Shadow Shaman": ["小y"],
  "Skywrath Mage": ["天怒"],
  "Slark": ["小鱼人"],
  "Sniper": ["火枪"],
  "Spirit Bear": ["熊灵"],
  "Spirit Breaker": ["白牛"],
  "Storm Spirit": ["蓝猫"],
  "Templar Assassin": ["圣堂"],
  "Tidehunter": ["潮汐"],
  "Tinker": ["修补", "地精"],
  "Tiny": ["小小"],
  "Treant Protector": ["大树"],
  "Ursa": ["拍拍熊"],
  "Void Spirit": ["紫猫"],
  "Windranger": ["风行"],
  "Zeus": ["众神之王"]
};
const refreshState = {
  seasonContext: false,
  playerDriven: false,
  queue: false,
  leaderboard: false,
  rewardLogs: false,
  seasonLogs: false,
  recentMatches: false,
  seasonEndConfirmations: false,
};
const refreshSuppressUntil = {
  seasonContext: 0,
  playerDriven: 0,
  queue: 0,
  leaderboard: 0,
  rewardLogs: 0,
  seasonLogs: 0,
  recentMatches: 0,
  seasonEndConfirmations: 0,
};

function hasPendingRefresh() {
  return Object.values(refreshState).some(Boolean);
}

function consumeRefreshState() {
  const snapshot = { ...refreshState };
  Object.keys(refreshState).forEach((key) => {
    refreshState[key] = false;
  });
  return snapshot;
}

function markRefreshSuppression(flags, durationMs = REFRESH_SELF_SUPPRESS_MS) {
  const until = Date.now() + durationMs;
  Object.entries(flags).forEach(([key, value]) => {
    if (!value || !(key in refreshSuppressUntil)) return;
    refreshSuppressUntil[key] = Math.max(refreshSuppressUntil[key], until);
  });
}

async function flushRefreshQueue() {
  if (refreshFlushPromise) {
    return refreshFlushPromise;
  }

  if (refreshTimer) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  refreshFlushPromise = (async () => {
    while (hasPendingRefresh()) {
      const pending = consumeRefreshState();

      if (pending.seasonContext) {
        await loadActiveSeason();
        await refreshPlayerDrivenViews();
        await loadQueue();
        await loadSeasonEndConfirmations();
        await loadLeaderboard();
        await loadRewardLogs();
        await loadItemCatalog();
        await loadSeasonActionLogs();
        await loadRecentMatches();
        continue;
      }

      if (pending.playerDriven) {
        await refreshPlayerDrivenViews();
      }

      if (pending.queue) {
        await loadQueue();
      }

      if (pending.leaderboard) {
        await loadLeaderboard();
      }

      if (pending.rewardLogs) {
        await loadRewardLogs();
      }

      if (pending.seasonLogs) {
        await loadSeasonActionLogs();
      }

      if (pending.recentMatches) {
        await loadRecentMatches();
      }

      if (pending.seasonEndConfirmations) {
        await loadSeasonEndConfirmations();
      }
    }
  })().finally(() => {
    refreshFlushPromise = null;

    if (hasPendingRefresh() && !refreshTimer) {
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        flushRefreshQueue();
      }, REFRESH_DEBOUNCE_MS);
    }
  });

  return refreshFlushPromise;
}

function scheduleRefresh(flags, options = {}) {
  const respectSuppression = options.respectSuppression !== false;
  const now = Date.now();
  let hasScheduledFlag = false;

  Object.entries(flags).forEach(([key, value]) => {
    if (!value || !(key in refreshState)) {
      return;
    }

    if (respectSuppression && refreshSuppressUntil[key] > now) {
      return;
    }

    refreshState[key] = true;
    hasScheduledFlag = true;
  });

  if (!hasScheduledFlag) {
    return;
  }

  if (refreshFlushPromise || refreshTimer) {
    return;
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    flushRefreshQueue();
  }, REFRESH_DEBOUNCE_MS);
}

function requestImmediateRefresh(flags) {
  markRefreshSuppression(flags);
  scheduleRefresh(flags, { respectSuppression: false });
  return flushRefreshQueue();
}

function hideLoadingScreen() {
  if (!loadingScreen) return;

  const elapsed = Date.now() - loadingStartedAt;
  const waitMs = Math.max(0, LOADING_SCREEN_MIN_MS - elapsed);

  window.setTimeout(() => {
    loadingScreen.classList.add("is-hidden");
  }, waitMs);
}

function runWhenBrowserIdle(callback, timeout = 800) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => {
      callback();
    }, { timeout });
    return;
  }

  window.setTimeout(() => {
    callback();
  }, 0);
}

function getHomeLeaderboardCacheKey(activeSeasonId = "") {
  return `${HOME_LEADERBOARD_CACHE_STORAGE_KEY}:${activeSeasonId || "global"}`;
}

function readCachedHomeLeaderboardSnapshot(activeSeasonId = activeSeason?.id) {
  if (!activeSeasonId) return null;
  const snapshot = readLocalJsonStorage(getHomeLeaderboardCacheKey(activeSeasonId), null);
  if (!snapshot || snapshot.activeSeasonId !== activeSeasonId || !isFreshHomeCacheSnapshot(snapshot)) {
    return null;
  }
  return Array.isArray(snapshot.players) && snapshot.players.length ? snapshot : null;
}

function writeCachedHomeLeaderboardSnapshot({
  activeSeasonId = activeSeason?.id,
  displaySeasonId = leaderboardDisplaySeasonId,
  displaySeasonName = leaderboardDisplaySeasonName,
  players = [],
} = {}) {
  if (!activeSeasonId || !Array.isArray(players)) return;
  writeLocalJsonStorage(getHomeLeaderboardCacheKey(activeSeasonId), {
    cachedAt: Date.now(),
    activeSeasonId,
    displaySeasonId: displaySeasonId || null,
    displaySeasonName: displaySeasonName || "",
    players,
  });
}

function clearHomeLeaderboardCacheForSeason(activeSeasonId = activeSeason?.id) {
  if (!activeSeasonId) return;
  removeLocalStorageKey(getHomeLeaderboardCacheKey(activeSeasonId));
}

function clearHomePlayerDirectoryCacheForSeason(activeSeasonId = activeSeason?.id) {
  if (!activeSeasonId) return;
  removeLocalStorageKey(getHomePlayerDirectoryCacheKey(activeSeasonId));
}

function getHomePlayerDirectoryCacheKey(activeSeasonId = "") {
  return `${HOME_PLAYER_DIRECTORY_CACHE_STORAGE_KEY}:${activeSeasonId || "global"}`;
}

function readCachedHomePlayerDirectorySnapshot(activeSeasonId = activeSeason?.id) {
  if (!activeSeasonId) return null;
  const snapshot = readLocalJsonStorage(getHomePlayerDirectoryCacheKey(activeSeasonId), null);
  if (!snapshot || snapshot.activeSeasonId !== activeSeasonId || !isFreshHomeCacheSnapshot(snapshot)) {
    return null;
  }
  if (!Array.isArray(snapshot.seasonPlayers) || !Array.isArray(snapshot.allPlayersDirectory)) {
    return null;
  }
  return snapshot;
}

function writeCachedHomePlayerDirectorySnapshot({
  activeSeasonId = activeSeason?.id,
  seasonRows = seasonPlayers,
  playerDirectory = allPlayersDirectory,
} = {}) {
  if (!activeSeasonId || !Array.isArray(seasonRows) || !Array.isArray(playerDirectory)) return;
  writeLocalJsonStorage(getHomePlayerDirectoryCacheKey(activeSeasonId), {
    cachedAt: Date.now(),
    activeSeasonId,
    seasonPlayers: seasonRows,
    allPlayersDirectory: playerDirectory,
  });
}

function readSeasonChampionCache() {
  const cached = readLocalJsonStorage(SEASON_CHAMPION_CACHE_STORAGE_KEY, {});
  return cached && typeof cached === "object" && !Array.isArray(cached) ? cached : {};
}

function writeSeasonChampionCache(cache = {}) {
  writeLocalJsonStorage(SEASON_CHAMPION_CACHE_STORAGE_KEY, cache && typeof cache === "object" ? cache : {});
}

function getLifetimeRewardKey(playerId = "", displayName = "") {
  const normalizedPlayerId = String(playerId || "").trim();
  if (normalizedPlayerId) return `player:${normalizedPlayerId}`;
  const normalizedName = stripPlayerNameMeta(displayName || "").trim();
  return normalizedName ? `name:${normalizedName}` : "";
}

function normalizeLifetimeRewardRow(row = {}) {
  const displayName = stripPlayerNameMeta(row.displayName || row.display_name || row.donorName || row.donor_name || "") || "未知选手";
  const playerId = String(row.playerId || row.player_id || "").trim();
  const key = getLifetimeRewardKey(playerId, displayName);
  if (!key) return null;
  const seasons = row.seasons && typeof row.seasons === "object" && !Array.isArray(row.seasons)
    ? { ...row.seasons }
    : {};
  const totalAmount = Number.isFinite(Number(row.totalAmount))
    ? Number(row.totalAmount)
    : Object.values(seasons).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    key,
    playerId,
    displayName,
    totalAmount: Number(totalAmount.toFixed(2)),
    seasons,
    updatedAt: Number(row.updatedAt || Date.now()),
  };
}

function hydrateLifetimeRewardTotalsCache() {
  const cached = readLocalJsonStorage(LIFETIME_REWARD_TOTALS_STORAGE_KEY, {});
  const rows = Array.isArray(cached?.rows)
    ? cached.rows.map(normalizeLifetimeRewardRow).filter(Boolean)
    : [];
  lifetimeRewardTotalsByKey = new Map(rows.map((row) => [row.key, row]));
  lifetimeRewardTotalsUpdatedAt = Number(cached?.updatedAt || 0);
  lifetimeRewardTotalsBootstrapped = Boolean(cached?.bootstrapped);
  lifetimeRewardTotalsProcessedSeasonIds = new Set(
    Array.isArray(cached?.processedSeasonIds) ? cached.processedSeasonIds.map(String).filter(Boolean) : []
  );
}

function writeLifetimeRewardTotalsCache({ bootstrapped = lifetimeRewardTotalsBootstrapped } = {}) {
  const rows = [...lifetimeRewardTotalsByKey.values()]
    .map(normalizeLifetimeRewardRow)
    .filter(Boolean)
    .sort((a, b) => b.totalAmount - a.totalAmount || a.displayName.localeCompare(b.displayName, "zh-CN"));
  lifetimeRewardTotalsUpdatedAt = Date.now();
  lifetimeRewardTotalsBootstrapped = Boolean(bootstrapped);
  writeLocalJsonStorage(LIFETIME_REWARD_TOTALS_STORAGE_KEY, {
    version: 1,
    updatedAt: lifetimeRewardTotalsUpdatedAt,
    bootstrapped: lifetimeRewardTotalsBootstrapped,
    processedSeasonIds: [...lifetimeRewardTotalsProcessedSeasonIds],
    rows,
  });
}

function hydrateWarmHomeCacheForActiveSeason() {
  let hydrated = false;
  const cachedPlayers = readCachedHomePlayerDirectorySnapshot();
  if (cachedPlayers) {
    allPlayersDirectory = cachedPlayers.allPlayersDirectory || [];
    seasonPlayers = cachedPlayers.seasonPlayers || [];
    updateSeasonPlayerPowerCacheFromPlayers(
      activeSeason?.id,
      seasonPlayers.filter((player) => player.is_in_season)
    );
    renderSeasonPlayersPanel();
    renderAccessScorerOptions();
    renderAdminAddScorerOptions();
    renderPlayerManagementOptions();
    renderScorerManualScoreOptions();
    renderAdminManualScoreOptions();
    hydrated = seasonPlayers.length > 0 || hydrated;
  }

  const cachedLeaderboard = readCachedHomeLeaderboardSnapshot();
  if (cachedLeaderboard) {
    leaderboardDisplaySeasonId = cachedLeaderboard.displaySeasonId || activeSeason?.id || null;
    leaderboardDisplaySeasonName = cachedLeaderboard.displaySeasonName || activeSeason?.name || "";
    renderLeaderboard(cachedLeaderboard.players || []);
    hydrated = true;
  }

  return hydrated;
}

function getExternalDonationStorageKey(seasonId) {
  return `dota2sys_external_reward_logs_${seasonId || "global"}`;
}

function readExternalDonationLogs(seasonId) {
  try {
    const raw = window.localStorage.getItem(getExternalDonationStorageKey(seasonId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeExternalDonationLogs(seasonId, logs) {
  window.localStorage.setItem(
    getExternalDonationStorageKey(seasonId),
    JSON.stringify(logs)
  );
}

function getSignupFeePaidStorageKey(seasonId) {
  return `dota2sys_signup_fee_paid_${seasonId || "global"}`;
}

function getSignupFeeDonationSourceKey(seasonId, playerId) {
  const normalizedSeasonId = String(seasonId || "").trim();
  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedSeasonId || !normalizedPlayerId) return "";
  return `signup_fee:${normalizedSeasonId}:${normalizedPlayerId}`;
}

function readStoredSignupFeePaidPlayerIds(seasonId) {
  try {
    const raw = window.localStorage.getItem(getSignupFeePaidStorageKey(seasonId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writeStoredSignupFeePaidPlayerIds(seasonId, playerIds) {
  window.localStorage.setItem(
    getSignupFeePaidStorageKey(seasonId),
    JSON.stringify(
      [...new Set((Array.isArray(playerIds) ? playerIds : []).map((value) => String(value || "").trim()).filter(Boolean))]
    )
  );
}

function loadSeasonSignupFeePaidState() {
  seasonSignupFeePaidPlayerIds = new Set();
}

function normalizeItemInventoryLogRow(row = {}) {
  return {
    id: String(row?.id || row?.source_key || `item-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    season_id: String(row?.season_id || activeSeason?.id || ""),
    player_id: String(row?.player_id || ""),
    player_name: String(row?.player_name || "未知选手"),
    item_catalog_id: row?.item_catalog_id ? String(row.item_catalog_id) : "",
    item_name: String(row?.item_name || "未命名道具"),
    event_kind: String(row?.event_kind || "record"),
    quantity: Math.max(Number(row?.quantity ?? 0), 0),
    occurred_at: String(row?.occurred_at || row?.created_at || new Date().toISOString()),
    operator_name: String(row?.operator_name || ""),
    notes: String(row?.notes || ""),
    match_id: row?.match_id ? String(row.match_id) : "",
    source_key: String(row?.source_key || ""),
  };
}

function sortItemInventoryLogRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeItemInventoryLogRow(row))
    .sort((a, b) => {
      const timeDiff = new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime();
      if (timeDiff !== 0) return timeDiff;
      const playerCompare = String(a.player_name || "").localeCompare(String(b.player_name || ""), "zh-CN");
      if (playerCompare !== 0) return playerCompare;
      return String(a.item_name || "").localeCompare(String(b.item_name || ""), "zh-CN");
    });
}

function readAdminActionLogs() {
  return Array.isArray(seasonActionLogs) ? seasonActionLogs : [];
}

function normalizeSeasonActionLogText(action, actorName = "") {
  const rawText = String(action || "").trim();
  const normalizedActor = String(actorName || "").trim();
  if (!rawText || !normalizedActor) return rawText;
  const actorPrefixPattern = new RegExp(`^${escapeRegExp(normalizedActor)}\\s*`);
  return rawText.replace(actorPrefixPattern, "").trim();
}

async function loadSeasonActionLogs() {
  if (!activeSeason?.id || !authSession || !isCurrentRoleScorer()) {
    seasonActionLogs = [];
    renderAdminActionLogs();
    return;
  }

  const { data, error } = await db.rpc("get_season_action_logs", {
    p_season_id: activeSeason.id,
  });

  if (error) {
    console.error("加载操作日志失败：", error);
    seasonActionLogs = [];
    renderAdminActionLogs();
    return;
  }

  seasonActionLogs = (Array.isArray(data) ? data : []).map((row) => ({
    id: row?.id || "",
    season_id: row?.season_id || activeSeason.id,
    actor_user_id: row?.actor_user_id || "",
    actor_role: row?.actor_role || "",
    actor_name: row?.actor_name || "未知身份",
    text: normalizeSeasonActionLogText(row?.text, row?.actor_name),
    created_at: row?.created_at || "",
  }));
  renderAdminActionLogs();
}

async function appendAdminActionLog(action) {
  const text = String(action || "").trim();
  if (!text || !activeSeason?.id || !authSession || !isCurrentRoleScorer()) return;

  const actorName = getCurrentActionLogActorLabel();
  const normalizedText = normalizeSeasonActionLogText(
    normalizeSeasonActionLogText(text, getCurrentAccessActorLabel()),
    actorName
  );

  const optimisticLog = {
    id: `temp-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    season_id: activeSeason.id,
    actor_user_id: authSession.user?.id || "",
    actor_role: isCurrentRoleAdmin() ? "admin" : "scorekeeper",
    actor_name: actorName,
    text: normalizedText,
    created_at: new Date().toISOString(),
  };
  seasonActionLogs = [optimisticLog, ...readAdminActionLogs()].slice(0, 300);
  renderAdminActionLogs();

  const { data, error } = await db.rpc("append_season_action_log", {
    p_season_id: activeSeason.id,
    p_text: normalizedText,
    p_metadata: {},
  });

  if (error) {
    console.error("写入操作日志失败：", error);
    seasonActionLogs = readAdminActionLogs().filter((log) => log.id !== optimisticLog.id);
    renderAdminActionLogs();
    return;
  }

  const savedRow = Array.isArray(data) ? data[0] : data;
  if (!savedRow) {
    await loadSeasonActionLogs();
    return;
  }

  seasonActionLogs = readAdminActionLogs().map((log) => (
    log.id === optimisticLog.id
      ? {
        id: savedRow.id || optimisticLog.id,
        season_id: savedRow.season_id || optimisticLog.season_id,
        actor_user_id: savedRow.actor_user_id || optimisticLog.actor_user_id,
        actor_role: savedRow.actor_role || optimisticLog.actor_role,
        actor_name: savedRow.actor_name || optimisticLog.actor_name,
        text: normalizeSeasonActionLogText(savedRow.text, savedRow.actor_name),
        created_at: savedRow.created_at || optimisticLog.created_at,
      }
      : log
  ));
  renderAdminActionLogs();
}

function formatTime24(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hours = String(Math.max(0, Math.min(23, Number(match[1])))).padStart(2, "0");
  const minutes = String(Math.max(0, Math.min(59, Number(match[2])))).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeTimeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 3) {
    return formatTime24(`${digits.slice(0, 1)}:${digits.slice(1)}`);
  }
  if (digits.length === 4) {
    return formatTime24(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  }

  const colonMatch = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    return formatTime24(`${colonMatch[1]}:${colonMatch[2]}`);
  }

  return raw;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getMatchDayStartTimeKey() {
  return "dota2sys_match_day_start_time";
}

function readStoredMatchDayStartTime() {
  try {
    const raw = window.localStorage.getItem(getMatchDayStartTimeKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredMatchDayStartTime(payload) {
  window.localStorage.setItem(getMatchDayStartTimeKey(), JSON.stringify(payload));
}

function clearStoredMatchDayStartTime() {
  window.localStorage.removeItem(getMatchDayStartTimeKey());
}

function readStoredLeaderboardCompactState() {
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_COMPACT_STORAGE_KEY);
    if (raw !== "1" && raw !== "0") {
      return false;
    }
    return raw === "1";
  } catch {
    return false;
  }
}

function writeStoredLeaderboardCompactState(isCompact) {
  try {
    window.localStorage.setItem(LEADERBOARD_COMPACT_STORAGE_KEY, isCompact ? "1" : "0");
  } catch {
    // Ignore localStorage failures and keep in-memory state.
  }
}

function setMessageNode(node, text = "", isError = false) {
  const value = String(text || "").trim();
  if (node) {
    node.textContent = "";
    node.className = isError ? "message error" : "message";
    node.hidden = true;
  }
  if (value) {
    showGlobalToast(value, isError);
  }
}

function setMessage(text, isError = false) {
  setMessageNode(messageEl, text, isError);
}

function showGlobalToast(text, isError = false) {
  const value = String(text || "").trim();
  if (!globalToast || !value) return;
  if (toastTimer) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastHideTimer) {
    window.clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }

  globalToast.textContent = value;
  globalToast.hidden = false;
  globalToast.className = isError ? "global-toast global-toast-error global-toast-visible" : "global-toast global-toast-visible";

  toastTimer = window.setTimeout(() => {
    globalToast.classList.remove("global-toast-visible");
    toastHideTimer = window.setTimeout(() => {
      globalToast.hidden = true;
      globalToast.textContent = "";
      globalToast.className = "global-toast";
      toastHideTimer = null;
    }, TOAST_HIDE_TRANSITION_MS);
  }, TOAST_VISIBLE_DURATION_MS);
}

function showSeasonRolloverFeedback(text, isError = false) {
  setMessage(text, isError);
}

function setSystemPromptOpen(isOpen, options = {}) {
  if (!systemPromptModal) return;
  setDialogOpen(systemPromptModal, isOpen, {
    initialFocus: options.initialFocus || systemPromptConfirmBtn,
    restoreFocus: options.restoreFocus,
  });
}

function settleSystemPrompt(confirmed = false) {
  if (!activeSystemPrompt) {
    setSystemPromptOpen(false);
    return;
  }

  const promptState = activeSystemPrompt;
  const value = confirmed && promptState.usesInput
    ? String(systemPromptInput?.value ?? "")
    : "";
  activeSystemPrompt = null;
  setSystemPromptOpen(false);
  promptState.resolve({ confirmed: Boolean(confirmed), value });
}

function openSystemPrompt(options = {}) {
  if (!systemPromptModal || !systemPromptConfirmBtn || !systemPromptCancelBtn) {
    showGlobalToast("确认弹窗不可用，请刷新页面后重试。", true);
    return Promise.resolve({ confirmed: false, value: "" });
  }

  if (activeSystemPrompt) {
    settleSystemPrompt(false);
  }

  const usesInput = Boolean(options.input);
  const danger = Boolean(options.danger);
  const title = String(options.title || (usesInput ? "输入确认" : "确认操作"));
  const message = String(options.message || "");
  const confirmLabel = String(options.confirmLabel || "确认");
  const cancelLabel = String(options.cancelLabel || "取消");
  const inputLabel = String(options.inputLabel || "确认文字");

  if (systemPromptTitle) {
    systemPromptTitle.textContent = title;
  }
  if (systemPromptBody) {
    systemPromptBody.textContent = message;
  }
  if (systemPromptInputWrap) {
    systemPromptInputWrap.hidden = !usesInput;
  }
  if (systemPromptInputLabel) {
    systemPromptInputLabel.textContent = inputLabel;
  }
  if (systemPromptInput) {
    systemPromptInput.type = options.inputType === "password" ? "password" : "text";
    systemPromptInput.value = String(options.defaultValue ?? "");
    systemPromptInput.placeholder = String(options.placeholder || "");
    systemPromptInput.autocomplete = options.inputType === "password" ? "new-password" : "off";
  }
  systemPromptCancelBtn.textContent = cancelLabel;
  systemPromptConfirmBtn.textContent = confirmLabel;
  systemPromptConfirmBtn.className = danger
    ? "button-danger system-prompt-confirm-btn"
    : "button-secondary system-prompt-confirm-btn";

  return new Promise((resolve) => {
    activeSystemPrompt = { resolve, usesInput };
    setSystemPromptOpen(true, { initialFocus: usesInput ? systemPromptInput : systemPromptConfirmBtn });
  });
}

async function confirmAction(message, options = {}) {
  const result = await openSystemPrompt({
    ...options,
    input: false,
    message,
  });
  return result.confirmed;
}

async function promptAction(message, defaultValue = "", options = {}) {
  const result = await openSystemPrompt({
    ...options,
    input: true,
    message,
    defaultValue,
  });
  return result.confirmed ? result.value : null;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getAccessRoleLabel(role = currentAccessSession.role) {
  return ACCESS_ROLE_LABELS[role] || (role ? String(role) : copyText("runtime.common.viewer", "游客"));
}

async function invokeFunction(name, body = {}) {
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    let message = error.message || "Edge Function 调用失败。";

    const context = error.context;
    if (context && typeof context.clone === "function") {
      try {
        const responseClone = context.clone();
        const contentType = String(responseClone.headers?.get?.("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          const payload = await responseClone.json();
          message = String(payload?.error || payload?.message || message);
        } else {
          const text = await responseClone.text();
          if (text.trim()) {
            message = text.trim();
          }
        }
      } catch (_parseError) {
        // Fall back to the original SDK error message when the response body cannot be parsed.
      }
    }

    if (message === "Edge Function returned a non-2xx status code") {
      message = name === "admin-save-user-mapping"
        ? "账号映射保存接口返回非 2xx 响应。请先确认已部署 Edge Function：admin-save-user-mapping。"
        : `Edge Function ${name} 返回非 2xx 响应。请先确认该函数已部署到当前 Supabase 项目。`;
    }

    throw new Error(message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

async function archiveClosedSeasonToGithub(season, options = {}) {
  if (!season?.id) return null;
  return invokeFunction("archive-season-to-github", {
    seasonId: season.id,
    archiveAfterExport: options.archiveAfterExport !== false,
    deleteAfterExport: false,
  });
}

async function adoptRolloverNextSeason(result) {
  const nextSeasonId = String(result?.next_season_id || "").trim();
  if (!nextSeasonId) return;

  const { data, error } = await db
    .from("seasons")
    .select("id, code, name, status, start_at, end_at, rule_config")
    .eq("id", nextSeasonId)
    .maybeSingle();

  if (error || !data?.id) {
    console.error("加载新赛季失败：", error || new Error("Next season not found."));
    return;
  }

  activeSeason = normalizeSeasonMeta(data);
  updateSeasonInfo();
  renderSeasonRolloverAction();
  renderSeasonArchiveExportOptions();
}

async function handleSeasonRolloverFinalization(result, refreshOptions = {}) {
  const nextSeasonName = result?.next_season_name || "下赛季";
  const closedSeasonName = result?.closed_season_name || activeSeason?.name || "当前赛季";
  const closedSeasonId = String(result?.closed_season_id || activeSeason?.id || "").trim();
  const matchCount = Math.max(0, Number(result?.closed_season_match_count ?? 0));
  const retainedInDatabase = result?.closed_season_retained_in_database !== false;
  const closureText = retainedInDatabase
    ? `赛季已完结，系统已切换至 ${nextSeasonName}；${closedSeasonName} 已保留在 Supabase 数据库中。`
    : `赛季已完结，系统已切换至 ${nextSeasonName}；${closedSeasonName} 因没有比赛记录，未保留历史数据。`;
  showSeasonRolloverFeedback(closureText);
  appendAdminActionLog(
    retainedInDatabase
      ? `完成了 ${closedSeasonName} 的赛季完结，并切换至 ${nextSeasonName}；数据库保留了 ${matchCount} 场比赛的赛季记录。`
      : `完成了 ${closedSeasonName} 的赛季完结，并切换至 ${nextSeasonName}；因该赛季没有比赛记录，未保留历史数据。`
  );
  await updateLifetimeRewardTotalsForSeason(closedSeasonId);
  await adoptRolloverNextSeason(result);
  await requestImmediateRefresh({
    seasonContext: true,
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
    ...refreshOptions,
  });
}

function getExportableClosedSeasons() {
  return (allSeasons || [])
    .filter((season) => season?.id && String(season.status || "").trim().toLowerCase() === "closed")
    .slice()
    .sort((a, b) => String(b.start_at || "").localeCompare(String(a.start_at || ""), "zh-CN"));
}

function setAdminExportSeasonMessage(text = "", isError = false) {
  setMessageNode(adminExportSeasonMessage, text, isError);
}

function setSeasonArchiveExportModalOpen(isOpen) {
  if (!adminExportSeasonModal) return;
  if (isOpen) {
    renderSeasonArchiveExportOptions();
    setAdminExportSeasonMessage("");
    setDialogOpen(adminExportSeasonModal, true, {
      initialFocus: adminExportSeasonSelect || adminConfirmExportSeasonBtn || closeAdminExportSeasonBtn,
    });
    return;
  }

  setDialogOpen(adminExportSeasonModal, false);
  setAdminExportSeasonMessage("");
}

async function openSeasonArchiveExportModal() {
  if (!ensureAdminAccess("仅管理员可导出已完结赛季。")) return;
  if (adminExportSeasonBtn) {
    adminExportSeasonBtn.disabled = true;
  }
  await loadSeasons();
  renderSeasonArchiveExportOptions();
  setSeasonArchiveExportModalOpen(true);
}

function renderSeasonArchiveExportOptions() {
  if (!adminExportSeasonRow || !adminExportSeasonBtn || !adminExportSeasonSelect) return;

  const canAdmin = isCurrentRoleAdmin();
  adminExportSeasonRow.hidden = !canAdmin;
  adminExportSeasonRow.style.display = canAdmin ? "" : "none";
  adminExportSeasonBtn.hidden = !canAdmin;
  if (adminPrizeDistributionBtn) {
    adminPrizeDistributionBtn.hidden = !canAdmin;
    adminPrizeDistributionBtn.disabled = !canAdmin || !activeSeason?.id;
  }
  if (adminParticipationRulesBtn) {
    adminParticipationRulesBtn.hidden = !canAdmin;
    adminParticipationRulesBtn.disabled = !canAdmin || !activeSeason?.id;
  }

  if (!canAdmin) {
    return;
  }

  const exportableSeasons = getExportableClosedSeasons();
  const previousValue = adminExportSeasonSelect.value || "";

  adminExportSeasonSelect.innerHTML = exportableSeasons.length
    ? [
      '<option value="">请选择已完结赛季</option>',
      ...exportableSeasons.map((season) => (
        `<option value="${escapeHtml(season.id || "")}">${escapeHtml(season.name || season.code || "未命名赛季")}</option>`
      )),
    ].join("")
    : '<option value="">暂无可导出的已完结赛季</option>';

  if (exportableSeasons.some((season) => season.id === previousValue)) {
    adminExportSeasonSelect.value = previousValue;
  } else if (exportableSeasons.length) {
    adminExportSeasonSelect.value = exportableSeasons[0].id || "";
  } else {
    adminExportSeasonSelect.value = "";
  }

  const hasSelection = Boolean(adminExportSeasonSelect.value);
  adminExportSeasonSelect.disabled = !exportableSeasons.length;
  adminExportSeasonBtn.disabled = !exportableSeasons.length;
  if (adminConfirmExportSeasonBtn) {
    adminConfirmExportSeasonBtn.disabled = !hasSelection;
  }
}

function setPrizeDistributionMessage(text = "", isError = false) {
  setMessageNode(adminPrizeDistributionMessage, text, isError);
}

function setPrizeDistributionModalOpen(isOpen) {
  if (!adminPrizeDistributionModal) return;
  if (isOpen) {
    latestPrizeDistributionText = "";
    if (adminPrizeDistributionResult) {
      adminPrizeDistributionResult.innerHTML = "";
    }
    if (adminCopyPrizeDistributionBtn) {
      adminCopyPrizeDistributionBtn.disabled = true;
    }
    setPrizeDistributionMessage("");
    setDialogOpen(adminPrizeDistributionModal, true, {
      initialFocus: adminPrizeDistributionSeedInput || adminRunPrizeDistributionBtn || closeAdminPrizeDistributionBtn,
    });
    return;
  }

  setDialogOpen(adminPrizeDistributionModal, false);
  setPrizeDistributionMessage("");
}

function setAdminParticipationRulesMessage(text = "", isError = false) {
  setMessageNode(adminParticipationRulesMessage, text, isError);
}

function setAdminBackgroundPickerMessage(text = "", isError = false) {
  setMessageNode(adminBackgroundPickerMessage, text, isError);
}

function getSharedBackgroundSettingsErrorMessage(error) {
  if (isMissingSharedBackgroundSettingsError(error)) {
    return "共享背景设置保存失败：请先在 Supabase 应用 20260607120000_site_background_settings.sql。";
  }
  return `共享背景设置保存失败：${getErrorMessage(error)}`;
}

function reportSharedBackgroundSettingsError(error) {
  const message = getSharedBackgroundSettingsErrorMessage(error);
  console.error("保存共享背景设置失败：", error);
  setAdminBackgroundPickerMessage(message, true);
  setAdminPanelMessage(message, true);
  showGlobalToast("背景设置未保存到共享数据库", true);
}

function getBackgroundUploadFileExtension(file) {
  const filename = String(file?.name || "").trim();
  const filenameMatch = filename.match(/\.([a-z0-9]+)$/i);
  const extension = String(filenameMatch?.[1] || "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }
  const mimeType = String(file?.type || "").toLowerCase();
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "";
}

function getBackgroundUploadMimeType(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return mimeType;
  const extension = getBackgroundUploadFileExtension(file);
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "";
}

function getBackgroundUploadFilename(file) {
  const extension = getBackgroundUploadFileExtension(file);
  if (!extension) return "";
  const originalName = String(file?.name || "background")
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const safeBase = originalName
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/[-_. ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    || "background";
  const prefixedBase = /^[A-Za-z0-9]/.test(safeBase) ? safeBase : `background-${safeBase}`;
  return `${prefixedBase}.${extension}`;
}

function createBackgroundUploadObjectName(file) {
  const filename = getBackgroundUploadFilename(file);
  if (!filename) return "";
  const randomId = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `bg_upload_${Date.now().toString(36)}_${randomId}${BACKGROUND_IMAGE_STORAGE_OBJECT_SEPARATOR}${filename}`;
}

function getAdminBackgroundUploadValidationError(file) {
  if (!file) return "请先选择一张图片。";
  if (!getBackgroundUploadMimeType(file)) {
    return "只能上传 JPG、PNG 或 WebP 图片。";
  }
  if (Number(file.size || 0) <= 0) {
    return "图片文件为空。";
  }
  if (Number(file.size || 0) > BACKGROUND_IMAGE_UPLOAD_MAX_BYTES) {
    return "图片不能超过 25 MB。";
  }
  if (!getBackgroundUploadFilename(file)) {
    return "图片文件名不符合上传要求。";
  }
  return "";
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败。"));
    };
    image.src = objectUrl;
  });
}

async function createBackgroundThumbnailBlob(file) {
  const image = await loadImageElementFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = BACKGROUND_IMAGE_THUMBNAIL_WIDTH;
  canvas.height = BACKGROUND_IMAGE_THUMBNAIL_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法生成缩略图。");
  }

  const scale = Math.max(
    BACKGROUND_IMAGE_THUMBNAIL_WIDTH / image.naturalWidth,
    BACKGROUND_IMAGE_THUMBNAIL_HEIGHT / image.naturalHeight
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (BACKGROUND_IMAGE_THUMBNAIL_WIDTH - drawWidth) / 2;
  const drawY = (BACKGROUND_IMAGE_THUMBNAIL_HEIGHT - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("缩略图生成失败。"));
      },
      "image/jpeg",
      BACKGROUND_IMAGE_THUMBNAIL_QUALITY
    );
  });
}

function resetAdminBackgroundUploadInput() {
  if (adminBackgroundUploadInput) {
    adminBackgroundUploadInput.value = "";
  }
}

function syncAdminBackgroundUploadState() {
  if (adminBackgroundUploadInput) {
    adminBackgroundUploadInput.disabled = !isCurrentRoleAdmin() || adminBackgroundUploadInProgress;
  }
}

async function uploadAdminBackgroundImage() {
  if (adminBackgroundUploadInProgress) return;
  if (!ensureAdminAccess("仅管理员可上传网站背景。")) return;
  const file = adminBackgroundUploadInput?.files?.[0] || null;
  const validationError = getAdminBackgroundUploadValidationError(file);
  if (validationError) {
    setAdminBackgroundPickerMessage(validationError, true);
    resetAdminBackgroundUploadInput();
    syncAdminBackgroundUploadState();
    return;
  }

  const objectName = createBackgroundUploadObjectName(file);
  const thumbnailObjectName = getBackgroundThumbnailObjectName(objectName);
  adminBackgroundUploadInProgress = true;
  setAdminBackgroundPickerMessage("正在生成缩略图...");
  syncAdminBackgroundUploadState();

  try {
    let thumbnailBlob = null;
    try {
      thumbnailBlob = await createBackgroundThumbnailBlob(file);
    } catch (error) {
      console.error("生成背景缩略图失败：", error);
      setAdminBackgroundPickerMessage(`缩略图生成失败：${getErrorMessage(error)}`, true);
      return;
    }

    setAdminBackgroundPickerMessage("正在上传背景图到 Supabase...");
    const { error } = await db.storage
      .from(BACKGROUND_IMAGE_STORAGE_BUCKET)
      .upload(objectName, file, {
        cacheControl: "31536000",
        contentType: getBackgroundUploadMimeType(file) || undefined,
        upsert: false,
      });

    if (error) {
      const message = `背景上传失败：${getErrorMessage(error)}`;
      console.error("上传背景图失败：", error);
      setAdminBackgroundPickerMessage(message, true);
      setAdminPanelMessage(message, true);
      showGlobalToast("背景上传失败", true);
      return;
    }

    const { error: thumbnailError } = await db.storage
      .from(BACKGROUND_IMAGE_STORAGE_BUCKET)
      .upload(thumbnailObjectName, thumbnailBlob, {
        cacheControl: "31536000",
        contentType: "image/jpeg",
        upsert: false,
      });

    if (thumbnailError) {
      const message = `缩略图上传失败：${getErrorMessage(thumbnailError)}`;
      console.error("上传背景缩略图失败：", thumbnailError);
      setAdminBackgroundPickerMessage(message, true);
      setAdminPanelMessage(message, true);
      showGlobalToast("缩略图上传失败", true);
      return;
    }

    await loadAdminBackgroundImageOptions();
    const uploadedOption = ADMIN_BACKGROUND_IMAGE_OPTIONS.find((option) => option.objectName === objectName);
    if (uploadedOption) {
      adminBackgroundDraftId = uploadedOption.id;
      adminBackgroundPreviewContextText = "";
      adminBackgroundPreviewPlayerId = "";
    }
    renderAdminBackgroundOptions();
    const successMessage = uploadedOption
      ? `已上传背景：${getAdminBackgroundDisplayName(uploadedOption)}`
      : "背景已上传，请刷新背景列表后选择。";
    setAdminBackgroundPickerMessage(successMessage);
    setAdminPanelMessage(successMessage);
    showGlobalToast("背景图已上传");
  } finally {
    adminBackgroundUploadInProgress = false;
    resetAdminBackgroundUploadInput();
    syncAdminBackgroundUploadState();
  }
}

function getAdminBackgroundDisplayName(option) {
  return option?.filename || "未选择背景";
}

function getAdminBackgroundPreviewUrl(option) {
  return option?.previewUrl || "";
}

function getAdminBackgroundPlayerOptions() {
  const seen = new Set();
  return [
    ...(allPlayersDirectory || []),
    ...(seasonPlayers || []),
  ]
    .filter((player) => {
      const playerId = String(player?.id || "").trim();
      if (!playerId || seen.has(playerId)) return false;
      seen.add(playerId);
      return true;
    })
    .map((player) => ({
      id: player.id,
      display_name: player.display_name || "未知选手",
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));
}

function getAdminBackgroundPlayerName(playerId = "") {
  const normalizedPlayerId = String(playerId || "").trim();
  const player = getAdminBackgroundPlayerOptions().find((entry) => entry.id === normalizedPlayerId);
  return player?.display_name || "未知选手";
}

function getAdminBackgroundPlayerAssignmentsByBackgroundId(backgroundId = "", settings = readBackgroundImageSettings()) {
  const normalizedBackgroundId = normalizeBackgroundAssetId(backgroundId);
  if (!normalizedBackgroundId) return [];
  return Object.entries(settings.playerBackgrounds || {})
    .filter(([, assignedBackgroundId]) => assignedBackgroundId === normalizedBackgroundId)
    .map(([playerId]) => ({
      playerId,
      playerName: getAdminBackgroundPlayerName(playerId),
    }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "zh-CN"));
}

function getAdminBackgroundOptionBadges(backgroundId = "", settings = readBackgroundImageSettings()) {
  const normalizedBackgroundId = normalizeBackgroundAssetId(backgroundId);
  if (!normalizedBackgroundId) return [];

  const badges = [];
  if (normalizedBackgroundId === currentBackgroundImageId) {
    badges.push({ type: "current", label: "当前" });
  }
  if (normalizedBackgroundId === settings.finalDayBackgroundId) {
    badges.push({ type: "final", label: "决赛日" });
  }
  getAdminBackgroundPlayerAssignmentsByBackgroundId(normalizedBackgroundId, settings).forEach((entry) => {
    badges.push({ type: "player", label: entry.playerName });
  });
  return badges;
}

function renderAdminBackgroundOptionBadges(optionButton, settings = readBackgroundImageSettings()) {
  const badgeContainer = optionButton?.querySelector?.(".admin-background-option-badges");
  if (!badgeContainer) return;
  badgeContainer.innerHTML = "";
  getAdminBackgroundOptionBadges(optionButton.dataset.backgroundId || "", settings).forEach((badge) => {
    const badgeElement = document.createElement("span");
    badgeElement.className = `admin-background-option-badge admin-background-option-badge-${badge.type}`;
    badgeElement.textContent = badge.label;
    badgeContainer.appendChild(badgeElement);
  });
}

function previewAdminPlayerBackground(playerId = "") {
  const normalizedPlayerId = String(playerId || "").trim();
  const settings = readBackgroundImageSettings();
  const backgroundId = settings.playerBackgrounds?.[normalizedPlayerId] || "";
  const option = getAdminBackgroundOptionById(backgroundId);
  if (!normalizedPlayerId || !option) return;

  adminBackgroundDraftId = option.id;
  adminBackgroundPreviewPlayerId = normalizedPlayerId;
  adminBackgroundPreviewContextText = `${getAdminBackgroundPlayerName(normalizedPlayerId)} 的专属背景`;
  if (adminPlayerBackgroundPlayerSelect) {
    adminPlayerBackgroundPlayerSelect.value = normalizedPlayerId;
  }
  setAdminBackgroundPickerMessage("");
  syncAdminBackgroundPreview();
}

function renderAdminPlayerBackgroundSettings() {
  const settings = readBackgroundImageSettings();
  const players = getAdminBackgroundPlayerOptions();

  if (adminPlayerBackgroundSettings) {
    adminPlayerBackgroundSettings.hidden = !adminPlayerBackgroundSettingsOpen;
  }

  if (adminPlayerBackgroundSettingsOpen) {
    const selectedPlayerId = adminPlayerBackgroundPlayerSelect?.value || adminBackgroundPreviewPlayerId || players[0]?.id || "";

    if (adminPlayerBackgroundPlayerSelect) {
      adminPlayerBackgroundPlayerSelect.innerHTML = players.length
        ? players.map((player) => (
          `<option value="${escapeHtml(player.id)}">${escapeHtml(player.display_name)}</option>`
        )).join("")
        : '<option value="">暂无可选选手</option>';
      adminPlayerBackgroundPlayerSelect.value = selectedPlayerId;
      adminPlayerBackgroundPlayerSelect.disabled = !players.length || !isCurrentRoleAdmin();
    }

    const canSave = isCurrentRoleAdmin() && Boolean(players.length) && Boolean(getAdminBackgroundOptionById(adminBackgroundDraftId));
    if (adminSavePlayerBackgroundBtn) {
      adminSavePlayerBackgroundBtn.disabled = !canSave;
    }
    if (adminClearPlayerBackgroundBtn) {
      adminClearPlayerBackgroundBtn.disabled = !isCurrentRoleAdmin()
        || !players.length
        || !settings.playerBackgrounds?.[selectedPlayerId];
    }
  }

  if (adminPlayerBackgroundSettingsBtn) {
    adminPlayerBackgroundSettingsBtn.setAttribute("aria-expanded", String(adminPlayerBackgroundSettingsOpen));
  }

  if (!adminPlayerBackgroundList) return;
  const entries = Object.entries(settings.playerBackgrounds || {})
    .map(([playerId, backgroundId]) => ({
      playerId,
      playerName: getAdminBackgroundPlayerName(playerId),
      option: getAdminBackgroundOptionById(backgroundId),
    }))
    .filter((entry) => entry.option)
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "zh-CN"));

  adminPlayerBackgroundList.innerHTML = entries.length
    ? entries.map((entry) => `
      <div class="admin-player-background-row${entry.playerId === adminBackgroundPreviewPlayerId ? " admin-player-background-row-selected" : ""}" role="button" tabindex="0" data-player-id="${escapeHtml(entry.playerId)}" data-background-id="${escapeHtml(entry.option.id)}" title="${escapeHtml(`${entry.playerName} 的专属背景`)}">
        <span class="admin-player-background-player">${escapeHtml(entry.playerName)}</span>
        <button class="button-secondary admin-player-background-remove-btn" type="button" data-player-id="${escapeHtml(entry.playerId)}" aria-label="${escapeHtml(`移除 ${entry.playerName} 的专属背景`)}">${escapeHtml(copyText("adminPanel.backgroundPickerPlayerRemove", "移除"))}</button>
      </div>
    `).join("")
    : `<p class="muted admin-player-background-empty">${escapeHtml(copyText("adminPanel.backgroundPickerPlayerEmpty", "当前还没有专属背景。"))}</p>`;
}

function syncAdminBackgroundPreview() {
  const selectedOption = getAdminBackgroundOptionById(adminBackgroundDraftId);
  const selectedId = selectedOption?.id || "";
  const selectedPreviewUrl = getAdminBackgroundPreviewUrl(selectedOption);
  const settings = readBackgroundImageSettings();

  if (adminBackgroundPreviewImage) {
    adminBackgroundPreviewImage.hidden = !selectedPreviewUrl;
    if (selectedPreviewUrl) {
      if (adminBackgroundPreviewImage.getAttribute("src") !== selectedPreviewUrl) {
        adminBackgroundPreviewImage.src = selectedPreviewUrl;
      }
    } else {
      adminBackgroundPreviewImage.removeAttribute("src");
    }
    adminBackgroundPreviewImage.alt = selectedOption
      ? `选中背景预览：${adminBackgroundPreviewContextText || getAdminBackgroundDisplayName(selectedOption)}`
      : "选中背景预览";
    adminBackgroundPreviewImage.style.filter = `brightness(${adminBackgroundBrightnessDraft / 100}) saturate(0.72) contrast(1.04)`;
  }
  if (adminBackgroundBrightnessInput) {
    adminBackgroundBrightnessInput.value = String(adminBackgroundBrightnessDraft);
  }
  if (adminBackgroundBrightnessValue) {
    adminBackgroundBrightnessValue.value = `${adminBackgroundBrightnessDraft}%`;
    adminBackgroundBrightnessValue.textContent = `${adminBackgroundBrightnessDraft}%`;
  }
  if (adminApplyBackgroundBtn) {
    adminApplyBackgroundBtn.disabled = !selectedOption || !isCurrentRoleAdmin();
  }
  if (adminSetFinalDayBackgroundBtn) {
    adminSetFinalDayBackgroundBtn.disabled = !selectedOption || !isCurrentRoleAdmin();
  }
  if (adminPlayerBackgroundSettingsBtn) {
    adminPlayerBackgroundSettingsBtn.disabled = !isCurrentRoleAdmin();
    adminPlayerBackgroundSettingsBtn.setAttribute("aria-expanded", String(adminPlayerBackgroundSettingsOpen));
  }
  if (adminBackgroundOptions) {
    adminBackgroundOptions.querySelectorAll(".admin-background-option").forEach((button) => {
      const isSelected = button.dataset.backgroundId === selectedId;
      const isCurrent = button.dataset.backgroundId === currentBackgroundImageId;
      const isFinal = button.dataset.backgroundId === settings.finalDayBackgroundId;
      const isDedicated = getAdminBackgroundPlayerAssignmentsByBackgroundId(button.dataset.backgroundId || "", settings).length > 0;
      button.classList.toggle("admin-background-option-selected", isSelected);
      button.classList.toggle("admin-background-option-current", isCurrent);
      button.classList.toggle("admin-background-option-final", isFinal);
      button.classList.toggle("admin-background-option-dedicated", isDedicated);
      button.setAttribute("aria-pressed", String(isSelected));
      renderAdminBackgroundOptionBadges(button, settings);
    });
  }
  syncAdminBackgroundUploadState();
  renderAdminPlayerBackgroundSettings();
}

function renderAdminBackgroundOptions() {
  if (!adminBackgroundOptions) return;
  adminBackgroundOptions.innerHTML = "";

  if (!ADMIN_BACKGROUND_IMAGE_OPTIONS.length) {
    adminBackgroundOptions.innerHTML = '<p class="muted">当前没有可选背景图片。</p>';
    syncAdminBackgroundPreview();
    return;
  }

  const settings = readBackgroundImageSettings();
  ADMIN_BACKGROUND_IMAGE_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-background-option";
    button.dataset.backgroundId = option.id;
    button.title = option.filename;
    button.setAttribute("aria-pressed", "false");

    const thumbnail = document.createElement("img");
    thumbnail.className = "admin-background-option-thumb";
    thumbnail.src = getAdminBackgroundPreviewUrl(option);
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    thumbnail.decoding = "async";
    thumbnail.fetchPriority = "low";

    const label = document.createElement("span");
    label.className = "admin-background-option-name";
    label.textContent = getAdminBackgroundDisplayName(option);

    const badges = document.createElement("span");
    badges.className = "admin-background-option-badges";

    button.appendChild(thumbnail);
    button.appendChild(label);
    button.appendChild(badges);
    renderAdminBackgroundOptionBadges(button, settings);
    adminBackgroundOptions.appendChild(button);
  });

  syncAdminBackgroundPreview();
}

function selectAdminBackgroundDraft(id = "") {
  const option = getAdminBackgroundOptionById(id);
  if (!option) return;
  adminBackgroundDraftId = option.id;
  adminBackgroundPreviewContextText = "";
  adminBackgroundPreviewPlayerId = "";
  setAdminBackgroundPickerMessage("");
  syncAdminBackgroundPreview();
}

function openAdminBackgroundPicker() {
  if (!ensureAdminAccess("仅管理员可更换网站背景。")) return;
  adminBackgroundDraftId = ADMIN_BACKGROUND_IMAGE_IDS.has(currentBackgroundImageId)
    ? currentBackgroundImageId
    : (ADMIN_BACKGROUND_IMAGE_OPTIONS[0]?.id || "");
  adminBackgroundPreviewContextText = "";
  adminBackgroundPreviewPlayerId = "";
  adminBackgroundBrightnessDraft = normalizeBackgroundBrightnessPercent(
    readBackgroundImageSettings().backgroundBrightness
  );
  adminPlayerBackgroundSettingsOpen = false;
  renderAdminBackgroundOptions();
  setAdminBackgroundPickerMessage("");
  setManagedDialogOpen("adminBackgroundPicker", true, {
    initialFocus: adminBackgroundOptions?.querySelector(".admin-background-option-selected")
      || adminBackgroundOptions?.querySelector(".admin-background-option")
      || closeAdminBackgroundPickerBtn
      || undefined,
  });
}

async function applyAdminBackgroundDraft() {
  if (!ensureAdminAccess("仅管理员可更换网站背景。")) return;
  const selectedOption = getAdminBackgroundOptionById(adminBackgroundDraftId);
  if (!selectedOption) {
    setAdminBackgroundPickerMessage("请先选择一张背景图。", true);
    return;
  }

  setAdminBackgroundPickerMessage("正在保存共享背景设置...");
  try {
    await updateBackgroundImageSettings((settings) => ({
      ...settings,
      fallbackBackgroundId: selectedOption.id,
      manualSeasonKey: getCurrentBackgroundSeasonKey(),
      manualBackgroundId: selectedOption.id,
      backgroundBrightness: adminBackgroundBrightnessDraft,
    }));
  } catch (error) {
    reportSharedBackgroundSettingsError(error);
    return;
  }
  applyBackgroundImageOption(selectedOption);
  applyBackgroundBrightness(adminBackgroundBrightnessDraft);
  syncAdminBackgroundPreview();

  const successMessage = `已应用背景：${getAdminBackgroundDisplayName(selectedOption)}`;
  setAdminBackgroundPickerMessage(successMessage);
  setAdminPanelMessage(successMessage);
  showGlobalToast("网站背景已更新");
  void appendAdminActionLog(`${getCurrentAccessActorLabel()} 更换了网站背景：${getAdminBackgroundDisplayName(selectedOption)}。`);
}

async function setFinalDayBackgroundDraft() {
  if (!ensureAdminAccess("仅管理员可设置决赛日背景。")) return;
  const selectedOption = getAdminBackgroundOptionById(adminBackgroundDraftId);
  if (!selectedOption) {
    setAdminBackgroundPickerMessage("请先选择一张背景图。", true);
    return;
  }

  setAdminBackgroundPickerMessage("正在保存共享背景设置...");
  try {
    await updateBackgroundImageSettings((settings) => ({
      ...settings,
      finalDayBackgroundId: selectedOption.id,
      automaticFinalDayAppliedKey: "",
    }));
  } catch (error) {
    reportSharedBackgroundSettingsError(error);
    return;
  }
  void refreshAutomaticBackgroundImage();
  syncAdminBackgroundPreview();

  const successMessage = `已设置决赛日背景：${getAdminBackgroundDisplayName(selectedOption)}`;
  setAdminBackgroundPickerMessage(successMessage);
  setAdminPanelMessage(successMessage);
  showGlobalToast("决赛日背景已更新");
  void appendAdminActionLog(`${getCurrentAccessActorLabel()} 设置了决赛日背景：${getAdminBackgroundDisplayName(selectedOption)}。`);
}

function toggleAdminPlayerBackgroundSettings() {
  if (!ensureAdminAccess("仅管理员可设置选手专属背景。")) return;
  adminPlayerBackgroundSettingsOpen = !adminPlayerBackgroundSettingsOpen;
  renderAdminPlayerBackgroundSettings();
  syncAdminBackgroundPreview();
  if (adminPlayerBackgroundSettingsOpen) {
    focusDialogElement(adminPlayerBackgroundPlayerSelect);
  }
}

async function saveAdminPlayerBackgroundSetting() {
  if (!ensureAdminAccess("仅管理员可设置选手专属背景。")) return;
  const playerId = String(adminPlayerBackgroundPlayerSelect?.value || "").trim();
  const backgroundId = String(adminBackgroundDraftId || "").trim();
  const selectedOption = getAdminBackgroundOptionById(backgroundId);
  if (!playerId || !selectedOption) {
    setAdminBackgroundPickerMessage("请先选择选手和背景。", true);
    return;
  }

  setAdminBackgroundPickerMessage("正在保存共享背景设置...");
  try {
    await updateBackgroundImageSettings((settings) => ({
      ...settings,
      playerBackgrounds: {
        ...(settings.playerBackgrounds || {}),
        [playerId]: selectedOption.id,
      },
    }));
  } catch (error) {
    reportSharedBackgroundSettingsError(error);
    return;
  }
  adminBackgroundDraftId = selectedOption.id;
  adminBackgroundPreviewPlayerId = playerId;
  adminBackgroundPreviewContextText = `${getAdminBackgroundPlayerName(playerId)} 的专属背景`;
  syncAdminBackgroundPreview();
  void refreshAutomaticBackgroundImage({ allowChampionLookup: true });

  const successMessage = `已保存 ${getAdminBackgroundPlayerName(playerId)} 的专属背景：${getAdminBackgroundDisplayName(selectedOption)}`;
  setAdminBackgroundPickerMessage(successMessage);
  setAdminPanelMessage(successMessage);
}

async function clearAdminPlayerBackgroundSetting(playerId = adminPlayerBackgroundPlayerSelect?.value || "") {
  if (!ensureAdminAccess("仅管理员可设置选手专属背景。")) return;
  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedPlayerId) return;

  setAdminBackgroundPickerMessage("正在保存共享背景设置...");
  try {
    await updateBackgroundImageSettings((settings) => {
      const playerBackgrounds = { ...(settings.playerBackgrounds || {}) };
      delete playerBackgrounds[normalizedPlayerId];
      return {
        ...settings,
        playerBackgrounds,
      };
    });
  } catch (error) {
    reportSharedBackgroundSettingsError(error);
    return;
  }
  if (adminBackgroundPreviewPlayerId === normalizedPlayerId) {
    adminBackgroundPreviewPlayerId = "";
    adminBackgroundPreviewContextText = "";
  }
  syncAdminBackgroundPreview();
  void refreshAutomaticBackgroundImage({ allowChampionLookup: true });

  const successMessage = `已移除 ${getAdminBackgroundPlayerName(normalizedPlayerId)} 的专属背景。`;
  setAdminBackgroundPickerMessage(successMessage);
  setAdminPanelMessage(successMessage);
}

function formatParticipationRuleNumber(value) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  if (Number.isInteger(numericValue)) return String(numericValue);
  return String(Number(numericValue.toFixed(2)));
}

function formatParticipationRuleRangeToken(start, end) {
  if (end === null || end === undefined) return `${start}+`;
  if (start === end) return String(start);
  if (start === 0) return `-${end}`;
  return `${start}-${end}`;
}

function formatParticipationRulesAsText(rows = []) {
  const normalizedRows = normalizeParticipationPointRules(rows);
  const exactRows = normalizedRows.filter((row) => !row.isOpenEnded);
  const openEndedRow = normalizedRows.find((row) => row.isOpenEnded) || null;
  const ranges = [];
  let currentRange = null;

  exactRows.forEach((row) => {
    if (!currentRange) {
      currentRange = {
        start: row.matchesPlayed,
        end: row.matchesPlayed,
        participationPoints: row.participationPoints,
      };
      return;
    }

    if (
      row.matchesPlayed === currentRange.end + 1
      && row.participationPoints === currentRange.participationPoints
    ) {
      currentRange.end = row.matchesPlayed;
      return;
    }

    ranges.push(currentRange);
    currentRange = {
      start: row.matchesPlayed,
      end: row.matchesPlayed,
      participationPoints: row.participationPoints,
    };
  });

  if (currentRange) {
    ranges.push(currentRange);
  }

  const lines = ranges.map((range) => (
    `${formatParticipationRuleRangeToken(range.start, range.end)},${formatParticipationRuleNumber(range.participationPoints)}`
  ));

  if (openEndedRow) {
    const isProgressive = openEndedRow.isProgressive || Number(openEndedRow.pointsPerExtraMatch || 0) > 0;
    const valueToken = isProgressive
      ? `~${formatParticipationRuleNumber(openEndedRow.pointsPerExtraMatch)}`
      : formatParticipationRuleNumber(openEndedRow.participationPoints);
    lines.push(`${formatParticipationRuleRangeToken(openEndedRow.matchesPlayed, null)},${valueToken}`);
  }

  return lines.join("\n");
}

function parseParticipationRangeToken(rawToken, lineNumber) {
  const token = String(rawToken || "").trim();
  if (/^\d+\+$/.test(token)) {
    return {
      start: Number(token.slice(0, -1)),
      end: null,
      isOpenEnded: true,
    };
  }

  if (/^-\d+$/.test(token)) {
    const end = Number(token.slice(1));
    return {
      start: 0,
      end,
      isOpenEnded: false,
    };
  }

  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (end < start) {
      throw new Error(`第 ${lineNumber} 行区间结束场次不能小于开始场次。`);
    }
    return {
      start,
      end,
      isOpenEnded: false,
    };
  }

  if (/^\d+$/.test(token)) {
    const matchesPlayed = Number(token);
    return {
      start: matchesPlayed,
      end: matchesPlayed,
      isOpenEnded: false,
    };
  }

  throw new Error(`第 ${lineNumber} 行场次范围无效。`);
}

function parseParticipationValueToken(rawToken, lineNumber) {
  const token = String(rawToken || "").trim();
  const isProgressive = token.startsWith("~");
  const valueToken = isProgressive ? token.slice(1).trim() : token;

  if (!/^\d+(?:\.\d+)?$/.test(valueToken)) {
    throw new Error(`第 ${lineNumber} 行分值必须是非负数字，或使用 ~数字 表示每场递增。`);
  }

  const value = Number(valueToken);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`第 ${lineNumber} 行分值必须是非负数字。`);
  }

  return {
    value,
    isProgressive,
  };
}

function parseParticipationRulesText(text = "") {
  const exactRows = [];
  let openEndedDraft = null;
  const seenMatches = new Set();

  String(text || "")
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: String(line || "").normalize("NFKC").replace(/^\uFEFF/, "").replace(/，/g, ",").trim(),
    }))
    .filter((line) => line.text && !line.text.startsWith("#"))
    .forEach(({ lineNumber, text: lineText }) => {
      if (/^matches_played\s*,\s*participation_points$/i.test(lineText)) {
        return;
      }

      const parts = lineText.split(",").map((value) => value.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`第 ${lineNumber} 行格式无效，请使用“场次范围,分值”。`);
      }

      const range = parseParticipationRangeToken(parts[0], lineNumber);
      const pointRule = parseParticipationValueToken(parts[1], lineNumber);

      if (pointRule.isProgressive && !range.isOpenEnded) {
        throw new Error(`第 ${lineNumber} 行只有带 + 的开放区间可以使用 ~ 递增分。`);
      }

      if (range.isOpenEnded) {
        if (openEndedDraft) {
          throw new Error("只能设置一条带 + 的开放区间规则。");
        }
        openEndedDraft = {
          matchesPlayed: range.start,
          participationPoints: pointRule.isProgressive ? null : pointRule.value,
          pointsPerExtraMatch: pointRule.isProgressive ? pointRule.value : 0,
          isProgressive: pointRule.isProgressive,
        };
        return;
      }

      for (let matchesPlayed = range.start; matchesPlayed <= range.end; matchesPlayed += 1) {
        if (seenMatches.has(matchesPlayed)) {
          throw new Error(`第 ${lineNumber} 行重复设置了 ${matchesPlayed} 场。`);
        }
        seenMatches.add(matchesPlayed);
        exactRows.push({
          matchesPlayed,
          participationPoints: pointRule.value,
          pointsPerExtraMatch: null,
          isOpenEnded: false,
          isProgressive: false,
        });
      }
    });

  exactRows.sort((a, b) => a.matchesPlayed - b.matchesPlayed);

  if (openEndedDraft) {
    const overlappingRow = exactRows.find((row) => row.matchesPlayed >= openEndedDraft.matchesPlayed);
    if (overlappingRow) {
      throw new Error(`开放区间 ${openEndedDraft.matchesPlayed}+ 之后不能再设置固定场次。`);
    }
    const previousRow = [...exactRows]
      .reverse()
      .find((row) => row.matchesPlayed < openEndedDraft.matchesPlayed);
    const basePoints = Number(previousRow?.participationPoints ?? 0);
    exactRows.push({
      matchesPlayed: openEndedDraft.matchesPlayed,
      participationPoints: openEndedDraft.isProgressive
        ? basePoints + openEndedDraft.pointsPerExtraMatch
        : openEndedDraft.participationPoints,
      pointsPerExtraMatch: openEndedDraft.pointsPerExtraMatch,
      isOpenEnded: true,
      isProgressive: openEndedDraft.isProgressive,
    });
  }

  return normalizeParticipationPointRules(exactRows);
}

function renderAdminParticipationRulesEditor() {
  const seasonName = activeSeason?.name || activeSeason?.code || "";
  if (adminParticipationRulesSeasonLabel) {
    adminParticipationRulesSeasonLabel.textContent = seasonName ? `当前赛季：${seasonName}` : "当前未识别到赛季";
  }
  if (adminParticipationRulesInput) {
    adminParticipationRulesInput.value = formatParticipationRulesAsText(
      getParticipationPointsTableForSeason(activeSeason?.id)
    );
  }
}

async function setAdminParticipationRulesModalOpen(isOpen) {
  if (!adminParticipationRulesModal) return;
  if (isOpen) {
    if (!ensureAdminAccess("仅管理员可修改场次分。")) return;
    if (!activeSeason?.id) {
      setMessage("当前未识别到赛季，无法修改场次分。", true);
      return;
    }
    setAdminParticipationRulesMessage("正在加载场次分规则...");
    try {
      await loadParticipationPointsTable(activeSeason.id, { force: true });
      renderAdminParticipationRulesEditor();
      setAdminParticipationRulesMessage("");
      setDialogOpen(adminParticipationRulesModal, true, {
        initialFocus: adminParticipationRulesInput || adminSaveParticipationRulesBtn || closeAdminParticipationRulesBtn,
      });
    } catch (error) {
      const message = error.message || "场次分规则加载失败。";
      setAdminParticipationRulesMessage(message, true);
      setMessage(message, true);
      showBlockingAlert(message);
    }
    return;
  }

  setDialogOpen(adminParticipationRulesModal, false);
  setAdminParticipationRulesMessage("");
}

async function saveAdminParticipationRules() {
  if (!ensureAdminAccess("仅管理员可修改场次分。")) return;
  if (!activeSeason?.id) {
    setAdminParticipationRulesMessage("当前未识别到赛季，无法保存场次分。", true);
    return;
  }

  let rules;
  try {
    rules = parseParticipationRulesText(adminParticipationRulesInput?.value || "");
    if (!rules.length) {
      throw new Error("至少需要保留一条场次分规则。");
    }
  } catch (error) {
    setAdminParticipationRulesMessage(error.message || "场次分规则格式无效。", true);
    return;
  }

  if (adminSaveParticipationRulesBtn) {
    adminSaveParticipationRulesBtn.disabled = true;
  }
  setAdminParticipationRulesMessage("正在保存场次分规则...");

  try {
    const { data, error } = await db.rpc("set_season_participation_point_rules", {
      p_season_id: activeSeason.id,
      p_rules: rules.map((row) => ({
        matchesPlayed: row.matchesPlayed,
        participationPoints: row.participationPoints,
        pointsPerExtraMatch: row.isOpenEnded ? row.pointsPerExtraMatch : null,
        isOpenEnded: row.isOpenEnded,
        isProgressive: row.isOpenEnded ? row.isProgressive : false,
      })),
    });

    if (error) {
      const migrationHint = getLatestSchemaMigrationHint(error);
      throw new Error(`${error.message}${migrationHint ? `。${migrationHint}` : ""}`);
    }

    setParticipationPointsTableForSeason(activeSeason.id, data || rules);
    renderAdminParticipationRulesEditor();
    renderLeaderboardParticipationView();
    clearHomeLeaderboardCacheForSeason(activeSeason.id);
    setAdminParticipationRulesMessage("场次分规则已保存。");
    showGlobalToast("场次分规则已保存");
    await requestImmediateRefresh({ leaderboard: true });
  } catch (error) {
    setAdminParticipationRulesMessage(`保存失败：${error.message || "未知错误"}`, true);
  } finally {
    if (adminSaveParticipationRulesBtn) {
      adminSaveParticipationRulesBtn.disabled = false;
    }
  }
}

function hashPrizeDistributionSeed(seed = "") {
  let hash = 2166136261;
  const normalizedSeed = String(seed || "").normalize("NFKC");
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createPrizeDistributionRng(seed = "") {
  let state = hashPrizeDistributionSeed(seed) || 0x9e3779b9;
  return () => {
    state = Math.imul(state + 0x6d2b79f5, 1);
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function formatPrizeAmount(cents = 0) {
  return `¥${(Math.max(Math.round(Number(cents) || 0), 0) / 100).toFixed(2)}`;
}

function allocatePrizePool(poolCents = 0, playerIds = [], rng = Math.random) {
  const normalizedPool = Math.max(Math.round(Number(poolCents) || 0), 0);
  const ids = (playerIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  const allocations = new Map(ids.map((id) => [id, 0]));
  if (!normalizedPool || !ids.length) return allocations;

  const weights = ids.map((id) => ({
    id,
    weight: Math.max(Number(rng()), 0) + 0.000001,
  }));
  const weightTotal = weights.reduce((sum, item) => sum + item.weight, 0);
  let assigned = 0;
  const fractionalParts = weights.map((item) => {
    const rawAmount = (normalizedPool * item.weight) / weightTotal;
    const cents = Math.floor(rawAmount);
    assigned += cents;
    allocations.set(item.id, cents);
    return {
      id: item.id,
      fraction: rawAmount - cents,
    };
  });

  fractionalParts
    .sort((a, b) => {
      if (b.fraction !== a.fraction) return b.fraction - a.fraction;
      return a.id.localeCompare(b.id, "zh-CN");
    })
    .slice(0, normalizedPool - assigned)
    .forEach((item) => {
      allocations.set(item.id, Number(allocations.get(item.id) || 0) + 1);
    });

  return allocations;
}

async function loadPrizeDistributionLeaderboardRows(seasonId) {
  if (!seasonId) return [];
  if (leaderboardDisplaySeasonId === seasonId && leaderboardPlayers.length) {
    return leaderboardPlayers;
  }
  await loadParticipationPointsTable(seasonId);

  const [leaderboardResult, manualTotalsResult, bonusTotalsResult] = await Promise.allSettled([
    db
      .from("v_leaderboard")
      .select("season_id, player_id, display_name, matches_played, wins, losses, win_rate, score_total")
      .eq("season_id", seasonId)
      .order("score_total", { ascending: false })
      .order("wins", { ascending: false })
      .order("matches_played", { ascending: false })
      .order("display_name", { ascending: true }),
    loadManualScoreTotalsBySeason(seasonId),
    loadBonusScoreTotalsBySeason(seasonId),
  ]);

  if (leaderboardResult.status !== "fulfilled" || leaderboardResult.value.error) {
    const error = leaderboardResult.status === "fulfilled"
      ? leaderboardResult.value.error
      : leaderboardResult.reason;
    throw error;
  }

  const manualTotals = manualTotalsResult.status === "fulfilled"
    ? manualTotalsResult.value
    : new Map();
  if (manualTotalsResult.status !== "fulfilled") {
    console.error("加载人工积分汇总失败：", manualTotalsResult.reason);
  }

  const bonusTotals = bonusTotalsResult.status === "fulfilled"
    ? bonusTotalsResult.value
    : new Map();
  if (bonusTotalsResult.status !== "fulfilled") {
    console.error("加载加成积分汇总失败：", bonusTotalsResult.reason);
  }

  return applyParticipationPointsToLeaderboardPlayers((leaderboardResult.value.data || []).map((player) => {
    const playerId = player.player_id || player.user_id;
    const bonusScore = Number(bonusTotals.get(playerId) ?? 0);
    const totalScore = Number(player.score_total ?? 0);
    const gamesPlayed = getEffectiveLeaderboardGames(
      player.matches_played,
      player.wins,
      player.losses
    );
    const wins = Number(player.wins ?? 0);
    return {
      wins,
      losses: Number(player.losses ?? 0),
      games_played: gamesPlayed,
      player_id: playerId,
      display_name: player.display_name || "未知选手",
      result_score: totalScore - bonusScore,
      bonus_score: bonusScore,
      win_rate: gamesPlayed ? Number(((wins / gamesPlayed) * 100).toFixed(2)) : 0,
      manual_score: Number(manualTotals.get(playerId) ?? 0),
      reward_points: 0,
      reward_minimum: SEASON_BASE_SPONSOR_AMOUNT,
      reward_extra_points: 0,
    };
  }), seasonId);
}

async function getPrizeDistributionContext() {
  const targetSeasonId = leaderboardDisplaySeasonId || activeSeason?.id || "";
  if (!targetSeasonId) {
    throw new Error("当前没有可分配的赛季。");
  }

  const targetSeason = getSeasonMetaById(targetSeasonId);
  const leaderboardRows = await loadPrizeDistributionLeaderboardRows(targetSeasonId);

  if (targetSeasonId === activeSeason?.id) {
    syncSeasonRewardTotalFromSummary();
    return {
      seasonId: targetSeasonId,
      seasonName: targetSeason?.name || leaderboardDisplaySeasonName || activeSeason?.name || "",
      players: seasonPlayers,
      paidPlayerIds: new Set(seasonSignupFeePaidPlayerIds),
      totalCents: Math.round(Math.max(seasonPlayerRewardTotal + externalRewardTotal, 0) * 100),
      leaderboardRows,
    };
  }

  const [membershipsResult, rewardLogsResult] = await Promise.all([
    db
      .from("season_memberships")
      .select("player_id, join_status, players ( display_name )")
      .eq("season_id", targetSeasonId),
    db
      .from("reward_donations")
      .select("player_id, amount, category, donor_name, is_outside, players ( display_name )")
      .eq("season_id", targetSeasonId),
  ]);

  if (membershipsResult.error) {
    throw membershipsResult.error;
  }
  if (rewardLogsResult.error) {
    throw rewardLogsResult.error;
  }

  const players = (membershipsResult.data || [])
    .filter((row) => row.join_status === "active" || row.join_status === "captain")
    .map((row) => ({
      id: row.player_id,
      is_in_season: true,
      display_name: row.players?.display_name || "未知选手",
    }));
  const logs = rewardLogsResult.data || [];

  return {
    seasonId: targetSeasonId,
    seasonName: targetSeason?.name || leaderboardDisplaySeasonName || "",
    players,
    paidPlayerIds: new Set(
      logs
        .filter((log) => isSignupFeeRewardLog(log) && log.player_id)
        .map((log) => String(log.player_id))
    ),
    totalCents: Math.round(logs.reduce((sum, log) => sum + Math.max(Number(log?.amount ?? 0), 0), 0) * 100),
    leaderboardRows,
  };
}

function getPrizeDistributionEligiblePlayers(context) {
  const scoreMap = new Map();
  (context?.leaderboardRows || []).forEach((player) => {
    const playerId = String(player?.player_id || player?.id || "").trim();
    if (!playerId) return;
    scoreMap.set(playerId, {
      display_name: player.display_name || "未知选手",
      result_score: Number(player.result_score ?? 0),
      bonus_score: Number(player.bonus_score ?? 0),
      participation_score: Number(player.participation_score ?? 0),
      manual_score: Number(player.manual_score ?? 0),
      score: Number(player.score ?? 0),
      games_played: Number(player.games_played ?? 0),
      wins: Number(player.wins ?? 0),
      losses: Number(player.losses ?? 0),
      win_rate: Number(player.win_rate ?? 0),
    });
  });

  return (context?.players || [])
    .filter((player) => player.is_in_season && context.paidPlayerIds.has(player.id))
    .map((player) => {
      const score = scoreMap.get(player.id) || null;
      const resultScore = Number(score?.result_score ?? 0);
      const bonusScore = Number(score?.bonus_score ?? 0);
      const participationScore = Number(score?.participation_score ?? 0);
      const manualScore = Number(score?.manual_score ?? 0);
      return {
        id: player.id,
        player_id: player.id,
        display_name: player.display_name || score?.display_name || "未知选手",
        result_score: resultScore,
        bonus_score: bonusScore,
        participation_score: participationScore,
        manual_score: manualScore,
        score: Number(score?.score ?? (resultScore + bonusScore + participationScore + manualScore)),
        games_played: Number(score?.games_played ?? 0),
        wins: Number(score?.wins ?? 0),
        losses: Number(score?.losses ?? 0),
        win_rate: Number(score?.win_rate ?? 0),
      };
    })
    .sort(compareLeaderboardPlayers);
}

function addPrizeComponent(row, key, label, cents) {
  if (!row) return;
  const amount = Math.max(Math.round(Number(cents) || 0), 0);
  if (!amount) return;
  row.components[key] = {
    label,
    cents: amount,
  };
  row.totalCents += amount;
}

async function buildPrizeDistribution(seed = "") {
  const normalizedSeed = String(seed || "").normalize("NFKC").trim();
  if (!normalizedSeed) {
    throw new Error("请输入随机数种子。");
  }
  const context = await getPrizeDistributionContext();
  if (!context.totalCents) {
    throw new Error("当前赛季赞助总额为 0，暂时无法分配。");
  }

  const players = getPrizeDistributionEligiblePlayers(context);
  if (!players.length) {
    throw new Error("当前没有基础赞助已确认的赛季选手。");
  }

  const rng = createPrizeDistributionRng(normalizedSeed);
  const championFixedCents = Math.round((context.totalCents * 10) / 100);
  const topThreePoolCents = Math.round((context.totalCents * 20) / 100);
  const topFivePoolCents = Math.round((context.totalCents * 30) / 100);
  const allPoolCents = Math.max(context.totalCents - championFixedCents - topThreePoolCents - topFivePoolCents, 0);

  const rows = players.map((player, index) => ({
    ...player,
    rank: index + 1,
    totalCents: 0,
    components: {},
  }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const topOneIds = rows.slice(0, 1).map((row) => row.id);
  const topThreeIds = rows.slice(0, 3).map((row) => row.id);
  const topFiveIds = rows.slice(0, 5).map((row) => row.id);
  const allIds = rows.map((row) => row.id);

  if (topOneIds.length) {
    addPrizeComponent(rowById.get(topOneIds[0]), "champion", "第一名固定10%", championFixedCents);
  }

  allocatePrizePool(topThreePoolCents, topThreeIds, rng).forEach((cents, playerId) => {
    addPrizeComponent(rowById.get(playerId), "topThree", "1-3名随机20%", cents);
  });
  allocatePrizePool(topFivePoolCents, topFiveIds, rng).forEach((cents, playerId) => {
    addPrizeComponent(rowById.get(playerId), "topFive", "1-5名随机30%", cents);
  });
  allocatePrizePool(allPoolCents, allIds, rng).forEach((cents, playerId) => {
    addPrizeComponent(rowById.get(playerId), "all", "全员随机40%", cents);
  });

  return {
    seed: normalizedSeed,
    seasonName: context.seasonName || "",
    totalCents: context.totalCents,
    eligibleCount: rows.length,
    rows,
  };
}

function buildPrizeDistributionShareText(distribution) {
  if (!distribution?.rows?.length) return "";
  const title = distribution.seasonName
    ? `【${distribution.seasonName}奖金分配】`
    : "【赛季奖金分配】";
  const lines = [
    title,
    `随机数种子：${distribution.seed}`,
    `总奖金：${formatPrizeAmount(distribution.totalCents)}`,
    `范围：基础赞助已确认选手 ${distribution.eligibleCount} 人`,
    "规则：第一名固定10%；1-3名随机分20%；1-5名随机分30%；全员随机分40%",
  ];

  distribution.rows.forEach((row) => {
    const name = stripPlayerNameMeta(row.display_name || "未知选手");
    const componentText = row.rank <= 5
      ? Object.values(row.components).map((item) => `${item.label} ${formatPrizeAmount(item.cents)}`).join("，")
      : `全员随机40% ${formatPrizeAmount(row.components.all?.cents || 0)}`;
    lines.push(`${row.rank}. ${name}：${formatPrizeAmount(row.totalCents)}（${componentText}）`);
  });

  return lines.join("\n");
}

function renderPrizeDistribution(distribution) {
  if (!adminPrizeDistributionResult) return;
  latestPrizeDistributionText = buildPrizeDistributionShareText(distribution);
  if (adminCopyPrizeDistributionBtn) {
    adminCopyPrizeDistributionBtn.disabled = !latestPrizeDistributionText;
  }

  const totalAllocatedCents = distribution.rows.reduce((sum, row) => sum + row.totalCents, 0);
  adminPrizeDistributionResult.innerHTML = `
    <div class="prize-distribution-summary">
      <span>总奖金：<strong>${escapeHtml(formatPrizeAmount(distribution.totalCents))}</strong></span>
      <span>已分配：<strong>${escapeHtml(formatPrizeAmount(totalAllocatedCents))}</strong></span>
      <span>确认选手：<strong>${escapeHtml(String(distribution.eligibleCount))} 人</strong></span>
    </div>
    <div class="prize-distribution-list">
      ${distribution.rows.map((row) => {
        const componentHtml = row.rank <= 5
          ? Object.values(row.components).map((item) => `
            <span class="prize-distribution-component">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(formatPrizeAmount(item.cents))}</strong>
            </span>
          `).join("")
          : "";
        return `
          <div class="prize-distribution-row">
            <div class="prize-distribution-player">
              <span class="leaderboard-rank">${escapeHtml(String(row.rank))}</span>
              <div>
                <strong>${escapeHtml(stripPlayerNameMeta(row.display_name || "未知选手"))}</strong>
              </div>
            </div>
            <strong class="prize-distribution-amount">${escapeHtml(formatPrizeAmount(row.totalCents))}</strong>
            ${componentHtml ? `<div class="prize-distribution-components">${componentHtml}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function runPrizeDistribution() {
  if (!ensureAdminAccess("仅管理员可分配赛季奖金。")) return;
  if (adminRunPrizeDistributionBtn) {
    adminRunPrizeDistributionBtn.disabled = true;
  }
  setPrizeDistributionMessage("正在生成奖金分配...");
  try {
    const distribution = await buildPrizeDistribution(adminPrizeDistributionSeedInput?.value || "");
    renderPrizeDistribution(distribution);
    setPrizeDistributionMessage("奖金分配已生成。");
  } catch (error) {
    latestPrizeDistributionText = "";
    if (adminCopyPrizeDistributionBtn) {
      adminCopyPrizeDistributionBtn.disabled = true;
    }
    if (adminPrizeDistributionResult) {
      adminPrizeDistributionResult.innerHTML = "";
    }
    setPrizeDistributionMessage(error.message || "奖金分配失败。", true);
  } finally {
    if (adminRunPrizeDistributionBtn) {
      adminRunPrizeDistributionBtn.disabled = false;
    }
  }
}

async function copyPrizeDistributionText() {
  if (!latestPrizeDistributionText) {
    setPrizeDistributionMessage("请先生成奖金分配结果。", true);
    return;
  }
  if (adminCopyPrizeDistributionBtn) {
    adminCopyPrizeDistributionBtn.disabled = true;
  }
  try {
    const copied = await copyTextToClipboard(latestPrizeDistributionText);
    if (!copied) {
      setPrizeDistributionMessage("复制失败，请稍后重试。", true);
      return;
    }
    setPrizeDistributionMessage("奖金分配文本已复制，可直接粘贴到微信。");
    showGlobalToast("奖金分配文本已复制");
  } catch (error) {
    setPrizeDistributionMessage(`复制失败：${error.message || "未知错误"}`, true);
  } finally {
    if (adminCopyPrizeDistributionBtn) {
      adminCopyPrizeDistributionBtn.disabled = !latestPrizeDistributionText;
    }
  }
}

async function exportClosedSeasonArchiveToGithub() {
  if (!ensureAdminAccess("仅管理员可导出已完结赛季。")) return;

  const seasonId = String(adminExportSeasonSelect?.value || "").trim();
  const targetSeason = getExportableClosedSeasons().find((season) => season.id === seasonId) || null;
  if (!targetSeason) {
    setAdminPanelMessage("请选择一个可导出的已完结赛季。", true);
    setMessage("请选择一个可导出的已完结赛季。", true);
    setAdminExportSeasonMessage("请选择一个可导出的已完结赛季。", true);
    renderSeasonArchiveExportOptions();
    return;
  }

  adminExportSeasonBtn.disabled = true;
  adminExportSeasonSelect.disabled = true;
  if (adminConfirmExportSeasonBtn) {
    adminConfirmExportSeasonBtn.disabled = true;
  }
  setAdminPanelMessage(`正在导出 ${targetSeason.name || "该赛季"} 到 GitHub...`);
  setAdminExportSeasonMessage(`正在导出 ${targetSeason.name || "该赛季"} 到 GitHub...`);
  setMessage(`正在导出 ${targetSeason.name || "该赛季"} 到 GitHub...`);

  let exportResult = null;
  try {
    await updateLifetimeRewardTotalsForSeason(targetSeason.id);
    exportResult = await archiveClosedSeasonToGithub(targetSeason, {
      archiveAfterExport: true,
    });
  } catch (error) {
    const schemaHint = getLatestSchemaMigrationHint(error);
    const errorMessage = `导出赛季失败：${getErrorMessage(error)}。请检查 Edge Function archive-season-to-github 与 GitHub 环境变量。${schemaHint ? ` ${schemaHint}` : ""}`;
    setAdminPanelMessage(errorMessage, true);
    setAdminExportSeasonMessage(errorMessage, true);
    setMessage(errorMessage, true);
    renderSeasonArchiveExportOptions();
    return;
  }

  if (exportResult?.archivedInDatabase !== true) {
    const warningMessage = `GitHub 导出已完成，但数据库归档标记失败：${exportResult?.archiveError || exportResult?.deleteError || "Edge Function 尚未返回数据库归档结果，请确认已部署新版 archive-season-to-github。"}。`;
    setAdminPanelMessage(warningMessage, true);
    setAdminExportSeasonMessage(warningMessage, true);
    setMessage(warningMessage, true);
    appendAdminActionLog(`导出了 ${targetSeason.name || "该赛季"} 到 GitHub，但数据库归档标记失败。`);
    renderSeasonArchiveExportOptions();
    return;
  }

  writeExternalDonationLogs(targetSeason.id, []);
  const successMessage = `已将 ${targetSeason.name || "该赛季"} 导出到 GitHub，并在 Supabase 数据库中标记为只读归档。`;
  setAdminPanelMessage(successMessage);
  setAdminExportSeasonMessage(successMessage);
  setMessage(successMessage);
  appendAdminActionLog(
    `将 ${targetSeason.name || "该赛季"} 导出到 GitHub，并在 Supabase 数据库中标记为只读归档${exportResult?.path ? `；GitHub 路径：${exportResult.path}` : ""}。`
  );
  setSeasonArchiveExportModalOpen(false);
  requestImmediateRefresh({
    seasonContext: true,
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
  });
}

function setMatchMessage(text, isError = false) {
  setMessageNode(matchMessageEl, text, isError);
}

function setBackfillMessage(text, isError = false) {
  setMessageNode(backfillMessageEl, text, isError);
}

function setHeroPickerMessage(text, isError = false) {
  setMessageNode(heroPickerMessage, text, isError);
}

function setRewardMessage(text, isError = false) {
  setMessageNode(rewardMessageEl, text, isError);
}

function setScoreDetailMessage(text, isError = false) {
  setMessageNode(scoreDetailMessage, text, isError);
}

function formatScore(value) {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return "0";
  return numericValue.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function formatItemUsageCount(value) {
  return formatScore(value);
}

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

function formatWinRateValue(value, wins = 0, gamesPlayed = 0) {
  const resolvedValue = getWinRateNumber(value, wins, gamesPlayed);
  return `${resolvedValue.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatSignedScore(value) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return `${numericValue > 0 ? "+" : ""}${formatScore(numericValue)}`;
}

function formatShortLocalTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getLeaderboardNumber(value, fallback = 0) {
  const numericValue = Number(value ?? fallback);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function getLeaderboardTotalScore(player = {}) {
  return getLeaderboardNumber(player?.score);
}

function getLeaderboardWinLossScore(player = {}) {
  return getLeaderboardNumber(player?.win_loss_score ?? player?.result_score ?? player?.score_total);
}

function getLeaderboardBonusScore(player = {}) {
  return getLeaderboardNumber(player?.bonus_score);
}

function getLeaderboardParticipationScore(player = {}) {
  return getLeaderboardNumber(player?.participation_score);
}

function getLeaderboardManualScore(player = {}) {
  return getLeaderboardNumber(player?.manual_score);
}

function getLeaderboardDisplayScore(player = {}) {
  return leaderboardSortMode === "win_loss"
    ? getLeaderboardWinLossScore(player)
    : getLeaderboardTotalScore(player);
}

function compareLeaderboardScoreTieBreakers(a, b, options = {}) {
  const includeWinLossScore = options.includeWinLossScore !== false;
  const componentDiffs = [
    includeWinLossScore ? getLeaderboardWinLossScore(b) - getLeaderboardWinLossScore(a) : 0,
    getLeaderboardBonusScore(b) - getLeaderboardBonusScore(a),
    getLeaderboardParticipationScore(b) - getLeaderboardParticipationScore(a),
    getLeaderboardManualScore(b) - getLeaderboardManualScore(a),
  ];
  const componentDiff = componentDiffs.find((diff) => diff !== 0);
  if (componentDiff) return componentDiff;

  const winRateDiff = getWinRateNumber(b.win_rate, b.wins, b.games_played) - getWinRateNumber(a.win_rate, a.wins, a.games_played);
  if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;

  return String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-CN");
}

function compareLeaderboardPlayers(a, b) {
  const scoreDiff = getLeaderboardTotalScore(b) - getLeaderboardTotalScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  return compareLeaderboardScoreTieBreakers(a, b);
}

function compareLeaderboardPlayersByWinLoss(a, b) {
  const scoreDiff = getLeaderboardWinLossScore(b) - getLeaderboardWinLossScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  return compareLeaderboardScoreTieBreakers(a, b, { includeWinLossScore: false });
}

function sortLeaderboardPlayers(players = [], mode = leaderboardSortMode) {
  return [...players].sort(mode === "win_loss" ? compareLeaderboardPlayersByWinLoss : compareLeaderboardPlayers);
}

function buildLeaderboardDisplayRankMap(players = []) {
  const totalSortedPlayers = sortLeaderboardPlayers(players, "total");
  const rankMap = new Map();
  totalSortedPlayers.forEach((player, index) => {
    const playerId = player.player_id || player.id || "";
    if (!playerId) return;
    rankMap.set(playerId, getLeaderboardDisplayRankAtIndex(totalSortedPlayers, index));
  });
  return rankMap;
}

function syncLeaderboardScoreSortControl() {
  if (!leaderboardScoreSortBtn) return;
  const isWinLossMode = leaderboardSortMode === "win_loss";
  leaderboardScoreSortBtn.setAttribute("aria-pressed", String(isWinLossMode));
  leaderboardScoreSortBtn.setAttribute(
    "aria-label",
    isWinLossMode ? "恢复按总积分排序" : "按胜负积分排序"
  );
  leaderboardScoreSortBtn.title = isWinLossMode ? "恢复按总积分排序" : "按胜负积分排序";
}

function getSeasonCodeMonthIndex(seasonCode = "") {
  const match = String(seasonCode || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return (year * 12) + month - 1;
}

function getChampionTiNumberForSeasonCode(seasonCode = "") {
  const baseIndex = getSeasonCodeMonthIndex(CHAMPION_BASE_SEASON_CODE);
  const seasonIndex = getSeasonCodeMonthIndex(seasonCode);
  if (baseIndex === null || seasonIndex === null || seasonIndex < baseIndex) return null;
  return seasonIndex - baseIndex + 1;
}

function getChampionTiLabel(seasonCode = "") {
  const tiNumber = getChampionTiNumberForSeasonCode(seasonCode);
  return tiNumber ? `TI${tiNumber}` : "";
}

function getChampionSeasonSortValue(seasonCode = "") {
  return getSeasonCodeMonthIndex(seasonCode) ?? Number.MAX_SAFE_INTEGER;
}

function getChampionSeasonStartSortValue(entryOrSeason = {}) {
  const seasonCode = String(entryOrSeason?.seasonCode || entryOrSeason?.code || "").trim();
  const season = (allSeasons || []).find((item) => String(item?.code || "").trim() === seasonCode) || entryOrSeason;
  const startValue = String(season?.start_at || season?.start_date || "").trim();
  if (startValue) {
    const timestamp = new Date(startValue).getTime();
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  const monthIndex = getChampionSeasonSortValue(seasonCode);
  if (monthIndex === Number.MAX_SAFE_INTEGER) {
    return Number.NEGATIVE_INFINITY;
  }
  return new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1).getTime();
}

function compareChampionEntriesByRecentSeasonStart(a, b) {
  const startDiff = getChampionSeasonStartSortValue(b) - getChampionSeasonStartSortValue(a);
  if (startDiff !== 0) return startDiff;
  return String(b.seasonCode || "").localeCompare(String(a.seasonCode || ""), "zh-CN");
}

function isEndedSeasonForChampion(season = {}) {
  const status = String(season?.status || "").toLowerCase();
  return status === "closed" || status === "archived";
}

function buildFixedChampionEntries() {
  return FIXED_SEASON_CHAMPIONS.map((entry) => ({
    seasonCode: entry.seasonCode,
    seasonName: entry.seasonCode,
    tiLabel: getChampionTiLabel(entry.seasonCode),
    championName: entry.championName,
    playerId: "",
    score: null,
    source: "fixed",
  })).filter((entry) => entry.tiLabel && entry.championName);
}

function getAutoChampionSeasons() {
  const fixedSeasonCodes = new Set(FIXED_SEASON_CHAMPIONS.map((entry) => entry.seasonCode));
  return (allSeasons || [])
    .filter((season) => {
      const seasonCode = String(season?.code || "").trim();
      if (!season?.id || !seasonCode || fixedSeasonCodes.has(seasonCode)) return false;
      const tiNumber = getChampionTiNumberForSeasonCode(seasonCode);
      return tiNumber && isEndedSeasonForChampion(season);
    })
    .slice()
    .sort((a, b) => getChampionSeasonStartSortValue(b) - getChampionSeasonStartSortValue(a));
}

function normalizeCachedChampionEntry(season, cachedEntry = null) {
  if (!season?.code || !cachedEntry?.championName) return null;
  const tiLabel = getChampionTiLabel(season.code);
  if (!tiLabel) return null;
  return {
    seasonCode: season.code,
    seasonName: season.name || season.code,
    tiLabel,
    championName: cachedEntry.championName,
    playerId: cachedEntry.playerId || "",
    score: cachedEntry.score === null || cachedEntry.score === undefined || cachedEntry.score === ""
      ? null
      : (Number.isFinite(Number(cachedEntry.score)) ? Number(cachedEntry.score) : null),
    source: "cache",
  };
}

async function fetchSeasonChampionEntry(season) {
  if (!season?.id || !season?.code) return null;
  const rows = sortLeaderboardPlayers(await loadPrizeDistributionLeaderboardRows(season.id));
  const champion = rows[0] || null;
  if (!champion) return null;

  return {
    seasonCode: season.code,
    seasonName: season.name || season.code,
    tiLabel: getChampionTiLabel(season.code),
    championName: stripPlayerNameMeta(champion.display_name || "未知选手") || "未知选手",
    playerId: champion.player_id || champion.id || "",
    score: Number.isFinite(Number(champion.score)) ? Number(champion.score) : null,
    source: "database",
  };
}

async function loadLeaderboardChampions() {
  if (isLeaderboardChampionsLoading) return leaderboardChampions;
  isLeaderboardChampionsLoading = true;
  leaderboardChampionsStatusText = copyText("leaderboard.championsStatusLoading", "冠军读取中...");
  renderLeaderboardChampions();

  if (!allSeasons.length) {
    await loadSeasons();
  }

  const cache = readSeasonChampionCache();
  let didChangeCache = false;
  let errorCount = 0;
  const dynamicEntries = [];

  for (const season of getAutoChampionSeasons()) {
    const cachedEntry = normalizeCachedChampionEntry(season, cache[season.code]);
    if (cachedEntry) {
      dynamicEntries.push(cachedEntry);
      continue;
    }

    try {
      const fetchedEntry = await fetchSeasonChampionEntry(season);
      if (!fetchedEntry?.championName) continue;
      dynamicEntries.push(fetchedEntry);
      cache[season.code] = {
        seasonId: season.id,
        seasonName: season.name || season.code,
        championName: fetchedEntry.championName,
        playerId: fetchedEntry.playerId || "",
        score: fetchedEntry.score,
        cachedAt: Date.now(),
      };
      didChangeCache = true;
    } catch (error) {
      errorCount += 1;
      console.error(`读取 ${season.code} 冠军失败：`, error);
    }
  }

  if (didChangeCache) {
    writeSeasonChampionCache(cache);
  }

  leaderboardChampions = [
    ...buildFixedChampionEntries(),
    ...dynamicEntries,
  ].sort(compareChampionEntriesByRecentSeasonStart);

  isLeaderboardChampionsLoading = false;
  leaderboardChampionsStatusText = errorCount
    ? copyText("leaderboard.championsStatusPartial", "部分已完结赛季冠军读取失败。")
    : copyText("leaderboard.championsStatusReady", "");
  renderLeaderboardChampions();
  return leaderboardChampions;
}

function renderLeaderboardChampions() {
  if (!leaderboardChampionsList) return;
  const rows = leaderboardChampions || [];
  if (leaderboardChampionsStatus) {
    leaderboardChampionsStatus.textContent = leaderboardChampionsStatusText
      || copyText("leaderboard.championsStatusIdle", "");
  }
  if (leaderboardChampionsEmpty) {
    leaderboardChampionsEmpty.hidden = rows.length > 0 || isLeaderboardChampionsLoading;
  }

  if (isLeaderboardChampionsLoading && !rows.length) {
    leaderboardChampionsList.innerHTML = '<div class="leaderboard-champions-loading muted">冠军读取中...</div>';
    return;
  }

  leaderboardChampionsList.innerHTML = rows.map((entry) => {
    const seasonLabel = entry.seasonCode || entry.seasonName || "";
    return `
      <article class="leaderboard-champion-card" title="${escapeHtml(`${entry.tiLabel || ""}${seasonLabel ? ` · ${seasonLabel}` : ""}`)}">
        <div class="leaderboard-champion-mark" aria-hidden="true"></div>
        <div class="leaderboard-champion-main">
          <div class="leaderboard-champion-meta">
            <span class="leaderboard-champion-ti">${escapeHtml(entry.tiLabel || "")}</span>
            <span class="leaderboard-champion-season">${escapeHtml(seasonLabel)}</span>
          </div>
          <strong class="leaderboard-champion-name">${escapeHtml(entry.championName || "未知选手")}</strong>
        </div>
      </article>
    `;
  }).join("");
}

async function openLeaderboardChampions() {
  renderLeaderboardChampions();
  setManagedDialogOpen("leaderboardChampions", true, { initialFocus: closeLeaderboardChampionsBtn || undefined });
  await loadLeaderboardChampions();
}

function getLifetimeRewardRows() {
  return [...lifetimeRewardTotalsByKey.values()]
    .map(normalizeLifetimeRewardRow)
    .filter((row) => {
      if (!row || row.totalAmount <= 0) return false;
      const seasonCount = Object.values(row.seasons || {})
        .filter((amount) => Number(amount || 0) > 0)
        .length;
      if (!seasonCount) return false;
      return row.totalAmount - seasonCount * SEASON_BASE_SPONSOR_AMOUNT > LIFETIME_REWARD_EXTRA_DISPLAY_THRESHOLD;
    })
    .sort((a, b) => b.totalAmount - a.totalAmount || a.displayName.localeCompare(b.displayName, "zh-CN"));
}

function renderLeaderboardLifetimeRewards() {
  if (!leaderboardLifetimeRewardsList) return;
  const rows = getLifetimeRewardRows();
  if (leaderboardLifetimeRewardsEmpty) {
    leaderboardLifetimeRewardsEmpty.hidden = rows.length > 0 || isLifetimeRewardTotalsLoading;
  }

  if (isLifetimeRewardTotalsLoading && !rows.length) {
    leaderboardLifetimeRewardsList.innerHTML = '<div class="leaderboard-champions-loading muted">赞助总额读取中...</div>';
    return;
  }

  leaderboardLifetimeRewardsList.innerHTML = rows.map((entry, index) => {
    const seasonCount = Object.keys(entry.seasons || {}).length;
    const seasonLabel = seasonCount ? `${seasonCount} 个赛季` : "历史累计";
    return `
      <article class="leaderboard-champion-card leaderboard-lifetime-reward-card" title="${escapeHtml(`${entry.displayName} · ${formatScore(entry.totalAmount)}`)}">
        <div class="leaderboard-lifetime-reward-mark" aria-hidden="true">${index + 1}</div>
        <div class="leaderboard-champion-main">
          <div class="leaderboard-champion-meta">
            <span class="leaderboard-champion-ti">${escapeHtml(formatScore(entry.totalAmount))}</span>
            <span class="leaderboard-champion-season">${escapeHtml(seasonLabel)}</span>
          </div>
          <strong class="leaderboard-champion-name">${escapeHtml(entry.displayName || "未知选手")}</strong>
        </div>
      </article>
    `;
  }).join("");
}

function mergeLifetimeRewardSeasonTotals(seasonId = "", totals = new Map()) {
  const normalizedSeasonId = String(seasonId || "").trim();
  if (!normalizedSeasonId || !(totals instanceof Map)) return false;
  let didChange = false;
  lifetimeRewardTotalsProcessedSeasonIds.add(normalizedSeasonId);

  lifetimeRewardTotalsByKey.forEach((entry, key) => {
    if (!entry?.seasons || !(normalizedSeasonId in entry.seasons)) return;
    const seasons = { ...entry.seasons };
    delete seasons[normalizedSeasonId];
    const totalAmount = Object.values(seasons).reduce((sum, value) => sum + Number(value || 0), 0);
    if (totalAmount > 0) {
      lifetimeRewardTotalsByKey.set(key, {
        ...entry,
        seasons,
        totalAmount: Number(totalAmount.toFixed(2)),
        updatedAt: Date.now(),
      });
    } else {
      lifetimeRewardTotalsByKey.delete(key);
    }
    didChange = true;
  });

  totals.forEach((entry) => {
    if (Number(entry.totalAmount || 0) <= 0) return;
    const normalizedEntry = normalizeLifetimeRewardRow({
      ...entry,
      seasons: {
        [normalizedSeasonId]: Number(entry.totalAmount || 0),
      },
    });
    if (!normalizedEntry) return;

    const existing = normalizeLifetimeRewardRow(lifetimeRewardTotalsByKey.get(normalizedEntry.key) || normalizedEntry);
    const seasons = {
      ...(existing?.seasons || {}),
      [normalizedSeasonId]: Number(normalizedEntry.totalAmount || 0),
    };
    const totalAmount = Object.values(seasons).reduce((sum, value) => sum + Number(value || 0), 0);
    lifetimeRewardTotalsByKey.set(normalizedEntry.key, {
      ...normalizedEntry,
      displayName: normalizedEntry.displayName || existing?.displayName || "未知选手",
      seasons,
      totalAmount: Number(totalAmount.toFixed(2)),
      updatedAt: Date.now(),
    });
    didChange = true;
  });

  return didChange;
}

async function fetchSeasonLifetimeRewardTotals(seasonId = "") {
  const normalizedSeasonId = String(seasonId || "").trim();
  if (!normalizedSeasonId) return new Map();

  const { data, error } = await db
    .from("reward_donations")
    .select("player_id, donor_name, amount, players ( display_name )")
    .eq("season_id", normalizedSeasonId);

  if (error) {
    throw error;
  }

  const playerByName = new Map(
    allPlayersDirectory.map((player) => [
      stripPlayerNameMeta(player.display_name || "").trim(),
      player,
    ]).filter(([name]) => Boolean(name))
  );
  const totals = new Map();

  (data || []).forEach((row) => {
    const joinedPlayer = Array.isArray(row.players) ? row.players[0] : row.players;
    const joinedName = joinedPlayer?.display_name || "";
    const donorName = stripPlayerNameMeta(row.donor_name || joinedName || "").trim();
    const matchedPlayer = row.player_id
      ? null
      : (playerByName.get(donorName) || null);
    const playerId = String(row.player_id || matchedPlayer?.id || "").trim();
    const displayName = stripPlayerNameMeta(joinedName || matchedPlayer?.display_name || donorName || "未知选手") || "未知选手";
    const key = getLifetimeRewardKey(playerId, displayName);
    if (!key) return;

    const current = totals.get(key) || {
      key,
      playerId,
      displayName,
      totalAmount: 0,
    };
    current.totalAmount = Number((Number(current.totalAmount || 0) + Number(row.amount || 0)).toFixed(2));
    totals.set(key, current);
  });

  return totals;
}

async function updateLifetimeRewardTotalsForSeason(seasonId = "", { silent = true } = {}) {
  const normalizedSeasonId = String(seasonId || "").trim();
  if (!normalizedSeasonId) return false;
  try {
    if (!allPlayersDirectory.length) {
      await loadSeasonPlayers();
    }
    const totals = await fetchSeasonLifetimeRewardTotals(normalizedSeasonId);
    const didChange = mergeLifetimeRewardSeasonTotals(normalizedSeasonId, totals);
    writeLifetimeRewardTotalsCache({ bootstrapped: lifetimeRewardTotalsBootstrapped });
    renderLeaderboardLifetimeRewards();
    return didChange;
  } catch (error) {
    console.error("更新历届赞助总额失败：", error);
    if (!silent) {
      showGlobalToast(`历届赞助总额更新失败：${getErrorMessage(error)}`, true);
    }
    return false;
  }
}

async function bootstrapLifetimeRewardTotalsFromClosedSeasons() {
  if (isLifetimeRewardTotalsLoading) {
    return;
  }

  isLifetimeRewardTotalsLoading = true;
  renderLeaderboardLifetimeRewards();
  try {
    if (!allSeasons.length) {
      await loadSeasons();
    }
    if (!allPlayersDirectory.length) {
      await loadSeasonPlayers();
    }

    const closedSeasons = (allSeasons || [])
      .filter((season) => season?.id && (season.status === "closed" || season.status === "archived"))
      .sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || ""), "zh-CN"));
    const seasonsToLoad = lifetimeRewardTotalsBootstrapped
      ? closedSeasons.filter((season) => !lifetimeRewardTotalsProcessedSeasonIds.has(season.id))
      : closedSeasons;

    for (const season of seasonsToLoad) {
      const totals = await fetchSeasonLifetimeRewardTotals(season.id);
      mergeLifetimeRewardSeasonTotals(season.id, totals);
    }

    if (!lifetimeRewardTotalsBootstrapped || seasonsToLoad.length) {
      writeLifetimeRewardTotalsCache({ bootstrapped: true });
    }
  } finally {
    isLifetimeRewardTotalsLoading = false;
    renderLeaderboardLifetimeRewards();
  }
}

async function openLeaderboardLifetimeRewards() {
  hydrateLifetimeRewardTotalsCache();
  renderLeaderboardLifetimeRewards();
  setManagedDialogOpen("leaderboardLifetimeRewards", true, { initialFocus: closeLeaderboardLifetimeRewardsBtn || undefined });
  await bootstrapLifetimeRewardTotalsFromClosedSeasons();
}

function setHomeStealthMode(isEnabled) {
  isHomeStealthMode = Boolean(isEnabled);
  document.body.classList.toggle("home-stealth-mode", isHomeStealthMode);
  if (homeStealthToggle) {
    homeStealthToggle.dataset.active = isHomeStealthMode ? "true" : "false";
  }
}

function normalizeParticipationPointRules(rows = []) {
  return (rows || [])
    .map((row) => {
      const matchesPlayed = Number(row?.matches_played ?? row?.matchesPlayed);
      const participationPoints = Number(row?.participation_points ?? row?.participationPoints);
      const isOpenEnded = Boolean(row?.is_open_ended ?? row?.isOpenEnded);
      const extraRaw = row?.points_per_extra_match ?? row?.pointsPerExtraMatch;
      const pointsPerExtraMatch = extraRaw === null || extraRaw === undefined || extraRaw === ""
        ? null
        : Number(extraRaw);
      const isProgressive = Boolean(
        row?.is_progressive
        ?? row?.isProgressive
        ?? (isOpenEnded && Number(pointsPerExtraMatch || 0) > 0)
      );

      if (
        !Number.isInteger(matchesPlayed)
        || matchesPlayed < 0
        || !Number.isFinite(participationPoints)
        || participationPoints < 0
        || (isOpenEnded && (!Number.isFinite(pointsPerExtraMatch) || pointsPerExtraMatch < 0))
      ) {
        return null;
      }

      return {
        matchesPlayed,
        participationPoints,
        pointsPerExtraMatch: isOpenEnded ? pointsPerExtraMatch : null,
        isOpenEnded,
        isProgressive: isOpenEnded ? isProgressive : false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
      return Number(a.isOpenEnded) - Number(b.isOpenEnded);
    });
}

function getParticipationPointsTableForSeason(seasonId = activeSeason?.id) {
  const targetSeasonId = seasonId || "";
  if (!targetSeasonId) return participationPointsTable;
  return participationPointsTableBySeasonId.get(targetSeasonId) || [];
}

function setParticipationPointsTableForSeason(seasonId = activeSeason?.id, rows = []) {
  const targetSeasonId = seasonId || "";
  const normalizedRows = normalizeParticipationPointRules(rows);
  if (targetSeasonId) {
    participationPointsTableBySeasonId.set(targetSeasonId, normalizedRows);
  }
  if (!targetSeasonId || targetSeasonId === activeSeason?.id || targetSeasonId === leaderboardDisplaySeasonId) {
    participationPointsTable = normalizedRows;
  }
  return normalizedRows;
}

async function loadParticipationPointsTable(seasonId = activeSeason?.id, options = {}) {
  const targetSeasonId = seasonId || activeSeason?.id || "";
  if (!targetSeasonId) {
    participationPointsTable = [];
    renderLeaderboardParticipationView();
    return [];
  }

  if (!options.force && participationPointsTableBySeasonId.has(targetSeasonId)) {
    const cachedRules = getParticipationPointsTableForSeason(targetSeasonId);
    if (targetSeasonId === activeSeason?.id || targetSeasonId === leaderboardDisplaySeasonId) {
      participationPointsTable = cachedRules;
      renderLeaderboardParticipationView();
    }
    return cachedRules;
  }

  const { data, error } = await db
    .from("season_participation_point_rules")
    .select("matches_played, participation_points, points_per_extra_match, is_open_ended")
    .eq("season_id", targetSeasonId)
    .order("matches_played", { ascending: true });

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    throw new Error(`场次积分规则读取失败：${error.message}${migrationHint ? `。${migrationHint}` : ""}`);
  }

  const parsedTable = setParticipationPointsTableForSeason(targetSeasonId, data || []);
  if (targetSeasonId === activeSeason?.id || targetSeasonId === leaderboardDisplaySeasonId) {
    renderLeaderboardParticipationView();
  }
  return parsedTable;
}

function getParticipationPointsForMatches(matchesPlayed, seasonId = leaderboardDisplaySeasonId || activeSeason?.id) {
  const normalizedMatches = Math.max(Math.trunc(Number(matchesPlayed) || 0), 0);
  const rules = getParticipationPointsTableForSeason(seasonId);
  if (!rules.length) {
    return 0;
  }

  let resolvedPoints = 0;
  for (const row of rules) {
    if (row.isOpenEnded) {
      if (normalizedMatches >= row.matchesPlayed) {
        return row.participationPoints + ((normalizedMatches - row.matchesPlayed) * row.pointsPerExtraMatch);
      }
      continue;
    }
    if (normalizedMatches < row.matchesPlayed) {
      break;
    }
    resolvedPoints = row.participationPoints;
  }
  return resolvedPoints;
}

function applyParticipationPointsToLeaderboardPlayers(players = [], seasonId = leaderboardDisplaySeasonId || activeSeason?.id) {
  return (players || []).map((player) => {
    const totalLedgerScore = Number(player.score_total ?? player.score ?? 0);
    const bonusScore = Number(player.bonus_score ?? 0);
    const resultScore = Number(player.win_loss_score ?? player.result_score ?? (totalLedgerScore - bonusScore));
    const gamesPlayed = Number(player.games_played ?? 0);
    const participationScore = getParticipationPointsForMatches(gamesPlayed, seasonId);
    const playerId = player.player_id || player.id || "";
    const manualScore = Number(player.manual_score ?? manualScoreTotalsByPlayerId.get(playerId) ?? 0);
    return {
      ...player,
      win_loss_score: resultScore,
      result_score: resultScore,
      bonus_score: bonusScore,
      participation_score: participationScore,
      manual_score: manualScore,
      score: resultScore + bonusScore + participationScore + manualScore,
    };
  });
}

async function loadManualScoreTotalsBySeason(seasonId) {
  if (!seasonId) return new Map();
  const { data, error } = await db
    .from("manual_score_adjustments")
    .select("player_id, points_delta")
    .eq("season_id", seasonId)
    .is("revoked_at", null)
    .limit(5000);

  if (error) {
    throw error;
  }
  const totals = new Map();
  (data || []).forEach((row) => {
    const playerId = String(row?.player_id || "").trim();
    if (!playerId) return;
    totals.set(playerId, Number(totals.get(playerId) ?? 0) + Number(row?.points_delta ?? 0));
  });
  return totals;
}

async function loadBonusScoreTotalsBySeason(seasonId) {
  if (!seasonId) return new Map();
  const { data, error } = await db
    .from("score_ledger")
    .select("id, player_id, entry_type, points_delta, reversal_of_id")
    .eq("season_id", seasonId)
    .limit(10000);

  if (error) {
    console.error("加载加成积分汇总失败：", error);
    return new Map();
  }

  const rows = data || [];
  const entryTypesById = new Map(
    rows
      .filter((row) => row?.id)
      .map((row) => [row.id, row.entry_type])
  );
  const totals = new Map();

  rows.forEach((row) => {
    const playerId = String(row?.player_id || "").trim();
    if (!playerId) return;
    const isItemEffect = row.entry_type === "item_effect"
      || (row.entry_type === "rollback" && entryTypesById.get(row.reversal_of_id) === "item_effect");
    if (!isItemEffect) return;
    const pointsDelta = Number(row?.points_delta ?? 0);
    if (!Number.isFinite(pointsDelta) || pointsDelta === 0) return;
    totals.set(playerId, Number(totals.get(playerId) ?? 0) + pointsDelta);
  });

  return totals;
}

function getEffectiveLeaderboardGames(matchesPlayed = 0, wins = 0, losses = 0) {
  const resolvedWins = Math.max(Math.trunc(Number(wins) || 0), 0);
  const resolvedLosses = Math.max(Math.trunc(Number(losses) || 0), 0);
  const decidedGames = resolvedWins + resolvedLosses;
  if (decidedGames > 0) {
    return decidedGames;
  }
  return Math.max(Math.trunc(Number(matchesPlayed) || 0), 0);
}

function buildParticipationPointRanges(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const sortedRows = normalizeParticipationPointRules(rows);
  const exactRows = sortedRows.filter((row) => !row.isOpenEnded);
  const openEndedRule = sortedRows.find((row) => row.isOpenEnded) || null;

  const ranges = [];
  let currentRange = null;

  exactRows.forEach((row) => {
    if (!currentRange) {
      currentRange = {
        start: row.matchesPlayed,
        end: row.matchesPlayed,
        participationPoints: row.participationPoints,
      };
      return;
    }

    const isContinuous = row.matchesPlayed === currentRange.end + 1;
    const isSamePoints = row.participationPoints === currentRange.participationPoints;

    if (isContinuous && isSamePoints) {
      currentRange.end = row.matchesPlayed;
      return;
    }

    ranges.push(currentRange);
    currentRange = {
      start: row.matchesPlayed,
      end: row.matchesPlayed,
      participationPoints: row.participationPoints,
    };
  });

  if (currentRange) {
    ranges.push(currentRange);
  }

  const visibleRanges = ranges.filter((range) => range.participationPoints !== 0);
  if (openEndedRule && (openEndedRule.participationPoints !== 0 || openEndedRule.pointsPerExtraMatch !== 0)) {
    visibleRanges.push({
      start: openEndedRule.matchesPlayed,
      end: null,
      participationPoints: openEndedRule.participationPoints,
      pointsPerExtraMatch: openEndedRule.pointsPerExtraMatch,
      isOpenEnded: true,
      isProgressive: openEndedRule.isProgressive,
    });
  }
  return visibleRanges;
}

function isSameLeaderboardRankGroup(a, b) {
  if (!a || !b) return false;
  return Math.abs(getLeaderboardTotalScore(a) - getLeaderboardTotalScore(b)) < 0.0001
    && Math.abs(getLeaderboardWinLossScore(a) - getLeaderboardWinLossScore(b)) < 0.0001
    && Math.abs(getLeaderboardBonusScore(a) - getLeaderboardBonusScore(b)) < 0.0001
    && Math.abs(getLeaderboardParticipationScore(a) - getLeaderboardParticipationScore(b)) < 0.0001
    && Math.abs(getLeaderboardManualScore(a) - getLeaderboardManualScore(b)) < 0.0001
    && Math.abs(
      getWinRateNumber(a.win_rate, a.wins, a.games_played)
      - getWinRateNumber(b.win_rate, b.wins, b.games_played)
    ) < 0.0001;
}

function getLeaderboardDisplayRankAtIndex(players, index) {
  if (!Array.isArray(players) || index < 0 || index >= players.length) return 0;
  if (index === 0) return 1;
  return isSameLeaderboardRankGroup(players[index], players[index - 1])
    ? getLeaderboardDisplayRankAtIndex(players, index - 1)
    : index + 1;
}

function buildLeaderboardShareText(players = leaderboardPlayers) {
  const source = players || [];
  if (!source.length) {
    return "";
  }

  const headerSeasonName = leaderboardDisplaySeasonName || activeSeason?.name || "";
  const header = headerSeasonName
    ? `【${headerSeasonName}积分榜】`
    : "【积分榜】";
  const rankMap = buildLeaderboardDisplayRankMap(source);

  const lines = source.map((player, idx) => {
    const playerId = player.player_id || player.id || "";
    const displayRank = rankMap.get(playerId) || getLeaderboardDisplayRankAtIndex(source, idx);
    const playerName = stripPlayerNameMeta(player.display_name || "未知选手");
    const score = formatScore(player.score);
    const gamesPlayed = Number(player.games_played ?? 0);
    const winRate = formatWinRateValue(player.win_rate, player.wins, player.games_played);
    return `${displayRank}. ${playerName}｜${score}分｜${gamesPlayed}场｜${winRate}`;
  });

  return [
    header,
    ...lines,
  ].join("\n");
}

function buildLeaderboardScoreTooltip(player) {
  const resultScore = Number(player.result_score ?? 0);
  const bonusScore = Number(player.bonus_score ?? 0);
  const participationScore = Number(player.participation_score ?? 0);
  const manualScore = Number(player.manual_score ?? 0);
  const totalScore = Number(player.score ?? (resultScore + bonusScore + participationScore + manualScore));

  return {
    text: `胜负积分 ${formatScore(resultScore)}，加成积分 ${formatScore(bonusScore)}，场次积分 ${formatScore(participationScore)}，人工积分 ${formatScore(manualScore)}，总积分 ${formatScore(totalScore)}`,
    html: [
      `<span class="leaderboard-hovercard-title">积分构成</span>`,
      `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">胜负积分</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(formatScore(resultScore))}</strong></span>`,
      `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">加成积分</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(formatScore(bonusScore))}</strong></span>`,
      `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">场次积分</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(formatScore(participationScore))}</strong></span>`,
      `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">人工积分</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(formatScore(manualScore))}</strong></span>`,
      `<span class="leaderboard-hovercard-row leaderboard-hovercard-row-total"><span class="leaderboard-hovercard-row-label">总积分</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(formatScore(totalScore))}</strong></span>`,
    ].join(""),
  };
}

async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

async function copyLeaderboardSummary() {
  const text = buildLeaderboardShareText();
  if (!text) {
    setMessage("当前暂无可复制的积分榜内容。", true);
    return;
  }

  if (leaderboardCopyBtn) {
    leaderboardCopyBtn.disabled = true;
  }

  try {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      setMessage("积分榜复制失败，请稍后重试。", true);
      showGlobalToast("积分榜复制失败，请稍后重试。", true);
      return;
    }
    setMessage("积分榜文本已复制，可直接粘贴到微信。");
    showGlobalToast("积分榜文本已复制");
  } catch (error) {
    setMessage(`积分榜复制失败：${error.message || "未知错误"}`, true);
    showGlobalToast(`积分榜复制失败：${error.message || "未知错误"}`, true);
  } finally {
    if (leaderboardCopyBtn) {
      leaderboardCopyBtn.disabled = false;
    }
  }
}

function buildMatchDayBattleReportText(group) {
  const matches = group?.matches || [];
  const attendanceNotes = group?.attendance_notes || [];
  const dateLabel = group?.match_date || "历史比赛";
  const seasonName = activeSeason?.id && group?.season_id === activeSeason.id
    ? activeSeason.name
    : (allSeasons.find((season) => season.id === group?.season_id)?.name || "");
  const header = seasonName
    ? `【${seasonName} ${dateLabel}战斗简报】`
    : `【${dateLabel}战斗简报】`;

  const lines = [header];

  if (!matches.length) {
    lines.push("当日暂无已记录比赛。");
  } else {
    matches.forEach((match, index) => {
      const players = parseRecentMatchPlayers(match.players);
      const teamAPlayers = players
        .filter((player) => player.team === "A")
        .map((player) => stripPlayerNameMeta(player.display_name || "未知选手"));
      const teamBPlayers = players
        .filter((player) => player.team === "B")
        .map((player) => stripPlayerNameMeta(player.display_name || "未知选手"));
      const matchLabel = `第${index + 1}场`;
      const titleLine = [matchLabel, getWinnerLabel(match.winner_team)]
        .filter(Boolean)
        .join("｜");
      lines.push(titleLine);
      lines.push(`天辉：${teamAPlayers.join("·") || "待补充"}`);
      lines.push(`夜魇：${teamBPlayers.join("·") || "待补充"}`);

      const noteLines = getMatchNoteLines(match);
      if (noteLines.length) {
        lines.push(`备注：${noteLines.join("；")}`);
      }
    });
  }

  const standbyNames = attendanceNotes
    .filter((entry) => entry.status === "standby")
    .map((entry) => stripPlayerNameMeta(entry.display_name || "未知选手"));
  const absentNames = attendanceNotes
    .filter((entry) => entry.status === "absent")
    .map((entry) => stripPlayerNameMeta(entry.display_name || "未知选手"));

  if (standbyNames.length) {
    lines.push(`替补：${standbyNames.join("·")}`);
  }
  if (absentNames.length) {
    lines.push(`迟到：${absentNames.join("·")}`);
  }

  return lines.join("\n");
}

async function copyMatchDayBattleReport(groupKey, buttonEl) {
  const group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);
  if (!group) {
    setMessage("未找到对应比赛日，暂时无法复制战斗简报。", true);
    return;
  }

  const text = buildMatchDayBattleReportText(group);
  if (!text) {
    setMessage("当前暂无可复制的战斗简报内容。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  try {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      setMessage("战斗简报复制失败，请稍后重试。", true);
      showGlobalToast("战斗简报复制失败，请稍后重试。", true);
      return;
    }
    setMessage(`${group.match_date || "该比赛日"}战斗简报已复制。`);
    showGlobalToast(`${group.match_date || "该比赛日"}战斗简报已复制`);
  } catch (error) {
    setMessage(`战斗简报复制失败：${error.message || "未知错误"}`, true);
    showGlobalToast(`战斗简报复制失败：${error.message || "未知错误"}`, true);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
  }
}

function getHeroDisplayName(heroName) {
  if (!heroName) return "";
  return HERO_NAME_ZH[heroName] || heroName;
}

function getEnglishInitials(heroName) {
  return heroName
    .toLowerCase()
    .replace(/'/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
}

function getHeroSearchKeywords(heroName) {
  const english = heroName.toLowerCase();
  const chinese = getHeroDisplayName(heroName);
  const aliases = HERO_ALIASES[heroName] || [];
  return [
    english,
    english.replace(/[^a-z0-9]+/g, ""),
    getEnglishInitials(heroName),
    chinese,
    (HERO_PINYIN_INITIALS[heroName] || "").toLowerCase(),
    ...aliases,
  ].filter(Boolean);
}

function isHeroSearchReady(searchTerm = "") {
  const normalizedSearch = String(searchTerm || "").trim();
  if (!normalizedSearch) return false;

  const hasChinese = /[\u3400-\u9fff]/.test(normalizedSearch);
  return hasChinese ? normalizedSearch.length >= 1 : normalizedSearch.length >= 2;
}

function getFilteredHeroes(searchTerm = "") {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
  if (!normalizedSearch || !isHeroSearchReady(normalizedSearch)) {
    return DOTA_HEROES;
  }

  return DOTA_HEROES.filter((hero) =>
    getHeroSearchKeywords(hero).some((keyword) => keyword.toLowerCase().includes(normalizedSearch))
  );
}

function setMatchFormOpen(isOpen) {
  isMatchFormOpen = isOpen && isCurrentRoleScorer();
  matchFormPanel.hidden = !isMatchFormOpen;
  openMatchFormBtn.textContent = isMatchFormOpen ? "正在录入比赛" : "添加当日比赛";
  openMatchFormBtn.disabled = !isCurrentRoleScorer() || isMatchFormOpen || !isActiveSeasonReadyForMatches();
}

function setBackfillFormOpen(isOpen) {
  isBackfillFormOpen = isOpen && isCurrentRoleScorer();
  backfillFormPanel.hidden = !isBackfillFormOpen;
  openBackfillFormBtn.disabled = !isCurrentRoleScorer() || isBackfillFormOpen || !isActiveSeasonReadyForMatches();
}

function setSeasonPanelOpen(isOpen) {
  isSeasonPanelOpen = isOpen;
  seasonPlayersPanel.hidden = !isOpen;
  if (seasonToggleBtn) {
    seasonToggleBtn.setAttribute("aria-expanded", String(isOpen));
  }
  renderSeasonRolloverAction();
}

function setRewardPanelOpen(isOpen) {
  isRewardPanelOpen = isOpen;
  rewardPanel.hidden = !isOpen;
  seasonRewardTotal.setAttribute("aria-expanded", String(isOpen));
}

function refreshRewardPanelSelectionUi() {
  if (!isRewardPanelOpen) return;
  renderRewardPlayerPicker();
  updateRewardMinimumHint();
}

function selectRewardPlayer(playerId = "") {
  rewardSelectedPlayerId = playerId || "";
  refreshRewardPanelSelectionUi();
}

function setScorerPanelOpen(isOpen) {
  isScorerPanelOpen = Boolean(isOpen) && isCurrentRoleScorerOnly();
  if (scorerPanel) {
    scorerPanel.hidden = !isScorerPanelOpen;
  }
  if (scorerModeBtn) {
    scorerModeBtn.setAttribute("aria-expanded", String(isScorerPanelOpen));
    scorerModeBtn.textContent = isScorerPanelOpen ? "收起记录" : "记录员模式";
  }
  if (isScorerPanelOpen) {
    setAdminPanelOpen(false);
  }
}

function getClosedSeasonsForHistoryRepair() {
  return (allSeasons || [])
    .filter((season) => season?.id && String(season.status || "").toLowerCase() === "closed")
    .slice()
    .sort((a, b) => String(b.start_at || "").localeCompare(String(a.start_at || ""), "zh-CN"));
}

function isAdminHistoryRepairActiveForSeason(seasonId = "") {
  return Boolean(
    isCurrentRoleAdmin()
    && adminHistoryRepairState.seasonId
    && adminHistoryRepairState.seasonId === seasonId
    && adminHistoryRepairState.reason
    && adminHistoryRepairState.expiresAt > Date.now()
  );
}

function renderAdminHistoryRepairControls() {
  if (!adminHistoryRepairControls) return;
  const active = isAdminHistoryRepairActiveForSeason(adminHistoryRepairState.seasonId);
  const closedSeasons = getClosedSeasonsForHistoryRepair();
  const selectedSeasonId = active
    ? adminHistoryRepairState.seasonId
    : String(adminHistoryRepairSeasonSelect?.value || "");

  adminHistoryRepairControls.hidden = !isAdminHistoryRepairControlsOpen;
  adminHistoryRepairToggleBtn?.setAttribute("aria-expanded", String(isAdminHistoryRepairControlsOpen));
  if (adminHistoryRepairSeasonSelect) {
    adminHistoryRepairSeasonSelect.innerHTML = buildSeasonOptions(closedSeasons, selectedSeasonId);
    adminHistoryRepairSeasonSelect.disabled = active;
  }
  if (adminHistoryRepairReasonInput) {
    adminHistoryRepairReasonInput.disabled = active;
    if (active) adminHistoryRepairReasonInput.value = adminHistoryRepairState.reason;
  }
  if (adminStartHistoryRepairBtn) adminStartHistoryRepairBtn.hidden = active;
  if (adminStopHistoryRepairBtn) adminStopHistoryRepairBtn.hidden = !active;

  if (active) {
    const season = getSeasonMetaById(adminHistoryRepairState.seasonId);
    const remainingMinutes = Math.max(1, Math.ceil((adminHistoryRepairState.expiresAt - Date.now()) / 60000));
    setMessageNode(
      adminHistoryRepairStatus,
      `${season?.name || "所选赛季"} 维修模式已开启，约 ${remainingMinutes} 分钟后自动结束。所有操作将写入长期审计记录。`
    );
  } else {
    setMessageNode(adminHistoryRepairStatus, "");
  }
}

function stopAdminHistoryRepairMode(message = "历史维修模式已结束。") {
  adminHistoryRepairState = { seasonId: "", reason: "", expiresAt: 0 };
  clearBackfillForm();
  setBackfillFormOpen(false);
  renderBackfillForm();
  renderAdminHistoryRepairControls();
  if (message) setAdminPanelMessage(message);
}

async function startAdminHistoryRepairMode() {
  if (!isCurrentRoleAdmin()) return;
  await loadSeasons();
  const seasonId = String(adminHistoryRepairSeasonSelect?.value || "").trim();
  const reason = String(adminHistoryRepairReasonInput?.value || "").trim();
  const season = getClosedSeasonsForHistoryRepair().find((entry) => entry.id === seasonId) || null;
  if (!season) {
    setMessageNode(adminHistoryRepairStatus, "请选择一个已结束赛季。", true);
    return;
  }
  if (reason.length < 4) {
    setMessageNode(adminHistoryRepairStatus, "请填写至少 4 个字的维修原因。", true);
    return;
  }

  adminHistoryRepairState = {
    seasonId,
    reason,
    expiresAt: Date.now() + ADMIN_HISTORY_REPAIR_WINDOW_MS,
  };
  backfillSeasonSelect.value = seasonId;
  clearBackfillForm();
  backfillSeasonSelect.value = seasonId;
  backfillDateInput.value = season.end_date || getPreviousBeijingBusinessDateString();
  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderAdminHistoryRepairControls();
  renderBackfillForm();
  await ensureBackfillSeasonSelectionLoaded({ forcePlayers: true });
  await loadRecentMatchesForSeason(seasonId, { keepOpen: true });
  refreshBackfillSelectOptions();
  backfillFormPanel?.scrollIntoView({ behavior: "smooth", block: "start" });

  const expectedExpiry = adminHistoryRepairState.expiresAt;
  setTimeout(() => {
    if (adminHistoryRepairState.expiresAt === expectedExpiry && Date.now() >= expectedExpiry) {
      stopAdminHistoryRepairMode("历史维修窗口已自动到期。");
    }
  }, ADMIN_HISTORY_REPAIR_WINDOW_MS + 500);
}

function setAdminPanelOpen(isOpen) {
  isAdminPanelOpen = isOpen && isCurrentRoleAdmin();
  adminPanel.hidden = !isAdminPanelOpen;
  adminModeBtn.setAttribute("aria-expanded", String(isAdminPanelOpen));
  if (adminModeBtn) {
    adminModeBtn.textContent = isAdminPanelOpen ? "收起管理" : "管理员模式";
  }
  if (isAdminPanelOpen) {
    setScorerPanelOpen(false);
    renderAdminHistoryRepairControls();
  } else if (adminHistoryRepairState.seasonId) {
    stopAdminHistoryRepairMode("");
  }
}

const DIALOG_FOCUS_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const managedDialogEntries = [
  { modal: scorerSeasonRuleModal, close: () => setManagedDialogOpen("scorerSeasonRule", false) },
  { modal: adminSeasonRuleModal, close: () => setManagedDialogOpen("adminSeasonRule", false) },
  { modal: scorerPowerModal, close: () => setManagedDialogOpen("scorerPower", false) },
  { modal: adminPowerModal, close: () => setManagedDialogOpen("adminPower", false) },
  { modal: scorerPlayerManagementModal, close: () => setManagedDialogOpen("scorerPlayerManagement", false) },
  { modal: adminPlayerManagementModal, close: () => setManagedDialogOpen("adminPlayerManagement", false) },
  { modal: scorerManualScoreModal, close: () => setManagedDialogOpen("scorerManualScore", false) },
  { modal: adminManualScoreModal, close: () => setManagedDialogOpen("adminManualScore", false) },
  { modal: scorerItemCatalogModal, close: () => setManagedDialogOpen("scorerItemCatalog", false) },
  { modal: adminItemCatalogModal, close: () => setManagedDialogOpen("adminItemCatalog", false) },
  { modal: scorerActionLogsModal, close: () => setManagedDialogOpen("scorerActionLogs", false) },
  { modal: adminActionLogsModal, close: () => setManagedDialogOpen("adminActionLogs", false) },
  { modal: itemInventoryLogsModal, close: () => setManagedDialogOpen("itemInventoryLogs", false) },
  { modal: leaderboardPowerViewModal, close: () => setManagedDialogOpen("leaderboardPowerView", false) },
  { modal: leaderboardParticipationViewModal, close: () => setManagedDialogOpen("leaderboardParticipationView", false) },
  { modal: leaderboardChampionsModal, close: () => setManagedDialogOpen("leaderboardChampions", false) },
  { modal: leaderboardLifetimeRewardsModal, close: () => setManagedDialogOpen("leaderboardLifetimeRewards", false) },
  { modal: playerRelationModal, close: () => setManagedDialogOpen("playerRelation", false) },
  { modal: adminBackgroundPickerModal, close: () => setManagedDialogOpen("adminBackgroundPicker", false) },
].filter((entry) => entry.modal);

const seasonRolloverEntries = [...document.querySelectorAll('[data-role="season-rollover-block"]')]
  .map((block) => ({
    block,
    button: block.querySelector('[data-role="season-rollover-btn"]'),
    status: block.querySelector('[data-role="season-rollover-status"]'),
  }))
  .filter((entry) => entry.block && entry.button && entry.status);

function getOpenDialogModal() {
  return [
    systemPromptModal,
    deleteMatchConfirmModal,
    adminExportSeasonModal,
    adminPrizeDistributionModal,
    adminParticipationRulesModal,
    heroPickerModal,
    scoreDetailModal,
    accessModal,
    ...managedDialogEntries.map((entry) => entry.modal),
  ]
    .find((modal) => modal && !modal.hidden) || null;
}

function getDialogFocusableElements(modal) {
  if (!modal) return [];
  return [...modal.querySelectorAll(DIALOG_FOCUS_SELECTOR)]
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function focusDialogElement(target) {
  if (!target || typeof target.focus !== "function") return;
  window.requestAnimationFrame(() => target.focus());
}

function setDialogOpen(modal, isOpen, options = {}) {
  if (!modal) return;

  if (isOpen) {
    dialogFocusRestoreElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : dialogFocusRestoreElement;
    modal.hidden = false;
    modal.dataset.state = "open";
    modal.setAttribute("aria-hidden", "false");
    const initialFocus = options.initialFocus || getDialogFocusableElements(modal)[0];
    focusDialogElement(initialFocus);
    return;
  }

  modal.dataset.state = "closed";
  modal.setAttribute("aria-hidden", "true");
  modal.hidden = true;
  if (options.restoreFocus !== false && dialogFocusRestoreElement) {
    focusDialogElement(dialogFocusRestoreElement);
  }
}

function getManagedDialogModal(key = "") {
  switch (key) {
    case "scorerSeasonRule":
      return scorerSeasonRuleModal;
    case "adminSeasonRule":
      return adminSeasonRuleModal;
    case "scorerPower":
      return scorerPowerModal;
    case "adminPower":
      return adminPowerModal;
    case "scorerPlayerManagement":
      return scorerPlayerManagementModal;
    case "adminPlayerManagement":
      return adminPlayerManagementModal;
    case "scorerManualScore":
      return scorerManualScoreModal;
    case "adminManualScore":
      return adminManualScoreModal;
    case "scorerItemCatalog":
      return scorerItemCatalogModal;
    case "adminItemCatalog":
      return adminItemCatalogModal;
    case "scorerActionLogs":
      return scorerActionLogsModal;
    case "adminActionLogs":
      return adminActionLogsModal;
    case "itemInventoryLogs":
      return itemInventoryLogsModal;
    case "leaderboardPowerView":
      return leaderboardPowerViewModal;
    case "leaderboardParticipationView":
      return leaderboardParticipationViewModal;
    case "leaderboardChampions":
      return leaderboardChampionsModal;
    case "leaderboardLifetimeRewards":
      return leaderboardLifetimeRewardsModal;
    case "playerRelation":
      return playerRelationModal;
    case "adminBackgroundPicker":
      return adminBackgroundPickerModal;
    default:
      return null;
  }
}

function setManagedDialogOpen(key = "", isOpen = false, options = {}) {
  const modal = getManagedDialogModal(key);
  if (!modal) return;
  const isCurrentlyOpen = !modal.hidden;
  if (isCurrentlyOpen === Boolean(isOpen)) {
    return;
  }
  setDialogOpen(modal, isOpen, options);
  if (!isOpen) {
    if (key === "scorerPower") {
      seasonPowerDraftCommitTimers.scorer.forEach((timerId) => window.clearTimeout(timerId));
      seasonPowerDraftCommitTimers.scorer.clear();
      seasonPowerDraftState.scorer = null;
      renderRankLabelEditors();
    } else if (key === "adminPower") {
      seasonPowerDraftCommitTimers.admin.forEach((timerId) => window.clearTimeout(timerId));
      seasonPowerDraftCommitTimers.admin.clear();
      seasonPowerDraftState.admin = null;
      renderRankLabelEditors();
    } else if (key === "scorerItemCatalog") {
      resetItemCatalogForm("scorer", { closeEditor: true });
    } else if (key === "adminItemCatalog") {
      resetItemCatalogForm("admin", { closeEditor: true });
    } else if (key === "adminBackgroundPicker") {
      adminPlayerBackgroundSettingsOpen = false;
      renderAdminPlayerBackgroundSettings();
    }
  }
}

function setLeaderboardCompactMode(isCompact) {
  isLeaderboardCompact = false;
  leaderboardCard?.classList.toggle("leaderboard-card-compact", isLeaderboardCompact);
  writeStoredLeaderboardCompactState(false);
  if (leaderboardCompactBtn) {
    leaderboardCompactBtn.setAttribute("aria-pressed", String(isLeaderboardCompact));
    leaderboardCompactBtn.setAttribute("aria-label", isLeaderboardCompact ? "展开积分榜" : "收起积分榜");
    leaderboardCompactBtn.title = isLeaderboardCompact ? "展开积分榜" : "收起积分榜";
  }
}

function closeScoreDetailModal() {
  scoreDetailState = null;
  scoreDetailFilterMode = "all";
  clearLeaderboardScoreCompositionState({ clearFocus: true });
  if (scoreDetailModal) {
    setDialogOpen(scoreDetailModal, false, { restoreFocus: false });
  }
  if (scoreDetailSummary) {
    scoreDetailSummary.innerHTML = "";
  }
  if (scoreDetailList) {
    scoreDetailList.innerHTML = "";
  }
  setScoreDetailMessage("");
}

function clearLeaderboardScoreCompositionState(options = {}) {
  const except = options.except || null;
  document.querySelectorAll(".leaderboard-score-wrap.leaderboard-score-composition-open").forEach((wrap) => {
    if (wrap === except) return;
    wrap.classList.remove("leaderboard-score-composition-open");
    wrap.querySelector(".leaderboard-score-trigger")?.setAttribute("aria-expanded", "false");
  });

  if (!options.clearFocus) return;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && activeElement.closest(".leaderboard-score-wrap")) {
    activeElement.blur();
  }
}

function toggleLeaderboardScoreComposition(trigger) {
  if (!(trigger instanceof HTMLElement)) return;
  const scoreWrap = trigger.closest(".leaderboard-score-wrap");
  if (!scoreWrap) return;
  const shouldOpen = !scoreWrap.classList.contains("leaderboard-score-composition-open");

  clearLeaderboardScoreCompositionState({ except: scoreWrap });
  scoreWrap.classList.toggle("leaderboard-score-composition-open", shouldOpen);
  trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  if (shouldOpen) {
    try {
      trigger.focus({ preventScroll: true });
    } catch (_error) {
      trigger.focus();
    }
  } else {
    trigger.blur();
  }
}

function renderScoreDetailLoading(player) {
  const seasonId = leaderboardDisplaySeasonId || activeSeason?.id || null;
  const initialScore = getSeasonInitialScore(seasonId);
  const seasonLabelName = getSeasonMetaById(seasonId)?.name || leaderboardDisplaySeasonName || activeSeason?.name || "";
  const currentScore = Number(player?.score ?? player?.result_score ?? initialScore);

  if (scoreDetailTitle) {
    scoreDetailTitle.textContent = `${stripPlayerNameMeta(player?.display_name || "未知选手")} · 积分明细`;
  }
  if (scoreDetailSubtitle) {
    const seasonLabel = seasonLabelName
      ? `${seasonLabelName} · 起始 ${formatScore(initialScore)} 分`
      : `起始 ${formatScore(initialScore)} 分`;
    scoreDetailSubtitle.textContent = seasonLabel;
  }
  if (scoreDetailSummary) {
    scoreDetailSummary.innerHTML = `
      <div class="score-detail-summary-card">
        <span class="score-detail-summary-label">当前积分</span>
        <strong class="score-detail-summary-value">${formatScore(currentScore)}</strong>
      </div>
      <div class="score-detail-summary-card">
        <span class="score-detail-summary-label">净变化</span>
        <strong class="score-detail-summary-value">${formatSignedScore(currentScore - initialScore)}</strong>
      </div>
      <div class="score-detail-summary-card">
        <span class="score-detail-summary-label">记分项</span>
        <strong class="score-detail-summary-value">整理中</strong>
      </div>
    `;
  }
  if (scoreDetailList) {
    scoreDetailList.innerHTML = '<div class="score-detail-empty muted">正在整理积分变动...</div>';
  }
  setScoreDetailMessage("");
}

function compareScoreDetailMatches(a, b) {
  const aDate = a.match_date || formatArchiveDate(a.created_at) || "";
  const bDate = b.match_date || formatArchiveDate(b.created_at) || "";
  if (aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }

  const aMatchNo = Number(a?.match_no ?? NaN);
  const bMatchNo = Number(b?.match_no ?? NaN);
  if (Number.isFinite(aMatchNo) && Number.isFinite(bMatchNo) && aMatchNo !== bMatchNo) {
    return aMatchNo - bMatchNo;
  }

  const aTime = new Date(a.created_at || 0).getTime();
  const bTime = new Date(b.created_at || 0).getTime();
  if (aTime !== bTime) {
    return aTime - bTime;
  }

  return String(a.match_id || "").localeCompare(String(b.match_id || ""));
}

function createArchivedScoreSummaryEntry(summary, direction = "positive") {
  if (!summary || !summary.matchCount) return null;
  const isPositive = direction === "positive";
  const summaryDelta = isPositive
    ? Number(summary.positiveDelta || 0)
    : Number(summary.negativeDelta || 0);
  if (!Number.isFinite(summaryDelta) || summaryDelta === 0) return null;

  const dayCount = summary.matchDays.size;
  const rangeLabel = summary.firstDate && summary.lastDate
    ? (summary.firstDate === summary.lastDate ? summary.firstDate : `${summary.firstDate} 至 ${summary.lastDate}`)
    : "更早比赛";
  const noteParts = [
    `${summary.winCount} 胜 ${summary.loseCount} 负`,
    `累计上分 ${formatSignedScore(summary.positiveDelta || 0)}`,
    `累计掉分 ${formatSignedScore(summary.negativeDelta || 0)}`,
  ];

  if (summary.teamDoubleCount) {
    noteParts.push(`团队道具 ${summary.teamDoubleCount} 次`);
  }
  if (summary.singleDoubleCount) {
    noteParts.push(`个人道具 ${summary.singleDoubleCount} 次`);
  }
  if (summary.floorProtectionCount) {
    noteParts.push(`保底触发 ${summary.floorProtectionCount} 次`);
  }

  return {
    id: `archived-match-summary-${isPositive ? "positive" : "negative"}-${summary.firstDate || "older"}`,
    kind: isPositive ? "summary_archived_positive" : "summary_archived_negative",
    delta: summaryDelta,
    title: isPositive ? "更早比赛净胜分简报" : "更早比赛净负分简报",
    subtitle: `最近${SCORE_DETAIL_RECENT_MATCH_DAY_COUNT}个比赛日之前的历史汇总`,
    meta: `${rangeLabel} · ${dayCount} 个比赛日 · ${summary.matchCount} 场比赛`,
    note: noteParts.join(" · "),
    badges: [
      { label: isPositive ? "早期上分" : "早期掉分", tone: isPositive ? "win" : "lose" },
      { label: `${dayCount} 个比赛日`, tone: "rest" },
      { label: `${summary.matchCount} 场`, tone: "single" },
    ],
  };
}

function createFullMatchScoreSummaryEntry(summary) {
  if (!summary || !summary.matchCount) return null;

  const noteParts = [
    `${summary.winCount} 胜 ${summary.loseCount} 负`,
    `累计上分 ${formatSignedScore(summary.positiveDelta || 0)}`,
    `累计掉分 ${formatSignedScore(summary.negativeDelta || 0)}`,
  ];

  if (summary.teamDoubleCount) {
    noteParts.push(`团队道具 ${summary.teamDoubleCount} 次`);
  }
  if (summary.singleDoubleCount) {
    noteParts.push(`个人道具 ${summary.singleDoubleCount} 次`);
  }
  if (summary.floorProtectionCount) {
    noteParts.push(`保底触发 ${summary.floorProtectionCount} 次`);
  }

  return {
    id: "full-match-summary",
    kind: "summary_full_match",
    delta: summary.delta,
    title: "全部比赛简报",
    subtitle: "仅汇总比赛造成的积分变化",
    meta: `${summary.dayCount} 个比赛日 · ${summary.matchCount} 场比赛`,
    note: noteParts.join(" · "),
    badges: [
      { label: "总简报", tone: "team" },
      { label: `${summary.dayCount} 个比赛日`, tone: "rest" },
      { label: `${summary.matchCount} 场`, tone: "single" },
    ],
  };
}

function ensureScoreStateEntry(stateMap, playerId, displayName = "未知选手", initialScore = 10) {
  if (!playerId) return null;
  if (!stateMap.has(playerId)) {
    stateMap.set(playerId, {
      score: initialScore,
      gamesPlayed: 0,
      display_name: stripPlayerNameMeta(displayName || "未知选手") || "未知选手",
    });
  }
  const entry = stateMap.get(playerId);
  if (displayName && (!entry.display_name || entry.display_name === "未知选手")) {
    entry.display_name = stripPlayerNameMeta(displayName) || "未知选手";
  }
  return entry;
}

async function getScoreDetailSeasonData(seasonId) {
  if (!seasonId) {
    throw new Error("当前没有可用赛季。");
  }

  if (scoreDetailSeasonCache.has(seasonId)) {
    return scoreDetailSeasonCache.get(seasonId);
  }

  const matchesQuery = db
    .from("v_match_detail")
    .select("match_id, season_id, match_no, match_date, status, winner_side, notes, metadata, created_at, submitted_at, approved_at, players")
    .eq("season_id", seasonId)
    .order("match_date", { ascending: true })
    .order("match_no", { ascending: true })
    .limit(1200);
  const participantsQuery = db
    .from("season_memberships")
    .select("player_id")
    .eq("season_id", seasonId)
    .in("join_status", ["active", "captain"]);
  const scoreLedgerQuery = db
    .from("score_ledger")
    .select("id, season_id, player_id, match_id, entry_type, points_delta, reason, source_table, source_id, reversal_of_id, metadata, created_at")
    .eq("season_id", seasonId)
    .order("created_at", { ascending: true })
    .limit(5000);
  const manualAdjustmentsQuery = db
    .from("manual_score_adjustments")
    .select("id, season_id, player_id, points_delta, reason, metadata, created_at")
    .eq("season_id", seasonId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(5000);

  const [matchesResult, participantsResult, scoreLedgerResult, manualAdjustmentsResult] = await Promise.all([
    matchesQuery,
    participantsQuery,
    scoreLedgerQuery,
    manualAdjustmentsQuery,
  ]);

  if (matchesResult.error) {
    throw matchesResult.error;
  }
  if (scoreLedgerResult.error) {
    throw scoreLedgerResult.error;
  }
  if (manualAdjustmentsResult.error) {
    throw manualAdjustmentsResult.error;
  }

  const seasonData = {
    seasonId,
    matches: (matchesResult.data || [])
      .map((row) => normalizeMatchRecordFromView(row))
      .filter(Boolean)
      .sort(compareScoreDetailMatches),
    scoreLedger: (scoreLedgerResult.data || []).map((row) => ({
      ...row,
      points_delta: Number(row.points_delta ?? 0),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })),
    matchDays: [],
    manualAdjustments: (manualAdjustmentsResult.data || []).map((row) => ({
      ...row,
      points_delta: Number(row.points_delta ?? 0),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })),
    participantIds: new Set(
      participantsResult.error
        ? []
        : (participantsResult.data || []).map((row) => row.player_id).filter(Boolean)
    ),
  };

  scoreDetailSeasonCache.set(seasonId, seasonData);
  return seasonData;
}

function getManualAdjustmentAnchorMatchDate(entry) {
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  return String(metadata.anchor_match_date || getBeijingBusinessDateString(entry?.created_at) || "").trim();
}

function getManualAdjustmentAnchorMatchNo(entry) {
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const value = Number(metadata.anchor_match_no ?? NaN);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildManualAdjustmentScoreEntry(adjustment, matchDate, playerName) {
  const delta = Number(adjustment?.points_delta ?? 0);
  const anchorMatchNo = getManualAdjustmentAnchorMatchNo(adjustment);
  const note = getManualAdjustmentNoteText(adjustment?.reason, "");
  const matchDateLabel = formatLongDisplayDate(matchDate) || matchDate || "当前比赛日";
  const anchorLabel = anchorMatchNo
    ? `${matchDateLabel} 第 ${anchorMatchNo} 场之后`
    : `${matchDateLabel} 已记录比赛之前`;

  return {
    id: `manual-${adjustment.id || `${matchDate}-${playerName}`}`,
    kind: "manual_adjustment",
    delta,
    title: delta >= 0 ? "人工加分" : "人工扣分",
    subtitle: anchorLabel,
    meta: formatLocalTime(adjustment?.created_at) || "人工积分调整",
    note,
    badges: [
      { label: "人工积分", tone: "team" },
      { label: formatSignedScore(delta), tone: delta >= 0 ? "win" : "lose" },
    ],
    revocable: Boolean(adjustment?.id),
    adjustmentId: adjustment?.id || "",
    playerName,
    actionLabel: `${delta >= 0 ? "人工加分" : "人工扣分"} ${formatSignedScore(delta)}`,
  };
}

function buildScoreDetailEntries(player, seasonData) {
  const targetPlayerId = player.player_id || player.id || "";
  const targetPlayerName = stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手";
  const seasonId = seasonData?.seasonId || leaderboardDisplaySeasonId || activeSeason?.id || null;
  const initialScore = getSeasonInitialScore(seasonId);
  const stateMap = new Map();
  const participantIds = seasonData?.participantIds || new Set();
  const matchesByDay = new Map();
  const ledgerByMatchPlayer = new Map();
  const manualAdjustmentsByDate = new Map();
  const reversedLedgerIds = new Set(
    (seasonData?.scoreLedger || [])
      .map((entry) => entry?.reversal_of_id)
      .filter(Boolean)
  );

  ensureScoreStateEntry(stateMap, targetPlayerId, targetPlayerName, initialScore);
  participantIds.forEach((playerId) => ensureScoreStateEntry(stateMap, playerId, "未知选手", initialScore));

  (seasonData?.scoreLedger || []).forEach((entry) => {
    if (!entry?.player_id) return;
    if (entry.id && reversedLedgerIds.has(entry.id)) return;
    if (entry.entry_type === "rollback" || entry.reversal_of_id) return;
    const delta = Number(entry.points_delta ?? 0);
    if (!Number.isFinite(delta) || delta === 0) return;
    if (!entry.match_id) return;
    const key = `${entry.match_id}:${entry.player_id}`;
    if (!ledgerByMatchPlayer.has(key)) {
      ledgerByMatchPlayer.set(key, []);
    }
    ledgerByMatchPlayer.get(key).push(entry);
  });

  (seasonData?.manualAdjustments || []).forEach((entry) => {
    if (!entry?.player_id) return;
    const delta = Number(entry.points_delta ?? 0);
    if (!Number.isFinite(delta) || delta === 0) return;
    const matchDate = getManualAdjustmentAnchorMatchDate(entry);
    if (!matchDate) return;
    if (!manualAdjustmentsByDate.has(matchDate)) {
      manualAdjustmentsByDate.set(matchDate, []);
    }
    manualAdjustmentsByDate.get(matchDate).push(entry);
  });

  const getMatchLedgerDelta = (matchId, playerId, fallbackDelta = 0) => {
    const entriesForPlayer = ledgerByMatchPlayer.get(`${matchId || ""}:${playerId || ""}`) || [];
    return getEffectiveMatchPlayerLedgerDelta(entriesForPlayer, fallbackDelta);
  };

  (seasonData?.matches || []).forEach((match) => {
    const matchDate = match.match_date || formatArchiveDate(match.created_at) || "";
    if (!matchDate) return;
    if (!matchesByDay.has(matchDate)) {
      matchesByDay.set(matchDate, []);
    }
    matchesByDay.get(matchDate).push(match);
  });

  const entries = [];
  const timelineDates = [...new Set([
    ...matchesByDay.keys(),
    ...manualAdjustmentsByDate.keys(),
  ])].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
  const detailedMatchDates = new Set(timelineDates.slice(-SCORE_DETAIL_RECENT_MATCH_DAY_COUNT));
  const archivedMatchSummary = {
    firstDate: "",
    lastDate: "",
    matchDays: new Set(),
    matchCount: 0,
    winCount: 0,
    loseCount: 0,
    positiveDelta: 0,
    negativeDelta: 0,
    delta: 0,
    teamDoubleCount: 0,
    singleDoubleCount: 0,
    floorProtectionCount: 0,
  };
  const fullMatchSummary = {
    dayCount: 0,
    matchCount: 0,
    winCount: 0,
    loseCount: 0,
    positiveDelta: 0,
    negativeDelta: 0,
    delta: 0,
    teamDoubleCount: 0,
    singleDoubleCount: 0,
    floorProtectionCount: 0,
  };
  let seasonPositiveDelta = 0;
  let seasonNegativeDelta = 0;

  const accumulateSeasonDelta = (delta) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    if (delta > 0) {
      seasonPositiveDelta += delta;
    } else {
      seasonNegativeDelta += delta;
    }
  };

  fullMatchSummary.dayCount = matchesByDay.size;

  timelineDates.forEach((matchDate) => {
    const dayMatches = matchesByDay.get(matchDate) || [];
    const dayManualAdjustments = manualAdjustmentsByDate.get(matchDate) || [];
    const shouldKeepMatchLevelEntries = detailedMatchDates.has(matchDate);
    const manualAdjustmentsByAnchor = new Map();

    dayManualAdjustments.forEach((adjustment) => {
      const anchorMatchNo = getManualAdjustmentAnchorMatchNo(adjustment);
      const anchorKey = anchorMatchNo == null ? "__before__" : String(anchorMatchNo);
      if (!manualAdjustmentsByAnchor.has(anchorKey)) {
        manualAdjustmentsByAnchor.set(anchorKey, []);
      }
      manualAdjustmentsByAnchor.get(anchorKey).push(adjustment);
    });

    const applyManualAdjustments = (anchorKey) => {
      const adjustmentList = manualAdjustmentsByAnchor.get(anchorKey) || [];
      adjustmentList.forEach((adjustment) => {
        const delta = Number(adjustment?.points_delta ?? 0);
        if (!Number.isFinite(delta) || delta === 0) return;

        const state = ensureScoreStateEntry(
          stateMap,
          adjustment.player_id,
          getPlayerDisplayNameById(adjustment.player_id) || "未知选手",
          initialScore
        );
        if (state) {
          state.score += delta;
        }

        if (adjustment.player_id === targetPlayerId) {
          accumulateSeasonDelta(delta);
          entries.push(buildManualAdjustmentScoreEntry(adjustment, matchDate, targetPlayerName));
        }
      });
    };

    applyManualAdjustments("__before__");

    dayMatches.forEach((match, matchIndex) => {
      const players = parseRecentMatchPlayers(match.players);
      const doubleDowns = normalizeMatchDoubleDowns(match.double_downs, players);
      const winnerRecorded = hasRecordedWinner(match.winner_team);
      const targetPlayer = players.find((item) => item.player_id === targetPlayerId);
      const roundLabel = `第${matchIndex + 1}场`;

      players.forEach((matchPlayer) => {
        const state = ensureScoreStateEntry(stateMap, matchPlayer.player_id, matchPlayer.display_name, initialScore);
        if (!state) return;

        const delta = getMatchLedgerDelta(match.match_id, matchPlayer.player_id, matchPlayer.score_change);
        if (winnerRecorded) {
          state.score += delta;
          state.gamesPlayed += 1;
        }
      });

      applyManualAdjustments(String(match.match_no ?? ""));

      if (!targetPlayer) return;

      const delta = getMatchLedgerDelta(match.match_id, targetPlayer.player_id, targetPlayer.score_change);
      if (!winnerRecorded && (!Number.isFinite(delta) || delta === 0)) return;
      const isTeamDouble = doubleDowns.some(
        (item) => item.mode === "team" && item.target_team === targetPlayer.team
      );
      const isSingleDouble = doubleDowns.some(
        (item) => item.mode === "single" && item.target_player_id === targetPlayer.player_id
      );
      const isFloorProtected = Boolean(
        winnerRecorded
        && targetPlayer.team !== match.winner_team
        && (isTeamDouble || isSingleDouble)
        && Number.isFinite(delta)
        && delta === -1
      );
      const badges = [];

      const isTargetWinner = winnerRecorded && targetPlayer.team === match.winner_team;
      badges.push({
        label: winnerRecorded ? (isTargetWinner ? "胜场" : "败场") : "未判定",
        tone: winnerRecorded ? (isTargetWinner ? "win" : "lose") : "single",
      });
      if (isTeamDouble) {
        badges.push({ label: "团队道具", tone: "team" });
      }
      if (isSingleDouble) {
        badges.push({ label: "个人道具", tone: "single" });
      }
      if (isFloorProtected) {
        badges.push({ label: "保底生效", tone: "restplus" });
      }

      fullMatchSummary.matchCount += 1;
      fullMatchSummary.delta += Number.isFinite(delta) ? delta : 0;
      if (winnerRecorded) {
        if (isTargetWinner) {
          fullMatchSummary.winCount += 1;
        } else {
          fullMatchSummary.loseCount += 1;
        }
      }
      if (delta > 0) {
        fullMatchSummary.positiveDelta += delta;
      } else if (delta < 0) {
        fullMatchSummary.negativeDelta += delta;
      }
      accumulateSeasonDelta(delta);
      if (isTeamDouble) fullMatchSummary.teamDoubleCount += 1;
      if (isSingleDouble) fullMatchSummary.singleDoubleCount += 1;
      if (isFloorProtected) fullMatchSummary.floorProtectionCount += 1;

      const matchDateLabel = formatLongDisplayDate(matchDate) || matchDate;
      const teamAPlayers = players
        .filter((item) => item.team === "A")
        .map((item) => getCompactPlayerDisplayName(item.display_name));
      const teamBPlayers = players
        .filter((item) => item.team === "B")
        .map((item) => getCompactPlayerDisplayName(item.display_name));

      if (!shouldKeepMatchLevelEntries) {
        archivedMatchSummary.firstDate = archivedMatchSummary.firstDate || matchDate;
        archivedMatchSummary.lastDate = matchDate;
        archivedMatchSummary.matchDays.add(matchDate);
        archivedMatchSummary.matchCount += 1;
        archivedMatchSummary.delta += Number.isFinite(delta) ? delta : 0;
        if (winnerRecorded) {
          if (isTargetWinner) {
            archivedMatchSummary.winCount += 1;
          } else {
            archivedMatchSummary.loseCount += 1;
          }
        }
        if (delta > 0) {
          archivedMatchSummary.positiveDelta += delta;
        } else if (delta < 0) {
          archivedMatchSummary.negativeDelta += delta;
        }
        if (isTeamDouble) archivedMatchSummary.teamDoubleCount += 1;
        if (isSingleDouble) archivedMatchSummary.singleDoubleCount += 1;
        if (isFloorProtected) archivedMatchSummary.floorProtectionCount += 1;
        return;
      }

      if (!Number.isFinite(delta) || delta === 0) return;

      entries.push({
        id: `match-${match.match_id}-${targetPlayer.player_id}`,
        delta,
        title: `${matchDateLabel} ${roundLabel} ${winnerRecorded ? getWinnerLabel(match.winner_team) : "未判定胜负"}`,
        subtitle: "",
        meta: "",
        matchup: {
          teamA: teamAPlayers,
          teamB: teamBPlayers,
          targetTeam: targetPlayer.team,
        },
        badges,
      });
    });

    [...manualAdjustmentsByAnchor.keys()]
      .filter((anchorKey) => anchorKey !== "__before__")
      .forEach((anchorKey) => {
        const anchorMatchNo = Number(anchorKey);
        const hasMatchedAnchor = dayMatches.some((match) => Number(match?.match_no ?? NaN) === anchorMatchNo);
        if (!hasMatchedAnchor) {
          applyManualAdjustments(anchorKey);
        }
      });

  });

  const archivedPositiveSummaryEntry = createArchivedScoreSummaryEntry(archivedMatchSummary, "positive");
  const archivedNegativeSummaryEntry = createArchivedScoreSummaryEntry(archivedMatchSummary, "negative");
  const fullSummaryEntry = createFullMatchScoreSummaryEntry(fullMatchSummary);
  if (fullSummaryEntry) {
    entries.unshift(fullSummaryEntry);
  }
  if (archivedNegativeSummaryEntry) {
    entries.unshift(archivedNegativeSummaryEntry);
  }
  if (archivedPositiveSummaryEntry) {
    entries.unshift(archivedPositiveSummaryEntry);
  }

  const seasonTotalDelta = seasonPositiveDelta + seasonNegativeDelta;
  const winLossScore = Number(player.win_loss_score ?? player.result_score ?? (initialScore + seasonTotalDelta));
  const bonusScore = Number(player.bonus_score ?? 0);
  const participationScore = Number(player.participation_score ?? 0);
  const manualScore = Number(player.manual_score ?? 0);
  const currentScore = Number(player.score ?? (winLossScore + bonusScore + participationScore + manualScore));
  const positiveDelta = seasonPositiveDelta + Math.max(participationScore, 0);
  const negativeDelta = seasonNegativeDelta + Math.min(participationScore, 0);

  return {
    playerName: targetPlayerName,
    seasonId,
    initialScore,
    currentScore,
    winLossScore,
    bonusScore,
    participationScore,
    manualScore,
    totalDelta: currentScore - initialScore,
    positiveDelta,
    negativeDelta,
    entries,
  };
}

function renderScoreDetailContent(player, detail) {
  if (!scoreDetailTitle || !scoreDetailSubtitle || !scoreDetailSummary || !scoreDetailList) return;

  scoreDetailTitle.textContent = `${detail.playerName} · 积分明细`;
  const seasonLabelName = getSeasonMetaById(detail.seasonId)?.name || leaderboardDisplaySeasonName || activeSeason?.name || "";
  scoreDetailSubtitle.textContent = seasonLabelName
    ? `${seasonLabelName} · 起始 ${formatScore(detail.initialScore)} 分`
    : `起始 ${formatScore(detail.initialScore)} 分`;

  const isPositiveFilter = scoreDetailFilterMode === "positive";
  const isNegativeFilter = scoreDetailFilterMode === "negative";
  const isSummaryFilter = scoreDetailFilterMode === "summary";
  const filteredEntries = detail.entries.filter((entry) => {
    const entryKind = String(entry?.kind || "");
    if (isSummaryFilter) {
      return entryKind === "summary_full_match" || entryKind === "manual_adjustment";
    }
    if (isPositiveFilter) {
      if (entryKind === "summary_full_match" || entryKind === "summary_archived_negative") return false;
      return entryKind === "summary_archived_positive" || entry.delta > 0;
    }
    if (isNegativeFilter) {
      if (entryKind === "summary_full_match" || entryKind === "summary_archived_positive") return false;
      return entryKind === "summary_archived_negative" || entry.delta < 0;
    }
    return true;
  });

  scoreDetailSummary.innerHTML = `
    <div class="score-detail-summary-card" title="${escapeHtml(`胜负积分 ${formatScore(detail.winLossScore)} · 加成积分 ${formatScore(detail.bonusScore)} · 场次分 ${formatScore(detail.participationScore)} · 人工积分 ${formatScore(detail.manualScore)}`)}">
      <span class="score-detail-summary-label">当前积分</span>
      <strong class="score-detail-summary-value">${formatScore(detail.currentScore)}</strong>
      <span class="score-detail-summary-breakdown">${escapeHtml(`胜负 ${formatScore(detail.winLossScore)} · 加成 ${formatScore(detail.bonusScore)} · 场次 ${formatScore(detail.participationScore)} · 人工 ${formatScore(detail.manualScore)}`)}</span>
    </div>
    <button type="button" class="score-detail-summary-card score-detail-summary-filter${isSummaryFilter ? " score-detail-summary-filter-active" : ""}" data-filter-mode="summary" aria-pressed="${isSummaryFilter ? "true" : "false"}">
      <span class="score-detail-summary-label">净变化</span>
      <strong class="score-detail-summary-value ${detail.totalDelta >= 0 ? "score-detail-delta-positive" : "score-detail-delta-negative"}">${formatSignedScore(detail.totalDelta)}</strong>
    </button>
    <button type="button" class="score-detail-summary-card score-detail-summary-filter${isPositiveFilter ? " score-detail-summary-filter-active" : ""}" data-filter-mode="positive" aria-pressed="${isPositiveFilter ? "true" : "false"}">
      <span class="score-detail-summary-label">上分合计</span>
      <strong class="score-detail-summary-value score-detail-delta-positive">${formatSignedScore(detail.positiveDelta)}</strong>
    </button>
    <button type="button" class="score-detail-summary-card score-detail-summary-filter${isNegativeFilter ? " score-detail-summary-filter-active" : ""}" data-filter-mode="negative" aria-pressed="${isNegativeFilter ? "true" : "false"}">
      <span class="score-detail-summary-label">掉分合计</span>
      <strong class="score-detail-summary-value score-detail-delta-negative">${formatSignedScore(detail.negativeDelta)}</strong>
    </button>
  `;

  if (!detail.entries.length) {
    scoreDetailList.innerHTML = '<div class="score-detail-empty muted">本赛季还没有产生积分变动。</div>';
    setScoreDetailMessage("");
    return;
  }

  if (!filteredEntries.length) {
    scoreDetailList.innerHTML = `<div class="score-detail-empty muted">${isSummaryFilter ? "当前没有可显示的比赛简报或人工积分记录。" : (isPositiveFilter ? "当前没有上分记录。" : "当前没有掉分记录。")}</div>`;
    setScoreDetailMessage(
      isSummaryFilter
        ? "当前仅显示全部比赛简报与人工积分。"
        : (isPositiveFilter ? "当前仅显示上分内容。" : "当前仅显示掉分内容。")
    );
    return;
  }

  const renderMatchupHtml = (entry) => {
    if (!entry.matchup) return "";
    const renderTeam = (teamKey, label, names) => `
      <div class="score-detail-match-team${entry.matchup.targetTeam === teamKey ? " score-detail-match-team-active" : ""}">
        <span class="score-detail-match-team-label">${label}</span>
        <span class="score-detail-match-team-names">${escapeHtml((names || []).join("·") || "待补充")}</span>
      </div>
    `;

    return `
      <div class="score-detail-matchup">
        ${renderTeam("A", "天辉", entry.matchup.teamA)}
        ${renderTeam("B", "夜魇", entry.matchup.teamB)}
      </div>
    `;
  };

  scoreDetailList.innerHTML = [...filteredEntries].reverse().map((entry) => `
    <article class="score-detail-item">
      <div class="score-detail-item-head">
        <div class="score-detail-item-copy">
          <strong class="score-detail-item-title">${escapeHtml(entry.title)}</strong>
          ${entry.subtitle ? `<p class="score-detail-item-subtitle muted">${escapeHtml(entry.subtitle)}</p>` : ""}
        </div>
        <span class="score-detail-delta ${entry.delta >= 0 ? "score-detail-delta-positive" : "score-detail-delta-negative"}">${formatSignedScore(entry.delta)}</span>
      </div>
      ${entry.meta ? `<p class="score-detail-item-meta muted">${escapeHtml(entry.meta)}</p>` : ""}
      ${renderMatchupHtml(entry)}
      ${entry.note ? `<p class="score-detail-item-note">${escapeHtml(`备注：${entry.note}`)}</p>` : ""}
      <div class="score-detail-badges">
        ${entry.badges.map((badge) => `<span class="score-detail-badge score-detail-badge-${badge.tone}">${escapeHtml(badge.label)}</span>`).join("")}
      </div>
    </article>
  `).join("");

  setScoreDetailMessage(
    scoreDetailFilterMode === "all"
      ? `共整理出 ${detail.entries.length} 条有效积分变动。`
      : scoreDetailFilterMode === "summary"
        ? `当前显示 ${filteredEntries.length} 条全部比赛简报或人工积分记录。`
      : `当前筛选后显示 ${filteredEntries.length} 条记录。`
  );
}

async function openScoreDetailModal(playerId) {
  const player = leaderboardPlayers.find(
    (item) => (item.player_id || item.id) === playerId
  );
  if (!player) {
    setMessage("未找到这位选手的积分信息。", true);
    return;
  }
  const detailSeasonId = leaderboardDisplaySeasonId || activeSeason?.id || null;
  if (!detailSeasonId) {
    setMessage("当前没有可查看的赛季积分明细。", true);
    return;
  }

  const previousPlayerId = scoreDetailState?.playerId || "";
  const previousSeasonId = scoreDetailState?.seasonId || "";
  scoreDetailState = {
    playerId,
    seasonId: detailSeasonId,
  };
  if (previousPlayerId !== playerId || previousSeasonId !== detailSeasonId) {
    scoreDetailFilterMode = "all";
  }
  setDialogOpen(scoreDetailModal, true, { initialFocus: closeScoreDetailBtn });
  renderScoreDetailLoading(player);
  setScoreDetailMessage("正在整理积分变动...");

  try {
    const seasonData = await getScoreDetailSeasonData(detailSeasonId);
    if (!scoreDetailState || scoreDetailState.playerId !== playerId || scoreDetailState.seasonId !== detailSeasonId) {
      return;
    }
    const detail = buildScoreDetailEntries(player, seasonData);
    renderScoreDetailContent(player, detail);
  } catch (error) {
    if (!scoreDetailState || scoreDetailState.playerId !== playerId) return;
    if (scoreDetailList) {
      scoreDetailList.innerHTML = '<div class="score-detail-empty muted">积分明细暂时不可用。</div>';
    }
    setScoreDetailMessage(`积分明细加载失败：${error.message || "未知错误"}`, true);
  }
}

function shouldSkipNextScorerReconnect() {
  try {
    return window.sessionStorage.getItem(SKIP_NEXT_SCORER_RECONNECT_KEY) === "true";
  } catch {
    return false;
  }
}

function isApprovedRoleMember(member) {
  return (member?.status || "approved") === "approved";
}

function ensureScorerAccess(message = "当前身份无此操作权限。") {
  if (isCurrentRoleScorer()) return true;
  setMessage(message, true);
  return false;
}

function ensureAdminAccess(message = "当前身份无管理员权限。") {
  if (isCurrentRoleAdmin()) return true;
  setMessage(message, true);
  return false;
}

function getAdminDisplayName(index) {
  return `管理员 ${String.fromCharCode(65 + index)}`;
}

function getScorerDisplayName(member) {
  return member.display_name || "未命名选手";
}

function renderActionLogList(listEl, emptyEl, logs = [], emptyText = "") {
  if (listEl) {
    listEl.innerHTML = logs.length
      ? logs.map((log) => `
        <div class="admin-action-log-card admin-action-log-card-compact">
          <div class="admin-action-log-meta">
            <strong class="admin-action-log-actor">${escapeHtml(log.actor_name || "未知身份")}</strong>
            <span class="muted admin-action-log-time">${escapeHtml(formatLocalTime(log.created_at) || "未知时间")}</span>
          </div>
          <p class="admin-action-log-text">${escapeHtml(log.text || "")}</p>
        </div>
      `).join("")
      : "";
  }
  if (emptyEl) {
    emptyEl.hidden = logs.length > 0;
    if (!logs.length && emptyText) {
      emptyEl.textContent = emptyText;
    }
  }
}

function renderAdminActionLogs() {
  const logs = readAdminActionLogs();
  renderActionLogList(
    adminActionLogsList,
    adminActionLogsEmpty,
    logs,
    copyText("adminPanel.logsEmpty", "当前还没有操作记录")
  );
  renderActionLogList(
    scorerActionLogsList,
    scorerActionLogsEmpty,
    logs,
    copyText("scorerPanel.logsEmpty", "当前还没有操作记录")
  );
}

function getItemInventoryLogCopyPath(key = "") {
  const scope = itemInventoryLogMode === "admin" ? "adminPanel" : "scorerPanel";
  return `${scope}.${key}`;
}

function getItemInventoryEventLabel(eventKind = "") {
  switch (eventKind) {
    case "purchase":
      return "购买";
    case "gift":
      return "赠送";
    case "usage":
      return "使用";
    case "revoke":
      return "扣除";
    default:
      return "记录";
  }
}

function getItemInventoryEventTone(eventKind = "") {
  switch (eventKind) {
    case "purchase":
      return "base";
    case "gift":
      return "gift";
    case "usage":
      return "usage";
    case "revoke":
      return "revoke";
    default:
      return "base";
  }
}

function getItemInventoryCatalogMeta(itemCatalogId = "") {
  const entry = itemCatalogEntries.find((item) => item.id === itemCatalogId) || null;
  if (!entry) {
    return {
      name: "未命名道具",
      donationAmount: 0,
      initialQuantity: 0,
    };
  }
  return {
    name: entry.name || "未命名道具",
    donationAmount: getItemCatalogConfigNumber(entry, "donation_amount", 0),
    initialQuantity: getItemCatalogInitialQuantity(entry),
  };
}

function createItemInventoryGroup(playerId = "", playerName = "未知选手") {
  return {
    playerId,
    playerName,
    rows: [],
    initialGifts: [],
    summary: {
      purchase: 0,
      gift: 0,
      usage: 0,
      revoke: 0,
      giftedAmount: 0,
      giftedItems: new Map(),
    },
  };
}

function addItemInventoryGiftQuantity(group, itemCatalogId = "", quantity = 0) {
  if (!group || !itemCatalogId) return;
  const resolvedQuantity = Number(quantity ?? 0);
  if (!Number.isFinite(resolvedQuantity) || resolvedQuantity === 0) return;
  const current = group.summary.giftedItems.get(itemCatalogId) || {
    itemCatalogId,
    quantity: 0,
    donationAmount: getItemInventoryCatalogMeta(itemCatalogId).donationAmount,
  };
  current.quantity += resolvedQuantity;
  group.summary.giftedItems.set(itemCatalogId, current);
}

function finalizeItemInventoryGroupSummary(group) {
  if (!group) return group;
  let giftQuantity = 0;
  let giftedAmount = 0;
  group.summary.giftedItems.forEach((entry) => {
    const quantity = Math.max(Number(entry.quantity ?? 0), 0);
    giftQuantity += quantity;
    giftedAmount += quantity * Math.max(Number(entry.donationAmount ?? 0), 0);
  });
  group.summary.gift = giftQuantity;
  group.summary.giftedAmount = giftedAmount;
  group.summaryText = [
    `购买 ${formatItemUsageCount(group.summary.purchase)}`,
    `赠送 ${formatItemUsageCount(group.summary.gift)}`,
    `使用 ${formatItemUsageCount(group.summary.usage)}`,
    `获赠道具总额 ${formatScore(group.summary.giftedAmount)}`,
  ].join(" · ");
  return group;
}

function getGroupedItemInventoryLogs() {
  const seasonPlayerOrder = new Map(
    seasonPlayers.map((player, index) => [player.id, index])
  );
  const groupedRows = new Map();
  const ensureGroup = (playerId, playerName = "未知选手") => {
    if (!groupedRows.has(playerId)) {
      groupedRows.set(playerId, createItemInventoryGroup(playerId, playerName));
    }
    const group = groupedRows.get(playerId);
    if (playerName && (!group.playerName || group.playerName === "未知选手")) {
      group.playerName = playerName;
    }
    return group;
  };

  const initialGiftEntries = itemCatalogEntries
    .map((entry) => ({
      itemCatalogId: entry.id,
      itemName: entry.name || "未命名道具",
      quantity: getItemCatalogInitialQuantity(entry),
      donationAmount: getItemCatalogConfigNumber(entry, "donation_amount", 0),
    }))
    .filter((entry) => entry.itemCatalogId && entry.quantity > 0);

  if (initialGiftEntries.length) {
    seasonPlayers
      .filter((player) => player.is_in_season)
      .forEach((player) => {
        const playerId = String(player?.id || "");
        if (!playerId) return;
        const group = ensureGroup(playerId, String(player?.display_name || "未知选手"));
        initialGiftEntries.forEach((entry) => {
          group.initialGifts.push(entry);
          group.summary.giftedItems.set(entry.itemCatalogId, {
            itemCatalogId: entry.itemCatalogId,
            quantity: Number(group.summary.giftedItems.get(entry.itemCatalogId)?.quantity ?? 0) + entry.quantity,
            donationAmount: entry.donationAmount,
          });
        });
      });
  }

  itemInventoryLogRows.forEach((row) => {
    const playerId = String(row?.player_id || "");
    const playerName = String(row?.player_name || "未知选手");
    const group = ensureGroup(playerId, playerName);
    group.rows.push(row);
    const kind = String(row?.event_kind || "");
    if (Object.prototype.hasOwnProperty.call(group.summary, kind)) {
      group.summary[kind] += Number(row?.quantity ?? 0);
    }
    if (kind === "gift") {
      addItemInventoryGiftQuantity(group, row?.item_catalog_id || "", Number(row?.quantity ?? 0));
    } else if (kind === "revoke") {
      addItemInventoryGiftQuantity(group, row?.item_catalog_id || "", -Number(row?.quantity ?? 0));
    }
  });

  return [...groupedRows.values()]
    .sort((a, b) => {
      const aOrder = seasonPlayerOrder.has(a.playerId) ? seasonPlayerOrder.get(a.playerId) : Number.MAX_SAFE_INTEGER;
      const bOrder = seasonPlayerOrder.has(b.playerId) ? seasonPlayerOrder.get(b.playerId) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.playerName.localeCompare(b.playerName, "zh-CN");
    })
    .map((group) => finalizeItemInventoryGroupSummary(group));
}

function renderItemInventoryLogEventPill(row) {
  const eventKind = String(row?.event_kind || "");
  const eventTone = getItemInventoryEventTone(eventKind);
  const eventLabel = getItemInventoryEventLabel(eventKind);
  const quantity = Math.max(Number(row?.quantity ?? 0), 0);
  const quantityPrefix = eventKind === "usage" ? "-" : "+";
  return `
    <span class="queue-slot item-history-event item-history-event-${eventTone}">
      ${escapeHtml(row?.item_name || "未命名道具")} ${escapeHtml(eventLabel)} ${escapeHtml(quantityPrefix)}${escapeHtml(formatItemUsageCount(quantity))}
    </span>
  `;
}

function renderItemInventoryLogEntries(groupOrRows = []) {
  const rows = Array.isArray(groupOrRows) ? groupOrRows : (groupOrRows?.rows || []);
  const initialGifts = Array.isArray(groupOrRows?.initialGifts) ? groupOrRows.initialGifts : [];
  const displayRows = rows.filter((row) => String(row?.event_kind || "") !== "revoke");
  const entryGroups = [];
  const entryGroupMap = new Map();

  displayRows.forEach((row) => {
    const metaParts = [formatLocalTime(row?.occurred_at) || "未知时间"];
    if (row?.operator_name) {
      metaParts.push(`操作人 ${row.operator_name}`);
    }
    if (row?.match_id) {
      metaParts.push("比赛使用");
    }
    const notes = String(row?.notes || "").trim();
    const groupKey = [
      formatLocalTime(row?.occurred_at) || "未知时间",
      row?.operator_name || "",
      row?.match_id || "",
      notes,
    ].join("|");

    if (!entryGroupMap.has(groupKey)) {
      const entry = {
        metaParts,
        notes,
        rows: [],
      };
      entryGroups.push(entry);
      entryGroupMap.set(groupKey, entry);
    }
    entryGroupMap.get(groupKey).rows.push(row);
  });

  const initialGiftHtml = initialGifts.length
    ? `
      <div class="item-history-entry item-history-entry-compact">
        <div class="item-history-entry-head">
          <strong class="item-history-item-name">赛季初始赠送</strong>
          <div class="item-history-event-list">
            ${initialGifts.map((entry) => `
              <span class="queue-slot item-history-event item-history-event-gift">
                ${escapeHtml(entry.itemName)} 赠送 +${escapeHtml(formatItemUsageCount(entry.quantity))}
              </span>
            `).join("")}
          </div>
        </div>
        <p class="muted item-history-entry-meta">已并入赠送统计</p>
      </div>
    `
    : "";

  const rowHtml = entryGroups.map((entry) => (
    `
      <div class="item-history-entry item-history-entry-compact">
        <div class="item-history-entry-head">
          <strong class="item-history-item-name">${escapeHtml(entry.metaParts[0] || "道具变动")}</strong>
          <div class="item-history-event-list">
            ${entry.rows.map((row) => renderItemInventoryLogEventPill(row)).join("")}
          </div>
        </div>
        <p class="muted item-history-entry-meta">${escapeHtml(entry.metaParts.slice(1).join(" · ") || "道具变动")}</p>
        ${entry.notes ? `<p class="item-history-entry-note">${escapeHtml(entry.notes)}</p>` : ""}
      </div>
    `
  )).join("");

  if (initialGiftHtml || rowHtml) {
    return `${initialGiftHtml}${rowHtml}`;
  }

  return '<p class="muted item-history-entry-meta">当前没有可显示的道具变动。</p>';
}

function renderItemInventoryLogs() {
  const baseTitle = copyText(
    getItemInventoryLogCopyPath("itemHistoryTitle"),
    "选手道具变动日志"
  );

  if (itemInventoryLogsTitle) {
    itemInventoryLogsTitle.textContent = baseTitle;
  }

  if (!itemInventoryLogsList || !itemInventoryLogsEmpty) {
    return;
  }

  if (itemInventoryLogStatus === "loading") {
    itemInventoryLogsList.innerHTML = "";
    itemInventoryLogsEmpty.hidden = false;
    itemInventoryLogsEmpty.textContent = "正在加载道具变动记录...";
    return;
  }

  if (itemInventoryLogStatus === "error") {
    itemInventoryLogsList.innerHTML = "";
    itemInventoryLogsEmpty.hidden = false;
    itemInventoryLogsEmpty.textContent = "道具变动记录加载失败";
    return;
  }

  const groups = getGroupedItemInventoryLogs();

  if (!itemInventoryLogRows.length && !groups.length) {
    itemInventoryLogsList.innerHTML = "";
    itemInventoryLogsEmpty.hidden = false;
    itemInventoryLogsEmpty.textContent = copyText(
      getItemInventoryLogCopyPath("itemHistoryEmpty"),
      "当前还没有道具变动记录"
    );
    return;
  }

  const selectedGroup = itemInventoryLogSelectedPlayerId
    ? (groups.find((group) => group.playerId === itemInventoryLogSelectedPlayerId) || null)
    : null;

  if (itemInventoryLogSelectedPlayerId && !selectedGroup) {
    itemInventoryLogSelectedPlayerId = "";
  }

  if (selectedGroup) {
    if (itemInventoryLogsTitle) {
      itemInventoryLogsTitle.textContent = `${selectedGroup.playerName} · ${baseTitle}`;
    }
    itemInventoryLogsList.innerHTML = `
      <div class="item-history-detail-toolbar">
        <button type="button" class="button-secondary item-history-back-btn" data-role="item-history-back">返回列表</button>
        <span class="muted item-history-player-summary">${escapeHtml(selectedGroup.summaryText)}</span>
      </div>
      <div class="admin-action-log-card item-history-player-card">
        <div class="item-history-entry-list">
          ${renderItemInventoryLogEntries(selectedGroup)}
        </div>
      </div>
    `;
  } else {
    itemInventoryLogsList.innerHTML = `
      <div class="item-history-player-grid">
        ${groups.map((group) => `
          <button
            type="button"
            class="admin-action-log-card item-history-player-select"
            data-role="item-history-open-player"
            data-player-id="${escapeHtml(group.playerId)}"
          >
            <span class="item-history-player-name">${escapeHtml(group.playerName)}</span>
            <span class="muted item-history-player-summary">${escapeHtml(group.summaryText)}</span>
          </button>
        `).join("")}
      </div>
    `;
  }
  itemInventoryLogsEmpty.hidden = true;
  itemInventoryLogsEmpty.textContent = "";
}

async function loadItemInventoryLogs() {
  if (!activeSeason?.id) {
    itemInventoryLogRows = [];
    itemInventoryLogStatus = "idle";
    renderItemInventoryLogs();
    return;
  }

  itemInventoryLogStatus = "loading";
  renderItemInventoryLogs();

  try {
    const { data, error } = await db.rpc("get_item_inventory_activity_log", {
      p_season_id: activeSeason.id,
      p_item_catalog_id: null,
    });
    if (error) {
      throw error;
    }
    itemInventoryLogRows = sortItemInventoryLogRows(data || []);
    itemInventoryLogStatus = "ready";
    renderItemInventoryLogs();
  } catch (error) {
    console.error("加载道具变动日志失败：", error);
    itemInventoryLogRows = [];
    itemInventoryLogStatus = "error";
    const migrationHint = getLatestSchemaMigrationHint(error);
    setItemCatalogPanelMessage(
      itemInventoryLogMode,
      `加载道具变动日志失败：${getErrorMessage(error)}${migrationHint ? `。${migrationHint}` : ""}`,
      true
    );
    renderItemInventoryLogs();
  }
}

async function openItemInventoryLogsModal(mode = "scorer") {
  if (!ensureScorerAccess("仅记分员或管理员可查看道具变动日志。")) return;
  itemInventoryLogMode = mode === "admin" ? "admin" : "scorer";
  itemInventoryLogSelectedPlayerId = "";
  renderItemInventoryLogs();
  setManagedDialogOpen("itemInventoryLogs", true, { initialFocus: closeItemInventoryLogsBtn || undefined });
  await loadItemInventoryLogs();
}

function setAdminPanelMessage(text = "", isError = false) {
  setMessageNode(adminPanelMessage, text, isError);
}

function setScorerPanelMessage(text = "", isError = false) {
  setMessageNode(scorerPanelMessage, text, isError);
}

function setManualScoreModalMessage(mode = "scorer", text = "", isError = false) {
  const node = mode === "admin" ? adminManualScoreMessage : scorerManualScoreMessage;
  setMessageNode(node, text, isError);
}

function setAccessMessage(text = "", isError = false) {
  setMessageNode(accessMessage, text, isError);
}

function setOptionalText(node, text = "") {
  if (!node) return;
  const value = String(text || "").trim();
  node.textContent = value;
  node.hidden = !value;
}

function normalizeAccessPassword(value) {
  return String(value || "").normalize("NFKC").trim();
}

function setDeleteMatchConfirmOpen(isOpen) {
  if (!deleteMatchConfirmModal) return;
  setDialogOpen(deleteMatchConfirmModal, isOpen, { initialFocus: confirmDeleteMatchBtn });
}

function settleDeleteMatchConfirmation(confirmed) {
  setDeleteMatchConfirmOpen(false);
  const resolver = resolveDeleteMatchConfirmation;
  resolveDeleteMatchConfirmation = null;
  if (resolver) {
    resolver(Boolean(confirmed));
  }
}

function requestDeleteMatchConfirmation() {
  if (!deleteMatchConfirmModal) {
    return confirmAction(
      "删除后会按全部比赛记录重新计算积分。",
      { title: "确认删除比赛记录", confirmLabel: "确认删除", danger: true }
    );
  }
  if (resolveDeleteMatchConfirmation) {
    resolveDeleteMatchConfirmation(false);
    resolveDeleteMatchConfirmation = null;
  }
  setDeleteMatchConfirmOpen(true);
  return new Promise((resolve) => {
    resolveDeleteMatchConfirmation = resolve;
  });
}

function renderAccessScorerOptions() {
  if (!accessScorerChips) return;

  const playerMap = new Map();
  const sourcePlayers = allPlayersDirectory.length ? allPlayersDirectory : seasonPlayers;
  sourcePlayers.forEach((player) => {
    const displayName = stripPlayerNameMeta(player?.display_name || "");
    const username = normalizeUsername(displayName);
    if (!displayName || !username || playerMap.has(username)) return;
    playerMap.set(username, { displayName, username });
  });

  const players = Array.from(playerMap.values())
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-CN"));
  const selectedUsername = normalizeUsername(authUsernameInput?.value || "");

  accessScorerChips.innerHTML = players.length
    ? players.map((player) => `
      <button
        type="button"
        class="access-scorer-chip${selectedUsername === player.username ? " access-scorer-chip-active" : ""}"
        data-username="${escapeHtml(player.username)}"
        data-display-name="${escapeHtml(player.displayName)}"
      >
        ${escapeHtml(player.displayName)}
      </button>
    `).join("")
    : `<p class="muted">${escapeHtml(copyText("runtime.accessModal.playerPickerEmpty", "当前还没有可选选手。"))}</p>`;
}

function renderAdminAddScorerOptions() {
  if (!adminAddScorerSelect) return;
  const scorerPlayerIds = new Set(getRoleMembersByRoleAll("scorer").map((member) => member.player_id));
  const options = [`<option value="">${escapeHtml(copyText("runtime.players.adminAddDefault", "请选择总表选手"))}</option>`];
  allPlayersDirectory
    .filter((player) => !scorerPlayerIds.has(player.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"))
    .forEach((player) => {
      options.push(`<option value="${player.id}">${escapeHtml(player.display_name)}</option>`);
    });
  adminAddScorerSelect.innerHTML = options.join("");
}

function renderRenamePlayerChips(mode = "scorer") {
  const container = mode === "admin" ? adminRenamePlayerChips : scorerRenamePlayerChips;
  if (!container) return;
  const canManage = isCurrentRoleScorer();
  const selectedPlayerId = selectedRenamePlayerIds[mode] || "";

  const chipsHtml = allPlayersDirectory
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"))
    .map((player) => `
      <button
        type="button"
        class="access-scorer-chip${selectedPlayerId === player.id ? " access-scorer-chip-active" : ""}"
        data-role="rename-player-chip"
        data-mode="${mode}"
        data-player-id="${player.id}"
      >
        ${escapeHtml(player.display_name || copyText("runtime.players.unnamedPlayer", "未命名选手"))}
      </button>
    `).join("");

  container.innerHTML = chipsHtml || `<p class="muted">${escapeHtml(copyText("runtime.accessModal.playerPickerEmpty", "当前还没有可选选手。"))}</p>`;
  container.querySelectorAll(".access-scorer-chip").forEach((chip) => {
    chip.disabled = !canManage;
  });
}

function getSelectedActivePlayer(mode = "scorer") {
  const selectedPlayerId = selectedRenamePlayerIds[mode] || "";
  if (!selectedPlayerId) return null;
  return allPlayersDirectory.find((player) => player.id === selectedPlayerId) || null;
}

function selectRenamePlayer(mode = "scorer", playerId = "") {
  selectedRenamePlayerIds[mode] = playerId || "";
  renderRenamePlayerChips(mode);
  renderPlayerManagementOptions();
}

function getSelectedInactivePlayer() {
  if (!selectedInactivePlayerId) return null;
  return inactivePlayersDirectory.find((player) => player.id === selectedInactivePlayerId) || null;
}

function renderInactivePlayerChips() {
  if (!adminInactivePlayerChips) return;
  const canAdmin = isCurrentRoleAdmin();

  if (!canAdmin) {
    adminInactivePlayerChips.innerHTML = "";
    return;
  }

  if (inactivePlayersStatus === "loading") {
    adminInactivePlayerChips.innerHTML = '<p class="muted">已删除名单读取中...</p>';
    return;
  }

  if (inactivePlayersStatus === "error") {
    adminInactivePlayerChips.innerHTML = '<p class="muted">已删除名单暂时不可用。</p>';
    return;
  }

  const selectedPlayerId = selectedInactivePlayerId || "";
  const chipsHtml = inactivePlayersDirectory
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"))
    .map((player) => `
      <button
        type="button"
        class="access-scorer-chip${selectedPlayerId === player.id ? " access-scorer-chip-active" : ""}"
        data-role="inactive-player-chip"
        data-player-id="${player.id}"
      >
        ${escapeHtml(player.display_name || copyText("runtime.players.unnamedPlayer", "未命名选手"))}
      </button>
    `).join("");

  adminInactivePlayerChips.innerHTML = chipsHtml || `<p class="muted">${escapeHtml(copyText("runtime.players.noHiddenPlayers", "当前没有被删除的选手。"))}</p>`;
  adminInactivePlayerChips.querySelectorAll(".access-scorer-chip").forEach((chip) => {
    chip.disabled = !canAdmin;
  });
}

function selectInactivePlayer(playerId = "") {
  selectedInactivePlayerId = playerId || "";
  renderInactivePlayerChips();
  renderPlayerManagementOptions();
}

function renderPlayerManagementOptions() {
  if (
    selectedRenamePlayerIds.scorer
    && !allPlayersDirectory.some((player) => player.id === selectedRenamePlayerIds.scorer)
  ) {
    selectedRenamePlayerIds.scorer = "";
  }
  if (
    selectedRenamePlayerIds.admin
    && !allPlayersDirectory.some((player) => player.id === selectedRenamePlayerIds.admin)
  ) {
    selectedRenamePlayerIds.admin = "";
  }

  renderRenamePlayerChips("scorer");
  renderRenamePlayerChips("admin");
  if (
    selectedInactivePlayerId
    && !inactivePlayersDirectory.some((player) => player.id === selectedInactivePlayerId)
  ) {
    selectedInactivePlayerId = "";
  }
  renderInactivePlayerChips();

  const scorerSelectedPlayer = getSelectedActivePlayer("scorer");
  const adminSelectedPlayer = getSelectedActivePlayer("admin");
  const adminSelectedInactivePlayer = getSelectedInactivePlayer();

  if (scorerQuickAddPlayerBtn) {
    scorerQuickAddPlayerBtn.disabled = !isCurrentRoleScorer();
  }
  if (scorerQuickAddPlayerInput) {
    scorerQuickAddPlayerInput.disabled = !isCurrentRoleScorer();
  }
  if (scorerRenamePlayerBtn) {
    scorerRenamePlayerBtn.disabled = !isCurrentRoleScorer();
  }
  if (scorerRenamePlayerInput) {
    scorerRenamePlayerInput.disabled = !isCurrentRoleScorer();
  }
  if (scorerDeactivatePlayerBtn) {
    scorerDeactivatePlayerBtn.disabled = !isCurrentRoleScorer() || !scorerSelectedPlayer;
  }
  if (adminQuickAddPlayerBtn) {
    adminQuickAddPlayerBtn.disabled = !isCurrentRoleAdmin();
  }
  if (adminQuickAddPlayerInput) {
    adminQuickAddPlayerInput.disabled = !isCurrentRoleAdmin();
  }
  if (adminRenamePlayerBtn) {
    adminRenamePlayerBtn.disabled = !isCurrentRoleAdmin();
  }
  if (adminRenamePlayerInput) {
    adminRenamePlayerInput.disabled = !isCurrentRoleAdmin();
  }
  if (adminDeactivatePlayerBtn) {
    adminDeactivatePlayerBtn.disabled = !isCurrentRoleAdmin() || !adminSelectedPlayer;
  }
  if (adminInactivePlayersBlock) {
    adminInactivePlayersBlock.hidden = !isCurrentRoleAdmin();
  }
  if (adminRestorePlayerBtn) {
    adminRestorePlayerBtn.disabled = !isCurrentRoleAdmin() || !adminSelectedInactivePlayer;
  }
  if (adminHardDeletePlayerBtn) {
    adminHardDeletePlayerBtn.disabled = !isCurrentRoleAdmin() || !adminSelectedInactivePlayer;
  }
  if (adminIdentityEmailSelect) {
    adminIdentityEmailSelect.disabled = !isCurrentRoleAdmin();
  }
  if (adminIdentityUsernameInput) {
    adminIdentityUsernameInput.disabled = !isCurrentRoleAdmin();
  }
  if (adminSaveIdentityBtn) {
    adminSaveIdentityBtn.disabled = !isCurrentRoleAdmin();
  }
}

function getItemManagementRefs(mode = "scorer") {
  if (mode === "admin") {
    return {
      nameInput: adminItemNameInput,
      donationInput: adminItemDonationInput,
      matchIconSelect: adminItemMatchIconSelect,
      matchTargetsContainer: adminItemMatchTargets,
      resolutionModeSelect: adminItemResolutionModeSelect,
      scoreMultiplierInput: adminItemScoreMultiplierInput,
      stackTargetsContainer: adminItemStackTargets,
      stackMultiplierList: adminItemStackMultiplierList,
      initialQuantityInput: adminItemInitialQuantityInput,
      saveBtn: adminSaveItemBtn,
      resetBtn: adminResetItemBtn,
      toggleBtn: adminItemCatalogToggleBtn,
      editorPanel: adminItemCatalogEditorPanel,
      list: adminItemCatalogList,
    };
  }

  return {
    nameInput: scorerItemNameInput,
    donationInput: scorerItemDonationInput,
    matchIconSelect: scorerItemMatchIconSelect,
    matchTargetsContainer: scorerItemMatchTargets,
    resolutionModeSelect: scorerItemResolutionModeSelect,
    scoreMultiplierInput: scorerItemScoreMultiplierInput,
    stackTargetsContainer: scorerItemStackTargets,
    stackMultiplierList: scorerItemStackMultiplierList,
    initialQuantityInput: scorerItemInitialQuantityInput,
    saveBtn: scorerSaveItemBtn,
    resetBtn: scorerResetItemBtn,
    toggleBtn: scorerItemCatalogToggleBtn,
    editorPanel: scorerItemCatalogEditorPanel,
    list: scorerItemCatalogList,
  };
}

function getItemCatalogToggleLabel(mode = "scorer") {
  return itemCatalogEditingIds[mode] ? "编辑道具" : copyText(
    mode === "admin" ? "adminPanel.itemManageButton" : "scorerPanel.itemManageButton",
    "添加道具"
  );
}

function syncItemCatalogEditorState(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  const canManage = isCurrentRoleScorer();
  const isOpen = canManage && Boolean(itemCatalogEditorOpen[mode]);
  const titleEl = mode === "admin" ? adminItemCatalogTitle : scorerItemCatalogTitle;
  const modalKey = mode === "admin" ? "adminItemCatalog" : "scorerItemCatalog";

  if (refs.editorPanel) {
    refs.editorPanel.hidden = !isOpen;
  }
  if (titleEl) {
    titleEl.textContent = getItemCatalogToggleLabel(mode);
  }
  if (refs.toggleBtn) {
    refs.toggleBtn.textContent = getItemCatalogToggleLabel(mode);
    refs.toggleBtn.disabled = !canManage;
    refs.toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    refs.toggleBtn.classList.toggle("item-management-toggle-open", isOpen);
  }
  if (getManagedDialogModal(modalKey)?.hidden === false && !isOpen) {
    setManagedDialogOpen(modalKey, false);
  }
}

function setItemCatalogEditorOpen(mode = "scorer", isOpen = false) {
  itemCatalogEditorOpen[mode] = Boolean(isOpen);
  syncItemCatalogEditorState(mode);
  if (isOpen) {
    setManagedDialogOpen(mode === "admin" ? "adminItemCatalog" : "scorerItemCatalog", true, {
      initialFocus: getItemManagementRefs(mode).nameInput || undefined,
    });
  }
}

function getItemCatalogConfigString(entry, key, fallback = "") {
  const rawValue = entry?.config && typeof entry.config === "object" ? entry.config[key] : undefined;
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  return value || fallback;
}

function getItemCatalogConfigNumber(entry, key, fallback = 0) {
  const rawValue = entry?.config && typeof entry.config === "object" ? entry.config[key] : undefined;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

function getItemCatalogResolutionMode(entry) {
  const rawValue = entry?.config && typeof entry.config === "object"
    ? entry.config.match_resolution_mode
    : undefined;
  return rawValue === "record_only" ? "record_only" : "effect";
}

function isItemCatalogRecordOnly(entry) {
  return getItemCatalogResolutionMode(entry) === "record_only";
}

function normalizeItemMatchTargets(rawTargets = []) {
  if (!Array.isArray(rawTargets)) return [];
  const rawSet = new Set(rawTargets.filter((target) => ITEM_MATCH_TARGET_OPTIONS.has(target)));
  const deduped = ITEM_MATCH_TARGET_DEFINITIONS
    .map((option) => option.value)
    .filter((target) => rawSet.has(target));

  if (!deduped.length) {
    return [];
  }

  const groups = new Set(deduped.map((target) => ITEM_MATCH_TARGET_GROUPS.get(target) || ""));
  if (groups.size !== 1 || groups.has("")) {
    return [];
  }

  return deduped;
}

function getItemTargetToggleButtons(container) {
  return container ? [...container.querySelectorAll('[data-role="item-target-toggle"]')] : [];
}

function getItemTargetGroup(target) {
  return ITEM_MATCH_TARGET_GROUPS.get(target) || "";
}

function getSelectedItemMatchTargetsFromForm(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  return getItemTargetToggleButtons(refs.matchTargetsContainer)
    .filter((button) => button.classList.contains("item-target-chip-active"))
    .map((button) => button.dataset.target || "")
    .filter(Boolean);
}

function renderItemMatchTargetSelector(mode = "scorer", selectedTargets = []) {
  const refs = getItemManagementRefs(mode);
  const normalizedTargets = normalizeItemMatchTargets(selectedTargets);
  const activeTargets = new Set(normalizedTargets);
  const canManage = isCurrentRoleScorer();

  getItemTargetToggleButtons(refs.matchTargetsContainer).forEach((button) => {
    const target = button.dataset.target || "";
    const group = getItemTargetGroup(target);
    button.disabled = !canManage;
    button.classList.toggle("item-target-chip-active", activeTargets.has(target));
    button.classList.toggle("item-target-chip-group-single", group === "single");
    button.classList.toggle("item-target-chip-group-team", group === "team");
    button.setAttribute("aria-pressed", activeTargets.has(target) ? "true" : "false");
  });
}

function toggleItemMatchTarget(mode = "scorer", target = "") {
  if (!ITEM_MATCH_TARGET_OPTIONS.has(target)) return;
  const currentTargets = getSelectedItemMatchTargetsFromForm(mode);
  const targetGroup = getItemTargetGroup(target);
  const nextTargets = currentTargets.includes(target)
    ? currentTargets.filter((currentTarget) => currentTarget !== target)
    : [
      ...currentTargets.filter((currentTarget) => getItemTargetGroup(currentTarget) === targetGroup),
      target,
    ];
  renderItemMatchTargetSelector(mode, nextTargets);
}

function getItemCatalogMatchTargets(entry) {
  const rawTargets = entry?.config && typeof entry.config === "object"
    ? entry.config.match_targets
    : undefined;
  return normalizeItemMatchTargets(rawTargets);
}

function isLegacyItemCatalogMatchConfig(entry) {
  const matchTargets = getItemCatalogMatchTargets(entry);
  if (matchTargets.length) return false;
  const legacyScope = getItemCatalogConfigString(entry, "match_scope", "");
  return ["", "none", "personal", "team"].includes(legacyScope);
}

function getItemCatalogInteractionGroup(entry) {
  const matchTargets = getItemCatalogMatchTargets(entry);
  if (!matchTargets.length) return "";
  return getItemTargetGroup(matchTargets[0]);
}

function getItemCatalogMatchTargetsLabel(entry) {
  const targets = getItemCatalogMatchTargets(entry);
  if (targets.length) {
    return targets.map((target) => ITEM_MATCH_TARGET_LABELS.get(target) || target).join(" + ");
  }
  if (isLegacyItemCatalogMatchConfig(entry)) {
    return "需重选生效对象";
  }
  return "未配置生效对象";
}

function getItemCatalogMatchIcon(entry) {
  const icon = getItemCatalogConfigString(entry, "match_icon", DEFAULT_ITEM_MATCH_ICON);
  return ITEM_MATCH_ICON_OPTIONS.some((option) => option.value === icon) ? icon : DEFAULT_ITEM_MATCH_ICON;
}

function getItemCatalogMatchIconLabel(entry) {
  const icon = getItemCatalogMatchIcon(entry);
  const matched = ITEM_MATCH_ICON_OPTIONS.find((option) => option.value === icon);
  return matched ? `${matched.value} ${matched.label}` : icon;
}

function getItemCatalogInitialQuantity(entry) {
  const value = Math.trunc(Number(entry?.initial_quantity ?? 0));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeItemScoreMultiplierValue(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

const RESET_ITEM_SCORE_SPECIAL_TOKEN = "@";

function normalizeItemScoreSpecialToken(value = "") {
  const normalized = String(value ?? "").trim();
  return normalized === RESET_ITEM_SCORE_SPECIAL_TOKEN ? RESET_ITEM_SCORE_SPECIAL_TOKEN : "";
}

function parseItemScoreMultiplierInput(value, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return {
      valid: true,
      multiplier: normalizeItemScoreMultiplierValue(fallback, 0),
      specialToken: "",
    };
  }
  if (raw === RESET_ITEM_SCORE_SPECIAL_TOKEN) {
    return {
      valid: true,
      multiplier: 0,
      specialToken: RESET_ITEM_SCORE_SPECIAL_TOKEN,
    };
  }
  const multiplier = Number(raw);
  if (!Number.isFinite(multiplier)) {
    return {
      valid: false,
      multiplier: normalizeItemScoreMultiplierValue(fallback, 0),
      specialToken: "",
    };
  }
  return {
    valid: true,
    multiplier,
    specialToken: "",
  };
}

function formatItemScoreMultiplierInputValue(multiplier = 0, specialToken = "") {
  const normalizedSpecialToken = normalizeItemScoreSpecialToken(specialToken);
  if (normalizedSpecialToken) return normalizedSpecialToken;
  return String(normalizeItemScoreMultiplierValue(multiplier, 0));
}

function getItemCatalogScoreDeltaMultiplier(entry) {
  return normalizeItemScoreMultiplierValue(entry?.score_delta_multiplier, 0);
}

function getItemCatalogScoreDeltaSpecialToken(entry) {
  return normalizeItemScoreSpecialToken(entry?.score_delta_special ?? entry?.config?.score_delta_special);
}

function isResetToInitialWinScoreMultiplier(multiplier = 0, specialToken = "") {
  return normalizeItemScoreSpecialToken(specialToken) === RESET_ITEM_SCORE_SPECIAL_TOKEN;
}

function normalizeItemScoreStackRules(rawRules = [], selfItemId = "") {
  if (!Array.isArray(rawRules)) return [];
  const seenItemIds = new Set();

  return rawRules.reduce((list, rule) => {
    const itemCatalogId = String(rule?.itemCatalogId || rule?.item_catalog_id || "").trim();
    if (!itemCatalogId || itemCatalogId === selfItemId || seenItemIds.has(itemCatalogId)) {
      return list;
    }
    seenItemIds.add(itemCatalogId);
    const specialToken = normalizeItemScoreSpecialToken(rule?.specialToken ?? rule?.score_delta_special);
    list.push({
      itemCatalogId,
      multiplier: normalizeItemScoreMultiplierValue(rule?.multiplier ?? rule?.score_delta_multiplier, 0),
      specialToken,
    });
    return list;
  }, []);
}

function getItemCatalogScoreStackRules(entry) {
  if (isItemCatalogRecordOnly(entry)) {
    return [];
  }
  return normalizeItemScoreStackRules(entry?.score_delta_stack_rules, entry?.id || "");
}

function formatItemScoreMultiplierLabel(multiplier = 0, specialToken = "") {
  return isResetToInitialWinScoreMultiplier(multiplier, specialToken)
    ? `倍率 ${RESET_ITEM_SCORE_SPECIAL_TOKEN}`
    : `倍率 ${formatScore(normalizeItemScoreMultiplierValue(multiplier, 0))}`;
}

function formatItemScoreEffectText(multiplier = 0, baseDirection = 1, specialToken = "") {
  if (isResetToInitialWinScoreMultiplier(multiplier, specialToken)) {
    return "积分重置";
  }
  const normalizedMultiplier = normalizeItemScoreMultiplierValue(multiplier, 0);
  if (normalizedMultiplier === 0) {
    return "本场积分归零";
  }
  const direction = Number(baseDirection) < 0 ? -1 : 1;
  const percentValue = (normalizedMultiplier - 1) * 100 * direction;
  if (percentValue === 0) {
    return "积分不变";
  }
  return `积分${percentValue >= 0 ? "+" : ""}${formatScore(percentValue)}%`;
}

function getItemCatalogScoreStackSummaryLabel(entry) {
  if (isItemCatalogRecordOnly(entry)) {
    return "不参与叠加";
  }
  const stackRules = getItemCatalogScoreStackRules(entry);
  return stackRules.length ? `叠加 ${stackRules.length} 组` : "无叠加";
}

function getItemScoreMultiplierPriority(multiplier = 0, specialToken = "") {
  return isResetToInitialWinScoreMultiplier(multiplier, specialToken)
    ? Number.POSITIVE_INFINITY
    : Math.abs(normalizeItemScoreMultiplierValue(multiplier, 0));
}

function getItemCatalogScoreStackMultiplier(itemEntryA, itemEntryB) {
  const itemIdA = itemEntryA?.id || "";
  const itemIdB = itemEntryB?.id || "";
  if (!itemIdA || !itemIdB || itemIdA === itemIdB) return null;
  const rule = getItemCatalogScoreStackRules(itemEntryA).find((entry) => entry.itemCatalogId === itemIdB) || null;
  return rule
    ? {
      multiplier: normalizeItemScoreMultiplierValue(rule.multiplier, 0),
      specialToken: normalizeItemScoreSpecialToken(rule.specialToken),
    }
    : null;
}

function collectPendingMatchItemEffects(doubleDownPayload = [], players = []) {
  const normalizedPlayers = (players || []).map((player) => ({
    ...player,
    player_id: player.player_id || player.id || "",
  })).filter((player) => player.player_id && player.team);
  const normalizedDoubleDowns = normalizeMatchDoubleDowns(doubleDownPayload, normalizedPlayers);
  const effectCandidatesByTarget = new Map();

  normalizedDoubleDowns.forEach((item) => {
    const itemEntry = getMatchInteractionItemById(
      item.item_catalog_id || (item.mode === "team" ? LEGACY_MATCH_ITEM_IDS.team : LEGACY_MATCH_ITEM_IDS.personal)
    );
    const isRecordOnly = Boolean(item.item_catalog_id && isItemCatalogRecordOnly(itemEntry));
    const targetPlayers = item.mode === "team"
      ? normalizedPlayers.filter((player) => player.team === item.target_team)
      : normalizedPlayers.filter((player) => player.player_id === item.target_player_id);

    targetPlayers.forEach((targetPlayer) => {
      const targetPlayerId = targetPlayer.player_id || "";
      if (!targetPlayerId) return;
      if (!effectCandidatesByTarget.has(targetPlayerId)) {
        effectCandidatesByTarget.set(targetPlayerId, []);
      }
      effectCandidatesByTarget.get(targetPlayerId).push({
        targetPlayerId,
        targetTeam: targetPlayer.team || "",
        itemEntry,
        itemLabel: itemEntry?.name || "未命名道具",
        appliedMultiplier: isRecordOnly
          ? 1
          : (item.item_catalog_id ? getItemCatalogScoreDeltaMultiplier(itemEntry) : 1),
        appliedSpecialToken: isRecordOnly
          ? ""
          : (item.item_catalog_id ? getItemCatalogScoreDeltaSpecialToken(itemEntry) : ""),
        isConsumed: false,
      });
    });
  });

  const appliedGroups = [];
  effectCandidatesByTarget.forEach((effects) => {
    while (true) {
      let bestPair = null;
      for (let index = 0; index < effects.length; index += 1) {
        const current = effects[index];
        if (current.isConsumed || !current.itemEntry?.id) continue;
        for (let peerIndex = index + 1; peerIndex < effects.length; peerIndex += 1) {
          const peer = effects[peerIndex];
          if (peer.isConsumed || !peer.itemEntry?.id) continue;
          const stackRule = getItemCatalogScoreStackMultiplier(current.itemEntry, peer.itemEntry);
          if (stackRule === null) continue;
          const candidate = {
            left: current,
            right: peer,
            appliedMultiplier: stackRule.multiplier,
            appliedSpecialToken: stackRule.specialToken,
          };
          if (
            !bestPair
            || getItemScoreMultiplierPriority(candidate.appliedMultiplier, candidate.appliedSpecialToken)
              > getItemScoreMultiplierPriority(bestPair.appliedMultiplier, bestPair.appliedSpecialToken)
          ) {
            bestPair = candidate;
          }
        }
      }

      if (!bestPair) break;
      bestPair.left.isConsumed = true;
      bestPair.right.isConsumed = true;
      appliedGroups.push({
        targetPlayerId: bestPair.left.targetPlayerId,
        targetTeam: bestPair.left.targetTeam,
        itemLabel: `${bestPair.left.itemLabel} + ${bestPair.right.itemLabel}`,
        appliedMultiplier: bestPair.appliedMultiplier,
        appliedSpecialToken: bestPair.appliedSpecialToken,
      });
    }

    effects.forEach((entry) => {
      if (entry.isConsumed) return;
      appliedGroups.push({
        targetPlayerId: entry.targetPlayerId,
        targetTeam: entry.targetTeam,
        itemLabel: entry.itemLabel,
        appliedMultiplier: entry.appliedMultiplier,
        appliedSpecialToken: entry.appliedSpecialToken,
      });
    });
  });

  return appliedGroups;
}

function validateResetEffectUsage(winnerTeam, doubleDownPayload = [], players = []) {
  const effects = collectPendingMatchItemEffects(doubleDownPayload, players)
    .filter((entry) => isResetToInitialWinScoreMultiplier(entry.appliedMultiplier, entry.appliedSpecialToken));

  if (!effects.length) {
    return "";
  }

  if (!winnerTeam) {
    return "";
  }

  const initialScore = getSeasonInitialScore();
  const currentSeasonLeaderboard = leaderboardDisplaySeasonId === activeSeason?.id
    ? leaderboardPlayers
    : [];
  const leaderboardScoreByPlayerId = new Map(
    currentSeasonLeaderboard.map((player) => [
      player.player_id || player.id,
      Number(player.result_score ?? initialScore),
    ])
  );
  const playerNameById = new Map(
    (players || []).map((player) => [
      player.player_id || player.id,
      stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手",
    ])
  );

  for (const effect of effects) {
    if (effect.targetTeam !== winnerTeam) {
      continue;
    }

    const currentCompetitiveScore = leaderboardScoreByPlayerId.get(effect.targetPlayerId) ?? initialScore;
    if (currentCompetitiveScore >= initialScore) {
      const playerName = playerNameById.get(effect.targetPlayerId) || "该选手";
      return `${playerName} 当前胜负积分不低于赛季初始分，不能使用“${effect.itemLabel}”。`;
    }
  }

  return "";
}

function getItemStackToggleButtons(container) {
  return container ? [...container.querySelectorAll('[data-role="item-stack-toggle"]')] : [];
}

function getItemStackMultiplierInputs(container) {
  return container ? [...container.querySelectorAll('[data-role="item-stack-multiplier-input"]')] : [];
}

function getAvailableItemScoreStackEntries(mode = "scorer") {
  const editingId = itemCatalogEditingIds[mode] || "";
  return itemCatalogEntries
    .filter((entry) => entry.id && entry.id !== editingId && !isItemCatalogRecordOnly(entry))
    .slice()
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });
}

function getSelectedItemScoreStackRulesFromForm(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  const selectedItemIds = getItemStackToggleButtons(refs.stackTargetsContainer)
    .filter((button) => button.classList.contains("item-target-chip-active"))
    .map((button) => button.dataset.itemId || "")
    .filter(Boolean);
  const multiplierSpecByItemId = new Map(
    getItemStackMultiplierInputs(refs.stackMultiplierList).map((input) => [
      input.dataset.itemId || "",
      parseItemScoreMultiplierInput(input.value, 0),
    ])
  );

  return normalizeItemScoreStackRules(
    selectedItemIds.map((itemCatalogId) => ({
      itemCatalogId,
      multiplier: multiplierSpecByItemId.get(itemCatalogId)?.multiplier ?? 0,
      specialToken: multiplierSpecByItemId.get(itemCatalogId)?.specialToken ?? "",
    })),
    itemCatalogEditingIds[mode] || ""
  );
}

function renderItemScoreStackSelector(mode = "scorer", selectedRules = []) {
  const refs = getItemManagementRefs(mode);
  if (!refs.stackTargetsContainer || !refs.stackMultiplierList) return;

  const canManage = isCurrentRoleScorer();
  const activeRules = normalizeItemScoreStackRules(selectedRules, itemCatalogEditingIds[mode] || "");
  const ruleMap = new Map(activeRules.map((rule) => [rule.itemCatalogId, rule]));
  const availableEntries = getAvailableItemScoreStackEntries(mode);

  refs.stackTargetsContainer.innerHTML = availableEntries.length
    ? availableEntries.map((entry) => {
      const isActive = ruleMap.has(entry.id);
      const stateLabel = entry.is_active ? "" : " · 已停用";
      return `
        <button
          type="button"
          class="item-target-chip${isActive ? " item-target-chip-active" : ""}"
          data-role="item-stack-toggle"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          ${canManage ? "" : "disabled"}
          aria-pressed="${isActive ? "true" : "false"}"
          title="${escapeHtml(`${entry.name || "未命名道具"}${stateLabel}`)}"
        >${escapeHtml(`${entry.name || "未命名道具"}${stateLabel}`)}</button>
      `;
    }).join("")
    : '<span class="item-stack-empty muted">暂无其它道具可配置叠加。</span>';

  const selectedEntries = availableEntries.filter((entry) => ruleMap.has(entry.id));
  refs.stackMultiplierList.innerHTML = selectedEntries.length
    ? selectedEntries.map((entry) => {
      const activeRule = ruleMap.get(entry.id) || { multiplier: 0, specialToken: "" };
      return `
      <label class="item-stack-multiplier-row">
        <span class="item-stack-multiplier-name">${escapeHtml(entry.name || "未命名道具")}</span>
        <input
          type="text"
          inputmode="text"
          data-role="item-stack-multiplier-input"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          value="${escapeHtml(formatItemScoreMultiplierInputValue(activeRule.multiplier, activeRule.specialToken))}"
          ${canManage ? "" : "disabled"}
        />
      </label>
    `;
    }).join("")
    : '<span class="item-stack-empty muted">未选择叠加对象。</span>';
}

function toggleItemScoreStackTarget(mode = "scorer", itemCatalogId = "") {
  if (!itemCatalogId) return;
  const currentRules = getSelectedItemScoreStackRulesFromForm(mode);
  const nextRuleMap = new Map(currentRules.map((rule) => [rule.itemCatalogId, rule]));

  if (nextRuleMap.has(itemCatalogId)) {
    nextRuleMap.delete(itemCatalogId);
  } else {
    nextRuleMap.set(itemCatalogId, {
      itemCatalogId,
      multiplier: 0,
      specialToken: "",
    });
  }

  renderItemScoreStackSelector(
    mode,
    [...nextRuleMap.values()]
  );
}

function handleItemCatalogResolutionModeChange(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  if (
    refs.scoreMultiplierInput
    && refs.resolutionModeSelect?.value === "record_only"
    && !String(refs.scoreMultiplierInput.value || "").trim()
  ) {
    refs.scoreMultiplierInput.value = "1";
  }
  renderItemScoreStackSelector(mode, getSelectedItemScoreStackRulesFromForm(mode));
  syncItemCatalogFormState(mode);
}

function syncItemCatalogFormState(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  const canManage = isCurrentRoleScorer();
  const isEditing = Boolean(itemCatalogEditingIds[mode]);
  const isRecordOnly = refs.resolutionModeSelect?.value === "record_only";

  if (refs.nameInput) {
    refs.nameInput.disabled = !canManage;
    refs.nameInput.readOnly = false;
  }
  if (refs.donationInput) refs.donationInput.disabled = !canManage;
  if (refs.resolutionModeSelect) refs.resolutionModeSelect.disabled = !canManage;
  if (refs.scoreMultiplierInput) refs.scoreMultiplierInput.disabled = !canManage;
  if (refs.matchIconSelect) refs.matchIconSelect.disabled = !canManage;
  getItemTargetToggleButtons(refs.matchTargetsContainer).forEach((button) => {
    button.disabled = !canManage;
  });
  getItemStackToggleButtons(refs.stackTargetsContainer).forEach((button) => {
    button.disabled = !canManage || isRecordOnly;
  });
  getItemStackMultiplierInputs(refs.stackMultiplierList).forEach((input) => {
    input.disabled = !canManage || isRecordOnly;
  });
  if (refs.initialQuantityInput) refs.initialQuantityInput.disabled = !canManage;
  if (refs.saveBtn) refs.saveBtn.disabled = !canManage;
  if (refs.resetBtn) refs.resetBtn.disabled = !canManage;
  syncItemCatalogEditorState(mode);
}

function resetItemCatalogForm(mode = "scorer", { closeEditor = false } = {}) {
  const refs = getItemManagementRefs(mode);
  itemCatalogEditingIds[mode] = "";
  if (closeEditor) {
    itemCatalogEditorOpen[mode] = false;
  }
  if (refs.nameInput) refs.nameInput.value = "";
  if (refs.donationInput) refs.donationInput.value = "";
  if (refs.resolutionModeSelect) refs.resolutionModeSelect.value = "effect";
  if (refs.scoreMultiplierInput) refs.scoreMultiplierInput.value = "";
  if (refs.matchIconSelect) refs.matchIconSelect.value = DEFAULT_ITEM_MATCH_ICON;
  renderItemMatchTargetSelector(mode, []);
  renderItemScoreStackSelector(mode, []);
  if (refs.initialQuantityInput) refs.initialQuantityInput.value = "";
  syncItemCatalogFormState(mode);
}

function populateItemCatalogForm(entry, mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  itemCatalogEditingIds[mode] = entry?.id || "";
  itemCatalogEditorOpen[mode] = true;
  if (refs.nameInput) refs.nameInput.value = entry?.name || "";
  if (refs.donationInput) refs.donationInput.value = String(getItemCatalogConfigNumber(entry, "donation_amount", 0));
  if (refs.resolutionModeSelect) {
    refs.resolutionModeSelect.value = getItemCatalogResolutionMode(entry);
  }
  if (refs.scoreMultiplierInput) {
    refs.scoreMultiplierInput.value = formatItemScoreMultiplierInputValue(
      getItemCatalogScoreDeltaMultiplier(entry),
      getItemCatalogScoreDeltaSpecialToken(entry)
    );
  }
  if (refs.matchIconSelect) refs.matchIconSelect.value = getItemCatalogMatchIcon(entry);
  renderItemMatchTargetSelector(mode, getItemCatalogMatchTargets(entry));
  renderItemScoreStackSelector(mode, getItemCatalogScoreStackRules(entry));
  if (refs.initialQuantityInput) refs.initialQuantityInput.value = String(getItemCatalogInitialQuantity(entry) || "");
  syncItemCatalogFormState(mode);
  setManagedDialogOpen(mode === "admin" ? "adminItemCatalog" : "scorerItemCatalog", true, {
    initialFocus: refs.nameInput || refs.donationInput || undefined,
  });
}

function buildItemCatalogUsageSummaryMap(rows = []) {
  const summaryMap = new Map();
  (rows || []).forEach((row) => {
    const itemId = row?.item_catalog_id || "";
    const playerId = row?.player_id || "";
    if (!itemId || !playerId) return;

    if (!summaryMap.has(itemId)) {
      summaryMap.set(itemId, new Map());
    }

    summaryMap.get(itemId).set(playerId, {
      usageCount: Number(row?.usage_count ?? 0),
      remainingCount: Number(row?.remaining_count ?? 0),
    });
  });
  return summaryMap;
}

function getItemCatalogPlayerActionKey(mode = "", itemId = "", playerId = "", action = "") {
  return [mode, itemId, playerId, action].filter(Boolean).join(":");
}

function isSelectedItemCatalogPlayerAction(mode = "", itemId = "", playerId = "") {
  return Boolean(
    itemCatalogPendingPlayerAction
    && itemCatalogPendingPlayerAction.mode === mode
    && itemCatalogPendingPlayerAction.itemId === itemId
    && itemCatalogPendingPlayerAction.playerId === playerId
  );
}

function clearItemCatalogPendingPlayerAction() {
  itemCatalogPendingPlayerAction = null;
}

function setItemCatalogPanelMessage(mode = "scorer", text = "", isError = false) {
  if (mode === "admin") {
    setAdminPanelMessage(text, isError);
    return;
  }
  setScorerPanelMessage(text, isError);
}

function buildItemCatalogPlayerActionRow(entry, player, mode = "scorer") {
  if (!isCurrentRoleScorer()) return "";
  if (!entry?.id || !player?.id || !isSelectedItemCatalogPlayerAction(mode, entry.id, player.id)) {
    return "";
  }

  const purchaseActionKey = getItemCatalogPlayerActionKey(mode, entry.id, player.id, "purchase");
  const giftActionKey = getItemCatalogPlayerActionKey(mode, entry.id, player.id, "gift");
  const revokeActionKey = getItemCatalogPlayerActionKey(mode, entry.id, player.id, "revoke");
  const cancelActionKey = getItemCatalogPlayerActionKey(mode, entry.id, player.id, "cancel");
  const isBusy = Boolean(itemCatalogActionPendingKey)
    && [purchaseActionKey, giftActionKey, revokeActionKey, cancelActionKey].includes(itemCatalogActionPendingKey);

  return `
    <div class="item-catalog-player-action-row">
      <span class="item-catalog-player-action-label">${escapeHtml(stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手")} · ${escapeHtml(entry.name || "未命名道具")}</span>
      <div class="item-catalog-player-action-buttons">
        <button
          type="button"
          class="button-secondary item-catalog-player-action-btn"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          data-player-id="${player.id}"
          data-action="purchase"
          ${isBusy ? "disabled" : ""}
        >主动购买</button>
        <button
          type="button"
          class="button-secondary item-catalog-player-action-btn"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          data-player-id="${player.id}"
          data-action="gift"
          ${isBusy ? "disabled" : ""}
        >赠送</button>
        <button
          type="button"
          class="button-secondary item-catalog-player-action-btn"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          data-player-id="${player.id}"
          data-action="revoke"
          ${isBusy ? "disabled" : ""}
        >${escapeHtml(copyText(mode === "admin" ? "adminPanel.itemRevokeAction" : "scorerPanel.itemRevokeAction", "扣除"))}</button>
        <button
          type="button"
          class="button-secondary item-catalog-player-action-btn"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          data-player-id="${player.id}"
          data-action="cancel"
          ${isBusy ? "disabled" : ""}
        >取消</button>
      </div>
    </div>
  `;
}

function buildItemCatalogPlayerUsageHtml(entry, mode = "scorer") {
  if (!activeSeason?.id) {
    return '<span class="item-catalog-player-empty muted">未选择赛季</span>';
  }

  const players = seasonPlayers.filter((player) => player.is_in_season);
  if (!players.length) {
    return '<span class="item-catalog-player-empty muted">暂无赛季选手</span>';
  }

  if (itemCatalogUsageSummaryStatus === "loading") {
    return '<span class="item-catalog-player-empty muted">数量统计中...</span>';
  }

  if (itemCatalogUsageSummaryStatus === "error") {
    return '<span class="item-catalog-player-empty muted">数量统计待同步</span>';
  }

  if (itemCatalogUsageSummaryStatus !== "ready") {
    return '<span class="item-catalog-player-empty muted">等待数量统计</span>';
  }

  const itemSummary = itemCatalogUsageSummaryByItem.get(entry.id) || new Map();
  const initialQuantity = getItemCatalogInitialQuantity(entry);
  const donationAmount = getItemCatalogConfigNumber(entry, "donation_amount", 0);

  const selectedPlayer = players.find((player) =>
    isSelectedItemCatalogPlayerAction(mode, entry.id, player.id)
  ) || null;

  const playerChipsHtml = players.map((player) => {
    const usage = itemSummary.get(player.id) || null;
    const playerLabel = stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手";
    const usageCount = Number.isFinite(usage?.usageCount)
      ? Math.max(Number(usage.usageCount), 0)
      : 0;
    const remainingCount = Number.isFinite(usage?.remainingCount)
      ? usage.remainingCount
      : initialQuantity;
    const displayCount = Math.abs(remainingCount);
    const toneClass = remainingCount < 0
      ? " item-catalog-player-chip-negative"
      : (remainingCount > 0 ? " item-catalog-player-chip-positive" : " item-catalog-player-chip-zero");
    const selectedClass = isSelectedItemCatalogPlayerAction(mode, entry.id, player.id)
      ? " item-catalog-player-chip-selected"
      : "";
    const donationText = remainingCount < 0 && donationAmount > 0
      ? `，对应赞助 ${formatScore(displayCount * donationAmount)}`
      : "";
    const usageText = `${playerLabel}：已使用 ${formatItemUsageCount(usageCount)}`;
    const titleText = remainingCount < 0
      ? `${usageText}，额外购买 ${formatItemUsageCount(displayCount)}${donationText}`
      : `${usageText}，剩余 ${formatItemUsageCount(displayCount)}`;

    const chipInnerHtml = `
      <span class="item-catalog-player-name">${escapeHtml(getCompactPlayerDisplayName(player.display_name || "未知选手"))}</span>
      <span class="item-catalog-player-count">${escapeHtml(formatItemUsageCount(displayCount))}</span>
    `;

    const chipHtml = isCurrentRoleScorer()
      ? `
        <button
          type="button"
          class="item-catalog-player-chip item-catalog-player-chip-btn${toneClass}${selectedClass}"
          data-mode="${mode}"
          data-item-id="${entry.id}"
          data-player-id="${player.id}"
          title="${escapeHtml(titleText)}"
          aria-pressed="${selectedClass ? "true" : "false"}"
        >
          ${chipInnerHtml}
        </button>
      `
      : `
        <span
          class="item-catalog-player-chip${toneClass}"
          title="${escapeHtml(titleText)}"
        >
          ${chipInnerHtml}
        </span>
      `;

    return chipHtml;
  }).join("");

  return `${playerChipsHtml}${selectedPlayer ? buildItemCatalogPlayerActionRow(entry, selectedPlayer, mode) : ""}`;
}

async function loadItemCatalogUsageSummary() {
  if (!activeSeason?.id || !itemCatalogEntries.length) {
    itemCatalogUsageSummaryPendingKey = "";
    itemCatalogUsageSummaryPendingPromise = null;
    itemCatalogUsageSummaryByItem = new Map();
    itemCatalogUsageSummaryStatus = "idle";
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    if (leaderboardPlayers.length) {
      renderLeaderboard(leaderboardPlayers);
    }
    return;
  }

  if (!seasonPlayers.some((player) => player.is_in_season)) {
    itemCatalogUsageSummaryPendingKey = "";
    itemCatalogUsageSummaryPendingPromise = null;
    itemCatalogUsageSummaryByItem = new Map();
    itemCatalogUsageSummaryStatus = "idle";
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    if (leaderboardPlayers.length) {
      renderLeaderboard(leaderboardPlayers);
    }
    return;
  }

  const requestKey = [
    activeSeason.id,
    itemCatalogEntries.map((entry) => `${entry.id}:${getItemCatalogInitialQuantity(entry)}`).join("|"),
    seasonPlayers.filter((player) => player.is_in_season).map((player) => player.id).join("|"),
  ].join("::");

  if (itemCatalogUsageSummaryPendingPromise && itemCatalogUsageSummaryPendingKey === requestKey) {
    return itemCatalogUsageSummaryPendingPromise;
  }

  const shouldShowLoadingState = itemCatalogUsageSummaryStatus !== "ready";
  if (shouldShowLoadingState) {
    itemCatalogUsageSummaryStatus = "loading";
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
  }

  itemCatalogUsageSummaryPendingKey = requestKey;
  itemCatalogUsageSummaryPendingPromise = (async () => {
    const { data, error } = await db.rpc("get_item_catalog_usage_summary", {
      p_season_id: activeSeason.id,
    });

    if (itemCatalogUsageSummaryPendingKey !== requestKey) {
      return;
    }

    if (error) {
      console.error("加载道具数量统计失败：", error);
      itemCatalogUsageSummaryByItem = new Map();
      itemCatalogUsageSummaryStatus = "error";
      renderItemCatalogManagement("scorer");
      renderItemCatalogManagement("admin");
      if (leaderboardPlayers.length) {
        renderLeaderboard(leaderboardPlayers);
      }
      return;
    }

    itemCatalogUsageSummaryByItem = buildItemCatalogUsageSummaryMap(data || []);
    itemCatalogUsageSummaryStatus = "ready";
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    if (leaderboardPlayers.length) {
      renderLeaderboard(leaderboardPlayers);
    }
  })().finally(() => {
    if (itemCatalogUsageSummaryPendingKey === requestKey) {
      itemCatalogUsageSummaryPendingKey = "";
      itemCatalogUsageSummaryPendingPromise = null;
    }
  });

  return itemCatalogUsageSummaryPendingPromise;
}

function buildItemCatalogCardHtml(entry, mode = "scorer") {
  const donationAmount = getItemCatalogConfigNumber(entry, "donation_amount", 0);
  const initialQuantity = getItemCatalogInitialQuantity(entry);
  const matchTargetsLabel = getItemCatalogMatchTargetsLabel(entry);
  const resolutionModeLabel = isItemCatalogRecordOnly(entry)
    ? "仅记录"
    : "积分生效";
  const scoreMultiplierLabel = isItemCatalogRecordOnly(entry)
    ? "不参与胜负积分计算"
    : formatItemScoreMultiplierLabel(
      getItemCatalogScoreDeltaMultiplier(entry),
      getItemCatalogScoreDeltaSpecialToken(entry)
    );
  const stackSummaryLabel = getItemCatalogScoreStackSummaryLabel(entry);
  const matchTargetsTooltip = `生效对象：${matchTargetsLabel}\n记录模式：${resolutionModeLabel}\n积分效果：${scoreMultiplierLabel}\n叠加规则：${stackSummaryLabel}`;
  const canManage = isCurrentRoleScorer();
  const playerUsageHtml = buildItemCatalogPlayerUsageHtml(entry, mode);
  const statusBadgeHtml = entry.is_active
    ? ""
    : '<span class="queue-slot">已停用</span>';

  return `
    <div class="admin-member-card item-catalog-card${entry.is_active ? "" : " item-catalog-card-inactive"}">
      <div class="admin-identity-card-main item-catalog-card-main">
        <div class="item-catalog-card-meta">
          <strong class="item-catalog-name" title="${escapeHtml(matchTargetsTooltip)}">${escapeHtml(entry.name || "未命名道具")}</strong>
          <div class="item-catalog-card-badges">
            ${statusBadgeHtml}
            <span class="queue-slot">赞助额 ${escapeHtml(formatScore(donationAmount))}</span>
            <span class="queue-slot">初始 ${escapeHtml(String(initialQuantity))}</span>
          </div>
        </div>
        <div class="item-catalog-player-usage">${playerUsageHtml}</div>
      </div>
      ${canManage ? `
        <div class="admin-member-actions">
          <button type="button" class="button-secondary item-catalog-edit-btn" data-mode="${mode}" data-item-id="${entry.id}">编辑</button>
          <button type="button" class="button-danger item-catalog-delete-btn" data-mode="${mode}" data-item-id="${entry.id}">删除</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderItemCatalogManagement(mode = "scorer") {
  const refs = getItemManagementRefs(mode);
  if (!refs.list) return;
  const visibleEntries = itemCatalogEntries
    .slice()
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
    });

  refs.list.innerHTML = visibleEntries.length
    ? visibleEntries.map((entry) => buildItemCatalogCardHtml(entry, mode)).join("")
    : '<p class="muted">当前还没有道具，请先添加。</p>';

  renderItemScoreStackSelector(mode, getSelectedItemScoreStackRulesFromForm(mode));
  syncItemCatalogFormState(mode);
}

async function loadItemCatalog({ loadUsageSummary = true } = {}) {
  const { data, error } = await db
    .from("item_catalog")
    .select("id, code, name, config, score_delta_multiplier, score_delta_special, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("加载道具目录失败：", error);
    const migrationHint = getLatestSchemaMigrationHint(error);
    if (migrationHint) {
      setScorerPanelMessage(`道具目录功能尚未完成迁移。${migrationHint}`, true);
      setAdminPanelMessage(`道具目录功能尚未完成迁移。${migrationHint}`, true);
    }
    itemCatalogEntries = [];
    itemCatalogUsageSummaryByItem = new Map();
    itemCatalogUsageSummaryStatus = "idle";
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    return;
  }

  let seasonSettingsMap = new Map();
  let scoreStackRulesByItem = new Map();
  seasonItemCatalogSettingsAvailable = true;
  itemCatalogScoreRulesAvailable = true;
  if (activeSeason?.id) {
    const { data: settingsData, error: settingsError } = await db
      .from("season_item_catalog_settings")
      .select("item_catalog_id, initial_quantity")
      .eq("season_id", activeSeason.id);

    if (settingsError) {
      console.error("加载赛季道具配置失败：", settingsError);
      const migrationHint = getLatestSchemaMigrationHint(settingsError);
      seasonItemCatalogSettingsAvailable = !migrationHint;
      if (migrationHint) {
        setScorerPanelMessage(`赛季初始道具数量功能尚未启用。${migrationHint}`, true);
        setAdminPanelMessage(`赛季初始道具数量功能尚未启用。${migrationHint}`, true);
      }
    } else {
      seasonSettingsMap = new Map(
        (settingsData || []).map((row) => [row.item_catalog_id, Number(row.initial_quantity ?? 0)])
      );
    }
  }

  if ((data || []).length) {
    const { data: stackRows, error: stackError } = await db
      .from("item_catalog_score_stacks")
      .select("item_catalog_id_low, item_catalog_id_high, score_delta_multiplier, score_delta_special");

    if (stackError) {
      console.error("加载道具叠加倍率规则失败：", stackError);
      const migrationHint = getLatestSchemaMigrationHint(stackError);
      itemCatalogScoreRulesAvailable = false;
      if (migrationHint) {
        setScorerPanelMessage(`道具叠加倍率功能尚未启用。${migrationHint}`, true);
        setAdminPanelMessage(`道具叠加倍率功能尚未启用。${migrationHint}`, true);
      }
    } else {
      (stackRows || []).forEach((row) => {
        const lowItemId = row?.item_catalog_id_low || "";
        const highItemId = row?.item_catalog_id_high || "";
        if (!lowItemId || !highItemId) return;

        const multiplier = normalizeItemScoreMultiplierValue(row?.score_delta_multiplier, 0);
        const specialToken = normalizeItemScoreSpecialToken(row?.score_delta_special);
        const lowRules = scoreStackRulesByItem.get(lowItemId) || [];
        lowRules.push({ itemCatalogId: highItemId, multiplier, specialToken });
        scoreStackRulesByItem.set(lowItemId, lowRules);

        const highRules = scoreStackRulesByItem.get(highItemId) || [];
        highRules.push({ itemCatalogId: lowItemId, multiplier, specialToken });
        scoreStackRulesByItem.set(highItemId, highRules);
      });
    }
  }

  itemCatalogEntries = (data || []).map((entry) => ({
    ...entry,
    score_delta_multiplier: normalizeItemScoreMultiplierValue(entry?.score_delta_multiplier, 0),
    score_delta_special: normalizeItemScoreSpecialToken(entry?.score_delta_special ?? entry?.config?.score_delta_special),
    score_delta_stack_rules: normalizeItemScoreStackRules(scoreStackRulesByItem.get(entry.id) || [], entry.id),
    initial_quantity: Number(seasonSettingsMap.get(entry.id) ?? 0),
  }));
  if (
    itemCatalogPendingPlayerAction
    && (
      !itemCatalogEntries.some((entry) => entry.id === itemCatalogPendingPlayerAction.itemId)
      || !seasonPlayers.some((player) => player.id === itemCatalogPendingPlayerAction.playerId && player.is_in_season)
    )
  ) {
    clearItemCatalogPendingPlayerAction();
  }
  if (loadUsageSummary) {
    await loadItemCatalogUsageSummary();
  } else {
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
  }
  if (itemInventoryLogsModal && !itemInventoryLogsModal.hidden) {
    await loadItemInventoryLogs();
  }
  if (recentMatchesData.length || recentMatchDaysData.length) {
    renderRecentMatchState();
  }
}

async function applyItemCatalogInventoryAction(mode = "scorer", itemId = "", playerId = "", action = "") {
  if (!ensureScorerAccess("仅记分员或管理员可管理道具。")) return;
  if (!activeSeason?.id) {
    setItemCatalogPanelMessage(mode, "当前没有可操作的赛季。", true);
    return;
  }

  const entry = itemCatalogEntries.find((item) => item.id === itemId) || null;
  const player = seasonPlayers.find((item) => item.id === playerId && item.is_in_season) || null;
  if (!entry || !player) {
    setItemCatalogPanelMessage(mode, "目标选手或道具不存在，请刷新后重试。", true);
    clearItemCatalogPendingPlayerAction();
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    return;
  }

  if (action === "cancel") {
    clearItemCatalogPendingPlayerAction();
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    return;
  }

  const normalizedAction = action === "gift"
    ? "gift"
    : (action === "revoke" ? "revoke" : "purchase");
  const actionLabel = normalizedAction === "gift"
    ? "赠送"
    : (normalizedAction === "revoke"
      ? copyText(mode === "admin" ? "adminPanel.itemRevokeAction" : "scorerPanel.itemRevokeAction", "扣除")
      : "主动购买");
  const confirmMessage = `确认要为 ${player.display_name || "该选手"}${actionLabel}“${entry.name || "未命名道具"}”吗？`;
  const confirmed = await confirmAction(confirmMessage, {
    title: "确认道具操作",
    confirmLabel: actionLabel,
    danger: normalizedAction === "revoke",
  });
  if (!confirmed) {
    setItemCatalogPanelMessage(mode, `已取消${actionLabel}。`);
    return;
  }

  itemCatalogActionPendingKey = getItemCatalogPlayerActionKey(mode, itemId, playerId, normalizedAction);
  renderItemCatalogManagement("scorer");
  renderItemCatalogManagement("admin");
  setItemCatalogPanelMessage(mode, `正在为 ${player.display_name || "该选手"}${actionLabel}“${entry.name || "未命名道具"}”...`);

  const { error } = normalizedAction === "revoke"
    ? await db.rpc("revoke_player_item_inventory", {
      p_season_id: activeSeason.id,
      p_player_id: playerId,
      p_item_catalog_id: itemId,
      p_reason: "管理员扣除道具",
    })
    : await db.rpc("grant_player_item_inventory", {
      p_season_id: activeSeason.id,
      p_player_id: playerId,
      p_item_catalog_id: itemId,
      p_action: normalizedAction,
      p_reason: normalizedAction === "gift" ? "管理员赠送道具" : "选手主动购买道具",
    });

  itemCatalogActionPendingKey = "";

  if (error) {
    const hint = getLatestSchemaMigrationHint(error);
    const suffix = hint ? ` ${hint}` : "";
    setItemCatalogPanelMessage(mode, `${actionLabel}失败：${getErrorMessage(error)}${suffix}`, true);
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    return;
  }

  clearItemCatalogPendingPlayerAction();
  setItemCatalogPanelMessage(mode, `已为 ${player.display_name || "该选手"}${actionLabel}“${entry.name || "未命名道具"}”。`);
  await loadItemCatalog();
}

async function saveItemCatalogEntry(mode = "scorer") {
  if (!ensureScorerAccess("仅记分员或管理员可管理道具。")) return false;
  const refs = getItemManagementRefs(mode);
  const initialQuantityRaw = String(refs.initialQuantityInput?.value || "").trim();
  const donationAmount = Number(refs.donationInput?.value || 0);
  const resolutionMode = refs.resolutionModeSelect?.value === "record_only" ? "record_only" : "effect";
  const scoreMultiplierRaw = String(refs.scoreMultiplierInput?.value || "").trim();
  const matchIcon = refs.matchIconSelect?.value || DEFAULT_ITEM_MATCH_ICON;
  const matchTargets = getSelectedItemMatchTargetsFromForm(mode);
  const scoreStackRules = getSelectedItemScoreStackRulesFromForm(mode);
  const scoreMultiplierSpec = resolutionMode === "record_only"
    ? parseItemScoreMultiplierInput(scoreMultiplierRaw, 1)
    : parseItemScoreMultiplierInput(scoreMultiplierRaw, 0);
  const initialQuantity = initialQuantityRaw === "" ? 0 : Number(initialQuantityRaw);
  const setPanelMessage = mode === "admin" ? setAdminPanelMessage : setScorerPanelMessage;
  const editingId = itemCatalogEditingIds[mode] || "";
  const existing = itemCatalogEntries.find((entry) => entry.id === editingId) || null;
  const name = String(refs.nameInput?.value || existing?.name || "").trim();

  if (!activeSeason?.id) {
    setPanelMessage("当前没有可设置道具赛季配置的赛季。", true);
    return false;
  }

  if (editingId && !existing) {
    setPanelMessage("当前编辑的道具不存在，请刷新后重试。", true);
    await loadItemCatalog();
    resetItemCatalogForm(mode, { closeEditor: true });
    return false;
  }

  if (!name) {
    setPanelMessage("请输入道具名称。", true);
    return false;
  }
  if (!Number.isFinite(donationAmount) || donationAmount < 0) {
    setPanelMessage("赞助额必须是大于等于 0 的数字。", true);
    return false;
  }
  if (!scoreMultiplierSpec.valid) {
    setPanelMessage("积分变动倍率必须是有效数字或 @。", true);
    return false;
  }
  if (!ITEM_MATCH_ICON_OPTIONS.some((option) => option.value === matchIcon)) {
    setPanelMessage("请选择有效的道具图标。", true);
    return false;
  }
  if (!matchTargets.length) {
    setPanelMessage("请至少选择一个生效对象。", true);
    return false;
  }
  if (!normalizeItemMatchTargets(matchTargets).length) {
    setPanelMessage("生效对象配置无效，个人与团队不能混选。", true);
    return false;
  }
  if (!Number.isInteger(initialQuantity) || initialQuantity < 0) {
    setPanelMessage("赛季初始数量必须是大于等于 0 的整数。", true);
    return false;
  }
  if (
    resolutionMode !== "record_only"
    && scoreStackRules.some((rule) => !itemCatalogEntries.some((entry) => entry.id === rule.itemCatalogId))
  ) {
    setPanelMessage("叠加倍率对象不存在，请刷新后重试。", true);
    return false;
  }
  if (
    resolutionMode !== "record_only"
    && getItemStackMultiplierInputs(refs.stackMultiplierList).some((input) => !parseItemScoreMultiplierInput(input.value, 0).valid)
  ) {
    setPanelMessage("叠加倍率必须是有效数字或 @。", true);
    return false;
  }
  if (!seasonItemCatalogSettingsAvailable) {
    setPanelMessage(
      "保存道具失败：当前数据库尚未启用赛季初始数量配置表。请先在 Supabase 执行最新 SQL，至少应用 20260501081000_normalize_item_purchase_rewards.sql。",
      true
    );
    return false;
  }
  if (!itemCatalogScoreRulesAvailable) {
    setPanelMessage(
      "保存道具失败：当前数据库尚未启用最新道具积分倍率规则。请先在 Supabase 执行最新 SQL，至少应用 20260501122000_item_score_special_token_at.sql。",
      true
    );
    return false;
  }

  const existingConfig = existing?.config && typeof existing.config === "object"
    ? { ...existing.config }
    : {};
  delete existingConfig.score_multiplier;
  delete existingConfig.initial_quantity;
  delete existingConfig.match_scope;
  delete existingConfig.score_delta_special;

  const config = {
    ...existingConfig,
    donation_amount: donationAmount,
    match_icon: matchIcon,
    match_targets: matchTargets,
    match_resolution_mode: resolutionMode,
    operator_roles: ["season_admin", "score_keeper", "item_operator"],
  };
  const payload = editingId
    ? {
        name,
        config,
        effect_type: "informational",
        score_delta_multiplier: scoreMultiplierSpec.multiplier,
        score_delta_special: scoreMultiplierSpec.specialToken || null,
      }
    : {
        name,
        visibility_default: "public",
        effect_type: "informational",
        score_delta_multiplier: scoreMultiplierSpec.multiplier,
        score_delta_special: scoreMultiplierSpec.specialToken || null,
        config,
        is_active: true,
      };

  if (refs.saveBtn) refs.saveBtn.disabled = true;
  setPanelMessage(editingId ? "正在更新道具..." : "正在添加道具...");

  let error = null;
  let savedItemId = editingId || "";
  if (editingId) {
    ({ error } = await db.from("item_catalog").update(payload).eq("id", editingId));
  } else {
    const insertResult = await db
      .from("item_catalog")
      .insert(payload)
      .select("id")
      .single();
    error = insertResult.error;
    savedItemId = insertResult.data?.id || "";
  }

  if (!error && savedItemId) {
    const settingsResult = await db
      .from("season_item_catalog_settings")
      .upsert([{
        season_id: activeSeason.id,
        item_catalog_id: savedItemId,
        initial_quantity: initialQuantity,
      }], {
        onConflict: "season_id,item_catalog_id",
      });
    error = settingsResult.error;
  }

  if (!error && savedItemId) {
    const deleteResult = await db
      .from("item_catalog_score_stacks")
      .delete()
      .or(`item_catalog_id_low.eq.${savedItemId},item_catalog_id_high.eq.${savedItemId}`);
    error = deleteResult.error;
  }

  if (!error && savedItemId && resolutionMode !== "record_only" && scoreStackRules.length) {
    const stackRows = scoreStackRules.map((rule) => {
      const lowItemId = savedItemId < rule.itemCatalogId ? savedItemId : rule.itemCatalogId;
      const highItemId = savedItemId < rule.itemCatalogId ? rule.itemCatalogId : savedItemId;
      return {
        item_catalog_id_low: lowItemId,
        item_catalog_id_high: highItemId,
        score_delta_multiplier: normalizeItemScoreMultiplierValue(rule.multiplier, 0),
        score_delta_special: normalizeItemScoreSpecialToken(rule.specialToken) || null,
      };
    });
    const stackResult = await db
      .from("item_catalog_score_stacks")
      .insert(stackRows);
    error = stackResult.error;
  }

  if (refs.saveBtn) refs.saveBtn.disabled = false;

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    const errorMessage = getErrorMessage(error);
    setPanelMessage(`保存道具失败：${errorMessage}${migrationHint ? `。${migrationHint}` : ""}`, true);
    return false;
  }

  resetItemCatalogForm(mode, { closeEditor: true });
  setPanelMessage(editingId ? "道具已更新。" : "道具已添加。");
  await loadItemCatalog();
  return true;
}

async function deleteItemCatalogEntry(mode = "scorer", itemId = "") {
  if (!ensureScorerAccess("仅记分员或管理员可管理道具。")) return false;
  const entry = itemCatalogEntries.find((item) => item.id === itemId) || null;
  if (!entry) {
    setItemCatalogPanelMessage(mode, "目标道具不存在，请刷新后重试。", true);
    return false;
  }

  const confirmText = await promptAction(
    `请输入“确认删除”以删除道具“${entry.name || "未命名道具"}”。\n删除后无法恢复；若该道具已有历史发放或使用记录，数据库会直接拒绝删除。`,
    "",
    {
      title: "删除道具",
      inputLabel: "请输入“确认删除”",
      placeholder: "确认删除",
      confirmLabel: "删除",
      danger: true,
    }
  );

  if (confirmText !== "确认删除") {
    setItemCatalogPanelMessage(mode, "未输入正确确认文字，已取消删除。");
    return false;
  }

  setItemCatalogPanelMessage(mode, `正在删除“${entry.name || "未命名道具"}”...`);
  const { error } = await db.from("item_catalog").delete().eq("id", itemId);

  if (error) {
    const errorMessage = getErrorMessage(error);
    const blockedByHistory = (
      errorMessage.includes("item_instances")
      || errorMessage.includes("still referenced")
      || errorMessage.includes("violates foreign key constraint")
    );
    setItemCatalogPanelMessage(
      mode,
      blockedByHistory
        ? `删除道具失败：${entry.name || "该道具"} 已在赛季中发放或使用，当前不能直接删除。`
        : `删除道具失败：${errorMessage}`,
      true
    );
    return false;
  }

  if (itemCatalogEditingIds[mode] === itemId) {
    resetItemCatalogForm(mode, { closeEditor: true });
  }
  clearItemCatalogPendingPlayerAction();
  setItemCatalogPanelMessage(mode, `已删除“${entry.name || "未命名道具"}”。`);
  await loadItemCatalog();
  return true;
}

function isValidManagedIdentityUsername(value) {
  return /^(?=.{1,10}$)[\u4e00-\u9fff]+$/u.test(normalizeUsername(value));
}

function getManagedIdentityRoleLabel(role) {
  return role === "admin" ? "管理员" : "记分员";
}

function getManagedIdentityByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return adminManagedAccounts.find((entry) => normalizeEmail(entry.auth_email || entry.auth_email_normalized) === normalizedEmail) || null;
}

function populateManagedIdentityForm(identity = null) {
  adminEditingIdentityId = identity?.id || "";
  if (adminIdentityEmailSelect) {
    adminIdentityEmailSelect.value = identity?.auth_email || identity?.auth_email_normalized || "";
  }
  if (adminIdentityUsernameInput) {
    adminIdentityUsernameInput.value = identity?.username || "";
  }
}

function syncManagedIdentityFormFromEmail(email) {
  const existing = getManagedIdentityByEmail(email);
  if (existing) {
    populateManagedIdentityForm(existing);
    return;
  }
  adminEditingIdentityId = "";
  if (adminIdentityUsernameInput) {
    adminIdentityUsernameInput.value = "";
  }
}

function renderManagedIdentityEmailOptions() {
  if (!adminIdentityEmailSelect || !adminIdentityEmailOptions) return;
  const selectedValue = normalizeEmail(adminIdentityEmailSelect.value);
  const emailSet = new Set(
    [
      ...adminAvailableAuthEmails,
      ...adminManagedAccounts.map((entry) => entry.auth_email || entry.auth_email_normalized).filter(Boolean),
      normalizeEmail(authSession?.user?.email || ""),
    ].map((value) => normalizeEmail(value)).filter(Boolean)
  );
  const options = [];
  [...emailSet]
    .sort((a, b) => a.localeCompare(b, "en"))
    .forEach((email) => {
      const existing = getManagedIdentityByEmail(email);
      const suffix = existing ? ` · ${getManagedIdentityRoleLabel(existing.role)} · ${existing.username || "未命名"}` : "";
      options.push(`<option value="${escapeHtml(email)}">${escapeHtml(email)}${escapeHtml(suffix)}</option>`);
    });
  adminIdentityEmailOptions.innerHTML = options.join("");
  adminIdentityEmailSelect.value = selectedValue;
}

function renderManagedIdentityList() {
  if (!scorerMembersList) return;
  const accounts = adminManagedAccounts.slice().sort((a, b) => {
    const roleCompare = String(a.role || "").localeCompare(String(b.role || ""), "en");
    if (roleCompare !== 0) return roleCompare;
    return String(a.auth_email || "").localeCompare(String(b.auth_email || ""), "en");
  });

  if (!hasVisibleAuthSession()) {
    scorerMembersList.innerHTML = `<p class="muted">${escapeHtml(copyText("runtime.rolePanels.roleHintLoggedOut", "登录后会根据账号角色显示记录员或管理员入口。"))}</p>`;
    return;
  }

  if (!isCurrentRoleAdmin()) {
    scorerMembersList.innerHTML = `<p class="muted">${escapeHtml(copyText("runtime.rolePanels.roleHintLoggedIn", "当前项目已改为使用 Supabase Auth 账号角色控制访问权限，不再使用前端口令或隐藏入口。"))}</p>`;
    return;
  }

  scorerMembersList.innerHTML = accounts.length
    ? accounts.map((account) => `
      <div class="admin-member-card admin-identity-card">
        <div class="admin-identity-card-main">
          <div class="admin-identity-heading">
            <strong>${escapeHtml(account.username || "未命名")}</strong>
            <span class="queue-slot">${escapeHtml(getManagedIdentityRoleLabel(account.role))}</span>
          </div>
          <p class="muted admin-identity-email">${escapeHtml(account.auth_email || account.auth_email_normalized || "邮箱缺失")}</p>
        </div>
        <div class="admin-member-actions admin-identity-actions">
          <button
            type="button"
            class="button-secondary admin-identity-action-btn admin-edit-identity-btn"
            data-identity-id="${account.id}"
          >修改命名</button>
          <button
            type="button"
            class="button-secondary admin-identity-action-btn admin-reset-password-btn"
            data-identity-id="${account.id}"
            ${account.auth_user_id ? "" : 'disabled title="账号未绑定 Auth 用户"'}
          >改密码</button>
          <button
            type="button"
            class="button-secondary admin-identity-action-btn admin-clear-identity-devices-btn"
            data-identity-id="${account.id}"
          >清登录</button>
          ${account.role === "admin" ? "" : `
            <button
              type="button"
              class="button-danger admin-identity-action-btn admin-delete-identity-btn"
              data-identity-id="${account.id}"
            >删除</button>
          `}
        </div>
      </div>
    `).join("")
    : '<p class="muted">当前还没有已配置的管理员/记分员账号映射。</p>';
}

function validateManagedIdentityPassword(value) {
  const password = String(value || "");
  if (password.length < 8) {
    return "密码长度至少为 8 位。";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "密码至少需要包含字母和数字。";
  }
  return "";
}

function renderScorerManualScoreOptions() {
  if (!scorerManualScoreChips) return;
  const players = seasonPlayers
    .filter((player) => player.is_in_season)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));

  scorerManualScoreSelectedIds = new Set(
    [...scorerManualScoreSelectedIds].filter((playerId) => players.some((player) => player.id === playerId))
  );

  scorerManualScoreChips.innerHTML = players.length
    ? players.map((player) => `
      <button
        type="button"
        class="manual-score-player-chip${scorerManualScoreSelectedIds.has(player.id) ? " manual-score-player-chip-active" : ""}"
        data-mode="scorer"
        data-player-id="${player.id}"
      >${escapeHtml(player.display_name)}</button>
    `).join("")
    : '<p class="muted">当前赛季还没有可选选手。</p>';
  updateManualScoreControlState("scorer");
}

function renderAdminManualScoreOptions() {
  if (!adminManualScoreChips) return;
  const players = seasonPlayers
    .filter((player) => player.is_in_season)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));

  adminManualScoreSelectedIds = new Set(
    [...adminManualScoreSelectedIds].filter((playerId) => players.some((player) => player.id === playerId))
  );

  adminManualScoreChips.innerHTML = players.length
    ? players.map((player) => `
      <button
        type="button"
        class="manual-score-player-chip${adminManualScoreSelectedIds.has(player.id) ? " manual-score-player-chip-active" : ""}"
        data-mode="admin"
        data-player-id="${player.id}"
      >${escapeHtml(player.display_name)}</button>
    `).join("")
    : '<p class="muted">当前赛季还没有可选选手。</p>';
  updateManualScoreControlState("admin");
}

function renderManualScoreHistoryPanel(mode = "scorer") {
  const listEl = mode === "admin" ? adminManualScoreHistoryList : scorerManualScoreHistoryList;
  const emptyEl = mode === "admin" ? adminManualScoreHistoryEmpty : scorerManualScoreHistoryEmpty;
  if (!listEl || !emptyEl) return;

  if (!activeSeason?.id) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "当前没有可操作的赛季";
    return;
  }

  if (manualScoreHistoryStatus === "loading") {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "正在加载人工积分记录...";
    return;
  }

  if (manualScoreHistoryStatus === "error") {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "人工积分记录加载失败";
    return;
  }

  if (!manualScoreHistoryEntries.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "当前赛季暂无人工积分记录";
    return;
  }

  const entriesByDate = new Map();
  manualScoreHistoryEntries.forEach((entry) => {
    const groupDate = getManualScoreHistoryGroupDate(entry);
    if (!entriesByDate.has(groupDate)) {
      entriesByDate.set(groupDate, []);
    }
    entriesByDate.get(groupDate).push(entry);
  });

  listEl.innerHTML = [...entriesByDate.entries()]
    .sort(([leftDate], [rightDate]) => String(rightDate).localeCompare(String(leftDate), "zh-CN"))
    .map(([groupDate, entries]) => `
      <section class="manual-score-history-date-group">
        <div class="manual-score-history-date-head">
          <strong>${escapeHtml(getManualScoreHistoryGroupLabel(groupDate))}</strong>
          <span>${entries.length} 条</span>
        </div>
        <div class="manual-score-history-date-grid">
          ${entries.map((entry) => buildManualScoreHistoryItemHtml(entry, mode)).join("")}
        </div>
      </section>
    `).join("");
  emptyEl.hidden = true;
  emptyEl.textContent = "";
}

function renderManualScoreHistory() {
  renderManualScoreHistoryPanel("scorer");
  renderManualScoreHistoryPanel("admin");
}

async function loadManualScoreHistory() {
  if (!activeSeason?.id) {
    manualScoreHistoryEntries = [];
    manualScoreHistoryStatus = "idle";
    renderManualScoreHistory();
    return;
  }

  manualScoreHistoryStatus = "loading";
  renderManualScoreHistory();
  const targetSeasonId = activeSeason.id;

  const { data, error } = await db
    .from("manual_score_adjustments")
    .select("id, season_id, player_id, points_delta, reason, metadata, created_at")
    .eq("season_id", targetSeasonId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (targetSeasonId !== activeSeason?.id) {
    return;
  }

  if (error) {
    console.error("加载人工积分记录失败：", error);
    manualScoreHistoryEntries = [];
    manualScoreHistoryStatus = "error";
    renderManualScoreHistory();
    return;
  }

  manualScoreHistoryEntries = (data || []).map((row) => ({
    ...row,
    points_delta: Number(row.points_delta ?? 0),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  }));
  manualScoreHistoryStatus = "ready";
  renderManualScoreHistory();
}

function getManualScoreControlConfig(mode = "scorer") {
  if (mode === "admin") {
    return {
      modal: adminManualScoreModal,
      chipContainer: adminManualScoreChips,
      amountInput: adminManualScoreAmountInput,
      noteInput: adminManualScoreNoteInput,
      hintEl: adminManualScoreHint,
      deathBtn: adminDeathFingerBtn,
      healBtn: adminHealingHandBtn,
      selectedIds: adminManualScoreSelectedIds,
      canUse: isCurrentRoleAdmin() && Boolean(activeSeason?.id),
    };
  }

  return {
    modal: scorerManualScoreModal,
    chipContainer: scorerManualScoreChips,
    amountInput: scorerManualScoreAmountInput,
    noteInput: scorerManualScoreNoteInput,
    hintEl: scorerManualScoreHint,
    deathBtn: scorerDeathFingerBtn,
    healBtn: scorerHealingHandBtn,
    selectedIds: scorerManualScoreSelectedIds,
    canUse: isCurrentRoleScorer() && Boolean(activeSeason?.id),
  };
}

function updateManualScoreControlState(mode = "scorer") {
  const config = getManualScoreControlConfig(mode);
  const chipContainer = config.chipContainer;
  const amountInput = config.amountInput;
  const noteInput = config.noteInput;
  const hintEl = config.hintEl;
  const deathBtn = config.deathBtn;
  const healBtn = config.healBtn;
  const selectedPlayers = seasonPlayers.filter((item) => config.selectedIds.has(item.id) && item.is_in_season);
  const rawAmount = String(amountInput?.value ?? "").trim();
  const parsedAmount = rawAmount === "" ? NaN : Number(rawAmount);
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const canAct = config.canUse && selectedPlayers.length > 0 && hasAmount;

  if (chipContainer) {
    chipContainer.querySelectorAll(".manual-score-player-chip").forEach((chip) => {
      const playerId = chip.dataset.playerId || "";
      chip.disabled = !config.canUse;
      chip.classList.toggle("manual-score-player-chip-active", config.selectedIds.has(playerId));
    });
  }
  if (amountInput) {
    amountInput.disabled = !config.canUse;
  }
  if (noteInput) {
    noteInput.disabled = !config.canUse;
  }
  if (deathBtn) {
    deathBtn.disabled = !canAct;
    deathBtn.textContent = copyText(`${mode === "admin" ? "adminPanel" : "scorerPanel"}.manualScoreApplyLoss`, "确认扣分");
  }
  if (healBtn) {
    healBtn.disabled = !canAct;
    healBtn.textContent = copyText(`${mode === "admin" ? "adminPanel" : "scorerPanel"}.manualScoreApplyGain`, "确认加分");
  }
  if (hintEl) {
    if (!selectedPlayers.length) {
      hintEl.textContent = "";
      hintEl.hidden = true;
    } else {
      const amountLabel = hasAmount ? `；分值：${formatScore(parsedAmount)}` : "；请先填写分值";
      const noteLabel = String(noteInput?.value || "").trim() ? `；备注：${String(noteInput.value).trim()}` : "";
      hintEl.textContent = `已选 ${selectedPlayers.length} 名选手${amountLabel}${noteLabel}`;
      hintEl.hidden = false;
    }
  }
}

function toggleManualScorePlayer(mode, playerId) {
  const selectedIds = mode === "admin" ? adminManualScoreSelectedIds : scorerManualScoreSelectedIds;
  if (!playerId) return;
  if (selectedIds.has(playerId)) {
    selectedIds.delete(playerId);
  } else {
    selectedIds.add(playerId);
  }
  updateManualScoreControlState(mode);
}

function resetManualScoreControls(mode = "scorer") {
  const config = getManualScoreControlConfig(mode);
  config.selectedIds.clear();
  if (config.amountInput) {
    config.amountInput.value = "";
  }
  if (config.noteInput) {
    config.noteInput.value = "";
  }
  setManualScoreModalMessage(mode, "");
  updateManualScoreControlState(mode);
}

function openManualScoreModal(mode = "scorer") {
  if (!ensureScorerAccess("仅记分员或管理员可执行人工积分调整。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  renderScorerManualScoreOptions();
  renderAdminManualScoreOptions();
  resetManualScoreControls(mode);

  const config = getManualScoreControlConfig(mode);
  const dialogKey = mode === "admin" ? "adminManualScore" : "scorerManualScore";
  setManagedDialogOpen(dialogKey, true, {
    initialFocus: config.amountInput || undefined,
  });
  renderManualScoreHistory();
  void loadManualScoreHistory();
}

function renderScorerPanelSummary() {
  return;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatLocalTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatStorageBytes(bytes) {
  const numericBytes = Number(bytes);
  if (!Number.isFinite(numericBytes) || numericBytes < 0) return "未知";

  const units = ["B", "KB", "MB", "GB"];
  let value = numericBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatUsageWithQuota(usedBytes, quotaBytes) {
  const normalizedUsedBytes = Number(usedBytes);
  const normalizedQuotaBytes = Number(quotaBytes);
  const usedText = formatStorageBytes(normalizedUsedBytes);

  if (!Number.isFinite(normalizedQuotaBytes) || normalizedQuotaBytes <= 0) {
    return usedText;
  }

  const quotaText = formatStorageBytes(normalizedQuotaBytes);
  if (Number.isFinite(normalizedUsedBytes) && normalizedUsedBytes > normalizedQuotaBytes) {
    return `${usedText} / ${quotaText}（超出 ${formatStorageBytes(normalizedUsedBytes - normalizedQuotaBytes)}）`;
  }

  return `${usedText} / ${quotaText}`;
}

function isFiniteStorageByteCount(value) {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) && normalizedValue >= 0;
}

function setGitHubRepositoryStorageDisplayText(text = "未知") {
  githubRepositoryStorageDisplayText = String(text || "未知");
  renderRoleMembers();
}

function getGitHubRepositoryStorageDisplayText() {
  return githubRepositoryStorageDisplayText || "未知";
}

function getExpectedGitHubStorageSnapshotDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const snapshotDate = new Date(Date.UTC(year, month - 1, day - (hour < 2 ? 1 : 0)));
  return snapshotDate.toISOString().slice(0, 10);
}

function readGitHubStorageDailyCache(expectedDate) {
  try {
    const cached = JSON.parse(localStorage.getItem(GITHUB_STORAGE_DAILY_CACHE_KEY) || "null");
    if (cached?.beijingDate !== expectedDate || !isFiniteStorageByteCount(cached?.sizeBytes)) {
      return null;
    }
    return cached;
  } catch (_error) {
    return null;
  }
}

function writeGitHubStorageDailyCache(snapshot) {
  try {
    localStorage.setItem(GITHUB_STORAGE_DAILY_CACHE_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // Storage can be unavailable in private browsing; the daily server snapshot still works.
  }
}

async function refreshGitHubRepositoryStorageStatus() {
  if (githubRepositoryStorageRefreshPromise) {
    return githubRepositoryStorageRefreshPromise;
  }

  githubRepositoryStorageRefreshPromise = (async () => {
    const expectedDate = getExpectedGitHubStorageSnapshotDate();
    const cached = readGitHubStorageDailyCache(expectedDate);
    if (cached) {
      setGitHubRepositoryStorageDisplayText(
        formatUsageWithQuota(Number(cached.sizeBytes), GITHUB_PAGES_REPOSITORY_RECOMMENDED_LIMIT_BYTES)
      );
      return;
    }

    if (typeof fetch !== "function") {
      throw new Error("当前环境不支持读取 GitHub 仓库空间快照。");
    }
    const response = await fetch(
      `${GITHUB_REPOSITORY_STORAGE_SNAPSHOT_URL}?date=${encodeURIComponent(expectedDate)}`,
      { cache: "no-cache" }
    );
    if (!response.ok) {
      throw new Error(`GitHub 空间快照返回 ${response.status}`);
    }

    const snapshot = await response.json();
    const usedBytes = Number(snapshot?.sizeBytes);
    if (!isFiniteStorageByteCount(usedBytes)) {
      throw new Error("GitHub 空间快照未返回有效仓库大小。");
    }

    writeGitHubStorageDailyCache({
      sizeBytes: usedBytes,
      beijingDate: String(snapshot?.beijingDate || ""),
      checkedAt: String(snapshot?.checkedAt || ""),
    });
    setGitHubRepositoryStorageDisplayText(
      formatUsageWithQuota(usedBytes, GITHUB_PAGES_REPOSITORY_RECOMMENDED_LIMIT_BYTES)
    );
  })();

  try {
    await githubRepositoryStorageRefreshPromise;
  } catch (error) {
    console.warn("读取 GitHub 仓库空间失败。", error);
    setGitHubRepositoryStorageDisplayText("读取失败");
  } finally {
    githubRepositoryStorageRefreshPromise = null;
  }
}

function syncGitHubRepositoryStorageAutoRefresh() {
  if (authSession && isCurrentRoleScorer()) {
    void refreshGitHubRepositoryStorageStatus();
  }
}

function setSupabaseSystemUsageDisplayText(text = "未知") {
  supabaseSystemUsageDisplayText = String(text || "未知");
  renderRoleMembers();
}

function getSupabaseSystemUsageDisplayText() {
  return supabaseSystemUsageDisplayText || "未知";
}

function getSupabaseSystemUsageBusinessDate() {
  return getBeijingBusinessDateString() || new Date().toISOString().slice(0, 10);
}

function getSupabaseSystemUsageRefreshKey() {
  if (!authSession || !isCurrentRoleAdmin()) return "";
  return `${getSupabaseSystemUsageBusinessDate()}:${authSession.user?.id || ""}:admin`;
}

function readSupabaseSystemUsageDailyCache() {
  const snapshot = readLocalJsonStorage(SUPABASE_SYSTEM_USAGE_DAILY_CACHE_STORAGE_KEY, null);
  if (
    snapshot?.businessDate === getSupabaseSystemUsageBusinessDate()
    && typeof snapshot.displayText === "string"
    && snapshot.displayText.trim()
  ) {
    return snapshot;
  }
  return null;
}

function writeSupabaseSystemUsageDailyCache(displayText, status = "success") {
  writeLocalJsonStorage(SUPABASE_SYSTEM_USAGE_DAILY_CACHE_STORAGE_KEY, {
    businessDate: getSupabaseSystemUsageBusinessDate(),
    displayText,
    status,
    cachedAt: new Date().toISOString(),
  });
}

function applySupabaseSystemUsageDailyCache() {
  const snapshot = readSupabaseSystemUsageDailyCache();
  if (!snapshot) return false;
  setSupabaseSystemUsageDisplayText(snapshot.displayText);
  return true;
}

function resetSupabaseSystemUsageStatus(text = "仅管理员可见") {
  supabaseSystemUsageRefreshKey = "";
  supabaseSystemUsageRefreshPromise = null;
  setSupabaseSystemUsageDisplayText(text);
}

function prepareSupabaseSystemUsageStatusForAdmin() {
  const refreshKey = getSupabaseSystemUsageRefreshKey();
  if (!refreshKey) {
    resetSupabaseSystemUsageStatus();
    return false;
  }

  if (applySupabaseSystemUsageDailyCache()) {
    supabaseSystemUsageRefreshKey = refreshKey;
    supabaseSystemUsageRefreshPromise = null;
    return false;
  }

  if (supabaseSystemUsageRefreshKey !== refreshKey) {
    supabaseSystemUsageRefreshKey = refreshKey;
    supabaseSystemUsageRefreshPromise = null;
    setSupabaseSystemUsageDisplayText("数据库：读取中");
  }

  return true;
}

function formatSupabaseSystemUsageDisplay(usage = {}) {
  const databaseBytes = Number(usage.databaseBytes);
  const databaseQuotaBytes = Number(usage.databaseQuotaBytes) || SUPABASE_DATABASE_USAGE_QUOTA_BYTES;
  const usedDatabaseBytes = isFiniteStorageByteCount(databaseBytes) ? databaseBytes : Number.NaN;

  return `数据库：${formatUsageWithQuota(usedDatabaseBytes, databaseQuotaBytes)}`;
}

async function refreshSupabaseSystemUsageStatus() {
  const refreshKey = getSupabaseSystemUsageRefreshKey();
  if (!refreshKey) {
    resetSupabaseSystemUsageStatus();
    return;
  }

  if (applySupabaseSystemUsageDailyCache()) {
    supabaseSystemUsageRefreshKey = refreshKey;
    supabaseSystemUsageRefreshPromise = null;
    return;
  }

  if (supabaseSystemUsageRefreshKey !== refreshKey) {
    supabaseSystemUsageRefreshKey = refreshKey;
    supabaseSystemUsageRefreshPromise = null;
    setSupabaseSystemUsageDisplayText("数据库：读取中");
  }

  if (supabaseSystemUsageRefreshPromise) return supabaseSystemUsageRefreshPromise;
  if (supabaseSystemUsageDisplayText !== "数据库：读取中") return;

  supabaseSystemUsageRefreshPromise = (async () => {
    try {
      const { data, error } = await db.rpc("get_admin_system_usage");
      if (error) {
        throw error;
      }

      const usage = Array.isArray(data) ? data[0] : data;
      if (getSupabaseSystemUsageRefreshKey() === refreshKey) {
        const displayText = formatSupabaseSystemUsageDisplay(usage || {});
        writeSupabaseSystemUsageDailyCache(displayText, "success");
        setSupabaseSystemUsageDisplayText(displayText);
      }
    } catch (error) {
      console.warn("读取 Supabase 用量失败。", error);
      if (getSupabaseSystemUsageRefreshKey() === refreshKey) {
        const displayText = "数据库：读取失败";
        writeSupabaseSystemUsageDailyCache(displayText, "error");
        setSupabaseSystemUsageDisplayText(displayText);
      }
    } finally {
      if (supabaseSystemUsageRefreshKey === refreshKey) {
        supabaseSystemUsageRefreshPromise = null;
      }
    }
  })();

  return supabaseSystemUsageRefreshPromise;
}

function renderLastUpdatedTime() {
  if (!lastUpdatedText) return;

  const raw = document.lastModified;
  if (!raw) {
    lastUpdatedText.textContent = "未知";
    renderRoleMembers();
    return;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    lastUpdatedText.textContent = raw;
    renderRoleMembers();
    return;
  }

  lastUpdatedText.textContent = formatLocalTime(date.toISOString()) || raw;
  renderRoleMembers();
}

function getLastUpdatedDisplayText() {
  return String(lastUpdatedText?.textContent || "").trim() || "未知";
}

function getSeasonMonthBadgeText(season = activeSeason) {
  const seasonCode = String(season?.code || "").trim();

  if (/^\d{4}-\d{2}$/.test(seasonCode)) {
    return seasonCode;
  }

  const seasonStartText = String(season?.start_date || season?.start_at || "").trim();
  const matched = seasonStartText.match(/^(\d{4})-(\d{2})/);
  if (matched) {
    return `${matched[1]}-${matched[2]}`;
  }

  return "";
}

function getFallbackMonthBadgeText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getManualLeaderboardSeason() {
  if (!leaderboardManualSeasonId) return null;
  const selectedSeason = getSeasonMetaById(leaderboardManualSeasonId);
  if (selectedSeason?.id) return selectedSeason;
  leaderboardManualSeasonId = "";
  return null;
}

function getBrandMonthBadgeSeason() {
  return getManualLeaderboardSeason() || activeSeason;
}

function renderBrandMonthBadge(season = getBrandMonthBadgeSeason()) {
  const text = getSeasonMonthBadgeText(season) || getFallbackMonthBadgeText();
  const selectedSeason = getManualLeaderboardSeason();
  const title = selectedSeason?.id
    ? `当前查看 ${selectedSeason.name || text} 积分榜，点击切换赛季`
    : "点击切换积分榜赛季";

  if (brandMonthBadge) {
    brandMonthBadge.textContent = text;
    brandMonthBadge.title = title;
    brandMonthBadge.setAttribute("aria-label", title);
    brandMonthBadge.setAttribute("aria-expanded", leaderboardSeasonSelect && !leaderboardSeasonSelect.hidden ? "true" : "false");
  }
  if (loadingBrandMonth) {
    loadingBrandMonth.textContent = getSeasonMonthBadgeText(activeSeason) || getFallbackMonthBadgeText();
  }
}

function getOrderedLeaderboardSeasonOptions() {
  const seen = new Set();
  return (allSeasons || [])
    .filter((season) => {
      if (!season?.id || seen.has(season.id)) return false;
      seen.add(season.id);
      return true;
    })
    .slice()
    .sort((a, b) => {
      const aStart = String(a.start_at || a.start_date || "");
      const bStart = String(b.start_at || b.start_date || "");
      if (aStart !== bStart) return bStart.localeCompare(aStart, "zh-CN");
      return String(b.code || b.name || "").localeCompare(String(a.code || a.name || ""), "zh-CN");
    });
}

function getLeaderboardSeasonOptionLabel(season) {
  const badgeText = getSeasonMonthBadgeText(season) || season?.code || "未知赛季";
  const statusLabel = season?.id === activeSeason?.id
    ? "当前"
    : (season?.status === "closed" ? "历史" : "");
  return statusLabel ? `${badgeText} · ${statusLabel}` : badgeText;
}

function renderLeaderboardSeasonSelectOptions() {
  if (!leaderboardSeasonSelect) return;
  const options = getOrderedLeaderboardSeasonOptions();
  const selectedSeason = getManualLeaderboardSeason() || activeSeason;
  const badgeText = getSeasonMonthBadgeText(selectedSeason) || getFallbackMonthBadgeText();
  leaderboardSeasonSelect.innerHTML = `
    <option value="" hidden>${escapeHtml(badgeText)}</option>
    ${options.map((season) => `
      <option value="${escapeHtml(season.id)}">${escapeHtml(getLeaderboardSeasonOptionLabel(season))}</option>
    `).join("")}
  `;
  leaderboardSeasonSelect.value = "";
}

function hideLeaderboardSeasonSelect() {
  if (!leaderboardSeasonSelect) return;
  leaderboardSeasonSelect.hidden = true;
  if (brandMonthBadge) {
    brandMonthBadge.hidden = false;
    brandMonthBadge.setAttribute("aria-expanded", "false");
  }
}

async function openLeaderboardSeasonSelect() {
  if (!leaderboardSeasonSelect || !brandMonthBadge) return;
  if (!allSeasons.length) {
    await loadSeasons();
  }
  renderLeaderboardSeasonSelectOptions();
  const hasSeasonOptions = [...leaderboardSeasonSelect.options]
    .some((option) => !option.hidden && option.value);
  if (!hasSeasonOptions) return;

  const badgeRect = brandMonthBadge.getBoundingClientRect();
  if (badgeRect.width > 0) {
    leaderboardSeasonSelect.style.width = `${Math.ceil(badgeRect.width)}px`;
  }
  if (badgeRect.height > 0) {
    leaderboardSeasonSelect.style.height = `${Math.ceil(badgeRect.height)}px`;
  }
  brandMonthBadge.hidden = true;
  leaderboardSeasonSelect.hidden = false;
  brandMonthBadge.setAttribute("aria-expanded", "true");
  leaderboardSeasonSelect.focus();
  if (typeof leaderboardSeasonSelect.showPicker === "function") {
    try {
      leaderboardSeasonSelect.showPicker();
    } catch (_error) {
      // Some browsers only allow showPicker during direct user gestures.
    }
  }
}

async function selectLeaderboardSeason(seasonId) {
  const targetSeasonId = String(seasonId || "").trim();
  const targetSeason = getSeasonMetaById(targetSeasonId);
  if (!targetSeason?.id) {
    hideLeaderboardSeasonSelect();
    return;
  }

  leaderboardManualSeasonId = targetSeason.id;
  renderBrandMonthBadge();
  hideLeaderboardSeasonSelect();
  if (leaderboardSeasonSelect) {
    leaderboardSeasonSelect.disabled = true;
  }

  try {
    await loadLeaderboard();
  } finally {
    if (leaderboardSeasonSelect) {
      leaderboardSeasonSelect.disabled = false;
      renderLeaderboardSeasonSelectOptions();
    }
  }
}

function formatArchiveDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDisplayDate(value) {
  if (!value) return "";
  const normalized = String(value).trim();
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matched) {
    return `${matched[1]}年${matched[2]}月${matched[3]}日`;
  }
  const fallback = formatArchiveDate(value);
  if (!fallback) return normalized;
  const fallbackMatched = fallback.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fallbackMatched) return fallback;
  return `${fallbackMatched[1]}年${fallbackMatched[2]}月${fallbackMatched[3]}日`;
}

function formatMatchDaySummaryLabel(value) {
  if (!value) return "历史比赛";
  const matched = String(value).match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!matched) return String(value);
  return `${Number(matched[1])}日`;
}

function parseSeasonStartDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matched) {
      const [, year, month, day] = matched;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasSeasonReachedDay(startDateValue, dayNumber) {
  const startDate = parseSeasonStartDate(startDateValue);
  if (!startDate || dayNumber <= 1) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - startDate.getTime()) / DAY_MS) >= dayNumber - 1;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getQuantile(values, quantile) {
  const sortedValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const position = (sortedValues.length - 1) * clampNumber(quantile, 0, 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];

  if (lowerIndex === upperIndex) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex);
}

function getHardcoreLoseMetrics(data) {
  const effectivePlayers = (data || []).map((player) => {
    const gamesPlayed = Number(player.games_played ?? 0);
    const wins = Number(player.wins ?? 0);
    const parsedWinRate = Number(player.win_rate);
    return {
      ...player,
      gamesPlayed,
      score: Number(player.score ?? 0),
      winRate: Number.isFinite(parsedWinRate)
        ? parsedWinRate
        : (gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0),
    };
  }).filter((player) => player.gamesPlayed >= HARDCORE_TAG_MIN_GAMES);

  if (effectivePlayers.length < 3) {
    return {
      canEvaluate: false,
      winRateReference: null,
      scoreReference: null,
      minScore: null,
    };
  }

  const winRateReference = Math.min(
    getQuantile(effectivePlayers.map((player) => player.winRate), HARDCORE_TAG_QUANTILE) ?? HARDCORE_TAG_WIN_RATE_MAX,
    HARDCORE_TAG_WIN_RATE_MAX
  );
  const scoreValues = effectivePlayers.map((player) => player.score);
  const scoreReference = getQuantile(scoreValues, HARDCORE_TAG_QUANTILE);
  const minScore = scoreValues.reduce((min, value) => (value < min ? value : min), Number.POSITIVE_INFINITY);

  return {
    canEvaluate: Number.isFinite(winRateReference) && Number.isFinite(scoreReference) && Number.isFinite(minScore),
    winRateReference,
    scoreReference,
    minScore,
  };
}

function getHighestRewardPlayerIds(data) {
  const highestReward = (data || []).reduce((max, player) => {
    const rewardPoints = Number(player.reward_points ?? 0);
    return rewardPoints > max ? rewardPoints : max;
  }, 0);

  return new Set(
    highestReward > 0
      ? (data || [])
        .filter((player) => Number(player.reward_points ?? 0) === highestReward)
        .map((player) => player.player_id || player.id)
        .filter(Boolean)
      : []
  );
}

function getHardcoreLoseTaggedPlayerIds(data) {
  const hardcoreLoseMetrics = getHardcoreLoseMetrics(data);
  if (!hasSeasonReachedDay(activeSeason?.start_date, 8) || !hardcoreLoseMetrics.canEvaluate) {
    return new Set();
  }

  return new Set((data || []).filter((player) => {
    const gamesPlayed = Number(player.games_played ?? 0);
    const score = Number(player.score ?? 0);
    const wins = Number(player.wins ?? 0);
    const parsedWinRate = Number(player.win_rate);
    const winRate = Number.isFinite(parsedWinRate)
      ? parsedWinRate
      : (gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0);
    const lovePlayScore = clampNumber(gamesPlayed / HARDCORE_TAG_LOVE_CAP_GAMES, 0, 1);
    const winRateBadness = Number.isFinite(hardcoreLoseMetrics.winRateReference) && hardcoreLoseMetrics.winRateReference > 0
      ? clampNumber((hardcoreLoseMetrics.winRateReference - winRate) / hardcoreLoseMetrics.winRateReference, 0, 1)
      : 0;
    const scoreSpread = Number.isFinite(hardcoreLoseMetrics.scoreReference) && Number.isFinite(hardcoreLoseMetrics.minScore)
      ? Math.max(hardcoreLoseMetrics.scoreReference - hardcoreLoseMetrics.minScore, 0)
      : 0;
    const scoreBadness = Number.isFinite(hardcoreLoseMetrics.scoreReference)
      ? (
        scoreSpread > 0
          ? clampNumber((hardcoreLoseMetrics.scoreReference - score) / scoreSpread, 0, 1)
          : (score <= hardcoreLoseMetrics.scoreReference ? 1 : 0)
      )
      : 0;
    const poorPerformanceScore = Math.max(winRateBadness, scoreBadness);
    const hardcoreTagScore = poorPerformanceScore * lovePlayScore;

    return gamesPlayed >= HARDCORE_TAG_MIN_GAMES && hardcoreTagScore >= HARDCORE_TAG_SHOW_THRESHOLD;
  }).map((player) => player.player_id || player.id).filter(Boolean));
}

function getPlayerNameStyleClass(playerId, options = {}) {
  const source = options.players || leaderboardPlayers || [];
  if (!playerId || !source.length) {
    return "player-name-display";
  }

  const hardcoreLoseIds = options.hardcoreLoseIds || getHardcoreLoseTaggedPlayerIds(source);
  const highestRewardIds = options.highestRewardIds || getHighestRewardPlayerIds(source);

  if (highestRewardIds.has(playerId)) {
    return "player-name-display player-name-display-gold";
  }

  if (hardcoreLoseIds.has(playerId)) {
    return "player-name-display player-name-display-slate";
  }

  return "player-name-display";
}

function getMvpPlayerIds() {
  // Reserved for future MVP logic.
  return new Set();
}

function getActiveWinStreakMap(matches, minStreak = 3) {
  const streakMap = new Map();
  const finishedPlayers = new Set();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;

    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player.player_id || player.id;
      if (!playerId || finishedPlayers.has(playerId)) return;

      const isWinner = player.team === match.winner_team;
      const currentStreak = streakMap.get(playerId) || 0;

      if (isWinner) {
        streakMap.set(playerId, currentStreak + 1);
        return;
      }

      finishedPlayers.add(playerId);
    });
  });

  return new Map(
    [...streakMap.entries()]
      .filter(([playerId, streak]) => !finishedPlayers.has(playerId) && streak >= minStreak)
      .map(([playerId, streak]) => [playerId, streak])
  );
}

function getActiveLoseStreakMap(matches, minStreak = 3) {
  const streakMap = new Map();
  const finishedPlayers = new Set();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;

    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player.player_id || player.id;
      if (!playerId || finishedPlayers.has(playerId)) return;

      const isLoser = player.team !== match.winner_team;
      const currentStreak = streakMap.get(playerId) || 0;

      if (isLoser) {
        streakMap.set(playerId, currentStreak + 1);
        return;
      }

      finishedPlayers.add(playerId);
    });
  });

  return new Map(
    [...streakMap.entries()]
      .filter(([playerId, streak]) => !finishedPlayers.has(playerId) && streak >= minStreak)
      .map(([playerId, streak]) => [playerId, streak])
  );
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

function isPlayerAffectedByDoubleDown(player, doubleDowns) {
  const playerId = player?.player_id || player?.id;
  const team = player?.team;
  if (!playerId || !team) return false;
  return (doubleDowns || []).some((item) => (
    (item.mode === "team" && item.target_team === team)
    || (item.mode === "single" && item.target_player_id === playerId)
  ));
}

function getRegularLossCountMap(matches) {
  const lossMap = new Map();

  (matches || []).forEach((match) => {
    if (!hasRecordedWinner(match.winner_team)) return;
    const players = parseRecentMatchPlayers(match.players);
    const doubleDowns = normalizeMatchDoubleDowns(match.double_downs, players);

    players.forEach((player) => {
      const playerId = player.player_id || player.id;
      if (!playerId || player.team === match.winner_team) return;
      if (Number(player.score_change ?? 0) !== -1) return;
      if (isPlayerAffectedByDoubleDown(player, doubleDowns)) return;
      lossMap.set(playerId, (lossMap.get(playerId) || 0) + 1);
    });
  });

  return lossMap;
}

function getBronzeFeederPlayerIds(data, matches) {
  const lossMap = getRegularLossCountMap(matches);
  const entries = (data || [])
    .map((player) => ({
      playerId: player.player_id || player.id,
      losses: lossMap.get(player.player_id || player.id) || 0,
      gamesPlayed: Number(player.games_played ?? 0),
    }))
    .filter((entry) => entry.playerId && entry.gamesPlayed > 15);

  if (entries.length < 2) return new Set();

  const values = entries.map((entry) => entry.losses);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const std = Math.sqrt(variance);
  const sorted = [...entries].sort((a, b) => b.losses - a.losses);
  const top = sorted[0];
  const second = sorted[1];

  if (!top || top.losses <= 0) return new Set();
  if (second && top.losses <= second.losses) return new Set();
  if (top.losses < mean + std) return new Set();

  return new Set([top.playerId]);
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

function getAdjustedWinRateNumber(wins = 0, games = 0) {
  const resolvedGames = Math.max(Math.trunc(Number(games) || 0), 0);
  const resolvedWins = Math.max(Math.trunc(Number(wins) || 0), 0);
  return getWinRateNumber(((resolvedWins + 1) / (resolvedGames + 2)) * 100, resolvedWins + 1, resolvedGames + 2);
}

function getPlayerRelationWinRateNumber(row = null) {
  return getWinRateNumber(null, row?.wins, row?.games);
}

function getPlayerRelationAdjustedWinRateNumber(row = null) {
  return getAdjustedWinRateNumber(row?.wins, row?.games);
}

function formatPlayerRelationWinRate(row = null) {
  return formatWinRateValue(null, row?.wins, row?.games);
}

function formatPlayerRelationAdjustedWinRate(row = null) {
  return formatWinRateValue(getPlayerRelationAdjustedWinRateNumber(row));
}

function getPlayerRelationSampleLabel(games = 0, minGames = playerRelationState.minGames) {
  return Number(games ?? 0) <= Number(minGames ?? PLAYER_RELATION_MIN_GAMES_DEFAULT) ? "样本不足" : "稳定样本";
}

function normalizePlayerRelationMinGamesValue(value, minValue = PLAYER_RELATION_MIN_GAMES_DEFAULT) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return minValue;
  return Math.trunc(clampNumber(
    numericValue,
    minValue,
    PLAYER_RELATION_ALL_SEASONS_MIN_GAMES_MAX
  ));
}

function getPlayerRelationManualAllSeasonsMinGames() {
  if (playerRelationState.manualAllSeasonsMinGames === null || playerRelationState.manualAllSeasonsMinGames === undefined) {
    return null;
  }
  return normalizePlayerRelationMinGamesValue(
    playerRelationState.manualAllSeasonsMinGames,
    PLAYER_RELATION_MIN_GAMES_INPUT_MIN
  );
}

function getPlayerRelationResolvedMinGames(seasonId = playerRelationState.seasonId) {
  if (seasonId && seasonId !== PLAYER_RELATION_ALL_SEASONS_VALUE) {
    return PLAYER_RELATION_MIN_GAMES_DEFAULT;
  }
  const manualMinGames = getPlayerRelationManualAllSeasonsMinGames();
  if (manualMinGames !== null) {
    return manualMinGames;
  }
  return PLAYER_RELATION_MIN_GAMES_DEFAULT;
}

function syncPlayerRelationMinGamesInput() {
  if (!playerRelationMinGamesInput) return;
  const minGames = normalizePlayerRelationMinGamesValue(
    playerRelationState.minGames,
    PLAYER_RELATION_MIN_GAMES_INPUT_MIN
  );
  const isAllSeasons = playerRelationState.seasonId === PLAYER_RELATION_ALL_SEASONS_VALUE;
  playerRelationMinGamesInput.value = String(minGames);
  playerRelationMinGamesInput.readOnly = !isAllSeasons;
  playerRelationMinGamesInput.title = isAllSeasons
    ? "全部赛季默认最小场次为 3，可手动修改"
    : "单个赛季固定最小场次为 3";
  playerRelationMinGamesInput.setAttribute(
    "aria-label",
    isAllSeasons ? `全部赛季最小样本场次超过 ${minGames}，可手动修改` : "单个赛季固定最小样本场次超过 3"
  );
}

function syncPlayerRelationMinGamesForSeason(seasonId = playerRelationState.seasonId) {
  playerRelationState.minGames = getPlayerRelationResolvedMinGames(seasonId);
  syncPlayerRelationMinGamesInput();
}

function applyPlayerRelationMinGamesInputValue() {
  if (!playerRelationMinGamesInput) return;
  const isAllSeasons = playerRelationState.seasonId === PLAYER_RELATION_ALL_SEASONS_VALUE;
  if (!isAllSeasons) {
    syncPlayerRelationMinGamesForSeason(playerRelationState.seasonId);
    return;
  }

  const nextMinGames = normalizePlayerRelationMinGamesValue(
    playerRelationMinGamesInput.value,
    PLAYER_RELATION_MIN_GAMES_INPUT_MIN
  );
  playerRelationState.manualAllSeasonsMinGames = nextMinGames;
  playerRelationState.minGames = nextMinGames;
  syncPlayerRelationMinGamesInput();
}

function getPlayerRelationSeasonLabel(seasonId = playerRelationState.seasonId) {
  if (!seasonId || seasonId === PLAYER_RELATION_ALL_SEASONS_VALUE) {
    return "全部赛季";
  }
  return allSeasons.find((season) => season.id === seasonId)?.name
    || (activeSeason?.id === seasonId ? activeSeason.name : "")
    || leaderboardDisplaySeasonName
    || "所选赛季";
}

function getPlayerRelationSelectedPlayerName(playerId = playerRelationState.playerId) {
  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedPlayerId) return "该选手";
  return stripPlayerNameMeta(
    allPlayersDirectory.find((player) => player.id === normalizedPlayerId)?.display_name
    || seasonPlayers.find((player) => player.id === normalizedPlayerId)?.display_name
    || leaderboardPlayers.find((player) => (player.player_id || player.id) === normalizedPlayerId)?.display_name
    || getPlayerDisplayNameById(normalizedPlayerId)
    || "该选手"
  ) || "该选手";
}

function setPlayerRelationMessage(text = "", isError = false) {
  setMessageNode(playerRelationMessage, text, isError);
}

function getPlayerRelationPlayerOptions() {
  const optionMap = new Map();
  [
    ...(allPlayersDirectory || []),
    ...(seasonPlayers || []),
    ...(leaderboardPlayers || []).map((player) => ({
      id: player.player_id || player.id,
      display_name: player.display_name,
    })),
  ].forEach((player) => {
    const playerId = String(player?.id || "").trim();
    const displayName = stripPlayerNameMeta(player?.display_name || "");
    if (!playerId || !displayName || optionMap.has(playerId)) return;
    optionMap.set(playerId, {
      id: playerId,
      display_name: displayName,
    });
  });

  return [...optionMap.values()].sort((a, b) => (
    String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-CN")
  ));
}

function renderPlayerRelationPlayerOptions() {
  if (!playerRelationPlayerChips) return;
  const options = getPlayerRelationPlayerOptions();
  if (!options.length) {
    playerRelationPlayerChips.innerHTML = '<p class="muted">暂无可统计选手</p>';
    playerRelationState.playerId = "";
    return;
  }

  const hasSelected = options.some((player) => player.id === playerRelationState.playerId);
  if (!hasSelected) {
    playerRelationState.playerId = options[0].id;
  }

  playerRelationPlayerChips.innerHTML = options
    .map((player) => (
      `
        <button
          type="button"
          class="access-scorer-chip relation-player-chip${player.id === playerRelationState.playerId ? " access-scorer-chip-active" : ""}"
          data-role="player-relation-chip"
          data-player-id="${escapeHtml(player.id)}"
          aria-pressed="${player.id === playerRelationState.playerId ? "true" : "false"}"
        >
          ${escapeHtml(player.display_name)}
        </button>
      `
    ))
    .join("");
}

function renderPlayerRelationSeasonOptions() {
  if (!playerRelationSeasonSelect) return;
  const options = [
    { id: PLAYER_RELATION_ALL_SEASONS_VALUE, name: "全部赛季" },
    ...(allSeasons || []).map((season) => ({
      id: season.id,
      name: season.name || season.code || "未命名赛季",
    })),
  ];
  const hasSelected = options.some((season) => season.id === playerRelationState.seasonId);
  if (!hasSelected) {
    playerRelationState.seasonId = PLAYER_RELATION_ALL_SEASONS_VALUE;
  }

  playerRelationSeasonSelect.innerHTML = options
    .map((season) => (
      `<option value="${escapeHtml(season.id)}"${season.id === playerRelationState.seasonId ? " selected" : ""}>${escapeHtml(season.name)}</option>`
    ))
    .join("");
}

function getPlayerRelationCacheKey(playerId = "", seasonId = PLAYER_RELATION_ALL_SEASONS_VALUE) {
  return `${String(playerId || "").trim()}::${String(seasonId || PLAYER_RELATION_ALL_SEASONS_VALUE).trim()}`;
}

function normalizePlayerRelationRow(row, relationType = "teammate") {
  const games = Math.max(Math.trunc(Number(row?.games) || 0), 0);
  const wins = Math.max(Math.trunc(Number(row?.wins) || 0), 0);
  return {
    relation_type: relationType,
    season_id: row?.season_id || null,
    season_name: row?.season_name || "",
    month_start: row?.month_start ? String(row.month_start).slice(0, 10) : "",
    player_id: row?.player_id || "",
    player_name: stripPlayerNameMeta(row?.player_name || getPlayerDisplayNameById(row?.player_id) || "未知选手") || "未知选手",
    related_player_id: row?.related_player_id || "",
    related_player_name: stripPlayerNameMeta(row?.related_player_name || getPlayerDisplayNameById(row?.related_player_id) || "未知选手") || "未知选手",
    games,
    wins,
    win_rate: getWinRateNumber(row?.win_rate, wins, games),
    adjusted_win_rate: getAdjustedWinRateNumber(wins, games),
  };
}

async function loadPlayerRelationSourceRows(playerId = playerRelationState.playerId, seasonId = playerRelationState.seasonId) {
  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedPlayerId) {
    return {
      teammateRows: [],
      opponentRows: [],
    };
  }

  const cacheKey = getPlayerRelationCacheKey(normalizedPlayerId, seasonId);
  if (playerRelationDataCache.has(cacheKey)) {
    return playerRelationDataCache.get(cacheKey);
  }

  let teammateQuery = db
    .from("v_player_teammate_stats")
    .select("season_id, season_name, month_start, player_id, player_name, related_player_id, related_player_name, games, wins, win_rate, adjusted_win_rate")
    .eq("player_id", normalizedPlayerId);
  let opponentQuery = db
    .from("v_player_opponent_stats")
    .select("season_id, season_name, month_start, player_id, player_name, related_player_id, related_player_name, games, wins, win_rate, adjusted_win_rate")
    .eq("player_id", normalizedPlayerId);

  if (seasonId && seasonId !== PLAYER_RELATION_ALL_SEASONS_VALUE) {
    teammateQuery = teammateQuery.eq("season_id", seasonId);
    opponentQuery = opponentQuery.eq("season_id", seasonId);
  }

  const [
    { data: teammateData, error: teammateError },
    { data: opponentData, error: opponentError },
  ] = await Promise.all([teammateQuery, opponentQuery]);

  if (teammateError) throw teammateError;
  if (opponentError) throw opponentError;

  const payload = {
    teammateRows: (teammateData || []).map((row) => normalizePlayerRelationRow(row, "teammate")),
    opponentRows: (opponentData || []).map((row) => normalizePlayerRelationRow(row, "opponent")),
  };
  playerRelationDataCache.set(cacheKey, payload);
  return payload;
}

function aggregatePlayerRelationRows(sourceRows = [], relationType = "teammate") {
  const relationMap = new Map();

  (sourceRows || [])
    .filter((row) => (
      playerRelationState.seasonId === PLAYER_RELATION_ALL_SEASONS_VALUE || row.season_id === playerRelationState.seasonId
    ))
    .forEach((row) => {
      const key = `${row.player_id || ""}__${row.related_player_id || ""}`;
      const current = relationMap.get(key) || {
        ...row,
        relation_type: relationType,
        games: 0,
        wins: 0,
      };
      current.games += Number(row.games ?? 0);
      current.wins += Number(row.wins ?? 0);
      relationMap.set(key, current);
    });

  return [...relationMap.values()].map((row) => ({
    ...row,
    relation_type: relationType,
    win_rate: getPlayerRelationWinRateNumber(row),
    adjusted_win_rate: getPlayerRelationAdjustedWinRateNumber(row),
    sample_status: getPlayerRelationSampleLabel(row.games, playerRelationState.minGames),
  }));
}

function comparePlayerRelationRows(a, b, sortKey = playerRelationState.sortKey, sortDirection = playerRelationState.sortDirection) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const getNumericSampleRank = (row) => (row.sample_status === "样本不足" ? 1 : 0);

  const numericKeys = new Set(["games", "wins", "win_rate", "adjusted_win_rate"]);
  if (numericKeys.has(sortKey)) {
    const difference = Number(a?.[sortKey] ?? 0) - Number(b?.[sortKey] ?? 0);
    if (difference !== 0) return difference * direction;
  } else if (sortKey === "sample_status") {
    const difference = getNumericSampleRank(a) - getNumericSampleRank(b);
    if (difference !== 0) return difference * direction;
  } else if (sortKey === "relation_type") {
    const difference = String(a?.relation_type || "").localeCompare(String(b?.relation_type || ""), "zh-CN");
    if (difference !== 0) return difference * direction;
  } else {
    const difference = String(a?.[sortKey] || "").localeCompare(String(b?.[sortKey] || ""), "zh-CN");
    if (difference !== 0) return difference * direction;
  }

  if (Number(b?.games ?? 0) !== Number(a?.games ?? 0)) {
    return Number(b?.games ?? 0) - Number(a?.games ?? 0);
  }
  if (Number(b?.adjusted_win_rate ?? 0) !== Number(a?.adjusted_win_rate ?? 0)) {
    return Number(b?.adjusted_win_rate ?? 0) - Number(a?.adjusted_win_rate ?? 0);
  }
  return String(a?.related_player_name || "").localeCompare(String(b?.related_player_name || ""), "zh-CN");
}

function buildPlayerRelationDataset() {
  const teammateRows = aggregatePlayerRelationRows(playerRelationState.teammateRows, "teammate");
  const opponentRows = aggregatePlayerRelationRows(playerRelationState.opponentRows, "opponent");
  const tableRows = [...teammateRows, ...opponentRows].sort((a, b) => comparePlayerRelationRows(a, b));
  return {
    teammateRows,
    opponentRows,
    tableRows,
  };
}

function pickPlayerRelationHighlightRow(rows = [], direction = "best") {
  if (!Array.isArray(rows) || !rows.length) return null;
  const stableRows = rows.filter((row) => Number(row.games ?? 0) > Number(playerRelationState.minGames ?? PLAYER_RELATION_MIN_GAMES_DEFAULT));
  if (!stableRows.length) return null;
  const pool = stableRows;
  const isBest = direction === "best";
  return [...pool].sort((a, b) => {
    const primary = Number(b.adjusted_win_rate ?? 0) - Number(a.adjusted_win_rate ?? 0);
    if (primary !== 0) {
      return isBest ? primary : -primary;
    }
    const secondary = Number(b.games ?? 0) - Number(a.games ?? 0);
    if (secondary !== 0) {
      return secondary;
    }
    return String(a.related_player_name || "").localeCompare(String(b.related_player_name || ""), "zh-CN");
  })[0] || null;
}

function formatPlayerRelationRangeLabel(rows = []) {
  const rateValues = (rows || [])
    .map((row) => getPlayerRelationWinRateNumber(row))
    .filter((value) => Number.isFinite(value));

  if (!rateValues.length) return "";

  const minRate = Math.min(...rateValues);
  const maxRate = Math.max(...rateValues);
  if (Math.abs(maxRate - minRate) < 0.1) {
    return `${formatWinRateValue(minRate)}`;
  }
  return `${formatWinRateValue(minRate)} - ${formatWinRateValue(maxRate)}`;
}

function buildPlayerRelationSummaryCardHtml(label = "", row = null) {
  if (!row) {
    return `
      <article class="relation-summary-card relation-summary-card-empty">
        <span class="relation-summary-card-kicker">${escapeHtml(label)}</span>
        <div class="relation-summary-card-body">
          <strong class="relation-summary-card-title">--</strong>
        </div>
        <p class="relation-summary-card-meta">当前筛选条件下暂无有效样本。</p>
      </article>
    `;
  }

  const relationThemeClass = row.relation_type === "teammate"
    ? "relation-summary-card-teammate"
    : "relation-summary-card-opponent";

  const badges = [
    `<span class="relation-summary-badge">${escapeHtml(`${row.games} 场 · ${row.wins} 胜`)}</span>`,
    `<span class="relation-summary-badge">${escapeHtml(`胜率 ${formatPlayerRelationWinRate(row)}`)}</span>`,
  ];

  if (row.sample_status === "样本不足") {
    badges.push('<span class="relation-summary-badge relation-summary-badge-low">样本不足</span>');
  }

  return `
    <article class="relation-summary-card ${relationThemeClass}">
      <span class="relation-summary-card-kicker">${escapeHtml(label)}</span>
      <div class="relation-summary-card-body">
        <strong class="relation-summary-card-title">${escapeHtml(row.related_player_name || "未知选手")}</strong>
      </div>
      <div class="relation-summary-badges">${badges.join("")}</div>
    </article>
  `;
}

function renderPlayerRelationSummary(teammateRows = [], opponentRows = []) {
  if (!playerRelationSummary) return;
  const bestTeammate = pickPlayerRelationHighlightRow(teammateRows, "best");
  const worstTeammate = pickPlayerRelationHighlightRow(teammateRows, "worst");
  const bestOpponent = pickPlayerRelationHighlightRow(opponentRows, "best");
  const worstOpponent = pickPlayerRelationHighlightRow(opponentRows, "worst");

  playerRelationSummary.innerHTML = `
    <section class="relation-summary-group relation-summary-group-teammate">
      <div class="relation-summary-group-head">
        <strong class="relation-summary-group-title">队友</strong>
      </div>
      <div class="relation-summary-group-grid">
        ${buildPlayerRelationSummaryCardHtml("最佳队友", bestTeammate)}
        ${buildPlayerRelationSummaryCardHtml("最难配合", worstTeammate)}
      </div>
    </section>
    <section class="relation-summary-group relation-summary-group-opponent">
      <div class="relation-summary-group-head">
        <strong class="relation-summary-group-title">对手</strong>
      </div>
      <div class="relation-summary-group-grid">
        ${buildPlayerRelationSummaryCardHtml("最佳压制", bestOpponent)}
        ${buildPlayerRelationSummaryCardHtml("最难应对", worstOpponent)}
      </div>
    </section>
  `;
}

function setPlayerRelationChartPlaceholder(container, chartKey, text) {
  if (!container) return;
  container.innerHTML = `<div class="relation-chart-placeholder">${escapeHtml(text)}</div>`;
}

async function switchPlayerRelationPlayer(playerId = "") {
  const nextPlayerId = String(playerId || "").trim();
  if (!nextPlayerId || nextPlayerId === playerRelationState.playerId || playerRelationState.isLoading) return;

  playerRelationState.playerId = nextPlayerId;
  renderPlayerRelationPlayerOptions();
  setPlayerRelationChartPlaceholder(playerRelationTeammateChart, "teammate", "正在加载关系网络...");
  setPlayerRelationChartPlaceholder(playerRelationOpponentChart, "opponent", "正在加载关系网络...");
  await loadAndRenderPlayerRelationStats();
}

function renderPlayerRelationHeatmap(container, chartKey, rows = [], emptyText = "暂无数据") {
  if (!container) return;
  if (!rows.length) {
    setPlayerRelationChartPlaceholder(container, chartKey, emptyText);
    return;
  }

  const selectedPlayerName = getPlayerRelationSelectedPlayerName();
  const sortedRows = [...rows].sort((a, b) => {
    const primary = getPlayerRelationWinRateNumber(b) - getPlayerRelationWinRateNumber(a);
    if (primary !== 0) return primary;
    const secondary = Number(b.games ?? 0) - Number(a.games ?? 0);
    if (secondary !== 0) return secondary;
    return String(a.related_player_name || "").localeCompare(String(b.related_player_name || ""), "zh-CN");
  });
  const isPortraitLayout = Boolean(window.matchMedia?.("(orientation: portrait)")?.matches);
  const zoneLimit = isPortraitLayout ? PLAYER_RELATION_LADDER_PORTRAIT_ZONE_LIMIT : PLAYER_RELATION_LADDER_ZONE_LIMIT;
  const zoneColumnCount = isPortraitLayout ? 1 : PLAYER_RELATION_LADDER_ZONE_COLUMNS;
  const upperRows = sortedRows
    .filter((row) => getPlayerRelationWinRateNumber(row) > 50)
    .slice(0, zoneLimit);
  const lowerCandidateRows = sortedRows.filter((row) => getPlayerRelationWinRateNumber(row) <= 50);
  const lowerRows = isPortraitLayout
    ? lowerCandidateRows.slice(-zoneLimit)
    : lowerCandidateRows.slice(0, zoneLimit);
  const buildZoneEntries = (zoneRows, zone, rankOffset = 0) => {
    return zoneRows.map((row, index) => ({
      row,
      rank: rankOffset + index + 1,
      zone,
      rowPosition: index % PLAYER_RELATION_LADDER_ZONE_ROWS,
      columnPosition: Math.floor(index / PLAYER_RELATION_LADDER_ZONE_ROWS),
    }));
  };
  const visibleRows = [
    ...buildZoneEntries(upperRows, "upper"),
    ...buildZoneEntries(lowerRows, "lower", upperRows.length),
  ];
  const isTeammateChart = chartKey === "teammate";
  const maxGames = Math.max(...visibleRows.map(({ row }) => Number(row.games ?? 0)), 1);
  const subjectX = 50;
  const subjectY = 50;
  const getColumnX = (columnPosition) => {
    if (zoneColumnCount <= 1) return 50;
    const chartWidth = (zoneColumnCount * PLAYER_RELATION_LADDER_NODE_WIDTH_PX)
      + ((zoneColumnCount - 1) * PLAYER_RELATION_LADDER_COLUMN_GAP_PX)
      + (PLAYER_RELATION_LADDER_EDGE_GAP_PX * 2);
    const centerX = PLAYER_RELATION_LADDER_EDGE_GAP_PX
      + (PLAYER_RELATION_LADDER_NODE_WIDTH_PX / 2)
      + (columnPosition * (PLAYER_RELATION_LADDER_NODE_WIDTH_PX + PLAYER_RELATION_LADDER_COLUMN_GAP_PX));
    return (centerX / chartWidth) * 100;
  };
  const getZoneY = (zone, rowPosition) => {
    const [startY, endY] = zone === "upper" ? [8, 42] : [58, 92];
    return startY + rowPosition * ((endY - startY) / (PLAYER_RELATION_LADDER_ZONE_ROWS - 1));
  };
  const getNodePosition = ({ zone, rowPosition, columnPosition }) => ({
    x: getColumnX(columnPosition),
    y: getZoneY(zone, rowPosition),
  });

  const links = visibleRows.map((entry) => {
    const { row } = entry;
    const winRate = getPlayerRelationWinRateNumber(row);
    const games = Math.max(Number(row.games ?? 0), 0);
    const { x: targetX, y: targetY } = getNodePosition(entry);
    const strokeWidth = Math.max(0.7, Math.min(3.6, 0.7 + (games / maxGames) * 2.9));
    const opacity = Math.max(0.32, Math.min(0.86, 0.32 + (winRate / 100) * 0.54));
    return `
      <line
        class="relation-ladder-link"
        x1="${subjectX}"
        y1="${subjectY}"
        x2="${targetX.toFixed(2)}"
        y2="${targetY.toFixed(2)}"
        stroke-width="${strokeWidth.toFixed(2)}"
        opacity="${opacity.toFixed(2)}"
      ></line>
    `;
  }).join("");

  const nodes = visibleRows.map((entry) => {
    const { row, rank } = entry;
    const winRate = getPlayerRelationWinRateNumber(row);
    const games = Math.max(Number(row.games ?? 0), 0);
    const { x: targetX, y: targetY } = getNodePosition(entry);
    const rateClass = winRate >= 55 ? "high" : (winRate <= 45 ? "low" : "mid");
    const relationLabel = row.relation_type === "teammate" ? "同队" : "交手";
    const title = [
      row.relation_type === "teammate"
        ? `${selectedPlayerName} 与 ${row.related_player_name}`
        : `${selectedPlayerName} 对 ${row.related_player_name}`,
      `${relationLabel} ${row.games} 场，获胜 ${row.wins} 场`,
      `真实胜率 ${formatPlayerRelationWinRate(row)}`,
    ].join("；");
    return `
      <button
        type="button"
        class="relation-ladder-node relation-ladder-node-${rateClass}"
        style="--node-x: ${targetX.toFixed(2)}%; --node-y: ${targetY.toFixed(2)}%; --rate-pct: ${winRate.toFixed(2)}%;"
        data-player-id="${escapeHtml(row.related_player_id || "")}"
        title="${escapeHtml(title)}"
      >
        <span class="relation-ladder-rank">#${rank}</span>
        <span class="relation-ladder-name">${escapeHtml(row.related_player_name || "未知选手")}</span>
        <span class="relation-ladder-meta">${escapeHtml(`${formatPlayerRelationWinRate(row)} · ${games} 场`)}</span>
        <span class="relation-ladder-bar" aria-hidden="true"></span>
      </button>
    `;
  }).join("");

  container.innerHTML = `
    <div class="relation-ladder-chart relation-ladder-chart-${isTeammateChart ? "teammate" : "opponent"}">
      <svg class="relation-ladder-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line class="relation-ladder-reference" x1="6" y1="${subjectY}" x2="94" y2="${subjectY}"></line>
        ${links}
      </svg>
      <div class="relation-ladder-subject" style="--node-x: ${subjectX}%; --node-y: ${subjectY}%;">
        <strong>${escapeHtml(selectedPlayerName)}</strong>
      </div>
      <div class="relation-ladder-nodes">
        ${nodes}
      </div>
    </div>
  `;

  container.querySelectorAll(".relation-ladder-node").forEach((node) => {
    node.addEventListener("click", () => {
      const nextPlayerId = node.dataset.playerId || "";
      if (!nextPlayerId || nextPlayerId === playerRelationState.playerId) return;
      switchPlayerRelationPlayer(nextPlayerId).catch((error) => {
        console.error("切换胜率关系选手失败：", error);
      });
    });
  });
}

function updatePlayerRelationSortButtons() {
  document.querySelectorAll('[data-role="player-relation-sort"]').forEach((button) => {
    const baseLabel = button.dataset.baseLabel || button.textContent.trim();
    button.dataset.baseLabel = baseLabel;
    const isActive = button.dataset.sortKey === playerRelationState.sortKey;
    button.classList.toggle("relation-sort-btn-active", isActive);
    button.setAttribute("aria-sort", isActive ? (playerRelationState.sortDirection === "asc" ? "ascending" : "descending") : "none");
    button.textContent = isActive
      ? `${baseLabel} ${playerRelationState.sortDirection === "asc" ? "↑" : "↓"}`
      : baseLabel;
  });
}

function renderPlayerRelationTable(rows = []) {
  if (!playerRelationTableBody) return;
  playerRelationTableBody.innerHTML = "";

  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = '<td colspan="7" class="muted relation-table-empty">当前筛选条件下暂无关系数据</td>';
    playerRelationTableBody.appendChild(emptyRow);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="relation-table-primary">${escapeHtml(row.player_name || "未知选手")}</td>
      <td>${escapeHtml(row.related_player_name || "未知选手")}</td>
      <td><span class="relation-type-badge relation-type-badge-${row.relation_type === "teammate" ? "teammate" : "opponent"}">${escapeHtml(row.relation_type === "teammate" ? "队友" : "对手")}</span></td>
      <td>${escapeHtml(String(row.games ?? 0))}</td>
      <td>${escapeHtml(String(row.wins ?? 0))}</td>
      <td>${escapeHtml(formatPlayerRelationWinRate(row))}</td>
      <td><span class="relation-sample-badge relation-sample-badge-${row.sample_status === "样本不足" ? "low" : "ok"}">${escapeHtml(row.sample_status)}</span></td>
    `;
    playerRelationTableBody.appendChild(tr);
  });
}

function renderPlayerRelationViewMode() {
  const isDetailMode = playerRelationState.viewMode === "detail";

  if (playerRelationOverviewSection) {
    playerRelationOverviewSection.hidden = isDetailMode;
  }

  if (playerRelationTablePanel) {
    playerRelationTablePanel.hidden = !isDetailMode;
  }

  if (playerRelationViewToggleBtn) {
    playerRelationViewToggleBtn.textContent = isDetailMode ? "▦" : "≣";
    playerRelationViewToggleBtn.title = isDetailMode ? "切换为概览" : "切换为关系明细";
    playerRelationViewToggleBtn.setAttribute("aria-label", isDetailMode ? "切换为概览" : "切换为关系明细");
  }
}

function renderPlayerRelationModalView() {
  const { teammateRows, opponentRows, tableRows } = buildPlayerRelationDataset();
  const stableTeammateRows = teammateRows.filter((row) => row.sample_status !== "样本不足");
  const stableOpponentRows = opponentRows.filter((row) => row.sample_status !== "样本不足");
  if (playerRelationTeammateMeta) {
    const stableCount = stableTeammateRows.length;
    const rateRange = formatPlayerRelationRangeLabel(stableTeammateRows);
    playerRelationTeammateMeta.textContent = `${teammateRows.length} 组 · 稳定 ${stableCount} · 阈值 > ${playerRelationState.minGames} 场${rateRange ? ` · ${rateRange}` : ""}`;
  }
  if (playerRelationOpponentMeta) {
    const stableCount = stableOpponentRows.length;
    const rateRange = formatPlayerRelationRangeLabel(stableOpponentRows);
    playerRelationOpponentMeta.textContent = `${opponentRows.length} 组 · 稳定 ${stableCount} · 阈值 > ${playerRelationState.minGames} 场${rateRange ? ` · ${rateRange}` : ""}`;
  }
  if (playerRelationTableHint) {
    playerRelationTableHint.textContent = "";
  }

  renderPlayerRelationSummary(teammateRows, opponentRows);
  renderPlayerRelationTable(tableRows);
  renderPlayerRelationViewMode();
  updatePlayerRelationSortButtons();
  if (playerRelationState.viewMode === "overview") {
    renderPlayerRelationHeatmap(
      playerRelationTeammateChart,
      "teammate",
      stableTeammateRows,
      "当前筛选条件下暂无稳定样本队友关系网络。"
    );
    renderPlayerRelationHeatmap(
      playerRelationOpponentChart,
      "opponent",
      stableOpponentRows,
      "当前筛选条件下暂无稳定样本对手关系网络。"
    );
  }
}

async function loadAndRenderPlayerRelationStats({ force = false } = {}) {
  const selectedPlayerId = String(playerRelationState.playerId || "").trim();
  if (!selectedPlayerId) {
    setPlayerRelationMessage("当前没有可统计的选手。", true);
    renderPlayerRelationSummary([], []);
    renderPlayerRelationTable([]);
    setPlayerRelationChartPlaceholder(playerRelationTeammateChart, "teammate", "当前没有可统计的选手。");
    setPlayerRelationChartPlaceholder(playerRelationOpponentChart, "opponent", "当前没有可统计的选手。");
    return;
  }

  syncPlayerRelationMinGamesInput();

  playerRelationState.isLoading = true;
  setPlayerRelationMessage("正在加载胜率关系统计...");
  if (force) {
    playerRelationDataCache.delete(getPlayerRelationCacheKey(selectedPlayerId, playerRelationState.seasonId));
  }

  try {
    const { teammateRows, opponentRows } = await loadPlayerRelationSourceRows(selectedPlayerId, playerRelationState.seasonId);
    playerRelationState.teammateRows = teammateRows;
    playerRelationState.opponentRows = opponentRows;
    syncPlayerRelationMinGamesForSeason(playerRelationState.seasonId);
    renderPlayerRelationModalView();
    setPlayerRelationMessage("");
  } catch (error) {
    console.error("加载胜率关系统计失败：", error);
    playerRelationState.teammateRows = [];
    playerRelationState.opponentRows = [];
    renderPlayerRelationModalView();
    const migrationHint = getLatestSchemaMigrationHint(error);
    setPlayerRelationMessage(
      `加载胜率关系统计失败：${error.message || "未知错误"}${migrationHint ? `。${migrationHint}` : ""}`,
      true
    );
  } finally {
    playerRelationState.isLoading = false;
  }
}

async function openPlayerRelationModal(playerId = "", { seasonId = PLAYER_RELATION_ALL_SEASONS_VALUE } = {}) {
  const playerOptions = getPlayerRelationPlayerOptions();
  if (!playerOptions.length) {
    showBlockingAlert("当前暂无可统计的选手数据。");
    return;
  }

  const fallbackPlayerId = playerOptions.some((player) => player.id === playerRelationState.playerId)
    ? playerRelationState.playerId
    : playerOptions[0].id;
  playerRelationState.playerId = playerOptions.some((player) => player.id === playerId)
    ? playerId
    : fallbackPlayerId;
  playerRelationState.seasonId = seasonId || PLAYER_RELATION_ALL_SEASONS_VALUE;
  syncPlayerRelationMinGamesForSeason(playerRelationState.seasonId);
  playerRelationState.viewMode = "overview";

  renderPlayerRelationPlayerOptions();
  renderPlayerRelationSeasonOptions();
  renderPlayerRelationViewMode();
  setManagedDialogOpen("playerRelation", true, {
    initialFocus: playerRelationSeasonSelect || closePlayerRelationBtn || undefined,
  });
  setPlayerRelationChartPlaceholder(playerRelationTeammateChart, "teammate", "正在加载关系网络...");
  setPlayerRelationChartPlaceholder(playerRelationOpponentChart, "opponent", "正在加载关系网络...");
  await loadAndRenderPlayerRelationStats();
}

function getRewardGlowTier(amount) {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value) || value < 20) return "base";
  if (value < 100) return "warm";
  if (value < 300) return "bright";
  return "blazing";
}

function getStreakTagIntensityClass(streak) {
  const value = Number(streak || 0);
  if (value >= 7) return "leaderboard-tag-streak-3";
  if (value >= 5) return "leaderboard-tag-streak-2";
  return "leaderboard-tag-streak-1";
}

function getLeaderboardTagFitClass(label) {
  const text = String(label || "").trim();
  if (!text) return "";
  const widthUnits = Array.from(text).reduce((sum, char) => {
    if (/[\u4e00-\u9fff]/u.test(char)) return sum + 1;
    if (/[A-Z0-9]/.test(char)) return sum + 0.72;
    if (/[a-z]/.test(char)) return sum + 0.62;
    return sum + 0.78;
  }, 0);
  if (widthUnits >= 7.6) return "leaderboard-tag-fit-2";
  if (widthUnits >= 6.2) return "leaderboard-tag-fit-1";
  return "";
}

function getLeaderboardNameRankClass(rank) {
  if (rank === 1) return "player-name-display-rank1";
  if (rank <= 3) return "player-name-display-rank23";
  if (rank <= 5) return "player-name-display-rank45";
  return "";
}

function getLeaderboardRankByPlayerId(playerId, players = leaderboardPlayers) {
  if (!playerId || !players?.length) return 0;
  const index = players.findIndex((player) => (player.player_id || player.id) === playerId);
  return index >= 0 ? getLeaderboardDisplayRankAtIndex(players, index) : 0;
}

function buildDecoratedPlayerNameHtml(playerId, displayName, options = {}) {
  const safeName = escapeHtml(displayName || "未知选手");
  const nameClassName = getPlayerNameStyleClass(playerId, options);
  const rankClassName = getLeaderboardNameRankClass(options.rank || 0);
  const className = [nameClassName, rankClassName, options.wrapperClassName]
    .filter(Boolean)
    .join(" ");

  return `<span class="${className}">${safeName}</span>`;
}

function hasRecordedWinner(value) {
  return value === "A" || value === "B";
}

function getWinnerLabel(winnerTeam) {
  if (winnerTeam === "A") return "天辉方获胜";
  if (winnerTeam === "B") return "夜魇方获胜";
  return "胜负未定";
}

function getMatchStatusBadge(winnerTeam) {
  return hasRecordedWinner(winnerTeam) ? "比赛完成" : "待补胜负";
}

function getMatchDayGroupKey(groupOrMatchDayId, matchDate = "") {
  if (typeof groupOrMatchDayId === "object" && groupOrMatchDayId) {
    return groupOrMatchDayId.match_day_id || groupOrMatchDayId.id || groupOrMatchDayId.match_date || "历史比赛";
  }
  return groupOrMatchDayId || matchDate || "历史比赛";
}

function getMatchDayAttendanceLabel(status) {
  if (status === "standby") return "报名但替补";
  if (status === "absent") return "迟到";
  return "备注";
}

function getMatchDayParticipantEntries(matches) {
  const seen = new Set();
  const participants = [];

  (matches || []).forEach((match) => {
    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player.player_id || player.id || player.display_name;
      const displayName = stripPlayerNameMeta(player.display_name || "未知选手");
      if (!playerId || !displayName || seen.has(playerId)) return;
      seen.add(playerId);
      participants.push({
        player_id: player.player_id || null,
        display_name: displayName,
      });
    });
  });

  return participants;
}

function buildMatchDayPlayerSummaryHtml(participants, attendanceNotes) {
  const participantIdSet = new Set((participants || []).map((entry) => entry.player_id).filter(Boolean));
  const lateParticipantIdSet = new Set(
    (attendanceNotes || [])
      .filter((entry) => entry.status === "absent" && participantIdSet.has(entry.player_id))
      .map((entry) => entry.player_id)
      .filter(Boolean)
  );
  const summaryEntries = [
    ...(participants || []).map((entry) => ({
      ...entry,
      display_name: stripPlayerNameMeta(entry.display_name || "未知选手") || "未知选手",
      className: lateParticipantIdSet.has(entry.player_id)
        ? "match-day-player-name-late"
        : "match-day-player-name-participant",
      sortOrder: 0,
    })),
    ...(attendanceNotes || [])
      .filter((entry) => entry.status === "standby")
      .map((entry) => ({
        ...entry,
        display_name: stripPlayerNameMeta(entry.display_name || "未知选手") || "未知选手",
        className: "match-day-player-name-standby",
        sortOrder: 1,
      })),
    ...(attendanceNotes || [])
      .filter((entry) => entry.status === "absent")
      .filter((entry) => !participantIdSet.has(entry.player_id))
      .map((entry) => ({
        ...entry,
        display_name: stripPlayerNameMeta(entry.display_name || "未知选手") || "未知选手",
        className: "match-day-player-name-absent",
        sortOrder: 2,
      })),
  ];

  const html = summaryEntries
    .sort((a, b) => {
      if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-CN");
    })
    .map((entry) => `<span class="match-day-player-name ${entry.className}">${escapeHtml(entry.display_name || "未知选手")}</span>`)
    .join("");
  return html ? `<div class="match-day-player-list">${html}</div>` : "";
}

function getLateArrivalTaggedPlayerIds(groups, minLateCount = 3) {
  const lateCountMap = new Map();

  (groups || []).forEach((group) => {
    (group.attendance_notes || []).forEach((entry) => {
      if (entry.status !== "absent") return;
      const playerId = entry.player_id || "";
      if (!playerId) return;
      lateCountMap.set(playerId, (lateCountMap.get(playerId) || 0) + 1);
    });
  });

  return new Set(
    [...lateCountMap.entries()]
      .filter(([, count]) => count >= minLateCount)
      .map(([playerId]) => playerId)
  );
}

function getMatchDayAttendanceSelectedIds(groupKey, availablePlayerIds = []) {
  const current = matchDayAttendanceSelectedIdsByGroup.get(groupKey) || new Set();
  const availableIdSet = new Set(availablePlayerIds);
  const filtered = new Set([...current].filter((playerId) => availableIdSet.has(playerId)));
  matchDayAttendanceSelectedIdsByGroup.set(groupKey, filtered);
  return filtered;
}

function toggleMatchDayAttendanceSelection(groupKey, playerId) {
  if (!groupKey || !playerId) return;
  const selectedIds = new Set(matchDayAttendanceSelectedIdsByGroup.get(groupKey) || []);
  if (selectedIds.has(playerId)) {
    selectedIds.delete(playerId);
  } else {
    selectedIds.add(playerId);
  }
  matchDayAttendanceSelectedIdsByGroup.set(groupKey, selectedIds);
}

function clearMatchDayAttendanceSelection(groupKey) {
  if (!groupKey) return;
  matchDayAttendanceSelectedIdsByGroup.delete(groupKey);
}

function getMatchDayAttendanceEntryMeta(entry, participantIdSet) {
  const normalizedName = stripPlayerNameMeta(entry.display_name || "未知选手") || "未知选手";
  if (entry.status === "absent") {
    if (participantIdSet.has(entry.player_id)) {
      return {
        ...entry,
        display_name: normalizedName,
        statusLabel: "迟到",
        cardClassName: "match-day-attendance-note-late",
      };
    }
    return {
      ...entry,
      display_name: normalizedName,
      statusLabel: "未出席",
      cardClassName: "match-day-attendance-note-absent",
    };
  }

  return {
    ...entry,
    display_name: normalizedName,
    statusLabel: getMatchDayAttendanceLabel(entry.status),
    cardClassName: `match-day-attendance-note-${entry.status}`,
  };
}

function buildMatchDayAttendancePanelHtml(group, canScore) {
  if (!canScore) return "";
  if ((group.matches?.length || 0) === 0) return "";

  const participantEntries = group.participants || [];
  const participantIdSet = new Set(participantEntries.map((entry) => entry.player_id).filter(Boolean));
  const attendanceNotes = group.attendance_notes || [];
  const selectablePlayers = seasonPlayers.filter((player) => (
    player.is_in_season
    && !attendanceNotes.some((entry) => entry.player_id === player.id)
  )).sort((a, b) => {
    const aParticipant = participantIdSet.has(a.id);
    const bParticipant = participantIdSet.has(b.id);
    if (aParticipant !== bParticipant) return aParticipant ? -1 : 1;
    const aName = stripPlayerNameMeta(a.display_name || "未知选手") || "未知选手";
    const bName = stripPlayerNameMeta(b.display_name || "未知选手") || "未知选手";
    return aName.localeCompare(bName, "zh-CN");
  });
  const selectedIds = getMatchDayAttendanceSelectedIds(
    group.group_key,
    selectablePlayers.map((player) => player.id)
  );
  const isOpen = openMatchDayAttendanceGroups.has(group.group_key);
  const chipsHtml = selectablePlayers.length
    ? `
      <div class="match-day-attendance-player-chips">
        ${selectablePlayers.map((player) => {
          const isParticipant = participantEntries.some((entry) => entry.player_id === player.id);
          return `
            <button
              type="button"
              class="manual-score-player-chip match-day-attendance-player-chip${selectedIds.has(player.id) ? " manual-score-player-chip-active" : ""}${isParticipant ? " match-day-attendance-player-chip-participant" : ""}"
              data-role="attendance-player-chip"
              data-group-key="${group.group_key}"
              data-player-id="${player.id}"
              aria-pressed="${selectedIds.has(player.id) ? "true" : "false"}"
            >${escapeHtml(stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手")}${isParticipant ? " · 已出席" : " · 未出席"}</button>
          `;
        }).join("")}
      </div>
    `
    : "";
  const listHtml = attendanceNotes.length
    ? [...attendanceNotes].sort((a, b) => {
      const aParticipant = participantIdSet.has(a.player_id);
      const bParticipant = participantIdSet.has(b.player_id);
      if (aParticipant !== bParticipant) return aParticipant ? -1 : 1;
      const aName = stripPlayerNameMeta(a.display_name || "未知选手") || "未知选手";
      const bName = stripPlayerNameMeta(b.display_name || "未知选手") || "未知选手";
      return aName.localeCompare(bName, "zh-CN");
    }).map((entry) => {
      const meta = getMatchDayAttendanceEntryMeta(entry, participantIdSet);
      return `
      <div class="match-day-attendance-note ${meta.cardClassName}">
        <div class="match-day-attendance-note-main">
          <span class="match-day-attendance-status">${escapeHtml(meta.statusLabel)}</span>
          <strong>${escapeHtml(meta.display_name || "未知选手")}</strong>
          ${meta.note ? `<span class="muted">${escapeHtml(meta.note)}</span>` : ""}
        </div>
        ${canScore ? `<button class="button-secondary match-day-attendance-remove-btn" type="button" data-note-id="${meta.id}" data-player-name="${escapeHtml(meta.display_name || "该选手")}" data-status-label="${escapeHtml(meta.statusLabel)}">移除</button>` : ""}
      </div>
    `;
    }).join("")
    : "";
  return `
    <div class="match-day-attendance-panel${isOpen ? " match-day-attendance-panel-open" : ""}" data-match-day-key="${group.group_key}" ${isOpen ? "" : "hidden"}>
      <div class="match-day-attendance-content">
        ${canScore ? `
        <div class="match-day-attendance-form">
          ${chipsHtml}
          <div class="match-day-attendance-form-actions">
            <button class="button-secondary match-day-attendance-add-btn" type="button" data-status="absent" data-group-key="${group.group_key}" data-match-day-id="${group.match_day_id || ""}" data-match-date="${group.match_date || ""}" data-season-id="${group.season_id || ""}" ${(selectedIds.size && (group.match_day_id || group.match_date)) ? "" : "disabled"}>登记迟到选手${selectedIds.size ? `（${selectedIds.size}）` : ""}</button>
          </div>
        </div>
        ` : ""}
        ${listHtml ? `<div class="match-day-attendance-list">${listHtml}</div>` : ""}
      </div>
    </div>
  `;
}

function getWinnerToggleState(formType) {
  return formType === "backfill"
    ? { select: backfillWinnerSelect, hint: backfillWinnerToggleHint, panel: backfillFormPanel }
    : { select: winnerSelect, hint: winnerToggleHint, panel: matchFormPanel };
}

function setWinnerSelection(formType, winnerTeam = "") {
  const { select, hint, panel } = getWinnerToggleState(formType);
  select.value = winnerTeam || "";

  [...panel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    const isActive = button.dataset.winner === select.value;
    const isLoser = hasRecordedWinner(select.value) && button.dataset.winner !== select.value;
    button.classList.toggle("team-title-toggle-active", isActive);
    button.classList.toggle("team-title-toggle-loser", isLoser);
    button.setAttribute("aria-pressed", String(isActive));
    button.closest(".team-panel")?.classList.toggle("team-panel-winner", isActive);
    button.closest(".team-panel")?.classList.toggle("team-panel-loser", isLoser);
  });

  if (hint) {
    hint.textContent = hasRecordedWinner(select.value)
      ? `${select.value === "A" ? "天辉方" : "夜魇方"}已设为胜方，再次点击可取消`
      : copyText("recentMatches.winnerToggleHint", "");
  }
}

function toggleWinnerSelection(formType, winnerTeam) {
  const { select } = getWinnerToggleState(formType);
  setWinnerSelection(formType, select.value === winnerTeam ? "" : winnerTeam);
}

function updateRecentMatchGroupSummary(details, isActiveDay) {
  const badge = details.querySelector(".match-day-summary-badge");
  if (badge) {
    badge.textContent = isActiveDay ? "进行中" : "已归档";
  }

  details.dataset.expanded = details.open ? "true" : "false";
}

function rememberOpenRecentMatchGroups() {
  const businessDate = getBeijingBusinessDateString();
  openRecentMatchGroups = new Set(
    [...recentMatchesList.querySelectorAll(".match-day-group[open]")]
      .filter((element) => (element.dataset.matchDate || "") !== businessDate)
      .map((element) => element.dataset.groupKey || element.dataset.matchDate)
      .filter(Boolean)
  );
}

function updateRecentMatchHeroLocally(matchId, playerId, heroName) {
  const targetMatch = recentMatchesData.find((match) => match.match_id === matchId);
  if (!targetMatch) return;

  const players = parseRecentMatchPlayers(targetMatch.players).map((player) => (
    player.player_id === playerId
      ? { ...player, hero_name: heroName || null }
      : player
  ));

  targetMatch.players = players;
}

function getSavedMatchById(matchId) {
  return recentMatchesData.find((match) => match.match_id === matchId) || null;
}

function getOrderedSavedMatchTeamPlayers(players, team) {
  return (players || [])
    .map((player, index) => ({ ...player, __sourceIndex: index }))
    .filter((player) => player.team === team)
    .sort((a, b) => {
      const aSlot = Number.isFinite(Number(a.team_slot)) ? Number(a.team_slot) : a.__sourceIndex + 1;
      const bSlot = Number.isFinite(Number(b.team_slot)) ? Number(b.team_slot) : b.__sourceIndex + 1;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-CN");
    })
    .map(({ __sourceIndex, ...player }) => player);
}

function buildSavedMatchAssignmentsFromPlayers(players) {
  return (players || []).map((player) => ({
    player_id: player.player_id,
    hero_name: player.hero_name || null,
    kills: normalizeKdaValue(player.kills),
    deaths: normalizeKdaValue(player.deaths),
    assists: normalizeKdaValue(player.assists),
  })).filter((item) =>
    item.hero_name
    || item.kills !== null
    || item.deaths !== null
    || item.assists !== null
  );
}

function normalizeMatchDoubleDowns(doubleDowns, players = []) {
  const playerTeamMap = new Map(
    (players || []).map((player) => [(player.player_id || player.id), player.team]).filter(([playerId]) => Boolean(playerId))
  );
  const teamGroups = new Map();
  const singles = [];

  parseRecentMatchPlayers(doubleDowns).forEach((entry, index) => {
    if (!entry || !entry.mode) return;

    if (entry.mode === "single") {
      singles.push({
        mode: "single",
        user_player_id: entry.user_player_id || "",
        target_player_id: entry.target_player_id || "",
        item_catalog_id: entry.item_catalog_id || LEGACY_MATCH_ITEM_IDS.personal,
      });
      return;
    }

    if (entry.mode !== "team") return;
    const targetTeam = entry.target_team || "";
    const sourceTeam = entry.source_team || playerTeamMap.get(entry.user_player_id) || "";
    const paymentMode = entry.payment_mode || "solo";
    const groupKey = entry.effect_key || `team:${targetTeam}:${sourceTeam}:${paymentMode}:${index}`;
    const current = teamGroups.get(groupKey) || {
      mode: "team",
      target_team: targetTeam,
      source_team: sourceTeam,
      payment_mode: paymentMode,
      item_catalog_id: entry.item_catalog_id || LEGACY_MATCH_ITEM_IDS.team,
      user_player_id: "",
      contributor_player_ids: [],
      cost_amount: 0,
    };

    current.item_catalog_id = current.item_catalog_id || entry.item_catalog_id || LEGACY_MATCH_ITEM_IDS.team;

    const contributorIds = Array.isArray(entry.contributor_player_ids)
      ? entry.contributor_player_ids.filter(Boolean)
      : [];
    contributorIds.forEach((playerId) => {
      if (!current.contributor_player_ids.includes(playerId)) {
        current.contributor_player_ids.push(playerId);
      }
    });

    if (paymentMode === "split") {
      if (entry.user_player_id) {
        if (!current.contributor_player_ids.includes(entry.user_player_id)) {
          current.contributor_player_ids.push(entry.user_player_id);
        }
        if (!current.user_player_id) {
          current.user_player_id = entry.user_player_id;
        }
      }
    } else if (!current.user_player_id && entry.user_player_id) {
      current.user_player_id = entry.user_player_id;
    }

    current.cost_amount += Number(entry.cost_amount ?? 0);
    teamGroups.set(groupKey, current);
  });

  return [...teamGroups.values(), ...singles];
}

function sanitizeSavedMatchDoubleDowns(doubleDowns, players) {
  const validPlayers = players || [];
  const validIds = new Set(validPlayers.map((player) => player.player_id).filter(Boolean));
  const teamMap = new Map(validPlayers.map((player) => [player.player_id, player.team]));
  const seenTeamKeys = new Set();
  const seenSingleKeys = new Set();

  return normalizeMatchDoubleDowns(doubleDowns, players).filter((entry) => {
    if (entry?.mode === "team") {
      if (!["A", "B"].includes(entry.target_team || "")) return false;
      if (!["A", "B"].includes(entry.source_team || "")) return false;
      if (!["solo", "split"].includes(entry.payment_mode || "")) return false;
      if (entry.payment_mode === "solo") {
        if (!validIds.has(entry.user_player_id)) return false;
        if (teamMap.get(entry.user_player_id) !== entry.source_team) return false;
      }
      const dedupeKey = `${entry.item_catalog_id || ""}:${entry.source_team}:${entry.target_team}:${entry.payment_mode || "solo"}:${entry.user_player_id || ""}:${(entry.contributor_player_ids || []).join(",")}`;
      if (seenTeamKeys.has(dedupeKey)) return false;
      seenTeamKeys.add(dedupeKey);
      return true;
    }

    if (entry?.mode !== "single") return false;
    if (!validIds.has(entry.user_player_id) || !validIds.has(entry.target_player_id)) return false;
    const userTeam = teamMap.get(entry.user_player_id);
    if (!userTeam || !teamMap.get(entry.target_player_id)) return false;
    const dedupeKey = `${entry.item_catalog_id || ""}:${entry.user_player_id}:${entry.target_player_id}`;
    if (seenSingleKeys.has(dedupeKey)) return false;
    seenSingleKeys.add(dedupeKey);
    return true;
  });
}

function getSavedMatchDateValue(match) {
  return match?.match_date || formatArchiveDate(match?.created_at) || "";
}

async function persistSavedMatchUpdate(match, nextPlayers, nextWinnerTeam, nextDoubleDowns) {
  throw new Error("当前数据库结构未提供比赛编辑接口，请删除后重新补录。");
}

async function updateSavedMatchWinner(matchId, winnerTeam, triggerButton = null) {
  if (!ensureScorerAccess("仅记分员或管理员可直接修改比赛胜负。")) return;
  if (!ensureMatchRecordEditable(matchId, "修改")) return;
  if (triggerButton) triggerButton.disabled = false;
  setMessage("当前数据库结构未提供比赛编辑接口，请删除后重新补录。", true);
}

function getBeijingBusinessDateString(value = null) {
  const baseDate = value ? new Date(value) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return "";
  }

  const beijing = new Date(
    baseDate.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );

  if (beijing.getHours() < 2) {
    beijing.setDate(beijing.getDate() - 1);
  }

  const year = beijing.getFullYear();
  const month = String(beijing.getMonth() + 1).padStart(2, "0");
  const day = String(beijing.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousBeijingBusinessDateString() {
  const businessDate = getBeijingBusinessDateString();
  const [year, month, day] = businessDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const prevYear = date.getFullYear();
  const prevMonth = String(date.getMonth() + 1).padStart(2, "0");
  const prevDay = String(date.getDate()).padStart(2, "0");
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

function getBeijingNowDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
}

function scheduleRestDayBoundaryRefresh() {
  if (restDayBoundaryTimer) {
    window.clearTimeout(restDayBoundaryTimer);
    restDayBoundaryTimer = null;
  }

  const beijingNow = getBeijingNowDate();
  const nextBoundary = new Date(beijingNow);
  nextBoundary.setHours(2, 0, 5, 0);
  if (nextBoundary <= beijingNow) {
    nextBoundary.setDate(nextBoundary.getDate() + 1);
  }

  const delayMs = Math.max(nextBoundary.getTime() - beijingNow.getTime(), 1000);
  restDayBoundaryTimer = window.setTimeout(() => {
    renderRecentMatches(recentMatchDayGroupsData);
    renderMatchDayStatus();
    if (isCurrentRoleAdmin()) {
      prepareSupabaseSystemUsageStatusForAdmin();
      refreshSupabaseSystemUsageStatus();
    }
    void refreshAutomaticBackgroundImage({ allowChampionLookup: true });
    scheduleRestDayBoundaryRefresh();
  }, delayMs);
}

function getSeasonMonthLastDate(dateText) {
  if (!dateText) return null;
  const [yearText, monthText] = String(dateText).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearText}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getSeasonMonthFirstDate(season = activeSeason) {
  const seasonMonthCode = getSeasonMonthCode(season);
  if (seasonMonthCode) {
    return `${seasonMonthCode}-01`;
  }

  const startDate = String(season?.start_date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : "";
}

function getSeasonMonthCode(season = activeSeason) {
  const seasonCode = String(season?.code || "").trim();
  if (/^\d{4}-\d{2}$/.test(seasonCode)) {
    return seasonCode;
  }

  const referenceDate = String(season?.start_date || season?.end_date || "").trim();
  const matched = referenceDate.match(/^(\d{4})-(\d{2})/);
  if (!matched) return "";
  return `${matched[1]}-${matched[2]}`;
}

function getSeasonRolloverOpenDate(season = activeSeason) {
  const seasonMonthCode = getSeasonMonthCode(season);
  if (!seasonMonthCode) return "";

  const [yearText, monthText] = seasonMonthCode.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  return getSeasonMonthLastDate(`${yearText}-${String(month).padStart(2, "0")}-01`) || "";
}

function isDateOnOrAfter(dateA, dateB) {
  if (!dateA || !dateB) return false;
  return String(dateA) >= String(dateB);
}

function getInclusiveDateSpan(startDate, endDate) {
  const parsedStartDate = parseSeasonStartDate(startDate);
  const parsedEndDate = parseSeasonStartDate(endDate);
  if (!parsedStartDate || !parsedEndDate) return 0;

  parsedStartDate.setHours(0, 0, 0, 0);
  parsedEndDate.setHours(0, 0, 0, 0);
  const diffMs = parsedEndDate.getTime() - parsedStartDate.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / DAY_MS) + 1;
}

function getSeasonRecentMatchCalendarStats(seasonMeta, groups = []) {
  const matchDayDates = new Set(
    (groups || [])
      .filter((group) => (group.matches?.length || 0) > 0 && group.match_date)
      .map((group) => String(group.match_date))
  );
  const fallbackMatchDayCount = matchDayDates.size;
  const fallbackRestDayCount = Math.max((groups || []).length - fallbackMatchDayCount, 0);
  const monthStartDate = getSeasonMonthFirstDate(seasonMeta);
  const monthEndDate = getSeasonMonthLastDate(monthStartDate);

  if (!monthStartDate || !monthEndDate) {
    return {
      matchDayCount: fallbackMatchDayCount,
      restDayCount: fallbackRestDayCount,
    };
  }

  const today = getBeijingBusinessDateString();
  const effectiveEndDate = today < monthStartDate
    ? ""
    : (today < monthEndDate ? today : monthEndDate);

  if (!effectiveEndDate) {
    return {
      matchDayCount: 0,
      restDayCount: 0,
    };
  }

  const totalCalendarDays = getInclusiveDateSpan(monthStartDate, effectiveEndDate);
  const matchDayCount = [...matchDayDates].filter(
    (matchDate) => matchDate >= monthStartDate && matchDate <= effectiveEndDate
  ).length;

  return {
    matchDayCount,
    restDayCount: Math.max(totalCalendarDays - matchDayCount, 0),
  };
}

function isActiveSeasonReadyForMatches() {
  if (!activeSeason?.start_date) return true;
  return isDateOnOrAfter(getBeijingBusinessDateString(), activeSeason.start_date);
}

function getActiveSeasonMatchGateMessage() {
  if (!activeSeason?.start_date) return "";
  if (isActiveSeasonReadyForMatches()) return "";
  return `${activeSeason.name} 已初始化，比赛登记将于北京时间 ${activeSeason.start_date} 开放。`;
}

function shouldShowPreviousSeasonLeaderboard() {
  if (!activeSeason?.start_date) return false;
  const beijingNow = getBeijingNowDate();
  const carryoverDeadline = new Date(`${activeSeason.start_date}T12:00:00`);
  return beijingNow.getTime() < carryoverDeadline.getTime();
}

function getPreviousSeasonForLeaderboard() {
  if (!activeSeason?.id || !activeSeason?.start_at) return null;
  return (allSeasons || [])
    .filter((season) => season?.id && season.id !== activeSeason.id && season.start_at)
    .filter((season) => new Date(season.start_at).getTime() < new Date(activeSeason.start_at).getTime())
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())[0] || null;
}

function getSeasonRolloverWindowInfo(season = activeSeason) {
  if (!season) {
    return {
      isOpen: false,
      cutoffDate: "",
      cutoffLabel: "",
    };
  }

  const cutoffDate = getSeasonRolloverOpenDate(season);
  if (!cutoffDate) {
    return {
      isOpen: false,
      cutoffDate: "",
      cutoffLabel: "",
    };
  }

  const cutoffMoment = new Date(`${cutoffDate}T06:00:00+08:00`);
  return {
    isOpen: Date.now() >= cutoffMoment.getTime(),
    cutoffDate,
    cutoffLabel: `${cutoffDate} 06:00`,
  };
}

function buildSeasonRolloverFailureMessage(error) {
  const errorMessage = getErrorMessage(error);

  if (errorMessage.includes("Season rollover is not yet open")) {
    const windowInfo = getSeasonRolloverWindowInfo(activeSeason);
    return windowInfo.cutoffLabel
      ? `登记赛季完结失败：赛季完结尚未开放，将于北京时间 ${windowInfo.cutoffLabel} 开放。`
      : "登记赛季完结失败：赛季完结尚未开放。";
  }

  return `登记赛季完结失败：${errorMessage}。请先在 Supabase 执行最新 SQL。`;
}

function getRecordedMatchCountForDate(matchDate, seasonId = activeSeason?.id) {
  if (!matchDate) return 0;
  return (recentMatchesData || []).filter((match) => {
    const matchSeasonId = match.season_id || null;
    const resolvedMatchDate = match.match_date || formatArchiveDate(match.created_at) || "";
    return (!seasonId || matchSeasonId === seasonId) && resolvedMatchDate === matchDate;
  }).length;
}

function getTodayRecordedMatchCount(seasonId = activeSeason?.id) {
  return getRecordedMatchCountForDate(getBeijingBusinessDateString(), seasonId);
}

function getFinishMatchDayActionContext(seasonId = activeSeason?.id) {
  const businessDate = getBeijingBusinessDateString();
  const hasMatchingActiveDay = Boolean(
    activeMatchDay
    && seasonId
    && activeMatchDay.season_id === seasonId
  );
  const activeDate = hasMatchingActiveDay
    ? (activeMatchDay.match_date || businessDate)
    : null;
  const targetDate = activeDate || businessDate;
  const targetMatchCount = getRecordedMatchCountForDate(targetDate, seasonId);
  const hasPastActiveDay = Boolean(activeDate && activeDate !== businessDate);

  return {
    businessDate,
    activeDate,
    targetDate,
    targetMatchCount,
    hasPastActiveDay,
  };
}

function updateFinishTodayMatchDayButtonLabel() {
  if (!finishTodayMatchDayButtons.length) return;
  const actionContext = getFinishMatchDayActionContext(activeSeason?.id);
  const title = actionContext.targetDate === actionContext.businessDate
    ? "结束今日比赛并触发一次积分汇算"
    : `结束 ${actionContext.targetDate} 比赛日并触发一次积分汇算`;
  finishTodayMatchDayButtons.forEach((button) => {
    button.textContent = "今日比赛全部完结";
    button.title = title;
    button.setAttribute("aria-label", title);
  });
}

function getBackfillDateMaxValue() {
  const latestPastDate = getPreviousBeijingBusinessDateString();
  if (editingMatchId && backfillDateInput.value && backfillDateInput.value > latestPastDate) {
    return backfillDateInput.value;
  }
  return latestPastDate;
}

function getBackfillDateMinValue() {
  return allSeasons.find((season) => season.id === backfillSeasonSelect.value)?.start_date || "";
}

function getPlaceholderEnsureAttemptKey() {
  return `${activeSeason?.id || "global"}:${getBeijingBusinessDateString()}`;
}

async function ensurePreviousMatchDayPlaceholderOnce() {
  const attemptKey = getPlaceholderEnsureAttemptKey();
  placeholderEnsureAttemptKey = attemptKey;
}

function getQueueTimestamp(row) {
  const value = row.status === "cancelled" || row.is_active === false
    ? row.cancelled_at || row.created_at
    : row.created_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortQueueEntriesLocally() {
  queueEntries = [...(queueEntries || [])].sort((a, b) => getQueueTimestamp(a) - getQueueTimestamp(b));
}

function rerenderQueueLocally() {
  sortQueueEntriesLocally();
  renderQueue(queueEntries);
  renderSignupOptions();
}

function rerenderPlayerDrivenLocally() {
  renderTodayPlayers();
  renderQueue(queueEntries);
  renderSignupOptions();
  renderMatchForm();
}

function getPlayerDisplayNameById(playerId) {
  return stripPlayerNameMeta(seasonPlayers.find((player) => player.id === playerId)?.display_name || "未知选手") || "未知选手";
}

function createOptimisticQueueEntry(playerId, displayName, overrides = {}) {
  return {
    id: overrides.id || `temp-queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: overrides.created_at || new Date().toISOString(),
    player_id: playerId,
    is_active: overrides.is_active ?? true,
    status: overrides.status || "active",
    cancelled_at: overrides.cancelled_at ?? null,
    season_id: overrides.season_id ?? (activeSeason?.id || null),
    players: {
      display_name: displayName || getPlayerDisplayNameById(playerId),
    },
  };
}

function createOptimisticTodayPlayer(playerId, displayName, overrides = {}) {
  return {
    id: overrides.id || `temp-roster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    season_id: overrides.season_id ?? (activeSeason?.id || null),
    play_date: overrides.play_date || getBeijingBusinessDateString(),
    player_id: playerId,
    display_name: displayName || getPlayerDisplayNameById(playerId),
    source: overrides.source || "queue",
    note: overrides.note || null,
    created_at: overrides.created_at || new Date().toISOString(),
  };
}

function addTodayPlayerLocally(entry) {
  const playerId = entry?.player_id || entry?.id;
  if (!playerId) return;
  if (todayPlayers.some((player) => (player.player_id || player.id) === playerId)) return;
  todayPlayers = [...todayPlayers, entry];
}

function removeTodayPlayerLocallyByEntryId(entryId) {
  const existing = todayPlayers.find((player) => player.id === entryId) || null;
  if (!existing) return null;
  todayPlayers = todayPlayers.filter((player) => player.id !== entryId);
  return existing;
}

function removeTodayPlayerLocallyByPlayerId(playerId) {
  const existing = todayPlayers.find((player) => (player.player_id || player.id) === playerId) || null;
  if (!existing) return null;
  todayPlayers = todayPlayers.filter((player) => (player.player_id || player.id) !== playerId);
  return existing;
}

function sortRecentMatchDayGroupsLocally() {
  recentMatchDayGroupsData = [...(recentMatchDayGroupsData || [])].sort((a, b) => {
    if (a.match_date !== b.match_date) {
      return String(b.match_date).localeCompare(String(a.match_date), "zh-CN");
    }
    const aStarted = new Date(a.started_at || 0).getTime();
    const bStarted = new Date(b.started_at || 0).getTime();
    return bStarted - aStarted;
  });
}

function compareRecentMatchesInGroup(a, b) {
  const aMatchNo = Number(a?.match_no ?? NaN);
  const bMatchNo = Number(b?.match_no ?? NaN);
  const hasAMatchNo = Number.isFinite(aMatchNo);
  const hasBMatchNo = Number.isFinite(bMatchNo);
  if (hasAMatchNo || hasBMatchNo) {
    if (!hasAMatchNo) return 1;
    if (!hasBMatchNo) return -1;
    if (aMatchNo !== bMatchNo) {
      return aMatchNo - bMatchNo;
    }
  }

  const aTime = new Date(a?.created_at || 0).getTime();
  const bTime = new Date(b?.created_at || 0).getTime();
  if (aTime !== bTime) {
    return aTime - bTime;
  }

  return String(a?.match_id || "").localeCompare(String(b?.match_id || ""), "zh-CN");
}

function getCurrentActionLogActorLabel() {
  if (!hasVisibleAuthSession()) return copyText("runtime.common.viewer", "游客");
  return authAccessRole?.username || authProfile?.display_name || authSession.user?.email || getAccessRoleLabel();
}

function getMatchActionLogDateValue(match, fallbackDate = "") {
  return String(
    match?.match_date
    || fallbackDate
    || formatArchiveDate(match?.created_at)
    || ""
  ).trim();
}

function getMatchActionLogCandidates(match, fallbackDate = "") {
  const matchId = match?.match_id || match?.id || "";
  const seasonId = match?.season_id || activeSeason?.id || "";
  const matchDate = getMatchActionLogDateValue(match, fallbackDate);
  const seasonDateKey = getMatchDaySeasonDateKey(seasonId, matchDate);

  const group = (recentMatchDayGroupsData || []).find((item) => {
    const matches = item.matches || [];
    if (matchId && matches.some((candidate) => (candidate.match_id || candidate.id) === matchId)) {
      return true;
    }
    if (seasonDateKey && getMatchDaySeasonDateKey(item.season_id, item.match_date) === seasonDateKey) {
      return true;
    }
    return !seasonId && matchDate && String(item.match_date || "") === matchDate;
  });

  if (group?.matches?.length) {
    return group.matches;
  }

  return (recentMatchesData || []).filter((candidate) => {
    if (!candidate) return false;
    if (matchId && (candidate.match_id || candidate.id) === matchId) return true;
    if (seasonId && candidate.season_id && candidate.season_id !== seasonId) return false;
    return matchDate && getMatchActionLogDateValue(candidate) === matchDate;
  });
}

function getMatchActionLogRoundNo(match, fallbackDate = "") {
  const matchId = match?.match_id || match?.id || "";
  if (!matchId) return null;

  const sortedMatches = getMatchActionLogCandidates(match, fallbackDate)
    .slice()
    .sort(compareRecentMatchesInGroup);
  const matchIndex = sortedMatches.findIndex((candidate) => (candidate.match_id || candidate.id) === matchId);
  return matchIndex >= 0 ? matchIndex + 1 : null;
}

function buildMatchActionLogLabel(match, fallbackDate = "") {
  const matchDate = getMatchActionLogDateValue(match, fallbackDate);
  const dateLabel = formatLongDisplayDate(matchDate) || matchDate || "未知日期";
  const roundNo = getMatchActionLogRoundNo(match, fallbackDate);
  return roundNo ? `${dateLabel}第 ${roundNo} 场比赛` : `${dateLabel}的一场比赛`;
}

function buildMatchActionLogText(actionLabel, match, fallbackDate = "") {
  return `${actionLabel}了 ${buildMatchActionLogLabel(match, fallbackDate)}记录。`;
}

function getMatchDaySeasonDateKey(seasonId, matchDate = "") {
  if (!matchDate) return "";
  return `${seasonId || ""}::${matchDate}`;
}

function getOrCreateRecentMatchDayGroup(matchDayId, matchDate, seasonId, options = {}) {
  const groupKey = options.groupKey || getMatchDayGroupKey(matchDayId, matchDate);
  const seasonDateKey = getMatchDaySeasonDateKey(seasonId, matchDate);
  let group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);

  if (!group && seasonDateKey) {
    group = (recentMatchDayGroupsData || []).find((item) => (
      getMatchDaySeasonDateKey(item.season_id, item.match_date) === seasonDateKey
    ));
  }

  if (!group) {
    group = {
      group_key: groupKey,
      match_day_id: matchDayId || null,
      season_id: seasonId || null,
      match_date: matchDate || "历史比赛",
      started_at: options.started_at || new Date().toISOString(),
      closed_at: options.closed_at || null,
      day_is_active: Boolean(options.day_is_active),
      note: options.note || "",
      matches: [],
      attendance_notes: [],
      participants: [],
    };
    recentMatchDayGroupsData = [...(recentMatchDayGroupsData || []), group];
  } else {
    if (!group.match_day_id && matchDayId) {
      group.match_day_id = matchDayId;
    }
    if (!group.season_id && seasonId) {
      group.season_id = seasonId;
    }
    if ((!group.match_date || group.match_date === "历史比赛") && matchDate) {
      group.match_date = matchDate;
    }
    if (!group.started_at && options.started_at) {
      group.started_at = options.started_at;
    }
    if (!group.closed_at && options.closed_at) {
      group.closed_at = options.closed_at;
    }
    if (!group.note && options.note) {
      group.note = options.note;
    }
    if (options.day_is_active) {
      group.day_is_active = true;
    }
  }

  return group;
}

function syncRecentMatchDayGroupParticipants(group) {
  if (!group) return;
  group.attendance_notes.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  group.participants = getMatchDayParticipantEntries(group.matches);
}

function addMatchDayAttendanceNoteLocally(matchDayId, seasonId, matchDate, playerId, status, noteId = "", options = {}) {
  const group = getOrCreateRecentMatchDayGroup(matchDayId, matchDate, seasonId, {
    groupKey: options.groupKey || "",
    day_is_active: Boolean(activeMatchDay && activeMatchDay.id === matchDayId),
  });
  if (group.attendance_notes.some((entry) => entry.player_id === playerId && entry.status === status)) {
    return "";
  }

  const optimisticId = noteId || `temp-attendance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id: optimisticId,
    match_day_id: matchDayId || null,
    season_id: seasonId || activeSeason?.id || null,
    match_date: matchDate || null,
    player_id: playerId,
    status,
    note: null,
    created_at: new Date().toISOString(),
    display_name: getPlayerDisplayNameById(playerId),
  };
  group.attendance_notes.push(entry);
  recentMatchAttendanceNotesData = [
    ...recentMatchAttendanceNotesData.filter((item) => item.id !== optimisticId),
    entry,
  ];
  syncRecentMatchDayGroupParticipants(group);
  sortRecentMatchDayGroupsLocally();
  renderRecentMatches(recentMatchDayGroupsData);
  return optimisticId;
}

function removeMatchDayAttendanceNoteLocally(noteId) {
  let removedEntry = null;
  let removedGroupKey = "";

  recentMatchDayGroupsData.forEach((group) => {
    const entry = group.attendance_notes.find((item) => item.id === noteId);
    if (!entry) return;
    removedEntry = { ...entry };
    removedGroupKey = group.group_key;
    group.attendance_notes = group.attendance_notes.filter((item) => item.id !== noteId);
    syncRecentMatchDayGroupParticipants(group);
  });

  if (removedEntry) {
    recentMatchAttendanceNotesData = recentMatchAttendanceNotesData.filter((entry) => entry.id !== noteId);
    renderRecentMatches(recentMatchDayGroupsData);
  }

  return removedEntry ? { entry: removedEntry, groupKey: removedGroupKey } : null;
}

function restoreMatchDayAttendanceNoteLocally(entry) {
  if (!entry) return;
  const group = getOrCreateRecentMatchDayGroup(entry.match_day_id, entry.match_date, entry.season_id, {
    day_is_active: Boolean(activeMatchDay && activeMatchDay.id === entry.match_day_id),
  });
  if (!group.attendance_notes.some((item) => item.id === entry.id)) {
    group.attendance_notes.push(entry);
    recentMatchAttendanceNotesData = [
      ...recentMatchAttendanceNotesData.filter((item) => item.id !== entry.id),
      entry,
    ];
    syncRecentMatchDayGroupParticipants(group);
    sortRecentMatchDayGroupsLocally();
    renderRecentMatches(recentMatchDayGroupsData);
  }
}

function getLocalMatchPlayerSnapshot(playerId, seasonId = activeSeason?.id) {
  const cached = getCachedSeasonPlayerPower(seasonId, playerId);
  const playerPools = [];
  if (seasonId && backfillSeasonSelect?.value === seasonId) {
    playerPools.push(backfillPlayers);
  }
  if (seasonId && activeSeason?.id === seasonId) {
    playerPools.push(seasonPlayers);
  }
  playerPools.push(seasonPlayers, backfillPlayers);

  const player = playerPools
    .flat()
    .find((entry) => entry?.id === playerId || entry?.player_id === playerId);
  const rankNo = normalizeSeasonRankNo(player?.player_rank ?? player?.rank_no_snapshot ?? player?.rank_no ?? cached?.rank_no);
  const powerValue = cached?.power_value ?? (rankNo ? getSeasonRankPowerValue(rankNo, seasonId) : 0);
  if (rankNo) {
    cacheSeasonPlayerPower(seasonId, playerId, {
      displayName: player?.display_name || cached?.display_name || "",
      rankNo,
      powerValue,
    });
    writeSeasonPlayerPowerCache();
  }

  return {
    display_name: player?.display_name || cached?.display_name || "未知选手",
    rank_no_snapshot: rankNo,
    power_value_snapshot: Math.max(Number(powerValue) || 0, 0),
  };
}

function buildOptimisticMatchRecord(matchId, seasonId, matchDayId, matchDate, winner, note, teamAIds, teamBIds, assignments, kdaAssignments, doubleDowns, createdAt = new Date().toISOString(), isExhibition = false) {
  const buildPlayerRows = (ids, team) => ids.map((playerId, index) => {
    const snapshot = getLocalMatchPlayerSnapshot(playerId, seasonId);
    return {
      player_id: playerId,
      display_name: snapshot.display_name,
      team,
      team_slot: index + 1,
      rank_no_snapshot: snapshot.rank_no_snapshot,
      power_value_snapshot: snapshot.power_value_snapshot,
      hero_name: assignments[playerId] || null,
      kills: normalizeKdaValue(kdaAssignments?.[playerId]?.kills),
      deaths: normalizeKdaValue(kdaAssignments?.[playerId]?.deaths),
      assists: normalizeKdaValue(kdaAssignments?.[playerId]?.assists),
      score_change: 0,
      reward_change: 0,
    };
  });

  return {
    match_id: matchId,
    match_day_id: matchDayId || null,
    season_id: seasonId || null,
    match_date: matchDate || getBeijingBusinessDateString(),
    day_is_active: Boolean(activeMatchDay && activeMatchDay.id === matchDayId),
    winner_team: winner,
    note: note || "",
    created_at: createdAt,
    players: [
      ...buildPlayerRows(teamAIds, "A"),
      ...buildPlayerRows(teamBIds, "B"),
    ],
    double_downs: doubleDowns || [],
    is_exhibition: Boolean(isExhibition),
  };
}

function clonePlainObject(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON clone for plain Supabase row objects.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function upsertRecentMatchLocally(match) {
  if (!match?.match_id) return;

  const existingIndex = recentMatchesData.findIndex((item) => item.match_id === match.match_id);
  if (existingIndex >= 0) {
    recentMatchesData[existingIndex] = match;
  } else {
    recentMatchesData = [match, ...recentMatchesData];
  }

  let previousGroupKey = "";
  let previousGroupIndex = -1;
  (recentMatchDayGroupsData || []).forEach((group) => {
    const matchIndex = group.matches.findIndex((item) => item.match_id === match.match_id);
    if (matchIndex < 0) return;
    previousGroupKey = previousGroupKey || group.group_key;
    previousGroupIndex = previousGroupIndex < 0 ? matchIndex : previousGroupIndex;
    group.matches.splice(matchIndex, 1);
    syncRecentMatchDayGroupParticipants(group);
  });

  const group = getOrCreateRecentMatchDayGroup(match.match_day_id, match.match_date, match.season_id, {
    day_is_active: Boolean(match.day_is_active),
    started_at: match.created_at,
  });
  if (previousGroupKey === group.group_key && previousGroupIndex >= 0) {
    group.matches.splice(Math.min(previousGroupIndex, group.matches.length), 0, match);
  } else {
    group.matches.push(match);
  }
  syncRecentMatchDayGroupParticipants(group);
  sortRecentMatchDayGroupsLocally();
  renderRecentMatches(recentMatchDayGroupsData);
}

function removeRecentMatchLocally(matchId) {
  if (!matchId) return null;
  const recentDataIndex = recentMatchesData.findIndex((item) => item.match_id === matchId);
  const recentDataEntry = recentDataIndex >= 0 ? clonePlainObject(recentMatchesData[recentDataIndex]) : null;
  if (recentDataIndex >= 0) {
    recentMatchesData.splice(recentDataIndex, 1);
  }

  let removedEntry = null;
  let groupKey = "";
  let groupIndex = -1;
  (recentMatchDayGroupsData || []).some((group) => {
    const matchIndex = group.matches.findIndex((item) => item.match_id === matchId);
    if (matchIndex < 0) return false;
    groupKey = group.group_key;
    groupIndex = matchIndex;
    removedEntry = clonePlainObject(group.matches[matchIndex]);
    group.matches.splice(matchIndex, 1);
    syncRecentMatchDayGroupParticipants(group);
    return true;
  });

  if (!removedEntry && !recentDataEntry) return null;
  sortRecentMatchDayGroupsLocally();
  renderRecentMatches(recentMatchDayGroupsData);
  return {
    match: removedEntry || recentDataEntry,
    recentDataIndex,
    groupKey,
    groupIndex,
  };
}

function restoreRecentMatchLocally(state) {
  if (!state?.match?.match_id) return;
  const match = clonePlainObject(state.match);
  const existingDataIndex = recentMatchesData.findIndex((item) => item.match_id === match.match_id);
  if (existingDataIndex >= 0) {
    recentMatchesData[existingDataIndex] = match;
  } else if (state.recentDataIndex >= 0) {
    recentMatchesData.splice(Math.min(state.recentDataIndex, recentMatchesData.length), 0, match);
  } else {
    recentMatchesData = [match, ...recentMatchesData];
  }

  const group = getOrCreateRecentMatchDayGroup(match.match_day_id, match.match_date, match.season_id, {
    day_is_active: Boolean(match.day_is_active),
    started_at: match.created_at,
  });
  const existingGroupIndex = group.matches.findIndex((item) => item.match_id === match.match_id);
  if (existingGroupIndex >= 0) {
    group.matches[existingGroupIndex] = match;
  } else {
    const insertIndex = state.groupKey === group.group_key && state.groupIndex >= 0
      ? Math.min(state.groupIndex, group.matches.length)
      : group.matches.length;
    group.matches.splice(insertIndex, 0, match);
  }
  syncRecentMatchDayGroupParticipants(group);
  sortRecentMatchDayGroupsLocally();
  renderRecentMatches(recentMatchDayGroupsData);
}

function findRecentMatchGroupByMatchId(matchId) {
  for (const group of recentMatchDayGroupsData || []) {
    const matchIndex = group.matches.findIndex((item) => item.match_id === matchId);
    if (matchIndex >= 0) {
      return { group, matchIndex };
    }
  }
  return null;
}

function getRecentMatchCardsByGroupKey(groupKey) {
  if (!recentMatchesList || !groupKey) return [];
  return [...recentMatchesList.querySelectorAll(`.match-day-group[data-group-key="${groupKey}"] .recent-match-card[data-match-id]`)];
}

function captureRecentMatchCardRects(groupKey) {
  return new Map(
    getRecentMatchCardsByGroupKey(groupKey)
      .map((card) => [card.dataset.matchId || "", card.getBoundingClientRect()])
      .filter(([matchId]) => Boolean(matchId))
  );
}

function getMotionAnimate() {
  return window.Motion?.animate
    || window.motion?.animate
    || window.MotionOne?.animate
    || null;
}

function normalizeMotionOptions(options = {}) {
  return {
    duration: Number(options.duration ?? 180) / 1000,
    easing: options.easing || "cubic-bezier(0.22, 1, 0.36, 1)",
  };
}

function toMotionKeyframes(keyframes = []) {
  return keyframes.reduce((result, frame) => {
    Object.entries(frame || {}).forEach(([property, value]) => {
      if (!result[property]) {
        result[property] = [];
      }
      result[property].push(value);
    });
    return result;
  }, {});
}

function animateWithMotion(element, keyframes, options = {}) {
  const motionAnimate = getMotionAnimate();
  if (motionAnimate) {
    return motionAnimate(element, toMotionKeyframes(keyframes), normalizeMotionOptions(options));
  }
  return element.animate(keyframes, options);
}

function waitForAnimation(animation, fallbackMs = 160) {
  if (animation?.finished && typeof animation.finished.then === "function") {
    return animation.finished.catch(() => {});
  }
  return new Promise((resolve) => window.setTimeout(resolve, fallbackMs));
}

function escapeCssIdentifier(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function animateRecentMatchSwap(groupKey, previousRects) {
  if (!groupKey || !previousRects?.size) return;

  window.requestAnimationFrame(() => {
    getRecentMatchCardsByGroupKey(groupKey).forEach((card) => {
      const matchId = card.dataset.matchId || "";
      const previousRect = previousRects.get(matchId);
      if (!previousRect) return;
      const nextRect = card.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      animateWithMotion(
        card,
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(0.985)`,
            boxShadow: "0 18px 34px rgba(5, 18, 33, 0.28)",
          },
          {
            transform: "translate(0, 0) scale(1)",
            boxShadow: "",
          },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    });
  });
}

async function animateRecentMatchRemoval(matchId) {
  if (!recentMatchesList || !matchId) return;
  const card = recentMatchesList.querySelector(`.recent-match-card[data-match-id="${escapeCssIdentifier(matchId)}"]`);
  if (!card) return;
  card.classList.add("recent-match-card-removing");
  const animation = animateWithMotion(
    card,
    [
      { opacity: 1, transform: card.style.transform || "translate3d(0, 0, 0) scale(1)", maxHeight: `${card.offsetHeight}px` },
      { opacity: 0, transform: "translate3d(18px, 0, 0) scale(0.985)", maxHeight: "0px" },
    ],
    {
      duration: 170,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    }
  );
  await waitForAnimation(animation, 180);
}

function swapRecentMatchesLocally(matchId, targetMatchId) {
  const source = findRecentMatchGroupByMatchId(matchId);
  const target = findRecentMatchGroupByMatchId(targetMatchId);
  if (!source || !target || source.group.group_key !== target.group.group_key) return null;

  const { group } = source;
  if (source.matchIndex === target.matchIndex) return null;

  const previousOrder = group.matches.map((item) => item.match_id);
  const previousRects = captureRecentMatchCardRects(group.group_key);
  [group.matches[source.matchIndex], group.matches[target.matchIndex]] = [group.matches[target.matchIndex], group.matches[source.matchIndex]];
  syncRecentMatchDayGroupParticipants(group);
  renderRecentMatches(recentMatchDayGroupsData);
  animateRecentMatchSwap(group.group_key, previousRects);
  return {
    groupKey: group.group_key,
    previousOrder,
    nextOrder: group.matches.map((item) => item.match_id),
  };
}

function restoreRecentMatchOrderLocally(groupKey, previousOrder) {
  if (!groupKey || !Array.isArray(previousOrder) || !previousOrder.length) return;
  const group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);
  if (!group) return;

  const previousRects = captureRecentMatchCardRects(groupKey);
  const matchMap = new Map(group.matches.map((item) => [item.match_id, item]));
  const restoredMatches = previousOrder
    .map((matchId) => matchMap.get(matchId))
    .filter(Boolean);

  if (restoredMatches.length === group.matches.length) {
    group.matches = restoredMatches;
    syncRecentMatchDayGroupParticipants(group);
    renderRecentMatches(recentMatchDayGroupsData);
    animateRecentMatchSwap(groupKey, previousRects);
  }
}

function applyRecentMatchOrderLocally(groupKey, nextOrder) {
  if (!groupKey || !Array.isArray(nextOrder) || !nextOrder.length) return null;
  const group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);
  if (!group) return null;

  const previousOrder = group.matches.map((item) => item.match_id);
  if (
    previousOrder.length !== nextOrder.length
    || previousOrder.every((matchId, index) => matchId === nextOrder[index])
  ) {
    return null;
  }

  const matchMap = new Map(group.matches.map((item) => [item.match_id, item]));
  const reorderedMatches = nextOrder
    .map((matchId) => matchMap.get(matchId))
    .filter(Boolean);
  if (reorderedMatches.length !== group.matches.length) return null;

  const previousRects = captureRecentMatchCardRects(groupKey);
  group.matches = reorderedMatches;
  syncRecentMatchDayGroupParticipants(group);
  renderRecentMatches(recentMatchDayGroupsData);
  animateRecentMatchSwap(groupKey, previousRects);

  return {
    groupKey,
    previousOrder,
    nextOrder: group.matches.map((item) => item.match_id),
  };
}

function getRecentMatchOrderSwapSteps(previousOrder, nextOrder) {
  const workingOrder = [...previousOrder];
  const steps = [];

  nextOrder.forEach((expectedMatchId, index) => {
    if (workingOrder[index] === expectedMatchId) return;
    const targetIndex = workingOrder.indexOf(expectedMatchId);
    if (targetIndex < 0) return;
    const currentMatchId = workingOrder[index];
    steps.push([currentMatchId, expectedMatchId]);
    [workingOrder[index], workingOrder[targetIndex]] = [workingOrder[targetIndex], workingOrder[index]];
  });

  return steps;
}

function getClosestElement(target, selector) {
  if (!target || !selector) return null;
  if (typeof target.closest === "function") {
    return target.closest(selector);
  }
  if (target.parentElement && typeof target.parentElement.closest === "function") {
    return target.parentElement.closest(selector);
  }
  return null;
}

function clearRecentMatchDropTargets() {
  if (!recentMatchesList) return;
  recentMatchesList
    .querySelectorAll(".recent-match-card-drop-target")
    .forEach((card) => card.classList.remove("recent-match-card-drop-target"));
}

function getRecentMatchDragRect() {
  if (!recentMatchDragState?.card) return null;
  const rect = recentMatchDragState.card.getBoundingClientRect();
  return {
    left: rect.left + recentMatchDragState.currentX,
    top: rect.top + recentMatchDragState.currentY,
    right: rect.right + recentMatchDragState.currentX,
    bottom: rect.bottom + recentMatchDragState.currentY,
    width: rect.width,
    height: rect.height,
  };
}

function getRectOverlapArea(rectA, rectB) {
  if (!rectA || !rectB) return 0;
  const overlapWidth = Math.max(0, Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left));
  const overlapHeight = Math.max(0, Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top));
  return overlapWidth * overlapHeight;
}

function isRecentMatchDragHotspotHit(handle, clientX, clientY) {
  if (!handle) return false;
  const badgeRect = handle.getBoundingClientRect();
  const textNode = handle.querySelector(".recent-match-round-text");
  const textRect = textNode?.getBoundingClientRect?.() || null;
  const iconRadius = 18;
  const iconGap = 10;
  const iconVisualWidth = 13;
  const centerX = textRect
    ? (textRect.left - iconGap - (iconVisualWidth / 2))
    : (badgeRect.left + 20);
  const centerY = badgeRect.top + (badgeRect.height / 2);
  return Math.hypot(clientX - centerX, clientY - centerY) <= iconRadius;
}

function getStrictRecentMatchTargetCard(clientX, clientY) {
  if (!recentMatchDragState?.groupKey || !recentMatchesList) return null;

  let bestCard = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const cards = getRecentMatchCardsByGroupKey(recentMatchDragState.groupKey);

  cards.forEach((card) => {
    if (!card || card.dataset.matchId === recentMatchDragState.matchId) return;
    const rect = card.getBoundingClientRect();
    const containsPointer = (
      clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom
    );
    if (!containsPointer) return;
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const distance = Math.hypot(clientX - centerX, clientY - centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCard = card;
    }
  });

  return bestCard;
}

function updateRecentMatchPointerTarget(clientX, clientY) {
  if (!recentMatchDragState) return "";
  const targetCard = getStrictRecentMatchTargetCard(clientX, clientY);
  if (!targetCard) {
    clearRecentMatchDropTargets();
    recentMatchDragState.targetMatchId = "";
    return "";
  }
  if (targetCard.dataset.groupKey !== recentMatchDragState.groupKey) {
    clearRecentMatchDropTargets();
    recentMatchDragState.targetMatchId = "";
    return "";
  }
  if (targetCard.dataset.matchId === recentMatchDragState.matchId) {
    clearRecentMatchDropTargets();
    recentMatchDragState.targetMatchId = "";
    return "";
  }

  clearRecentMatchDropTargets();
  targetCard.classList.add("recent-match-card-drop-target");
  recentMatchDragState.targetMatchId = targetCard.dataset.matchId || "";
  return recentMatchDragState.targetMatchId;
}

function stopRecentMatchDragFrame() {
  if (recentMatchDragState?.animationFrame) {
    window.cancelAnimationFrame(recentMatchDragState.animationFrame);
    recentMatchDragState.animationFrame = 0;
  }
}

function updateRecentMatchPointerDrag(clientX, clientY) {
  if (!recentMatchDragState?.card) return;
  const deltaX = clientX - recentMatchDragState.startX;
  const deltaY = clientY - recentMatchDragState.startY;
  const travelDistance = Math.hypot(deltaX, deltaY);

  if (!recentMatchDragState.isDragging) {
    if (travelDistance < RECENT_MATCH_DRAG_THRESHOLD_PX) {
      return;
    }
    recentMatchDragState.isDragging = true;
    recentMatchDragState.card.classList.add("recent-match-card-dragging");
    recentMatchDragState.card.style.animation = "none";
  }

  recentMatchDragState.targetX = deltaX;
  recentMatchDragState.targetY = deltaY;
  recentMatchDragState.currentX = deltaX;
  recentMatchDragState.currentY = deltaY;
  recentMatchDragState.card.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.02)`;
  updateRecentMatchPointerTarget(clientX, clientY);
}

function resetRecentMatchPointerDrag(card = null, options = {}) {
  clearRecentMatchDropTargets();
  stopRecentMatchDragFrame();
  if (
    recentMatchDragState?.handle
    && typeof recentMatchDragState.handle.releasePointerCapture === "function"
    && recentMatchDragState.pointerId != null
  ) {
    try {
      recentMatchDragState.handle.releasePointerCapture(recentMatchDragState.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }
  }
  if (card) {
    const currentTransform = card.style.transform;
    card.classList.remove("recent-match-card-dragging");
    if (options.animateBack && currentTransform) {
      animateWithMotion(
        card,
        [
          { transform: currentTransform, opacity: 0.96 },
          { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
        ],
        {
          duration: 160,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    }
    card.style.removeProperty("animation");
    card.style.removeProperty("transform");
  }
  recentMatchDragState = null;
}

function sortQueueEntries(data) {
  return [...data].sort((a, b) => {
    const aCancelled = a.status === "cancelled" || a.is_active === false;
    const bCancelled = b.status === "cancelled" || b.is_active === false;

    if (aCancelled !== bCancelled) {
      return aCancelled ? 1 : -1;
    }

    return getQueueTimestamp(a) - getQueueTimestamp(b);
  });
}

function buildOptionsFromPlayers(players, currentValue = "") {
  const options = ['<option value="">请选择选手</option>'];

  players.forEach((player) => {
    const selected = player.id === currentValue ? " selected" : "";
    options.push(
      `<option value="${player.id}"${selected}>${escapeHtml(player.display_name)}</option>`
    );
  });

  return options.join("");
}

function buildSeasonOptions(seasons, currentValue = "") {
  const options = ['<option value="">请选择赛季</option>'];

  seasons.forEach((season) => {
    const selected = season.id === currentValue ? " selected" : "";
    options.push(
      `<option value="${season.id}"${selected}>${escapeHtml(season.name)}</option>`
    );
  });

  return options.join("");
}

function getSelectedMatchPlayerIds() {
  return [...matchTeamSelections.teamA, ...matchTeamSelections.teamB];
}

function getSelectedBackfillPlayerIds() {
  return [...backfillTeamSelections.teamA, ...backfillTeamSelections.teamB];
}

function getTodayRosterPlayers() {
  const rosterPlayers = [];
  const seen = new Set();

  const pushEntry = (entry) => {
    if (!entry) return;
    const playerId = entry.player_id || entry.id || null;
    const displayName = stripPlayerNameMeta(entry.display_name || "未知选手");
    const key = playerId || displayName;
    if (!key || seen.has(key)) return;
    seen.add(key);
    rosterPlayers.push({
      player_id: playerId,
      display_name: displayName,
      source: entry.source || "roster",
    });
  };

  (todayPlayers || []).forEach((entry) => pushEntry(entry));

  return rosterPlayers;
}

function getMatchRecordingPlayers() {
  return seasonPlayers
    .filter((player) => player.is_in_season)
    .map((player) => ({
      id: player.id,
      display_name: player.display_name,
      player_rank: player.player_rank || null,
    }));
}

function canUseMatchRecordingForm() {
  return Boolean((activeMatchDay || activeSeason?.id) && isActiveSeasonReadyForMatches());
}

function createEmptySingleDoubleEntry() {
  return {
    id: `double-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item_catalog_id: "",
    user_player_id: "",
    target_player_id: "",
  };
}

function getPlayersInSelectionOrder(playerIds, players, team = "") {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  return playerIds
    .map((playerId) => playerMap.get(playerId))
    .filter(Boolean)
    .map((player) => (team ? { ...player, team } : player));
}

function getSelectedPlayersByFormType(formType) {
  const selections = formType === "backfill" ? backfillTeamSelections : matchTeamSelections;
  const players = formType === "backfill" ? backfillPlayers : getMatchRecordingPlayers();
  return [
    ...getPlayersInSelectionOrder(selections.teamA, players, "A"),
    ...getPlayersInSelectionOrder(selections.teamB, players, "B"),
  ];
}

function buildLegacyMatchInteractionItem(scope = "personal") {
  const normalizedScope = scope === "team" ? "team" : "personal";
  return {
    id: normalizedScope === "team" ? LEGACY_MATCH_ITEM_IDS.team : LEGACY_MATCH_ITEM_IDS.personal,
    name: normalizedScope === "team" ? "旧版团队双倍" : "旧版个人双倍",
    is_active: true,
    config: {
      match_targets: normalizedScope === "team" ? ["own_team", "enemy_team"] : ["self", "opponent"],
      match_icon: "◉",
    },
  };
}

function isLegacyMatchInteractionItemId(itemCatalogId) {
  return itemCatalogId === LEGACY_MATCH_ITEM_IDS.personal || itemCatalogId === LEGACY_MATCH_ITEM_IDS.team;
}

function getMatchInteractionItemById(itemCatalogId) {
  if (!itemCatalogId) return null;
  if (itemCatalogId === LEGACY_MATCH_ITEM_IDS.personal) {
    return buildLegacyMatchInteractionItem("personal");
  }
  if (itemCatalogId === LEGACY_MATCH_ITEM_IDS.team) {
    return buildLegacyMatchInteractionItem("team");
  }
  return itemCatalogEntries.find((entry) => entry.id === itemCatalogId) || null;
}

function normalizeMatchInteractionGroup(group = "single") {
  if (group === "personal" || group === "single") return "single";
  if (group === "team") return "team";
  return "";
}

function resolveMatchInteractionItemId(itemCatalogId, group = "single") {
  const entry = getMatchInteractionItemById(itemCatalogId);
  return entry && getItemCatalogInteractionGroup(entry) === normalizeMatchInteractionGroup(group) ? entry.id : "";
}

function getMatchInteractionItems(group = "single", extraItemIds = []) {
  const normalizedGroup = normalizeMatchInteractionGroup(group);
  const items = itemCatalogEntries
    .filter((entry) => getItemCatalogInteractionGroup(entry) === normalizedGroup && entry.is_active && !isLegacyItemCatalogMatchConfig(entry))
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
  const knownIds = new Set(items.map((entry) => entry.id));

  (extraItemIds || []).forEach((itemCatalogId) => {
    const entry = getMatchInteractionItemById(itemCatalogId);
    if (!entry || knownIds.has(entry.id) || getItemCatalogInteractionGroup(entry) !== normalizedGroup) return;
    items.push(entry);
    knownIds.add(entry.id);
  });

  if (!items.length && (extraItemIds || []).some((itemCatalogId) => isLegacyMatchInteractionItemId(itemCatalogId))) {
    items.push(buildLegacyMatchInteractionItem(normalizedGroup === "team" ? "team" : "personal"));
  }

  return items;
}

function getMatchInteractionItemIcon(itemCatalogId, fallbackGroup = "single") {
  const normalizedGroup = normalizeMatchInteractionGroup(fallbackGroup);
  const entry = getMatchInteractionItemById(itemCatalogId) || buildLegacyMatchInteractionItem(normalizedGroup === "team" ? "team" : "personal");
  return getItemCatalogMatchIcon(entry);
}

function getMatchInteractionItemName(itemCatalogId, fallbackGroup = "single") {
  const normalizedGroup = normalizeMatchInteractionGroup(fallbackGroup);
  const entry = getMatchInteractionItemById(itemCatalogId) || buildLegacyMatchInteractionItem(normalizedGroup === "team" ? "team" : "personal");
  return entry.name || "未命名道具";
}

function getDoubleStateByFormType(formType) {
  return formType === "backfill" ? backfillDoubleState : matchDoubleState;
}

function getTeamDoubleStateKey(team) {
  return team === "A" ? "teamA" : "teamB";
}

function getTeamDoubleConfigs(formType, team) {
  const state = getDoubleStateByFormType(formType);
  const configs = state[getTeamDoubleStateKey(team)];
  return Array.isArray(configs) ? configs : [];
}

function getTeamDoubleConfig(formType, team, itemCatalogId = "") {
  const configs = getTeamDoubleConfigs(formType, team);
  if (!itemCatalogId) {
    return configs[0] || createEmptyTeamDoubleConfig();
  }
  return configs.find((entry) => entry.itemCatalogId === itemCatalogId) || createEmptyTeamDoubleConfig(itemCatalogId);
}

function setTeamDoubleConfigs(formType, team, configs) {
  const state = getDoubleStateByFormType(formType);
  state[getTeamDoubleStateKey(team)] = Array.isArray(configs)
    ? configs.filter(Boolean)
    : [];
}

function upsertTeamDoubleConfig(formType, team, nextConfig) {
  if (!nextConfig?.itemCatalogId) return;
  const configs = getTeamDoubleConfigs(formType, team).filter((entry) => entry.itemCatalogId !== nextConfig.itemCatalogId);
  if (nextConfig.targetTeam) {
    configs.push({
      itemCatalogId: nextConfig.itemCatalogId,
      targetTeam: nextConfig.targetTeam,
      paymentMode: nextConfig.paymentMode === "split" ? "split" : "solo",
      userPlayerId: nextConfig.paymentMode === "split" ? "" : (nextConfig.userPlayerId || ""),
    });
  }
  setTeamDoubleConfigs(formType, team, configs);
}

function removeTeamDoubleConfig(formType, team, itemCatalogId) {
  setTeamDoubleConfigs(
    formType,
    team,
    getTeamDoubleConfigs(formType, team).filter((entry) => entry.itemCatalogId !== itemCatalogId)
  );
}

function getTeamDoubleBaseCost(sourceTeam, targetTeam) {
  return sourceTeam && targetTeam && sourceTeam !== targetTeam ? 15 : 10;
}

function getTeamDoublePerPlayerCost(sourceTeam, targetTeam, paymentMode = "solo") {
  const baseCost = getTeamDoubleBaseCost(sourceTeam, targetTeam);
  return paymentMode === "split" ? baseCost / TEAM_SIZE : baseCost;
}

function getTeamDoubleModeLabel(sourceTeam, targetTeam, paymentMode = "solo") {
  if (!targetTeam) return "";
  const relationLabel = sourceTeam === targetTeam ? "己方效果" : "对方效果";
  return `${relationLabel} · ${paymentMode === "split" ? "平分出资" : "单人出资"}`;
}

function getTeamDoubleSummaryLabel(formType, sourceTeam, itemCatalogId = "") {
  const config = getTeamDoubleConfig(formType, sourceTeam, itemCatalogId);
  if (!config?.targetTeam) return "不使用";
  const relationLabel = config.targetTeam === sourceTeam ? "己方效果" : "对方效果";
  const payerLabel = config.paymentMode === "split"
    ? "平分出资"
    : (config.userPlayerId ? "单人出资" : "待选出资人");
  return `${relationLabel} · ${payerLabel} · ${getTeamDoublePerPlayerCost(sourceTeam, config.targetTeam, config.paymentMode)} 元`;
}

function getSelectedPlayersWithTeams(formType) {
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const teamMap = new Map(selectedPlayers.map((player) => [player.id, player.team]));
  return { selectedPlayers, teamMap };
}

function getSingleRelationKey(userPlayerId, targetPlayerId, teamMap = new Map()) {
  if (!userPlayerId || !targetPlayerId) return "";
  if (userPlayerId === targetPlayerId) return "self";
  const userTeam = teamMap.get(userPlayerId);
  const targetTeam = teamMap.get(targetPlayerId);
  if (!userTeam || !targetTeam) return "";
  return userTeam === targetTeam ? "ally" : "opponent";
}

function getItemCatalogAllowedSingleRelations(entry) {
  return getItemCatalogMatchTargets(entry).filter((target) => getItemTargetGroup(target) === "single");
}

function getItemCatalogAllowedTeamRelations(entry) {
  return getItemCatalogMatchTargets(entry).filter((target) => getItemTargetGroup(target) === "team");
}

function normalizeDoubleState(formType) {
  const doubleState = getDoubleStateByFormType(formType);
  const { selectedPlayers, teamMap } = getSelectedPlayersWithTeams(formType);
  const validIds = new Set(selectedPlayers.map((player) => player.id));

  ["A", "B"].forEach((sourceTeam) => {
    const seenItemIds = new Set();
    const nextConfigs = getTeamDoubleConfigs(formType, sourceTeam).reduce((list, config) => {
      const targetTeam = ["A", "B"].includes(config.targetTeam) ? config.targetTeam : "";
      const paymentMode = config.paymentMode === "split" ? "split" : "solo";
      const itemCatalogId = targetTeam
        ? (
          resolveMatchInteractionItemId(config.itemCatalogId, "team")
          || LEGACY_MATCH_ITEM_IDS.team
        )
        : "";
      if (!targetTeam || !itemCatalogId || seenItemIds.has(itemCatalogId)) {
        return list;
      }

      const itemEntry = getMatchInteractionItemById(itemCatalogId);
      const allowedTeamRelations = new Set(itemEntry ? getItemCatalogAllowedTeamRelations(itemEntry) : []);
      const relationKey = targetTeam === sourceTeam ? "own_team" : "enemy_team";
      if (!allowedTeamRelations.has(relationKey)) {
        return list;
      }

      let userPlayerId = config.userPlayerId || "";
      if (paymentMode === "solo") {
        if (!validIds.has(userPlayerId) || teamMap.get(userPlayerId) !== sourceTeam) {
          userPlayerId = "";
        }
      } else {
        userPlayerId = "";
      }

      seenItemIds.add(itemCatalogId);
      list.push({
        itemCatalogId,
        targetTeam,
        paymentMode,
        userPlayerId,
      });
      return list;
    }, []);

    setTeamDoubleConfigs(formType, sourceTeam, nextConfigs);
  });

  const seenSingleKeys = new Set();
  doubleState.singles = doubleState.singles.filter((entry) => {
    const itemCatalogId = resolveMatchInteractionItemId(entry.item_catalog_id || entry.itemCatalogId, "single")
      || LEGACY_MATCH_ITEM_IDS.personal;
    if (!validIds.has(entry.user_player_id) || !validIds.has(entry.target_player_id)) {
      return false;
    }

    const userTeam = teamMap.get(entry.user_player_id);
    if (!userTeam || !teamMap.get(entry.target_player_id)) {
      return false;
    }

    const itemEntry = getMatchInteractionItemById(itemCatalogId);
    const allowedRelations = new Set(itemEntry ? getItemCatalogAllowedSingleRelations(itemEntry) : []);
    const relationKey = getSingleRelationKey(entry.user_player_id, entry.target_player_id, teamMap);
    if (!relationKey || !allowedRelations.has(relationKey)) {
      return false;
    }

    const dedupeKey = `${itemCatalogId}:${entry.user_player_id}:${entry.target_player_id}`;
    if (seenSingleKeys.has(dedupeKey)) {
      return false;
    }
    entry.item_catalog_id = itemCatalogId;
    seenSingleKeys.add(dedupeKey);
    return true;
  });
}

function getSingleDoubleTargetsByUserAndItem(formType, userPlayerId, itemCatalogId) {
  const doubleState = getDoubleStateByFormType(formType);
  const normalizedItemCatalogId = resolveMatchInteractionItemId(itemCatalogId, "single") || LEGACY_MATCH_ITEM_IDS.personal;
  return doubleState.singles
    .filter((entry) => entry.user_player_id === userPlayerId && entry.item_catalog_id === normalizedItemCatalogId)
    .map((entry) => entry.target_player_id)
    .filter(Boolean);
}

function clearSingleDoubleTargets(formType, userPlayerId, itemCatalogId = "") {
  const doubleState = getDoubleStateByFormType(formType);
  if (!itemCatalogId) {
    doubleState.singles = doubleState.singles.filter((entry) => entry.user_player_id !== userPlayerId);
    return;
  }
  const normalizedItemCatalogId = resolveMatchInteractionItemId(itemCatalogId, "single") || LEGACY_MATCH_ITEM_IDS.personal;
  doubleState.singles = doubleState.singles.filter((entry) => (
    entry.user_player_id !== userPlayerId || entry.item_catalog_id !== normalizedItemCatalogId
  ));
}

function toggleSingleDoubleTarget(formType, userPlayerId, targetPlayerId, itemCatalogId) {
  const doubleState = getDoubleStateByFormType(formType);
  const normalizedItemCatalogId = resolveMatchInteractionItemId(itemCatalogId, "single") || LEGACY_MATCH_ITEM_IDS.personal;

  if (!targetPlayerId) {
    clearSingleDoubleTargets(formType, userPlayerId, normalizedItemCatalogId);
    return;
  }

  const isActive = doubleState.singles.some(
    (entry) => entry.user_player_id === userPlayerId
      && entry.target_player_id === targetPlayerId
      && entry.item_catalog_id === normalizedItemCatalogId
  );
  if (isActive) {
    doubleState.singles = doubleState.singles.filter((entry) => !(
      entry.user_player_id === userPlayerId
      && entry.target_player_id === targetPlayerId
      && entry.item_catalog_id === normalizedItemCatalogId
    ));
    return;
  }

  doubleState.singles.push({
    id: `single-${userPlayerId}-${normalizedItemCatalogId}-${targetPlayerId}`,
    item_catalog_id: normalizedItemCatalogId,
    user_player_id: userPlayerId,
    target_player_id: targetPlayerId,
  });
}

function buildTeamDoubleOptionsHtml(formType, team, players, itemEntry) {
  const config = getTeamDoubleConfig(formType, team, itemEntry.id);
  const isCurrentItem = Boolean(config?.targetTeam);
  const allowedRelations = new Set(getItemCatalogAllowedTeamRelations(itemEntry));
  const oppositeTeam = team === "A" ? "B" : "A";
  const optionDefinitions = [
    ...(allowedRelations.has("own_team")
      ? [
        { targetTeam: team, paymentMode: "solo", label: "己方效果 · 单人出资", tone: "own" },
        { targetTeam: team, paymentMode: "split", label: "己方效果 · 平分出资", tone: "own" },
      ]
      : []),
    ...(allowedRelations.has("enemy_team")
      ? [
        { targetTeam: oppositeTeam, paymentMode: "solo", label: "对方效果 · 单人出资", tone: "opp" },
        { targetTeam: oppositeTeam, paymentMode: "split", label: "对方效果 · 平分出资", tone: "opp" },
      ]
      : []),
  ];
  const payerPlayers = isCurrentItem
    ? players.filter((player) => player.team === team)
    : [];
  const modeOptions = optionDefinitions.map((option) => {
    const isActive = isCurrentItem && option.targetTeam === config.targetTeam && option.paymentMode === config.paymentMode;
    const toneClass = option.tone ? ` player-double-option-${option.tone}` : "";
    return `
      <button
        type="button"
        class="player-double-option team-double-mode-option${toneClass}${isActive ? " player-double-option-active" : ""}"
        data-role="team-double-mode"
        data-form-type="${formType}"
        data-team="${team}"
        data-item-id="${itemEntry.id}"
        data-target-team="${option.targetTeam}"
        data-payment-mode="${option.paymentMode}"
      >${option.label}</button>
    `;
  }).join("");

  const payerOptions = isCurrentItem && config.paymentMode === "solo"
    ? payerPlayers.map((player) => `
      <button
        type="button"
        class="player-double-option team-double-payer-option player-double-option-own${player.id === config.userPlayerId ? " player-double-option-active" : ""}"
        data-role="team-double-payer"
        data-form-type="${formType}"
        data-team="${team}"
        data-item-id="${itemEntry.id}"
        data-player-id="${player.id}"
      >${escapeHtml(player.display_name)}</button>
    `).join("")
    : "";

  return `
    <div class="team-double-options-title">
      <span class="match-item-toggle-icon" aria-hidden="true">${escapeHtml(getItemCatalogMatchIcon(itemEntry))}</span>
      <strong>${escapeHtml(itemEntry.name || "未命名道具")}</strong>
    </div>
    <div class="team-double-mode-grid">
      ${modeOptions}
    </div>
    ${isCurrentItem && config.paymentMode === "solo" ? `
      <div class="team-double-payer-block">
        <span>出资人</span>
        <div class="team-double-payer-grid">
          ${payerOptions}
        </div>
      </div>
    ` : ""}
  `;
}

function renderInlineTeamDoubleControls(formType, disabled = false) {
  normalizeDoubleState(formType);
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const slotMap = formType === "backfill"
    ? { A: backfillTeamADoubleSlot, B: backfillTeamBDoubleSlot }
    : { A: matchTeamADoubleSlot, B: matchTeamBDoubleSlot };

  ["A", "B"].forEach((team) => {
    const slot = slotMap[team];
    if (!slot) return;

    const activeItemIds = getTeamDoubleConfigs(formType, team).map((entry) => entry.itemCatalogId).filter(Boolean);
    const itemEntries = getMatchInteractionItems("team", activeItemIds);
    if (!itemEntries.length) {
      slot.innerHTML = "";
      return;
    }

    slot.innerHTML = `
      <div class="match-item-toggle-list match-item-toggle-list-team">
        ${itemEntries.map((itemEntry) => {
          const config = getTeamDoubleConfig(formType, team, itemEntry.id);
          const isActive = Boolean(config?.targetTeam);
          const needsSoloPayerSelection = Boolean(
            isActive && config.paymentMode === "solo" && !config.userPlayerId
          );
          const isOpen = teamDoublePickerOpen[formType][team] === itemEntry.id || needsSoloPayerSelection;
          const sourceToneClass = isActive && config?.targetTeam
            ? ` team-double-toggle-${config.targetTeam === team ? "own" : "opp"}`
            : "";
          const itemName = itemEntry.name || "未命名道具";
          const titleText = isActive
            ? `${team === "A" ? "天辉" : "夜魇"} · ${itemName} · ${getTeamDoubleModeLabel(team, config.targetTeam, config.paymentMode)}`
            : `${team === "A" ? "天辉" : "夜魇"} · ${itemName}`;

          return `
            <div class="match-item-toggle-shell">
              <button
                type="button"
                class="team-double-toggle match-item-toggle${isActive ? " team-double-toggle-active" : ""}${sourceToneClass}"
                data-role="team-double-toggle"
                data-form-type="${formType}"
                data-team="${team}"
                data-item-id="${itemEntry.id}"
                ${disabled ? "disabled" : ""}
                aria-expanded="${String(isOpen)}"
                title="${escapeHtml(titleText)}"
              >
                <span class="match-item-toggle-icon" aria-hidden="true">${escapeHtml(getItemCatalogMatchIcon(itemEntry))}</span>
              </button>
              <div class="team-double-options${isOpen ? " team-double-options-open" : ""}">
                ${buildTeamDoubleOptionsHtml(formType, team, selectedPlayers, itemEntry)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  });
}

function renderDoublePanel(formType) {
  const panel = formType === "backfill" ? backfillDoublePanel : matchDoublePanel;
  if (!panel) return;

  panel.innerHTML = "";
  panel.hidden = true;
}

function buildDoubleDownPayload(formType) {
  normalizeDoubleState(formType);
  const doubleState = getDoubleStateByFormType(formType);
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const teamMap = new Map(selectedPlayers.map((player) => [player.id, player.team]));
  const payload = [];

  ["A", "B"].forEach((sourceTeam) => {
    getTeamDoubleConfigs(formType, sourceTeam).forEach((config) => {
      if (!config?.targetTeam) return;
      const contributorPlayerIds = config.paymentMode === "split"
        ? selectedPlayers.filter((player) => player.team === sourceTeam).map((player) => player.id)
        : [];
      payload.push({
        mode: "team",
        target_team: config.targetTeam,
        source_team: sourceTeam,
        payment_mode: config.paymentMode,
        item_catalog_id: isLegacyMatchInteractionItemId(config.itemCatalogId) ? null : config.itemCatalogId,
        user_player_id: config.paymentMode === "solo"
          ? config.userPlayerId
          : (contributorPlayerIds[0] || null),
        contributor_player_ids: contributorPlayerIds,
      });
    });
  });

  doubleState.singles.forEach((entry) => {
    if (entry.user_player_id && entry.target_player_id) {
      payload.push({
        mode: "single",
        item_catalog_id: isLegacyMatchInteractionItemId(entry.item_catalog_id) ? null : entry.item_catalog_id,
        user_player_id: entry.user_player_id,
        target_player_id: entry.target_player_id,
      });
    }
  });

  const seenTeamKeys = new Set();
  const seenSingleKeys = new Set();

  for (const item of payload) {
    if (item.mode === "team") {
      if (!["A", "B"].includes(item.target_team || "") || !["A", "B"].includes(item.source_team || "")) {
        return { error: "团队道具必须同时指定生效方和出资方。", payload: [] };
      }
      if (!["solo", "split"].includes(item.payment_mode || "")) {
        return { error: "团队道具的付款方式不正确。", payload: [] };
      }
      const itemEntry = getMatchInteractionItemById(item.item_catalog_id || LEGACY_MATCH_ITEM_IDS.team);
      const allowedRelations = new Set(itemEntry ? getItemCatalogAllowedTeamRelations(itemEntry) : []);
      const relationKey = item.source_team === item.target_team ? "own_team" : "enemy_team";
      if (!allowedRelations.has(relationKey)) {
        return { error: "该团队道具不支持当前团队关系。", payload: [] };
      }
      if (item.payment_mode === "solo") {
        if (!teamMap.has(item.user_player_id)) {
          return { error: "团队道具的出资者必须是本场比赛选手。", payload: [] };
        }
        if (teamMap.get(item.user_player_id) !== item.source_team) {
          return { error: "团队道具的单人出资者必须和出资方在同一边。", payload: [] };
        }
      } else {
        const contributorPlayerIds = Array.isArray(item.contributor_player_ids)
          ? item.contributor_player_ids.filter(Boolean)
          : [];
        if (!contributorPlayerIds.length) {
          return { error: "团队道具的平分模式缺少参与选手。", payload: [] };
        }
        if (contributorPlayerIds.some((playerId) => !teamMap.has(playerId) || teamMap.get(playerId) !== item.source_team)) {
          return { error: "团队道具的平分选手必须全部来自出资方。", payload: [] };
        }
      }
      const dedupeKey = `${item.item_catalog_id || ""}:${item.source_team}:${item.target_team}:${item.payment_mode}:${item.user_player_id || ""}:${(item.contributor_player_ids || []).join(",")}`;
      if (seenTeamKeys.has(dedupeKey)) {
        return { error: "同一团队道具不能重复记录。", payload: [] };
      }
      seenTeamKeys.add(dedupeKey);
      continue;
    }

    if (!teamMap.has(item.user_player_id)) {
      return { error: "单人道具的使用者必须是本场比赛选手。", payload: [] };
    }

    if (!teamMap.has(item.target_player_id)) {
      return { error: "单人道具的生效对象必须是本场比赛选手。", payload: [] };
    }

    const itemEntry = getMatchInteractionItemById(item.item_catalog_id || LEGACY_MATCH_ITEM_IDS.personal);
    const allowedRelations = new Set(itemEntry ? getItemCatalogAllowedSingleRelations(itemEntry) : []);
    const relationKey = getSingleRelationKey(item.user_player_id, item.target_player_id, teamMap);
    if (!allowedRelations.has(relationKey)) {
      return { error: "单人道具命中了未配置的生效对象。", payload: [] };
    }

    const dedupeKey = `${item.item_catalog_id || ""}:${item.user_player_id}:${item.target_player_id}`;
    if (seenSingleKeys.has(dedupeKey)) {
      return { error: "同一单人道具不能重复记录到同一目标。", payload: [] };
    }
    seenSingleKeys.add(dedupeKey);
  }

  return { error: "", payload };
}

function syncTeamSelections(state, players, assignments = {}, kdaAssignments = {}) {
  const playerIds = new Set(players.map((player) => player.id));
  state.teamA = state.teamA.filter((playerId) => playerIds.has(playerId));
  state.teamB = state.teamB.filter(
    (playerId) => playerIds.has(playerId) && !state.teamA.includes(playerId)
  );

  Object.keys(assignments).forEach((playerId) => {
    if (!state.teamA.includes(playerId) && !state.teamB.includes(playerId)) {
      delete assignments[playerId];
    }
  });

  Object.keys(kdaAssignments).forEach((playerId) => {
    if (!state.teamA.includes(playerId) && !state.teamB.includes(playerId)) {
      delete kdaAssignments[playerId];
    }
  });
}

function getSelectableBackfillPlayersForField(currentValue) {
  const selected = new Set(getSelectedBackfillPlayerIds());
  if (currentValue) {
    selected.delete(currentValue);
  }

  return backfillPlayers.filter((player) => !selected.has(player.id) || player.id === currentValue);
}

function buildHeroBadge(heroName) {
  return heroName
    ? `<span class="match-picked-hero">${escapeHtml(getHeroDisplayName(heroName))}</span>`
    : '<span class="muted">未选英雄</span>';
}

function normalizeKdaValue(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const numericValue = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(numericValue) || numericValue < 0) return null;
  return numericValue;
}

function normalizeKdaEntry(entry = {}) {
  return {
    kills: normalizeKdaValue(entry.kills),
    deaths: normalizeKdaValue(entry.deaths),
    assists: normalizeKdaValue(entry.assists),
  };
}

function hasKdaEntryValue(entry = {}) {
  const normalized = normalizeKdaEntry(entry);
  return normalized.kills !== null || normalized.deaths !== null || normalized.assists !== null;
}

function getKdaAssignmentsByFormType(formType) {
  return formType === "backfill" ? backfillKdaAssignments : matchKdaAssignments;
}

function getPlayerKdaEntry(formType, playerId) {
  const assignments = getKdaAssignmentsByFormType(formType);
  return normalizeKdaEntry(assignments[playerId] || {});
}

function setPlayerKdaField(formType, playerId, field, value) {
  if (!playerId || !["kills", "deaths", "assists"].includes(field)) return;
  const assignments = getKdaAssignmentsByFormType(formType);
  const nextEntry = {
    ...(assignments[playerId] || {}),
    [field]: normalizeKdaValue(value),
  };

  if (hasKdaEntryValue(nextEntry)) {
    assignments[playerId] = normalizeKdaEntry(nextEntry);
  } else {
    delete assignments[playerId];
  }
}

function buildPlayerKdaInputsHtml(formType, playerId) {
  const entry = getPlayerKdaEntry(formType, playerId);
  const buildInput = (field, label) => `
    <label class="player-kda-chip" title="${label}">
      <span>${label}</span>
      <input
        type="number"
        min="0"
        step="1"
        inputmode="numeric"
        class="player-kda-input"
        data-role="player-kda-input"
        data-form-type="${formType}"
        data-player-id="${playerId}"
        data-kda-field="${field}"
        value="${entry[field] ?? ""}"
        placeholder="-"
      />
    </label>
  `;

  return `
    <div class="player-kda-row">
      ${buildInput("kills", "K")}
      ${buildInput("deaths", "D")}
      ${buildInput("assists", "A")}
    </div>
  `;
}

function buildPlayerKdaSummaryHtml(entry = {}) {
  const normalized = normalizeKdaEntry(entry);
  if (!hasKdaEntryValue(normalized)) return "";
  const getDisplayValue = (value) => (value === null ? "-" : String(value));
  return `<span class="match-player-kda-badge">KDA ${getDisplayValue(normalized.kills)}/${getDisplayValue(normalized.deaths)}/${getDisplayValue(normalized.assists)}</span>`;
}

function buildMatchPlayerScoreDeltaHtml(entry = {}) {
  const delta = Number(entry?.score_change ?? 0);
  if (!Number.isFinite(delta)) {
    return '<span class="match-player-score-delta-badge match-player-score-delta-neutral">0</span>';
  }
  const toneClass = delta > 0
    ? "match-player-score-delta-positive"
    : (delta < 0 ? "match-player-score-delta-negative" : "match-player-score-delta-neutral");
  return `<span class="match-player-score-delta-badge ${toneClass}">${escapeHtml(formatScore(Math.abs(delta)))}</span>`;
}

function buildSingleDoubleOptionsHtml(formType, player, allSelectedPlayers, itemEntry) {
  const { teamMap } = getSelectedPlayersWithTeams(formType);
  const currentTargetIds = new Set(getSingleDoubleTargetsByUserAndItem(formType, player.id, itemEntry.id));
  const options = getOrderedSingleDoubleCandidates(player, allSelectedPlayers, teamMap, itemEntry);

  return options.map((candidate) => {
    const isActive = currentTargetIds.has(candidate.id);
    const relationKey = getSingleRelationKey(player.id, candidate.id, teamMap);
    const relationLabel = relationKey === "ally"
      ? "队友"
      : (relationKey === "opponent" ? "对手" : "自己");
    const label = candidate.id === player.id
      ? "自己"
      : `${candidate.display_name} · ${relationLabel}`;
    return `
      <button
        type="button"
        class="player-double-option${isActive ? " player-double-option-active" : ""}"
        data-role="player-double-target"
        data-form-type="${formType}"
        data-user-player-id="${player.id}"
        data-item-id="${itemEntry.id}"
        data-target-player-id="${candidate.id}"
      >${escapeHtml(label)}</button>
    `;
  }).join("");
}

function renderTeamSelectionUI({
  players,
  selections,
  assignments,
  kdaAssignments,
  teamAContainer,
  teamBContainer,
  formType,
}) {
  normalizeDoubleState(formType);
  syncTeamSelections(selections, players, assignments, kdaAssignments);
  const groupedPlayers = [
    ...buildPlayerRankGroups(players).filter((group) => group.players.length),
    {
      title: "未分组",
      players: players.filter((player) => !normalizeSeasonRankNo(player.player_rank)),
    },
  ].filter((group) => group.players.length);
  [
    { container: teamAContainer, teamKey: "teamA", title: "天辉方已选" },
    { container: teamBContainer, teamKey: "teamB", title: "夜魇方已选" },
  ].forEach(({ container, teamKey, title }) => {
    const oppositeTeamKey = teamKey === "teamA" ? "teamB" : "teamA";
    const selectedIds = new Set(selections[teamKey]);
    const oppositeIds = new Set(selections[oppositeTeamKey]);
    const selectedPlayers = getPlayersInSelectionOrder(selections[teamKey], players);
    const summaryHtml = selectedPlayers.length
      ? selectedPlayers.map((player) => {
        const activeItemIds = getDoubleStateByFormType(formType).singles
          .filter((entry) => entry.user_player_id === player.id)
          .map((entry) => entry.item_catalog_id)
          .filter(Boolean);
        const personalItems = getMatchInteractionItems("single", activeItemIds);
        const optionsHtml = personalItems.map((itemEntry) => {
          const isOpen = singleDoublePickerOpen[formType][player.id] === itemEntry.id;
          if (isSelfOnlySingleRelationItem(itemEntry)) return "";
          return `
            <div class="player-double-options${isOpen ? " player-double-options-open" : ""}">
              ${buildSingleDoubleOptionsHtml(formType, player, getSelectedPlayersByFormType(formType), itemEntry)}
            </div>
          `;
        }).join("");

        return `
          <div class="match-picked-player-row">
            <div class="match-picked-player-row-main">
              <span class="match-picked-player-name">${escapeHtml(player.display_name)}</span>
              ${personalItems.length ? `
                <div class="match-item-toggle-list match-item-toggle-list-player">
                  ${personalItems.map((itemEntry) => {
                    const activeCount = getSingleDoubleTargetsByUserAndItem(formType, player.id, itemEntry.id).length;
                    const isSelfOnly = isSelfOnlySingleRelationItem(itemEntry);
                    const isOpen = !isSelfOnly && singleDoublePickerOpen[formType][player.id] === itemEntry.id;
                    return `
                      <button
                        type="button"
                        class="player-double-toggle match-item-toggle${activeCount ? " player-double-toggle-active" : ""}"
                        data-role="player-double-toggle"
                        data-form-type="${formType}"
                        data-player-id="${player.id}"
                        data-item-id="${itemEntry.id}"
                        aria-expanded="${String(isOpen)}"
                        title="${escapeHtml(`${itemEntry.name || "未命名道具"}${isSelfOnly ? " · 点击直接切换" : ""}`)}"
                      >
                        <span class="match-item-toggle-icon" aria-hidden="true">${escapeHtml(getItemCatalogMatchIcon(itemEntry))}</span>
                        ${activeCount ? `<span class="match-item-toggle-count">${escapeHtml(String(activeCount))}</span>` : ""}
                      </button>
                    `;
                  }).join("")}
                </div>
              ` : ""}
            </div>
            ${optionsHtml}
          </div>
        `;
      }).join("")
      : '<span class="muted">尚未选择队员</span>';

    container.innerHTML = `
      <div class="match-team-summary">
        <span class="queue-slot">${title} ${selectedPlayers.length}/${TEAM_SIZE}</span>
        <div class="match-picked-list">${summaryHtml}</div>
      </div>
      <div class="match-player-pool"></div>
    `;

    const pool = container.querySelector(".match-player-pool");
    groupedPlayers.forEach((group) => {
      const groupEl = document.createElement("section");
      groupEl.className = "match-player-group";
      groupEl.innerHTML = `
        <div class="match-player-group-head">
          <span>${group.title}</span>
          <span class="muted">${group.players.length} 人</span>
        </div>
        <div class="match-player-group-grid"></div>
      `;

      const grid = groupEl.querySelector(".match-player-group-grid");
      group.players.forEach((player) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "match-player-chip";
        chip.dataset.team = teamKey;
        chip.dataset.formType = formType;
        chip.dataset.playerId = player.id;
        chip.textContent = player.display_name;

        if (selectedIds.has(player.id)) {
          chip.classList.add("match-player-chip-selected");
        } else if (oppositeIds.has(player.id)) {
          chip.classList.add("match-player-chip-disabled");
          chip.disabled = true;
        } else if (selections[teamKey].length >= TEAM_SIZE) {
          chip.classList.add("match-player-chip-disabled");
          chip.disabled = true;
        }

        grid.appendChild(chip);
      });

      pool.appendChild(groupEl);
    });
  });
}

function refreshMatchSelectOptions() {
  renderTeamSelectionUI({
    players: getMatchRecordingPlayers(),
    selections: matchTeamSelections,
    assignments: matchHeroAssignments,
    kdaAssignments: matchKdaAssignments,
    teamAContainer: teamAFields,
    teamBContainer: teamBFields,
    formType: "match",
  });
}

function refreshBackfillSelectOptions() {
  renderTeamSelectionUI({
    players: backfillPlayers,
    selections: backfillTeamSelections,
    assignments: backfillHeroAssignments,
    kdaAssignments: backfillKdaAssignments,
    teamAContainer: backfillTeamAFields,
    teamBContainer: backfillTeamBFields,
    formType: "backfill",
  });
}

function renderMatchPlayerFields(container, prefix) {
  container.innerHTML = "";

  for (let i = 0; i < TEAM_SIZE; i += 1) {
    const select = document.createElement("select");
    select.id = `${prefix}Player${i + 1}`;
    select.dataset.team = prefix;
    select.dataset.slot = String(i + 1);
    container.appendChild(select);
  }
}

function renderBackfillPlayerFields() {
  renderMatchPlayerFields(backfillTeamAFields, "backfillTeamA");
  renderMatchPlayerFields(backfillTeamBFields, "backfillTeamB");
}

function updateSeasonInfo() {
  if (seasonToggleBtn) {
    seasonToggleBtn.textContent = copyText("header.seasonToggleLoading", "赛季选手");
  }
  renderBrandMonthBadge();
  seasonPanelTitle.textContent = copyText("seasonPlayers.title", "赛季选手");
  renderRankLabelEditors();
  renderSeasonRolloverAction();
  syncSeasonRuleControls();
}

function normalizeSeasonMeta(season) {
  if (!season) return null;
  return {
    ...season,
    is_active: season.status === "active",
    start_date: season.start_at ? String(season.start_at).slice(0, 10) : "",
    end_date: season.end_at ? String(season.end_at).slice(0, 10) : "",
  };
}

function syncUpdatedSeasonMeta(updatedSeason) {
  const normalized = normalizeSeasonMeta(updatedSeason);
  if (!normalized?.id) return;

  if (activeSeason?.id === normalized.id) {
    activeSeason = normalized;
    updateSeasonInfo();
  }

  const currentSeasons = allSeasons || [];
  const hasExisting = currentSeasons.some((season) => season.id === normalized.id);
  allSeasons = hasExisting
    ? currentSeasons.map((season) => (season.id === normalized.id ? normalized : season))
    : [normalized, ...currentSeasons];

  renderSeasonPlayersPanel();
  renderMatchForm();
  renderBackfillForm();
  renderRankLabelEditors();
  syncSeasonRuleControls();
}

function syncSeasonRuleControls() {
  const canManage = isCurrentRoleScorer();
  const hasSeason = Boolean(activeSeason?.id);
  const disabled = !canManage || !hasSeason;
  const winPoints = hasSeason ? String(getSeasonWinPoints()) : "";
  const lossPoints = hasSeason ? String(getSeasonLossPoints()) : "";
  const powerGapStep = hasSeason ? String(getSeasonPowerGapStep()) : "";
  const powerGapDelta = hasSeason ? String(getSeasonPowerGapDelta()) : "";
  const exhibitionWinPoints = hasSeason ? String(getSeasonWinPoints(activeSeason.id, "exhibition")) : "";
  const exhibitionLossPoints = hasSeason ? String(getSeasonLossPoints(activeSeason.id, "exhibition")) : "";
  const exhibitionPowerGapStep = hasSeason ? String(getSeasonPowerGapStep(activeSeason.id, "exhibition")) : "";
  const exhibitionPowerGapDelta = hasSeason ? String(getSeasonPowerGapDelta(activeSeason.id, "exhibition")) : "";

  if (adminSeasonInitialScoreInput) {
    adminSeasonInitialScoreInput.disabled = !isCurrentRoleAdmin() || !hasSeason;
    adminSeasonInitialScoreInput.value = hasSeason ? String(getSeasonInitialScore()) : "";
  }
  if (adminSaveSeasonInitialScoreBtn) {
    adminSaveSeasonInitialScoreBtn.disabled = !isCurrentRoleAdmin() || !hasSeason;
  }
  if (scorerSeasonInitialScoreInput) {
    scorerSeasonInitialScoreInput.disabled = disabled;
    scorerSeasonInitialScoreInput.value = hasSeason ? String(getSeasonInitialScore()) : "";
  }
  if (scorerSaveSeasonInitialScoreBtn) {
    scorerSaveSeasonInitialScoreBtn.disabled = disabled;
  }
  if (adminSeasonWinPointsInput) {
    adminSeasonWinPointsInput.disabled = disabled;
    adminSeasonWinPointsInput.value = winPoints;
  }
  if (adminSeasonLossPointsInput) {
    adminSeasonLossPointsInput.disabled = disabled;
    adminSeasonLossPointsInput.value = lossPoints;
  }
  if (adminSeasonPowerGapStepInput) {
    adminSeasonPowerGapStepInput.disabled = disabled;
    adminSeasonPowerGapStepInput.value = powerGapStep;
  }
  if (adminSeasonPowerGapDeltaInput) {
    adminSeasonPowerGapDeltaInput.disabled = disabled;
    adminSeasonPowerGapDeltaInput.value = powerGapDelta;
  }
  if (adminSaveSeasonMatchPointsBtn) {
    adminSaveSeasonMatchPointsBtn.disabled = disabled;
  }
  if (adminSeasonExhibitionWinPointsInput) {
    adminSeasonExhibitionWinPointsInput.disabled = disabled;
    adminSeasonExhibitionWinPointsInput.value = exhibitionWinPoints;
  }
  if (adminSeasonExhibitionLossPointsInput) {
    adminSeasonExhibitionLossPointsInput.disabled = disabled;
    adminSeasonExhibitionLossPointsInput.value = exhibitionLossPoints;
  }
  if (adminSeasonExhibitionPowerGapStepInput) {
    adminSeasonExhibitionPowerGapStepInput.disabled = disabled;
    adminSeasonExhibitionPowerGapStepInput.value = exhibitionPowerGapStep;
  }
  if (adminSeasonExhibitionPowerGapDeltaInput) {
    adminSeasonExhibitionPowerGapDeltaInput.disabled = disabled;
    adminSeasonExhibitionPowerGapDeltaInput.value = exhibitionPowerGapDelta;
  }
  if (adminSaveSeasonExhibitionMatchPointsBtn) {
    adminSaveSeasonExhibitionMatchPointsBtn.disabled = disabled;
  }
  if (scorerSeasonWinPointsInput) {
    scorerSeasonWinPointsInput.disabled = disabled;
    scorerSeasonWinPointsInput.value = winPoints;
  }
  if (scorerSeasonLossPointsInput) {
    scorerSeasonLossPointsInput.disabled = disabled;
    scorerSeasonLossPointsInput.value = lossPoints;
  }
  if (scorerSeasonPowerGapStepInput) {
    scorerSeasonPowerGapStepInput.disabled = disabled;
    scorerSeasonPowerGapStepInput.value = powerGapStep;
  }
  if (scorerSeasonPowerGapDeltaInput) {
    scorerSeasonPowerGapDeltaInput.disabled = disabled;
    scorerSeasonPowerGapDeltaInput.value = powerGapDelta;
  }
  if (scorerSaveSeasonMatchPointsBtn) {
    scorerSaveSeasonMatchPointsBtn.disabled = disabled;
  }
  if (scorerSeasonExhibitionWinPointsInput) {
    scorerSeasonExhibitionWinPointsInput.disabled = disabled;
    scorerSeasonExhibitionWinPointsInput.value = exhibitionWinPoints;
  }
  if (scorerSeasonExhibitionLossPointsInput) {
    scorerSeasonExhibitionLossPointsInput.disabled = disabled;
    scorerSeasonExhibitionLossPointsInput.value = exhibitionLossPoints;
  }
  if (scorerSeasonExhibitionPowerGapStepInput) {
    scorerSeasonExhibitionPowerGapStepInput.disabled = disabled;
    scorerSeasonExhibitionPowerGapStepInput.value = exhibitionPowerGapStep;
  }
  if (scorerSeasonExhibitionPowerGapDeltaInput) {
    scorerSeasonExhibitionPowerGapDeltaInput.disabled = disabled;
    scorerSeasonExhibitionPowerGapDeltaInput.value = exhibitionPowerGapDelta;
  }
  if (scorerSaveSeasonExhibitionMatchPointsBtn) {
    scorerSaveSeasonExhibitionMatchPointsBtn.disabled = disabled;
  }
}

function updateSeasonRewardTotal(total) {
  if (total == null) {
    seasonRewardTotal.textContent = "本赛季赞助总额：--";
    seasonRewardTotal.className = "season-total reward-glow-tier-base";
    return;
  }

  seasonRewardTotal.className = `season-total reward-glow-tier-${getRewardGlowTier(total)}`;
  seasonRewardTotal.textContent = `本赛季赞助总额：${formatScore(total)}`;
}

function refreshSeasonRewardTotal() {
  updateSeasonRewardTotal(seasonPlayerRewardTotal + externalRewardTotal);
}

function isSignupFeeRewardLog(log) {
  return String(log?.category || "").trim() === "signup_fee";
}

function syncSeasonSignupFeePaidStateFromLogs(logs = rewardLogs) {
  seasonSignupFeePaidPlayerIds = new Set(
    (Array.isArray(logs) ? logs : [])
      .filter((log) => isSignupFeeRewardLog(log) && log?.player_id && !log?.is_cancelled)
      .map((log) => String(log.player_id).trim())
      .filter(Boolean)
  );
}

async function migrateStoredSignupFeePaidStateToDatabase() {
  if (!activeSeason?.id || !isCurrentRoleAdmin()) {
    return;
  }

  const storedPlayerIds = readStoredSignupFeePaidPlayerIds(activeSeason.id)
    .filter((playerId) => seasonPlayers.some((player) => player.id === playerId && player.is_in_season));
  if (!storedPlayerIds.length) {
    return;
  }

  const rows = storedPlayerIds
    .map((playerId) => {
      const player = seasonPlayers.find((item) => item.id === playerId) || allPlayersDirectory.find((item) => item.id === playerId);
      const sourceKey = getSignupFeeDonationSourceKey(activeSeason.id, playerId);
      if (!player || !sourceKey) {
        return null;
      }
      return {
        season_id: activeSeason.id,
        source_key: sourceKey,
        donor_name: player.display_name || "未知选手",
        player_id: playerId,
        amount: SEASON_BASE_SPONSOR_AMOUNT,
        category: "signup_fee",
        note: activeSeason?.name ? `${activeSeason.name} 基础赞助确认` : "基础赞助确认",
        is_outside: false,
        is_public: true,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    writeStoredSignupFeePaidPlayerIds(activeSeason.id, []);
    return;
  }

  const { error } = await db.from("reward_donations").upsert(rows, {
    onConflict: "source_key",
  });

  if (error) {
    console.error("迁移本地基础赞助确认记录失败：", error);
    return;
  }

  writeStoredSignupFeePaidPlayerIds(activeSeason.id, []);
}

function syncSeasonRewardTotalFromSummary(summary = null) {
  const rewardSummary = Array.isArray(summary) ? summary : buildSeasonRewardSummary();
  if (!Array.isArray(rewardSummary)) {
    seasonPlayerRewardTotal = 0;
    externalRewardTotal = 0;
    return false;
  }

  const summaryPlayerIds = new Set(
    rewardSummary
      .map((player) => player?.id || "")
      .filter(Boolean)
  );

  seasonPlayerRewardTotal = rewardSummary.reduce(
    (sum, player) => sum + Math.max(Number(player?.total ?? 0), 0),
    0
  );
  externalRewardTotal = rewardLogs.reduce((sum, log) => {
    const playerId = log?.player_id || "";
    if (playerId && summaryPlayerIds.has(playerId)) {
      return sum;
    }
    return sum + Math.max(Number(log?.amount ?? 0), 0);
  }, 0);

  return rewardSummary.length > 0;
}

function syncSeasonRewardTotalFromStats(rows = [], options = {}) {
  if (!Array.isArray(rows) || !rows.length) return false;

  const baseTotal = rows.reduce((sum, row) => (
    sum
    + 20
    + Number(row?.reward_floor_bonus ?? 0)
    + Number(row?.reward_extra_points ?? 0)
  ), 0);

  const doubleDownTotal = Array.isArray(options.doubleDownRows)
    ? options.doubleDownRows.reduce((sum, row) => sum + Math.max(Number(row?.cost_amount ?? 0), 0), 0)
    : rows.reduce((sum, row) => sum + Math.max(Number(row?.reward_double_bonus ?? 0), 0), 0);

  seasonPlayerRewardTotal = baseTotal + doubleDownTotal;
  return true;
}

const REWARD_CATEGORY_CONFIG = {
  signup_fee: { label: "基础赞助", tone: "base", order: 10 },
  team_card: { label: "团队道具", tone: "card", order: 20 },
  single_card: { label: "个人道具", tone: "card", order: 30 },
  extra_donation: { label: "额外赞助", tone: "extra", order: 40 },
  misc_item: { label: "其它道具", tone: "misc", order: 50 },
};

function getRewardCategoryConfig(kind) {
  return REWARD_CATEGORY_CONFIG[kind] || REWARD_CATEGORY_CONFIG.misc_item;
}

function parseRewardCountFromNote(note) {
  const match = String(note || "").match(/[×x]\s*(-?\d+(?:\.\d+)?)/u);
  if (!match) return 1;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeRewardNoteLabel(note) {
  return String(note || "")
    .replace(/^道具购买\s*·\s*/u, "")
    .trim();
}

function trimRewardCountSuffix(note) {
  return normalizeRewardNoteLabel(note)
    .replace(/\s*[×x]\s*-?\d+(?:\.\d+)?(?:（[^）]*）)?\s*$/u, "")
    .trim();
}

function buildRewardLogSummaryEntry(log) {
  const amount = Number(log?.amount ?? 0);
  if (!log?.player_id || log?.is_cancelled || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (isSignupFeeRewardLog(log)) {
    return null;
  }

  const note = String(log.note || "").trim();
  const normalizedNote = normalizeRewardNoteLabel(note);

  if (log.category === "card") {
    return {
      kind: note.includes("团队") ? "team_card" : "single_card",
      amount,
      count: 1,
    };
  }

  if (log.category === "extra") {
    return {
      kind: "extra_donation",
      amount,
      count: 1,
    };
  }

  if (log.category === "misc") {
    return {
      kind: "misc_item",
      amount,
      count: normalizedNote ? parseRewardCountFromNote(normalizedNote) : 1,
      label: trimRewardCountSuffix(normalizedNote) || getRewardCategoryConfig("misc_item").label,
    };
  }

  return {
    kind: "misc_item",
    amount,
    count: 1,
    label: normalizedNote || getRewardCategoryConfig("misc_item").label,
  };
}

function getRewardLogBadgeText(log) {
  if (!log?.player_id) {
    return "场外赞助";
  }

  if (isSignupFeeRewardLog(log)) {
    return "基础赞助";
  }

  const note = String(log.note || "").trim();
  const normalizedNote = normalizeRewardNoteLabel(note);

  if (log.category === "extra") {
    return "额外赞助";
  }

  if (log.category === "card") {
    return note.includes("团队") ? "团队道具" : "个人道具";
  }

  if (log.category === "misc") {
    return trimRewardCountSuffix(normalizedNote) || "其它道具";
  }

  return normalizedNote || "赞助记录";
}

function canCancelRewardLog(log) {
  return log?.category === "extra" && !log?.source_key;
}

function shouldHideRewardLogInDetails(log) {
  if (!log) return true;
  if (isSignupFeeRewardLog(log)) return true;
  if (log.category === "card" || log.category === "misc") return true;
  return String(log.source_key || "").startsWith("item_purchase:");
}

function appendRewardCategory(categories, entry) {
  const amount = Number(entry?.amount ?? 0);
  const allowZeroAmount = entry?.kind === "signup_fee" && Number(entry?.expected_amount ?? 0) > 0;
  if (!Number.isFinite(amount) || (amount <= 0 && !allowZeroAmount)) return;

  const resolvedLabel = entry.label || getRewardCategoryConfig(entry.kind).label;
  const count = Math.max(Number(entry.count ?? 0), 0);
  const existing = categories.find(
    (item) => item.kind === entry.kind && (item.label || getRewardCategoryConfig(item.kind).label) === resolvedLabel
  );

  if (existing) {
    existing.amount += amount;
    existing.count = Math.max(Number(existing.count ?? 0), 0) + count;
    return;
  }

  categories.push({
    ...entry,
    amount,
    count,
    label: resolvedLabel,
  });
}

function getSeasonRewardPlayerMap() {
  const playerMap = new Map();

  seasonPlayers
    .filter((player) => player.is_in_season)
    .forEach((player) => {
      playerMap.set(player.id, {
        id: player.id,
        display_name: player.display_name,
        reward_floor_bonus: Number(player.reward_floor_bonus ?? 0),
        reward_double_bonus: Number(player.reward_double_bonus ?? 0),
        reward_extra_points: Number(player.reward_extra_points ?? 0),
      });
    });

  leaderboardPlayers.forEach((player) => {
    const playerId = player.player_id || player.id;
    if (!playerId) return;
    const current = playerMap.get(playerId) || {
      id: playerId,
      display_name: player.display_name || "未知选手",
      reward_floor_bonus: 0,
      reward_double_bonus: 0,
      reward_extra_points: 0,
    };
    playerMap.set(playerId, {
      ...current,
      display_name: player.display_name || current.display_name,
      reward_floor_bonus: Number(player.reward_floor_bonus ?? current.reward_floor_bonus ?? 0),
      reward_double_bonus: Number(player.reward_double_bonus ?? current.reward_double_bonus ?? 0),
      reward_extra_points: Number(player.reward_extra_points ?? current.reward_extra_points ?? 0),
    });
  });

  return playerMap;
}

function resetRewardSummarySortSnapshot() {
  rewardLogsLoadedSeasonId = "";
  rewardSummarySortSnapshot = {
    seasonId: "",
    orderByPlayerId: new Map(),
  };
}

function getRewardSummaryLeaderboardRank(player) {
  const playerId = player?.id || player?.player_id || "";
  if (!playerId) return -1;
  return leaderboardPlayers.findIndex((leaderboardPlayer) => (
    (leaderboardPlayer.player_id || leaderboardPlayer.id) === playerId
  ));
}

function compareRewardSummaryByCurrentTotals(a, b) {
  if (b.total !== a.total) {
    return b.total - a.total;
  }

  const leaderboardRankA = getRewardSummaryLeaderboardRank(a);
  const leaderboardRankB = getRewardSummaryLeaderboardRank(b);
  if (leaderboardRankA !== -1 || leaderboardRankB !== -1) {
    if (leaderboardRankA === -1) return 1;
    if (leaderboardRankB === -1) return -1;
    if (leaderboardRankA !== leaderboardRankB) {
      return leaderboardRankA - leaderboardRankB;
    }
  }

  return String(a.display_name || "").localeCompare(String(b.display_name || ""), "zh-CN");
}

function ensureRewardSummarySortSnapshot(summary) {
  const seasonId = activeSeason?.id || "";
  if (!seasonId || rewardLogsLoadedSeasonId !== seasonId) {
    return null;
  }

  if (
    rewardSummarySortSnapshot.seasonId === seasonId
    && rewardSummarySortSnapshot.orderByPlayerId.size
  ) {
    return rewardSummarySortSnapshot;
  }

  const orderedSummary = [...summary]
    .map((player, index) => ({ player, index }))
    .sort((a, b) => compareRewardSummaryByCurrentTotals(a.player, b.player) || a.index - b.index);

  rewardSummarySortSnapshot = {
    seasonId,
    orderByPlayerId: new Map(
      orderedSummary.map(({ player }, index) => [player.id, index])
    ),
  };

  return rewardSummarySortSnapshot;
}

function sortSeasonRewardSummary(summary) {
  const snapshot = ensureRewardSummarySortSnapshot(summary);
  if (!snapshot) {
    return [...summary].sort(compareRewardSummaryByCurrentTotals);
  }

  return [...summary]
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const hasOrderA = snapshot.orderByPlayerId.has(a.player.id);
      const hasOrderB = snapshot.orderByPlayerId.has(b.player.id);
      const orderA = hasOrderA ? snapshot.orderByPlayerId.get(a.player.id) : Number.POSITIVE_INFINITY;
      const orderB = hasOrderB ? snapshot.orderByPlayerId.get(b.player.id) : Number.POSITIVE_INFINITY;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      if (!hasOrderA && !hasOrderB) {
        return compareRewardSummaryByCurrentTotals(a.player, b.player) || a.index - b.index;
      }

      return a.index - b.index;
    })
    .map(({ player }) => player);
}

function buildSeasonRewardSummary() {
  if (!activeSeason?.id) {
    return [];
  }

  const playerMap = getSeasonRewardPlayerMap();
  const rewardLogSummary = new Map();

  rewardLogs.forEach((log) => {
    const entry = buildRewardLogSummaryEntry(log);
    if (!entry) return;
    const categories = rewardLogSummary.get(log.player_id) || [];
    appendRewardCategory(categories, entry);
    rewardLogSummary.set(log.player_id, categories);
  });

  const summary = [...playerMap.values()]
    .map((player) => {
      const categories = [];
      const loggedCategories = rewardLogSummary.get(player.id) || [];
      const loggedCardAmount = loggedCategories.reduce((sum, entry) => (
        entry.kind === "team_card" || entry.kind === "single_card"
          ? sum + Number(entry.amount ?? 0)
          : sum
      ), 0);
      const loggedExtraAmount = loggedCategories.reduce((sum, entry) => (
        entry.kind === "extra_donation"
          ? sum + Number(entry.amount ?? 0)
          : sum
      ), 0);
      const loggedMiscAmount = loggedCategories.reduce((sum, entry) => (
        entry.kind === "misc_item"
          ? sum + Number(entry.amount ?? 0)
          : sum
      ), 0);

      const isSignupFeePaid = seasonSignupFeePaidPlayerIds.has(player.id);
      appendRewardCategory(categories, {
        kind: "signup_fee",
        amount: isSignupFeePaid ? SEASON_BASE_SPONSOR_AMOUNT : 0,
        count: 1,
        is_paid: isSignupFeePaid,
        expected_amount: SEASON_BASE_SPONSOR_AMOUNT,
      });

      loggedCategories.forEach((entry) => appendRewardCategory(categories, entry));

      const fallbackCardAmount = Math.max(Number(player.reward_double_bonus ?? 0) - loggedCardAmount, 0);
      if (fallbackCardAmount > 0) {
        appendRewardCategory(categories, {
          kind: "misc_item",
          amount: fallbackCardAmount,
          count: 1,
          label: "其它积分卡",
        });
      }

      const fallbackMiscAmount = Math.max(Number(player.reward_floor_bonus ?? 0) - loggedMiscAmount, 0);
      if (fallbackMiscAmount > 0) {
        appendRewardCategory(categories, {
          kind: "misc_item",
          amount: fallbackMiscAmount,
          count: 1,
          label: "其它道具",
        });
      }

      const fallbackExtraAmount = Math.max(Number(player.reward_extra_points ?? 0) - loggedExtraAmount, 0);
      if (fallbackExtraAmount > 0) {
        appendRewardCategory(categories, {
          kind: "extra_donation",
          amount: fallbackExtraAmount,
          count: 1,
        });
      }

      const total = categories.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
      return {
        ...player,
        categories: categories.sort(
          (a, b) => getRewardCategoryConfig(a.kind).order - getRewardCategoryConfig(b.kind).order
        ),
        total,
      };
    });

  return sortSeasonRewardSummary(summary);
}

function buildRewardCategoryLineHtml(item, playerId = "") {
  const config = getRewardCategoryConfig(item.kind);
  const label = item.label || config.label;
  const numericCount = Number(item.count ?? 0);
  const metaText = Number.isFinite(numericCount) && Math.abs(numericCount - 1) > 0.0001
    ? ` · ${formatScore(numericCount)} 次`
    : "";
  const isSignupFee = item.kind === "signup_fee" && playerId;
  const isPaid = Boolean(item.is_paid) || (isSignupFee && seasonSignupFeePaidPlayerIds.has(playerId));
  const expectedAmount = Number(item.expected_amount ?? item.amount ?? 0);
  const signupFeeStateHtml = isSignupFee
    ? (
      isCurrentRoleAdmin()
        ? `
          <button
            type="button"
            class="button-secondary reward-signup-fee-toggle-btn${isPaid ? " reward-signup-fee-toggle-btn-active" : ""}"
            data-role="signup-fee-paid-toggle"
            data-player-id="${escapeHtml(playerId)}"
            aria-pressed="${isPaid ? "true" : "false"}"
            aria-label="${escapeHtml(copyText("rewards.signupFeePaidToggle", "确认"))}"
            title="${escapeHtml(copyText("rewards.signupFeePaidToggle", "确认"))}"
          ></button>
        `
        : (isPaid
          ? `<span class="reward-signup-fee-paid-badge" aria-label="${escapeHtml(copyText("rewards.signupFeePaidBadge", "已确认"))}" title="${escapeHtml(copyText("rewards.signupFeePaidBadge", "已确认"))}"></span>`
          : "")
    )
    : "";
  const valueText = isSignupFee && !isPaid
    ? `待确认 ${expectedAmount > 0 ? formatScore(expectedAmount) : ""}`.trim()
    : `+${formatScore(item.amount)}${metaText}`;
  return `
    <div class="reward-category-line reward-category-line-${config.tone}${isPaid ? " reward-category-line-paid" : ""}">
      <div class="reward-category-name-wrap">
        <span class="reward-category-name reward-category-name-${config.tone}">${escapeHtml(label)}</span>
        ${signupFeeStateHtml}
      </div>
      <span class="reward-category-value reward-category-value-${config.tone}">${escapeHtml(valueText)}</span>
    </div>
  `;
}

function renderRewardPlayerPicker() {
  if (!rewardPlayerPicker) return;

  const allRewardPlayers = [...seasonPlayers].sort((a, b) => {
    if (a.is_in_season !== b.is_in_season) {
      return a.is_in_season ? -1 : 1;
    }
    return a.display_name.localeCompare(b.display_name, "zh-CN");
  });

  if (rewardSelectedPlayerId && !allRewardPlayers.some((player) => player.id === rewardSelectedPlayerId)) {
    rewardSelectedPlayerId = "";
  }

  if (!allRewardPlayers.length) {
    rewardPlayerPicker.innerHTML = '<p class="muted">暂无可选选手</p>';
    return;
  }

  const groups = [
    { title: "赛季选手", players: allRewardPlayers.filter((player) => player.is_in_season), empty: "暂无赛季选手" },
    { title: "未参赛选手", players: allRewardPlayers.filter((player) => !player.is_in_season), empty: "暂无未参赛选手" },
  ];

  rewardPlayerPicker.innerHTML = groups.map((group) => `
    <section class="reward-player-group">
      <div class="reward-player-group-head">
        <h3>${group.title}</h3>
        <span class="season-rank-count">${group.players.length} 人</span>
      </div>
      ${group.players.length ? `
        <div class="reward-player-chip-list">
          ${group.players.map((player) => `
            <button
              type="button"
              class="manual-score-player-chip reward-player-chip${rewardSelectedPlayerId === player.id ? " manual-score-player-chip-active reward-player-chip-active" : ""}${player.is_in_season ? "" : " reward-player-chip-outside"}"
              data-role="reward-player-chip"
              data-player-id="${player.id}"
              aria-pressed="${rewardSelectedPlayerId === player.id ? "true" : "false"}"
            >
              ${escapeHtml(player.display_name)}
            </button>
          `).join("")}
        </div>
      ` : `<p class="muted">${group.empty}</p>`}
    </section>
  `).join("");
}

function getLeaderboardItemUsageDetail(playerId) {
  if (!playerId) {
    return {
      status: "missing-player",
      items: [],
      remainingItems: [],
    };
  }

  if (!activeSeason?.id) {
    return {
      status: "no-season",
      items: [],
      remainingItems: [],
    };
  }

  if (!itemCatalogEntries.length) {
    return {
      status: "no-items",
      items: [],
      remainingItems: [],
    };
  }

  if (itemCatalogUsageSummaryStatus !== "ready") {
    return {
      status: itemCatalogUsageSummaryStatus || "idle",
      items: [],
      remainingItems: [],
    };
  }

  const items = itemCatalogEntries.map((entry) => {
    const usage = itemCatalogUsageSummaryByItem.get(entry.id)?.get(playerId) || null;
    const usageCount = Number.isFinite(usage?.usageCount)
      ? Math.max(Number(usage.usageCount), 0)
      : 0;
    const remainingCount = Number.isFinite(usage?.remainingCount)
      ? Number(usage.remainingCount)
      : getItemCatalogInitialQuantity(entry);
    const purchasedCount = remainingCount < 0 ? Math.abs(remainingCount) : 0;
    const remainingPositiveCount = remainingCount > 0 ? remainingCount : 0;

    return {
      itemId: entry.id,
      name: entry.name || "未命名道具",
      icon: getItemCatalogMatchIcon(entry),
      usageCount,
      purchasedCount,
      remainingCount: remainingPositiveCount,
    };
  });

  return {
    status: "ready",
    items,
    remainingItems: items.filter((item) => item.remainingCount > 0),
  };
}

function buildLeaderboardGamesTooltip(player) {
  const wins = Math.max(Number(player?.wins ?? 0), 0);
  const losses = Math.max(Number(player?.losses ?? 0), 0);
  const playerId = player?.player_id || player?.id || "";
  const itemDetail = getLeaderboardItemUsageDetail(playerId);
  const lines = [
    `胜场：${wins}`,
    `负场：${losses}`,
  ];
  const htmlLines = [
    `<span class="leaderboard-hovercard-title">场次战绩</span>`,
    `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">胜场</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(String(wins))}</strong></span>`,
    `<span class="leaderboard-hovercard-row"><span class="leaderboard-hovercard-row-label">负场</span><strong class="leaderboard-hovercard-row-value">${escapeHtml(String(losses))}</strong></span>`,
  ];

  if (itemDetail.status === "ready") {
    const remainingItems = itemDetail.remainingItems.map(
      (item) => `${item.icon} ${item.name}×${formatItemUsageCount(item.remainingCount)}`
    );
    const remainingSummary = remainingItems.length ? remainingItems.join("；") : "无";
    lines.push(`剩余道具：${remainingSummary}`);
    htmlLines.push(`<span class="leaderboard-hovercard-section-title">剩余道具</span>`);
    if (remainingItems.length) {
      remainingItems.forEach((itemLine) => {
        htmlLines.push(`<span class="leaderboard-hovercard-row leaderboard-hovercard-row-full">${escapeHtml(itemLine)}</span>`);
      });
    } else {
      htmlLines.push(`<span class="leaderboard-hovercard-row leaderboard-hovercard-row-full muted">无</span>`);
    }

    const usedItems = itemDetail.items.filter((item) => item.usageCount > 0);
    htmlLines.push(`<span class="leaderboard-hovercard-section-title">道具使用</span>`);
    if (!usedItems.length) {
      lines.push("道具使用：暂无");
      htmlLines.push(`<span class="leaderboard-hovercard-row leaderboard-hovercard-row-full muted">暂无</span>`);
    }
    usedItems.forEach((item) => {
      const detailLine = `${item.icon} ${item.name}：已使用 ${formatItemUsageCount(item.usageCount)}`;
      lines.push(detailLine);
      htmlLines.push(`<span class="leaderboard-hovercard-row leaderboard-hovercard-row-full">${escapeHtml(detailLine)}</span>`);
    });
  } else {
    let itemStatusText = "道具统计待同步";
    if (itemDetail.status === "no-items") {
      itemStatusText = "当前赛季未配置道具";
    } else if (itemDetail.status === "loading") {
      itemStatusText = "道具统计加载中";
    } else if (itemDetail.status === "error") {
      itemStatusText = "道具统计加载失败";
    }
    lines.push(`道具统计：${itemStatusText}`);
    htmlLines.push(`<span class="leaderboard-hovercard-section-title">道具统计</span>`);
    htmlLines.push(`<span class="leaderboard-hovercard-row leaderboard-hovercard-row-full muted">${escapeHtml(itemStatusText)}</span>`);
  }

  return {
    text: lines.join(" | "),
    html: htmlLines.join(""),
  };
}

function updateRewardMinimumHint() {
  const selectedPlayer = seasonPlayers.find((player) => player.id === rewardSelectedPlayerId);
  if (!selectedPlayer) {
    rewardMinimumHint.textContent = "点选一位选手";
    return;
  }

  rewardMinimumHint.textContent = selectedPlayer.is_in_season
    ? `已选：${selectedPlayer.display_name}`
    : `已选：${selectedPlayer.display_name} · 记为场外赞助`;
}

function renderRewardLogs() {
  const canScore = isCurrentRoleScorer();
  const rewardSummary = buildSeasonRewardSummary();
  const detailLogs = rewardLogs.filter((log) => (
    !shouldHideRewardLogInDetails(log)
    && (!log.is_cancelled || log.cancelled_at)
  ));

  syncSeasonRewardTotalFromSummary(rewardSummary);
  refreshSeasonRewardTotal();

  if (!isRewardPanelOpen) {
    return;
  }

  rewardLogsList.innerHTML = "";

  if (!rewardSummary.length && !detailLogs.length) {
    rewardLogsEmpty.style.display = "block";
    return;
  }

  rewardLogsEmpty.style.display = "none";

  if (rewardSummary.length) {
    const summarySection = document.createElement("section");
    summarySection.className = "reward-summary-section";
    summarySection.innerHTML = `
      <div class="section-head">
        <div>
          <h3>选手赞助构成</h3>
        </div>
      </div>
      <div class="reward-summary-grid"></div>
    `;
    const summaryGrid = summarySection.querySelector(".reward-summary-grid");

    rewardSummary.forEach((player) => {
      const item = document.createElement("article");
      item.className = "reward-summary-card";
      const rewardTierClass = `reward-glow-tier-${getRewardGlowTier(player.total)}`;
      item.innerHTML = `
        <div class="reward-summary-head">
          <strong>${escapeHtml(player.display_name)}</strong>
          <span class="reward-log-amount reward-log-amount-total ${rewardTierClass}">总额 ${formatScore(player.total)}</span>
        </div>
        <div class="reward-category-list">
          ${player.categories.map((category) => buildRewardCategoryLineHtml(category, player.id)).join("")}
        </div>
      `;
      summaryGrid.appendChild(item);
    });

    rewardLogsList.appendChild(summarySection);
  }

  if (!canScore) {
    return;
  }

  if (!detailLogs.length) {
    return;
  }

  const detailSection = document.createElement("section");
  detailSection.className = "reward-summary-section";
  detailSection.innerHTML = `
    <div class="section-head">
      <div>
        <h3>赞助明细</h3>
      </div>
    </div>
    <div class="reward-detail-list reward-detail-list-compact"></div>
  `;
  const detailList = detailSection.querySelector(".reward-detail-list");

  detailLogs.forEach((log) => {
    const item = document.createElement("div");
    const playerName = log.players?.display_name || log.donor_name || "未知赞助人";
    const badgeText = getRewardLogBadgeText(log);
    const statusBadge = log.is_cancelled
      ? '<span class="reward-log-amount reward-log-cancelled">已取消</span>'
      : `<span class="reward-log-amount">+${Number(log.amount ?? 0)}</span>`;
    const actionHtml = log.is_cancelled
      ? ""
      : (canScore && canCancelRewardLog(log)
        ? `<button class="button-secondary cancel-reward-log-btn" type="button" data-donation-id="${log.id}" data-player-name="${escapeHtml(playerName)}">取消</button>`
        : "");

    item.className = `reward-log-item reward-log-item-compact${log.player_id ? "" : " reward-log-outside"}${log.category === "extra" ? " reward-log-item-extra" : ""}`;
    item.innerHTML = `
      <div class="reward-log-main">
        <strong>${escapeHtml(playerName)}</strong>
        <div class="reward-log-badges">
          <span class="queue-slot">${escapeHtml(badgeText)}</span>
          ${statusBadge}
        </div>
      </div>
      ${actionHtml ? `<div class="queue-actions">${actionHtml}</div>` : ""}
    `;
    detailList.appendChild(item);
  });

  rewardLogsList.appendChild(detailSection);
}

function applyRewardLogsToLocalViews() {
  syncSeasonSignupFeePaidStateFromLogs(rewardLogs);
  const donationTotals = new Map();
  const extraDonationTotals = new Map();
  const cardDonationTotals = new Map();
  const miscDonationTotals = new Map();

  rewardLogs.forEach((log) => {
    if (!log.player_id) return;
    const amount = Number(log.amount ?? 0);
    donationTotals.set(log.player_id, Number(donationTotals.get(log.player_id) ?? 0) + amount);
    if (log.category === "extra") {
      extraDonationTotals.set(log.player_id, Number(extraDonationTotals.get(log.player_id) ?? 0) + amount);
      return;
    }
    if (log.category === "card") {
      cardDonationTotals.set(log.player_id, Number(cardDonationTotals.get(log.player_id) ?? 0) + amount);
      return;
    }
    if (log.category === "misc") {
      miscDonationTotals.set(log.player_id, Number(miscDonationTotals.get(log.player_id) ?? 0) + amount);
    }
  });

  syncSeasonRewardTotalFromSummary();
  refreshSeasonRewardTotal();
  renderRewardLogs();

  if (leaderboardPlayers.length) {
    renderLeaderboard(leaderboardPlayers.map((player) => {
      const playerId = player.player_id || player.id;
      const rewardPoints = Number(donationTotals.get(playerId) ?? 0);
      const rewardExtraPoints = Number(extraDonationTotals.get(playerId) ?? 0);
      const rewardDoubleBonus = Number(cardDonationTotals.get(playerId) ?? 0);
      const rewardFloorBonus = Number(miscDonationTotals.get(playerId) ?? 0);
      return {
        ...player,
        reward_points: rewardPoints,
        reward_extra_points: rewardExtraPoints,
        reward_double_bonus: rewardDoubleBonus,
        reward_floor_bonus: rewardFloorBonus,
        reward_minimum: SEASON_BASE_SPONSOR_AMOUNT + rewardDoubleBonus + rewardFloorBonus,
      };
    }));
  }
}

async function toggleSignupFeePaid(playerId, buttonEl) {
  if (!ensureAdminAccess("仅管理员可确认基础赞助。")) return;

  const normalizedPlayerId = String(playerId || "").trim();
  if (!normalizedPlayerId || !activeSeason?.id) return;

  const player = seasonPlayers.find((item) => item.id === normalizedPlayerId) || null;
  if (!player) return;

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const isNowPaid = !seasonSignupFeePaidPlayerIds.has(normalizedPlayerId);
  if (isNowPaid) {
    seasonSignupFeePaidPlayerIds.add(normalizedPlayerId);
  } else {
    seasonSignupFeePaidPlayerIds.delete(normalizedPlayerId);
  }
  renderRewardLogs();

  const playerName = player.display_name || "该选手";
  const signupFeeSourceKey = getSignupFeeDonationSourceKey(activeSeason.id, normalizedPlayerId);
  const signupFeePayload = {
    season_id: activeSeason.id,
    source_key: signupFeeSourceKey,
    donor_name: playerName,
    player_id: normalizedPlayerId,
    amount: SEASON_BASE_SPONSOR_AMOUNT,
    category: "signup_fee",
    note: activeSeason?.name ? `${activeSeason.name} 基础赞助确认` : "基础赞助确认",
    is_outside: false,
    is_public: true,
  };
  const { error } = isNowPaid
    ? await db.from("reward_donations").upsert([signupFeePayload], {
      onConflict: "source_key",
    })
    : await db.from("reward_donations")
      .delete()
      .eq("season_id", activeSeason.id)
      .eq("source_key", signupFeeSourceKey);

  if (error) {
    if (isNowPaid) {
      seasonSignupFeePaidPlayerIds.delete(normalizedPlayerId);
    } else {
      seasonSignupFeePaidPlayerIds.add(normalizedPlayerId);
    }
    renderRewardLogs();
    const migrationHint = getLatestSchemaMigrationHint(error);
    const errorMessage = getErrorMessage(error);
    setRewardMessage(
      `保存基础赞助确认状态失败：${errorMessage}${migrationHint ? `。${migrationHint}` : ""}`,
      true
    );
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    return;
  }

  writeStoredSignupFeePaidPlayerIds(activeSeason.id, []);
  setRewardMessage(
    isNowPaid
      ? `${playerName} 已确认基础赞助。`
      : `${playerName} 已取消基础赞助确认。`
  );
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
  });

  if (buttonEl) {
    buttonEl.disabled = false;
  }
}

function renderSeasonPlayerDistribution(listEl, emptyEl, countEl = null) {
  if (!listEl || !emptyEl) return;
  listEl.innerHTML = "";
  if (countEl) {
    countEl.textContent = `${seasonPlayers.length} 人`;
  }
  if (seasonPlayers.length === 0) {
    emptyEl.hidden = false;
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.hidden = true;
  emptyEl.style.display = "none";
  const rankGroups = buildPlayerRankGroups(
    seasonPlayers.filter((player) => player.is_in_season),
    activeSeason?.id,
    { includeEmpty: true }
  );
  const groups = {
    unranked: seasonPlayers.filter((player) => player.is_in_season && !normalizeSeasonRankNo(player.player_rank)),
    idle: seasonPlayers.filter((player) => !player.is_in_season),
  };

  const renderPlayerCard = (player) => {
    const item = document.createElement("div");
    item.className = `season-player-item${player.is_in_season ? " season-player-item-active" : ""}`;
    item.dataset.playerId = player.id;
    item.dataset.playerName = player.display_name || "";
    item.dataset.playerRank = String(normalizeSeasonRankNo(player.player_rank) || "");
    item.innerHTML = `
      <div class="season-player-main">
        <div class="season-player-name">
          <span class="season-player-name-plain">${escapeHtml(player.display_name || "未知选手")}</span>
        </div>
      </div>
    `;
    return item;
  };

  const columns = document.createElement("div");
  columns.className = "season-rank-columns";

  rankGroups.forEach(({ title, players, rankNo }) => {
    const section = document.createElement("section");
    section.className = "season-rank-column";
    section.dataset.rank = String(rankNo);
    const powerValue = getSeasonRankPowerValue(rankNo, activeSeason?.id);
    section.innerHTML = `
      <div class="season-rank-head">
        <div class="season-rank-title-row">
          <h3 class="season-rank-title">${title}</h3>
          ${powerValue === null ? "" : `<span class="season-rank-power-badge">战力 ${powerValue}</span>`}
        </div>
        <span class="season-rank-count" title="${title}人数">${players.length} 人</span>
      </div>
      <div class="season-rank-list"></div>
      <p class="muted season-rank-empty"${players.length ? ' hidden' : ''}>暂无${title}选手</p>
    `;

    const list = section.querySelector(".season-rank-list");
    players.forEach((player) => list.appendChild(renderPlayerCard(player)));
    columns.appendChild(section);
  });

  listEl.appendChild(columns);

  const idleSection = document.createElement("section");
  idleSection.className = "season-unranked-section";
  idleSection.dataset.rank = "inactive";
  idleSection.innerHTML = `
    <div class="season-rank-head">
      <h3>未参加</h3>
      <span class="season-rank-count" title="未参加人数">${groups.idle.length} 人</span>
    </div>
    <div class="season-unranked-list"></div>
    <p class="muted season-rank-empty"${groups.idle.length ? ' hidden' : ''}>当前所有选手都已加入赛季</p>
  `;
  const idleList = idleSection.querySelector(".season-unranked-list");
  groups.idle.forEach((player) => idleList.appendChild(renderPlayerCard(player)));
  listEl.appendChild(idleSection);

  if (groups.unranked.length) {
    const unrankedSection = document.createElement("section");
    unrankedSection.className = "season-unranked-section";
    unrankedSection.innerHTML = `
      <div class="season-rank-head">
        <h3>已参加未分组</h3>
        <span class="season-rank-count" title="已参加未分组人数">${groups.unranked.length} 人</span>
      </div>
      <div class="season-unranked-list"></div>
    `;
    const unrankedList = unrankedSection.querySelector(".season-unranked-list");
    groups.unranked.forEach((player) => unrankedList.appendChild(renderPlayerCard(player)));
    listEl.appendChild(unrankedSection);
  }
}

function renderSeasonPlayersPanel() {
  renderSeasonPlayerDistribution(seasonPlayersList, seasonPlayersEmpty, seasonPlayersCount);
  renderLeaderboardPowerView();
  renderSeasonRolloverAction();
}

function renderLeaderboardPowerView() {
  if (!leaderboardPowerViewList || !leaderboardPowerViewEmpty) return;
  leaderboardPowerViewList.innerHTML = "";

  const rankedPlayers = seasonPlayers.filter(
    (player) => player.is_in_season && normalizeSeasonRankNo(player.player_rank)
  );

  if (leaderboardPowerViewCount) {
    leaderboardPowerViewCount.textContent = `${rankedPlayers.length} 人`;
  }

  if (!rankedPlayers.length) {
    leaderboardPowerViewEmpty.hidden = false;
    leaderboardPowerViewEmpty.style.display = "block";
    leaderboardPowerViewEmpty.textContent = "当前暂无已分配战力组选手";
    return;
  }

  leaderboardPowerViewEmpty.hidden = true;
  leaderboardPowerViewEmpty.style.display = "none";

  const rankGroups = buildPlayerRankGroups(rankedPlayers, activeSeason?.id, { includeEmpty: true });
  const columns = document.createElement("div");
  columns.className = "season-rank-columns";

  const renderPlayerCard = (player) => {
    const item = document.createElement("div");
    item.className = "season-player-item season-player-item-active";
    item.dataset.playerId = player.id;
    item.dataset.playerName = player.display_name || "";
    item.dataset.playerRank = String(normalizeSeasonRankNo(player.player_rank) || "");
    item.innerHTML = `
      <div class="season-player-main">
        <span class="season-player-name-plain">${escapeHtml(player.display_name || "未知选手")}</span>
      </div>
    `;
    return item;
  };

  rankGroups.forEach(({ title, players, rankNo }) => {
    const section = document.createElement("section");
    section.className = "season-rank-column";
    section.dataset.rank = String(rankNo);
    const powerValue = getSeasonRankPowerValue(rankNo, activeSeason?.id);
    section.innerHTML = `
      <div class="season-rank-head">
        <div class="season-rank-title-row">
          <h3 class="season-rank-title">${title}</h3>
          ${powerValue === null ? "" : `<span class="season-rank-power-badge">战力 ${powerValue}</span>`}
        </div>
        <span class="season-rank-count" title="${title}人数">${players.length} 人</span>
      </div>
      <div class="season-rank-list"></div>
      <p class="muted season-rank-empty"${players.length ? " hidden" : ""}>暂无${title}选手</p>
    `;

    const list = section.querySelector(".season-rank-list");
    players.forEach((player) => list.appendChild(renderPlayerCard(player)));
    columns.appendChild(section);
  });

  leaderboardPowerViewList.appendChild(columns);
}

function renderLeaderboardParticipationView() {
  if (!leaderboardParticipationViewList || !leaderboardParticipationViewEmpty) return;
  leaderboardParticipationViewList.innerHTML = "";

  const ranges = buildParticipationPointRanges(
    getParticipationPointsTableForSeason(leaderboardDisplaySeasonId || activeSeason?.id)
  );

  if (leaderboardParticipationViewCount) {
    leaderboardParticipationViewCount.textContent = `${ranges.length} 档`;
  }

  if (!ranges.length) {
    leaderboardParticipationViewEmpty.hidden = false;
    leaderboardParticipationViewEmpty.style.display = "block";
    leaderboardParticipationViewEmpty.textContent = "当前暂无非零场次分区间";
    return;
  }

  leaderboardParticipationViewEmpty.hidden = true;
  leaderboardParticipationViewEmpty.style.display = "none";

  const fragment = document.createDocumentFragment();

  ranges.forEach((range) => {
    const row = document.createElement("div");
    row.className = "leaderboard-participation-row";
    const rangeLabel = range.isOpenEnded
      ? `${range.start}场以上`
      : range.start === range.end
      ? `${range.start}场`
      : `${range.start}-${range.end}场`;
    const valueLabel = range.isOpenEnded && (range.isProgressive || Number(range.pointsPerExtraMatch || 0) > 0)
      ? `每场+${formatScore(range.pointsPerExtraMatch)}分`
      : `${formatScore(range.participationPoints)}分`;
    row.innerHTML = `
      <span class="leaderboard-participation-range">${escapeHtml(rangeLabel)}</span>
      <strong class="leaderboard-participation-value">${escapeHtml(valueLabel)}</strong>
    `;
    fragment.appendChild(row);
  });

  leaderboardParticipationViewList.appendChild(fragment);
}

function sortSeasonPlayersInPlace() {
  seasonPlayers.sort((a, b) => {
    if (a.is_in_season !== b.is_in_season) {
      return a.is_in_season ? -1 : 1;
    }

    const aRank = normalizeSeasonRankNo(a.player_rank) ?? 99;
    const bRank = normalizeSeasonRankNo(b.player_rank) ?? 99;
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.display_name.localeCompare(b.display_name, "zh-CN");
  });
}

function renderSeasonPlayerDerivedViews() {
  if (activeSeason?.id && backfillSeasonSelect?.value === activeSeason.id) {
    backfillPlayers = seasonPlayers
      .filter((player) => player.is_in_season)
      .map((player) => ({
        id: player.id,
        display_name: player.display_name || "未知选手",
        player_rank: normalizeSeasonRankNo(player.player_rank),
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));
    updateSeasonPlayerPowerCacheFromPlayers(activeSeason.id, backfillPlayers);
  }

  renderSeasonPlayersPanel();
  refreshRewardPanelSelectionUi();
  renderAdminAddScorerOptions();
  renderPlayerManagementOptions();
  renderScorerManualScoreOptions();
  renderAdminManualScoreOptions();
  renderSignupOptions();
  renderMatchForm();
  if (isBackfillFormOpen) {
    renderBackfillForm();
  }
}

function renderMatchDayStatus() {
  const storedStartTime = readStoredMatchDayStartTime();
  const matchGateMessage = getActiveSeasonMatchGateMessage();
  updateFinishTodayMatchDayButtonLabel();
  finishTodayMatchDayButtons.forEach((button) => {
    button.disabled = true;
    button.title = "当前数据库结构不再区分独立比赛日，无需手动完结。";
  });

  if (activeMatchDay) {
    matchDayStatus.textContent = `${activeMatchDay.match_date} 进行中`;
    matchDayStatus.className = "muted match-day-status-pill day-status-active";
    matchDayInfo.textContent = "次日 02:00 自动结束并清空当日报名。";
    matchDayInfo.hidden = false;
    startMatchDayBtn.textContent = "取消发起";
    startMatchDayBtn.classList.add("button-cancel-state");
    startMatchDayBtn.disabled = false;
    matchStartTimeInput.disabled = true;

    if (
      storedStartTime &&
      storedStartTime.seasonId === activeMatchDay.season_id &&
      storedStartTime.matchDate === activeMatchDay.match_date &&
      storedStartTime.startTime
    ) {
      matchStartTimeDisplay.textContent = `开始时间：${formatTime24(storedStartTime.startTime)}`;
    } else {
      matchStartTimeDisplay.textContent = "";
    }
    matchStartTimeDisplay.hidden = !matchStartTimeDisplay.textContent;
    return;
  }

  matchDayStatus.textContent = "未发起";
  matchDayStatus.className = "muted match-day-status-pill day-status-inactive";
  matchDayInfo.textContent = matchGateMessage || (activeSeason?.id ? "当前数据库结构不再区分比赛日，可直接录入当天比赛。" : "");
  matchDayInfo.hidden = !matchDayInfo.textContent;
  startMatchDayBtn.textContent = "发起当日比赛";
  startMatchDayBtn.classList.remove("button-cancel-state");
  startMatchDayBtn.disabled = true;
  matchStartTimeInput.disabled = !isActiveSeasonReadyForMatches();
  matchStartTimeDisplay.textContent = "";
  matchStartTimeDisplay.hidden = true;
}

function renderSignupOptions() {
  signupPlayerGrid.innerHTML = "";
  queueEntries = [];
  renderQueue(queueEntries);
  if (signupAllBtn) {
    signupAllBtn.disabled = true;
  }
  confirmQueueBtn.disabled = true;
  signupEmpty.style.display = "block";
  signupEmpty.textContent = "当前版本未接入报名队列，直接使用比赛录入或历史补录。";
}

async function signupAllPlayers() {
  if (!ensureScorerAccess("仅记分员或管理员可全部报名。")) return;
  if (!activeMatchDay) {
    setMessage("请先发起当日比赛，再开启全部报名。", true);
    return;
  }

  const participants = seasonPlayers.filter((player) => player.is_in_season);
  if (!participants.length) {
    setMessage("当前赛季暂无可报名选手。", true);
    return;
  }

  if (signupAllBtn) {
    signupAllBtn.disabled = true;
  }

  setMessage("正在为全部参赛选手报名...");

  const queueByPlayerId = new Map();
  queueEntries.forEach((row) => {
    if (row.status === "confirmed") return;
    queueByPlayerId.set(row.player_id, row);
  });

  let createdCount = 0;
  let resumedCount = 0;
  let skippedCount = 0;
  const actionTime = new Date().toISOString();

  for (const player of participants) {
    const entry = queueByPlayerId.get(player.id);
    const isActive = entry?.is_active === true && entry?.status !== "confirmed";
    const isCancelled = entry?.status === "cancelled" || entry?.is_active === false;
    let error = null;

    if (isActive) {
      skippedCount += 1;
      continue;
    }

    if (isCancelled && entry?.id) {
      ({ error } = await db
        .from("signup_queue")
        .update({
          is_active: true,
          status: "active",
          cancelled_at: null,
          created_at: actionTime,
        })
        .eq("id", entry.id));

      if (!error) {
        resumedCount += 1;
        continue;
      }
    } else {
      const payload = {
        player_id: player.id,
        is_active: true,
        status: "active",
      };

      if (activeSeason?.id) {
        payload.season_id = activeSeason.id;
      }

      ({ error } = await db.from("signup_queue").insert([payload]));

      if (!error) {
        createdCount += 1;
        continue;
      }
    }

    if (error?.message?.includes("signup_queue_one_active_per_player")) {
      skippedCount += 1;
      continue;
    }

    if (signupAllBtn) {
      signupAllBtn.disabled = false;
    }
    setMessage(`全部报名失败：${error?.message || "未知错误"}`, true);
    await loadQueue();
    return;
  }

  if (signupAllBtn) {
    signupAllBtn.disabled = false;
  }

  if (!createdCount && !resumedCount) {
    setMessage("当前可报名选手都已经在报名队列中。");
  } else {
    setMessage(
      `全部报名完成：新增 ${createdCount} 人，恢复 ${resumedCount} 人${skippedCount ? `，跳过 ${skippedCount} 人` : ""}。`
    );
  }
  requestImmediateRefresh({ queue: true });
}

function renderMatchForm() {
  refreshMatchSelectOptions();
  renderDoublePanel("match");

  const canUseForm = canUseMatchRecordingForm();
  const hasCompleteTeams = matchTeamSelections.teamA.length === TEAM_SIZE && matchTeamSelections.teamB.length === TEAM_SIZE;
  renderInlineTeamDoubleControls("match", !canUseForm);
  winnerSelect.disabled = !canUseForm;
  matchNoteInput.disabled = !canUseForm;
  recordMatchBtn.disabled = !canUseForm || !hasCompleteTeams;
  if (matchExhibitionToggleBtn) {
    matchExhibitionToggleBtn.disabled = !canUseForm;
    matchExhibitionToggleBtn.textContent = "娱乐赛";
    matchExhibitionToggleBtn.classList.toggle("match-type-toggle-btn-active", isMatchExhibition);
    matchExhibitionToggleBtn.setAttribute("aria-pressed", String(isMatchExhibition));
    matchExhibitionToggleBtn.setAttribute("title", isMatchExhibition ? "已启用娱乐赛" : "点击启用娱乐赛");
  }
  closeMatchFormBtn.disabled = false;
  openMatchFormBtn.disabled = isMatchFormOpen || !isActiveSeasonReadyForMatches();
  [...matchFormPanel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    button.disabled = !canUseForm;
  });
  setWinnerSelection("match", winnerSelect.value);
}

function renderBackfillForm() {
  refreshBackfillSelectOptions();
  renderDoublePanel("backfill");
  const repairSeason = isAdminHistoryRepairActiveForSeason(adminHistoryRepairState.seasonId)
    ? getSeasonMetaById(adminHistoryRepairState.seasonId)
    : null;
  const availableSeasons = repairSeason ? [repairSeason] : allSeasons;
  backfillSeasonSelect.innerHTML = buildSeasonOptions(availableSeasons, backfillSeasonSelect.value);
  const hasEnoughPlayers = backfillPlayers.length >= TEAM_SIZE * 2;
  const hasSeason = Boolean(backfillSeasonSelect.value);
  backfillSeasonSelect.disabled = Boolean(repairSeason);
  backfillDateInput.max = getBackfillDateMaxValue();
  backfillDateInput.min = getBackfillDateMinValue();
  renderInlineTeamDoubleControls("backfill", !hasSeason || !hasEnoughPlayers);
  backfillWinnerSelect.disabled = !hasSeason || !hasEnoughPlayers;
  backfillDateInput.disabled = !hasSeason;
  backfillMatchNoteInput.disabled = !hasSeason || !hasEnoughPlayers;
  recordBackfillBtn.disabled = !hasSeason || !hasEnoughPlayers || !backfillDateInput.value;
  if (backfillExhibitionToggleBtn) {
    backfillExhibitionToggleBtn.disabled = !hasSeason;
    backfillExhibitionToggleBtn.textContent = "娱乐赛";
    backfillExhibitionToggleBtn.classList.toggle("match-type-toggle-btn-active", isBackfillExhibition);
    backfillExhibitionToggleBtn.setAttribute("aria-pressed", String(isBackfillExhibition));
    backfillExhibitionToggleBtn.setAttribute("title", isBackfillExhibition ? "已启用娱乐赛" : "点击启用娱乐赛");
  }
  recordBackfillBtn.textContent = editingMatchId ? "保存修改" : "保存补录比赛";
  openBackfillFormBtn.disabled = isBackfillFormOpen || !isActiveSeasonReadyForMatches();
  [...backfillFormPanel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    button.disabled = !hasSeason || !hasEnoughPlayers;
  });
  setWinnerSelection("backfill", backfillWinnerSelect.value);
}

function clearMatchForm() {
  teamDoublePickerOpen.match = { A: "", B: "" };
  singleDoublePickerOpen.match = {};
  matchTeamSelections = {
    teamA: [],
    teamB: [],
  };
  matchHeroAssignments = {};
  matchKdaAssignments = {};
  matchDoubleState = createEmptyDoubleState();
  isMatchExhibition = false;
  setWinnerSelection("match", "");
  matchNoteInput.value = "";
  refreshMatchSelectOptions();
  renderDoublePanel("match");
  setMatchMessage("");
}

function clearBackfillForm() {
  editingMatchId = null;
  teamDoublePickerOpen.backfill = { A: "", B: "" };
  singleDoublePickerOpen.backfill = {};
  backfillTeamSelections = {
    teamA: [],
    teamB: [],
  };
  backfillHeroAssignments = {};
  backfillKdaAssignments = {};
  backfillDoubleState = createEmptyDoubleState();
  isBackfillExhibition = false;
  setWinnerSelection("backfill", "");
  backfillMatchNoteInput.value = "";
  refreshBackfillSelectOptions();
  renderDoublePanel("backfill");
  setBackfillMessage("");
}

function getQueueReadyEntries() {
  return todayPlayers.filter((player) => player.source === "queue");
}

function getQueueReadyEntryByPlayerId(playerId) {
  return getQueueReadyEntries().find((player) => (player.player_id || player.id) === playerId) || null;
}

function renderQueue(data) {
  queueList.innerHTML = "";
  const allRows = data || [];
  const readyEntries = getQueueReadyEntries();
  const canScore = isCurrentRoleScorer();
  confirmQueueBtn.disabled = readyEntries.length < 10;

  const visibleRows = allRows.filter((row) =>
    row.is_active === true || row.status === "cancelled"
  );

  if (visibleRows.length === 0) {
    queueEmpty.style.display = "block";
    renderScorerPanelSummary();
    return;
  }

  queueEmpty.style.display = "none";

  const sortedData = sortQueueEntries(visibleRows);
  let activeCount = 0;

  sortedData.forEach((row) => {
    const li = document.createElement("li");
    const playerName = row.players?.display_name || "未知玩家";
    const time = formatLocalTime(row.created_at);
    const cancelledTime = formatLocalTime(row.cancelled_at);
    const isCancelled = row.status === "cancelled" || row.is_active === false;
    const statusLabel = isCancelled ? "已取消报名" : "报名中";
    const statusClass = isCancelled
      ? "queue-status queue-status-cancelled"
      : "queue-status queue-status-active";
    const metaText = isCancelled && cancelledTime
      ? `取消于 ${cancelledTime}`
      : time
        ? `报名于 ${time}`
        : "";
    const readyEntry = getQueueReadyEntryByPlayerId(row.player_id);
    const hasArrived = Boolean(readyEntry);
    let laneLabel = "";
    let isStandby = false;

    if (!isCancelled) {
      activeCount += 1;
      isStandby = activeCount > 10;
      laneLabel = isStandby ? `替补 #${activeCount - 10}` : `正式 #${activeCount}`;
    }

    const actionHtml = isCancelled
      ? `<button class="button-secondary queue-action-btn queue-resignup-btn" data-entry-id="${row.id}" data-player-name="${escapeHtml(playerName)}">恢复报名</button>`
      : hasArrived
        ? (canScore
            ? `<button class="button-secondary queue-action-btn queue-unready-btn" data-roster-entry-id="${readyEntry.id}" data-player-name="${escapeHtml(playerName)}">取消到场</button>`
            : "")
        : `<button class="button-secondary queue-action-btn queue-ready-btn" data-entry-id="${row.id}" data-player-id="${row.player_id}" data-player-name="${escapeHtml(playerName)}">标记到场</button>`;
    const tagsHtml = [
      laneLabel ? `<span class="queue-slot">${escapeHtml(laneLabel)}</span>` : "",
      `<span class="${statusClass}">${statusLabel}</span>`,
      !isCancelled && hasArrived ? '<span class="queue-status queue-status-ready">已开机入场</span>' : "",
    ].filter(Boolean).join("");

    li.className = "queue-item";
    li.classList.add(
      isCancelled
        ? "queue-item-cancelled"
        : (hasArrived ? "queue-item-ready" : "queue-item-active")
    );
    if (isStandby) {
      li.classList.add("queue-item-standby");
    }
    if (!isCancelled && activeCount === 10) {
      li.classList.add("queue-cutoff");
    }

    li.innerHTML = `
      <div class="queue-card-main">
        <div class="queue-card-head">
          <strong>${escapeHtml(playerName)}</strong>
          <div class="queue-card-tags">
            ${tagsHtml}
          </div>
        </div>
        <p class="muted queue-card-time">${escapeHtml(metaText || "记录时间未知")}</p>
      </div>
      ${actionHtml ? `<div class="queue-card-actions">${actionHtml}</div>` : ""}
    `;
    queueList.appendChild(li);
  });

  renderScorerPanelSummary();
}

function renderTodayPlayers() {
  const displayPlayers = getTodayRosterPlayers();
  todayPlayersList.innerHTML = "";
  todayPlayersCount.textContent = `${displayPlayers.length} 人`;

  if (displayPlayers.length === 0) {
    todayPlayersEmpty.style.display = "block";
    renderScorerPanelSummary();
    return;
  }

  todayPlayersEmpty.style.display = "none";

  displayPlayers.forEach((player, idx) => {
    const li = document.createElement("li");
    li.className = "today-player-item";
    li.innerHTML = `
      <span class="today-player-index">${idx + 1}</span>
      <strong>${escapeHtml(player.display_name)}</strong>
    `;
    todayPlayersList.appendChild(li);
  });

  renderScorerPanelSummary();
}

function getLeaderboardNameCharWidth(players = []) {
  return 4;
}

function renderLeaderboard(data) {
  leaderboardBody.innerHTML = "";
  leaderboardPlayers = sortLeaderboardPlayers(data || []);
  const sortedData = leaderboardPlayers;
  const totalRankMap = buildLeaderboardDisplayRankMap(data || []);
  const isActiveSeasonLeaderboard = !leaderboardDisplaySeasonId || leaderboardDisplaySeasonId === activeSeason?.id;
  const shouldCacheLeaderboard = !leaderboardManualSeasonId;
  syncLeaderboardScoreSortControl();
  const longestNameLength = getLeaderboardNameCharWidth(sortedData);
  leaderboardCard?.style.setProperty(
    "--leaderboard-name-ch",
    String(longestNameLength)
  );
  leaderboardCard?.style.setProperty(
    "--leaderboard-table-width",
    "100%"
  );

  if (!sortedData.length) {
    if (isActiveSeasonLeaderboard) {
      seasonPlayerRewardTotal = 0;
      refreshSeasonRewardTotal();
      refreshRewardPanelSelectionUi();
    }
    if (shouldCacheLeaderboard) {
      writeCachedHomeLeaderboardSnapshot({
        activeSeasonId: activeSeason?.id,
        displaySeasonId: leaderboardDisplaySeasonId,
        displaySeasonName: leaderboardDisplaySeasonName,
        players: [],
      });
    }
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="muted leaderboard-empty">暂无排行榜数据</td>';
    leaderboardBody.appendChild(tr);
    return;
  }

  if (isActiveSeasonLeaderboard) {
    if (!syncSeasonRewardTotalFromSummary()) {
      seasonPlayerRewardTotal = sortedData.reduce(
        (sum, player) => sum + Number(player.reward_points ?? 0),
        0
      );
    }
    refreshSeasonRewardTotal();
    refreshRewardPanelSelectionUi();
  }

  const highestRewardIds = getHighestRewardPlayerIds(sortedData);
  const hardcoreLoseIds = getHardcoreLoseTaggedPlayerIds(sortedData);
  const leaderboardRecentMatches = isActiveSeasonLeaderboard ? recentMatchesData : [];
  const leaderboardRecentMatchGroups = isActiveSeasonLeaderboard ? recentMatchDayGroupsData : [];
  const winStreakMap = getActiveWinStreakMap(leaderboardRecentMatches, 3);
  const loseStreakMap = getActiveLoseStreakMap(leaderboardRecentMatches, 3);
  const bronzeFeederIds = getBronzeFeederPlayerIds(sortedData, leaderboardRecentMatches);
  const goldenTouchIds = getGoldenTouchPlayerIds(leaderboardRecentMatches);
  const superDoubleIds = getSuperDoublePlayerIds(leaderboardRecentMatches);
  const teammateAffinity = getTeammateAffinityLeaders(sortedData, leaderboardRecentMatches, 8, 12);
  const nemesisMap = getNemesisMap(sortedData, leaderboardRecentMatches, 8, 25);
  const sideSpecialistMap = getSideSpecialistMap(leaderboardRecentMatches, 11, 4, 22);
  const lateArrivalIds = getLateArrivalTaggedPlayerIds(leaderboardRecentMatchGroups, 3);
  const mvpIds = getMvpPlayerIds();
  const playerNameMap = new Map(sortedData.map((player) => [player.player_id || player.id, stripPlayerNameMeta(player.display_name || "未知选手") || "未知选手"]));

  sortedData.forEach((player, idx) => {
    const tr = document.createElement("tr");
    const playerId = player.player_id || player.id || "";
    const rank = totalRankMap.get(playerId) || getLeaderboardDisplayRankAtIndex(sortedData, idx);
    const isBottomTwo = sortedData.length >= 2 && rank >= sortedData.length - 1;
    const hoverDirectionClass = idx < 5 ? "leaderboard-hovercard-below" : "leaderboard-hovercard-above";
    const gamesPlayed = Number(player.games_played ?? 0);
    const rewardExtraPoints = Number(player.reward_extra_points ?? 0);
    const gamesTooltip = buildLeaderboardGamesTooltip(player);
    const scoreTooltip = buildLeaderboardScoreTooltip(player);
    const displayScore = getLeaderboardDisplayScore(player);
    const tags = [];

    if (highestRewardIds.has(playerId)) {
      tags.push({ icon: "¤", label: "金主", tone: "gold", description: "本赛季最大赞助人" });
    }

    if (rewardExtraPoints > 0) {
      tags.push({ icon: "✶", label: "感恩的信赖", tone: "gratitude", description: "感谢捐赠" });
    }

    if (hardcoreLoseIds.has(playerId)) {
      tags.push({ icon: "☄", label: "又菜又爱玩", tone: "slate", description: "你懂得" });
    }

    if (winStreakMap.has(playerId)) {
      const streak = winStreakMap.get(playerId);
      tags.push({
        icon: "▲",
        label: "连胜中",
        tone: "ember",
        className: getStreakTagIntensityClass(streak),
        description: `${streak} 连胜`,
      });
    }

    if (loseStreakMap.has(playerId)) {
      const streak = loseStreakMap.get(playerId);
      tags.push({
        icon: "▼",
        label: "连败中",
        tone: "crimson",
        className: getStreakTagIntensityClass(streak),
        description: `${streak} 连败`,
      });
    }

    if (Number(player.score ?? 0) < 0) {
      tags.push({ icon: "☘", label: "面有菜色", tone: "wasabi", description: "太菜了" });
    }

    if (bronzeFeederIds.has(playerId)) {
      tags.push({ icon: "◈", label: "送分童子", tone: "brass", description: "常规败场明显偏多" });
    }

    if (goldenTouchIds.has(playerId)) {
      tags.push({ icon: "✶", label: "点金手", tone: "sun", description: "道具净加成积分最多" });
    }

    if (superDoubleIds.has(playerId)) {
      tags.push({ icon: "⟡", label: "超级加倍", tone: "arcane", description: "道具净扣分最多" });
    }

    if (teammateAffinity.unluckyId && teammateAffinity.unluckyId === playerId) {
      tags.push({ icon: "⚡", label: "有毒", tone: "storm", description: "同队时更容易输" });
    }

    if (teammateAffinity.luckyId && teammateAffinity.luckyId === playerId) {
      tags.push({ icon: "✿", label: "福将", tone: "pink", description: "同队时更容易赢" });
    }

    const nemesisEntries = nemesisMap.get(playerId) || [];
    nemesisEntries.forEach((nemesis) => {
      if (!nemesis?.opponentId) return;
      const opponentName = playerNameMap.get(nemesis.opponentId) || "那位对手";
      tags.push({
        icon: "✹",
        label: `${opponentName}一生之敌`,
        tone: "inferno",
        description: `${nemesis.games} 场交手中对 ${opponentName} 胜率 ${formatWinRateValue(nemesis.winRate)}`,
      });
    });

    if (lateArrivalIds.has(playerId)) {
      tags.push({ icon: "🕊", label: "咕咕咕", tone: "dove", description: "赛季内迟到登记已达 3 次" });
    }

    const sideSpecialist = sideSpecialistMap.get(playerId);
    if (sideSpecialist?.side === "A") {
      tags.push({
        icon: "☼",
        label: "光明使者",
        tone: "dawn",
        description: `天辉胜率 ${formatWinRateValue(sideSpecialist.radiantRate)}`,
      });
    } else if (sideSpecialist?.side === "B") {
      tags.push({
        icon: "☽",
        label: "夜魇暗潮",
        tone: "abyss",
        description: `夜魇胜率 ${formatWinRateValue(sideSpecialist.direRate)}`,
      });
    }

    if (mvpIds.has(playerId)) {
      tags.push({ icon: "★", label: "MVP", tone: "royal" });
    }

    // Future follow-up: if tags exceed 12, add an admin action log entry so we can revisit tag prioritization.
    const tagsMarkup = tags.slice(0, 12).map((tag) => {
      const fitClassName = getLeaderboardTagFitClass(tag.label);
      return `
        <span class="leaderboard-tag leaderboard-tag-${tag.tone}${tag.className ? ` ${tag.className}` : ""}${fitClassName ? ` ${fitClassName}` : ""}" title="${escapeHtml(tag.description || tag.label)}" aria-label="${escapeHtml(tag.description || tag.label)}">
          <span class="leaderboard-tag-icon">${escapeHtml(tag.icon)}</span>
          <span class="leaderboard-tag-label">${escapeHtml(tag.label)}</span>
        </span>
      `;
    }).join("");
    const tagsHtml = tags.length
      ? `
        <div class="leaderboard-player-tags-popover-grid">
          ${tagsMarkup}
        </div>
      `
      : '<p class="leaderboard-player-tag-empty">当前暂无标签</p>';
    const winRateNumber = getWinRateNumber(player.win_rate, player.wins, player.games_played);
    const winRateLabel = formatWinRateValue(player.win_rate, player.wins, player.games_played);

    if (rank === 1) {
      tr.className = "leaderboard-row-top1";
    } else if (rank <= 3) {
      tr.className = "leaderboard-row-top23";
    } else if (rank <= 5) {
      tr.className = "leaderboard-row-top45";
    }
    if (isBottomTwo) {
      tr.classList.add(rank === sortedData.length ? "leaderboard-row-bottom1" : "leaderboard-row-bottom2");
    }
    tr.innerHTML = `
      <td><span class="leaderboard-rank">${rank}</span></td>
      <td>
        <div class="leaderboard-player-cell">
          <div class="leaderboard-player-name-wrap ${hoverDirectionClass}">
            <span class="leaderboard-player-name-button">
              <span class="leaderboard-player-name">${buildDecoratedPlayerNameHtml(playerId, player.display_name, {
                players: sortedData,
                highestRewardIds,
                hardcoreLoseIds,
                rank,
                wrapperClassName: "player-name-stack",
              })}</span>
            </span>
            <div class="leaderboard-player-tag-popover">
              <p class="leaderboard-player-tag-title">选手标签</p>
              ${tagsHtml}
            </div>
          </div>
        </div>
      </td>
      <td>
        <span class="leaderboard-score-wrap leaderboard-stat-wrap ${hoverDirectionClass}" aria-label="${escapeHtml(scoreTooltip.text)}">
          <button
            type="button"
            class="leaderboard-score leaderboard-score-trigger"
            data-role="score-detail"
            data-player-id="${escapeHtml(playerId)}"
            aria-label="查看 ${escapeHtml(stripPlayerNameMeta(player.display_name || "该选手"))} 的积分构成与明细"
            aria-expanded="false"
          >${formatScore(displayScore)}</button>
          <span class="leaderboard-stat-hovercard leaderboard-score-hovercard">${scoreTooltip.html}</span>
        </span>
      </td>
      <td>
        <span class="leaderboard-stat-wrap ${hoverDirectionClass}" aria-label="${escapeHtml(gamesTooltip.text)}">
          <span class="leaderboard-stat${gamesPlayed > 5 ? " leaderboard-stat-active" : ""}">${gamesPlayed}</span>
          <span class="leaderboard-stat-hovercard leaderboard-games-hovercard">${gamesTooltip.html}</span>
        </span>
      </td>
      <td>
        <div class="leaderboard-rate" style="--rate-percent: ${winRateNumber}%; --rate-glow: ${Math.max(14, winRateNumber)}%;">
          <button
            type="button"
            class="leaderboard-rate-trigger"
            data-role="player-relation"
            data-player-id="${escapeHtml(playerId)}"
            aria-label="查看 ${escapeHtml(stripPlayerNameMeta(player.display_name || "该选手"))} 的胜率关系统计"
            title="查看队友与对手胜率统计"
          >
            <span class="leaderboard-rate-bar" aria-hidden="true"></span>
            <span class="leaderboard-rate-value">${winRateLabel}</span>
          </button>
        </div>
      </td>
    `;
    leaderboardBody.appendChild(tr);
  });

  if (shouldCacheLeaderboard) {
    writeCachedHomeLeaderboardSnapshot({
      activeSeasonId: activeSeason?.id,
      displaySeasonId: leaderboardDisplaySeasonId,
      displaySeasonName: leaderboardDisplaySeasonName,
      players: sortedData,
    });
  }
}

async function addRewardExtra() {
  if (!ensureScorerAccess("仅记分员或管理员可记录赞助。")) return;
  const selectedPlayer = seasonPlayers.find((player) => player.id === rewardSelectedPlayerId) || null;
  const extraAmount = Number.parseInt(rewardExtraInput.value, 10);

  if (!activeSeason?.id) {
    setRewardMessage("当前未识别到赛季，无法记录赞助。", true);
    return;
  }

  if (!selectedPlayer) {
    setRewardMessage("请先点选一位选手。", true);
    return;
  }

  if (!Number.isInteger(extraAmount) || extraAmount < 0) {
    setRewardMessage("额外赞助额必须是大于等于 0 的整数。", true);
    return;
  }

  addRewardBtn.disabled = true;
  setRewardMessage(`正在添加赞助记录...`);

  const donorName = selectedPlayer.display_name || "未知赞助人";
  const { error } = await db.from("reward_donations").insert([{
    season_id: activeSeason.id,
    donor_name: donorName,
    player_id: selectedPlayer.id,
    amount: extraAmount,
    category: "extra",
    note: activeSeason?.name ? `${activeSeason.name} 赞助记录` : null,
    is_outside: !selectedPlayer.is_in_season,
    is_public: true,
  }]);

  addRewardBtn.disabled = false;

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    const errorMessage = getErrorMessage(error);
    setRewardMessage(`添加赞助失败：${errorMessage}${migrationHint ? `。${migrationHint}` : ""}`, true);
    return;
  }

  rewardExtraInput.value = "";
  setRewardMessage(`${donorName} 已增加赞助额 ${extraAmount}。`);
  appendAdminActionLog(`为 ${donorName} 添加了赞助 +${extraAmount}。`);
  updateRewardMinimumHint();
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
  });
}

async function loadRewardLogs() {
  const updateLeaderboardRewardTotals = ({
    totalMap = new Map(),
    extraMap = new Map(),
    cardMap = new Map(),
    miscMap = new Map(),
  } = {}) => {
    if (!leaderboardPlayers.length) {
      return;
    }

    renderLeaderboard(leaderboardPlayers.map((player) => {
      const playerId = player.player_id || player.id;
      const rewardPoints = Number(totalMap.get(playerId) ?? 0);
      const rewardExtraPoints = Number(extraMap.get(playerId) ?? 0);
      const rewardDoubleBonus = Number(cardMap.get(playerId) ?? 0);
      const rewardFloorBonus = Number(miscMap.get(playerId) ?? 0);
      return {
        ...player,
        reward_points: rewardPoints,
        reward_extra_points: rewardExtraPoints,
        reward_double_bonus: rewardDoubleBonus,
        reward_floor_bonus: rewardFloorBonus,
        reward_minimum: SEASON_BASE_SPONSOR_AMOUNT + rewardDoubleBonus + rewardFloorBonus,
      };
    }));
  };

  if (!activeSeason?.id) {
    rewardCardUsageSummary = new Map();
    rewardLogs = [];
    resetRewardSummarySortSnapshot();
    syncSeasonSignupFeePaidStateFromLogs([]);
    externalRewardTotal = 0;
    refreshSeasonRewardTotal();
    renderRewardLogs();
    updateLeaderboardRewardTotals();
    return;
  }

  await migrateStoredSignupFeePaidStateToDatabase();

  const seasonPlayerMap = new Map(
    seasonPlayers.map((player) => [stripPlayerNameMeta(player.display_name || ""), player])
  );
  const query = db
    .from("reward_donations")
    .select("id, season_id, source_key, donor_name, player_id, amount, category, note, is_outside, is_public, donated_at, created_at, players ( display_name )")
    .eq("season_id", activeSeason.id)
    .order("created_at", { ascending: false });
  const { data, error } = await query;
  rewardCardUsageSummary = new Map();

  if (error) {
    console.error("加载赞助记录失败：", error);
    rewardLogs = [];
    rewardLogsLoadedSeasonId = "";
    syncSeasonSignupFeePaidStateFromLogs([]);
    externalRewardTotal = 0;
    const migrationHint = getLatestSchemaMigrationHint(error);
    if (migrationHint) {
      setRewardMessage(`赞助面板尚未完成数据库升级。${migrationHint}`, true);
    }
    refreshSeasonRewardTotal();
    renderRewardLogs();
    updateLeaderboardRewardTotals();
    return;
  }

  rewardLogs = (data || []).map((row) => {
    const matchedPlayer = row.player_id
      ? seasonPlayers.find((player) => player.id === row.player_id) || null
      : (row.is_outside
      ? null
      : seasonPlayerMap.get(stripPlayerNameMeta(row.donor_name || "")));
    return {
      ...row,
      player_id: row.player_id || matchedPlayer?.id || null,
      players: row.players?.display_name
        ? row.players
        : (matchedPlayer ? { display_name: matchedPlayer.display_name } : null),
      is_cancelled: false,
      cancelled_at: null,
      created_at: row.created_at || row.donated_at || new Date().toISOString(),
    };
  }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  rewardLogsLoadedSeasonId = activeSeason.id;
  syncSeasonSignupFeePaidStateFromLogs(rewardLogs);
  const donationTotals = new Map();
  const extraDonationTotals = new Map();
  const cardDonationTotals = new Map();
  const miscDonationTotals = new Map();
  rewardLogs.forEach((log) => {
    if (!log.player_id) return;
    const amount = Number(log.amount ?? 0);
    donationTotals.set(log.player_id, Number(donationTotals.get(log.player_id) ?? 0) + amount);
    if (log.category === "extra") {
      extraDonationTotals.set(log.player_id, Number(extraDonationTotals.get(log.player_id) ?? 0) + amount);
      return;
    }
    if (log.category === "card") {
      cardDonationTotals.set(log.player_id, Number(cardDonationTotals.get(log.player_id) ?? 0) + amount);
      return;
    }
    if (log.category === "misc") {
      miscDonationTotals.set(log.player_id, Number(miscDonationTotals.get(log.player_id) ?? 0) + amount);
    }
  });
  syncSeasonRewardTotalFromSummary();
  refreshSeasonRewardTotal();
  renderRewardLogs();
  updateLeaderboardRewardTotals({
    totalMap: donationTotals,
    extraMap: extraDonationTotals,
    cardMap: cardDonationTotals,
    miscMap: miscDonationTotals,
  });
}

async function cancelRewardDonation(donationId, playerName, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可取消赞助记录。")) return;
  const confirmed = await confirmAction(
    `确认取消 ${playerName} 这条赞助记录吗？`,
    { title: "取消赞助记录", confirmLabel: "确认取消", danger: true }
  );

  if (!confirmed) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const removedIndex = rewardLogs.findIndex((log) => log.id === donationId);
  const removedLog = removedIndex >= 0 ? clonePlainObject(rewardLogs[removedIndex]) : null;
  if (removedIndex >= 0) {
    rewardLogs.splice(removedIndex, 1);
    applyRewardLogsToLocalViews();
  }
  setRewardMessage(`${playerName} 的赞助记录已从本地移除，正在同步数据库...`);

  const { error } = await db.from("reward_donations").delete().eq("id", donationId);

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    if (removedLog) {
      rewardLogs.splice(Math.min(removedIndex, rewardLogs.length), 0, removedLog);
      applyRewardLogsToLocalViews();
    }
    setRewardMessage(`取消赞助记录失败：${error.message}`, true);
    return;
  }

  setRewardMessage(`${playerName} 的赞助记录已取消。`);
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
  });
}

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

function formatChineseRankOrdinal(value) {
  const normalized = Number(value);
  const numerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  if (Number.isInteger(normalized) && normalized >= 0 && normalized < numerals.length) {
    return numerals[normalized];
  }
  return String(value || "");
}

function getDefaultSeasonRankLabel(rankNo) {
  const normalizedRank = normalizeSeasonRankNo(rankNo);
  if (!normalizedRank) return "未分组";
  return `第${formatChineseRankOrdinal(normalizedRank)}档`;
}

function getSeasonRankCount(seasonId = activeSeason?.id) {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const rankCount = Number(targetSeason?.rule_config?.rank_count ?? 2);
  if (!Number.isInteger(rankCount) || rankCount < 1) return 2;
  return Math.min(rankCount, 12);
}

function getSeasonRankLabels(seasonId = activeSeason?.id) {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const labels = targetSeason?.rule_config?.rank_labels;
  return labels && typeof labels === "object" ? labels : {};
}

function getSeasonRankPowerValues(seasonId = activeSeason?.id) {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const values = targetSeason?.rule_config?.rank_power_values;
  return values && typeof values === "object" ? values : {};
}

function getDefaultSeasonRankPowerValue(rankNo, seasonId = activeSeason?.id) {
  const normalizedRank = normalizeSeasonRankNo(rankNo);
  if (!normalizedRank) return null;
  const rankCount = getSeasonRankCount(seasonId);
  if (normalizedRank > rankCount) return null;
  return rankCount - normalizedRank + 1;
}

function getSeasonRankPowerValue(rankNo, seasonId = activeSeason?.id) {
  const normalizedRank = normalizeSeasonRankNo(rankNo);
  if (!normalizedRank) return null;
  const rawValue = getSeasonRankPowerValues(seasonId)?.[normalizedRank];
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return getDefaultSeasonRankPowerValue(normalizedRank, seasonId);
  }
  const value = Number(rawValue);
  return Number.isInteger(value) ? value : getDefaultSeasonRankPowerValue(normalizedRank, seasonId);
}

function getSeasonPlayerPowerCacheKey(seasonId, playerId) {
  return seasonId && playerId ? `${seasonId}:${playerId}` : "";
}

function getCachedSeasonPlayerPower(seasonId, playerId) {
  const key = getSeasonPlayerPowerCacheKey(seasonId, playerId);
  return key ? seasonPlayerPowerCache.get(key) || null : null;
}

function cacheSeasonPlayerPower(seasonId, playerId, {
  displayName = "",
  rankNo = null,
  powerValue = null,
} = {}) {
  const key = getSeasonPlayerPowerCacheKey(seasonId, playerId);
  if (!key) return;

  const normalizedRank = normalizeSeasonRankNo(rankNo);
  const parsedPower = powerValue === null || powerValue === undefined || powerValue === ""
    ? (normalizedRank ? getSeasonRankPowerValue(normalizedRank, seasonId) : null)
    : Number(powerValue);
  if (!normalizedRank && !Number.isFinite(parsedPower)) return;

  const current = seasonPlayerPowerCache.get(key) || {};
  seasonPlayerPowerCache.set(key, {
    ...current,
    season_id: seasonId,
    player_id: playerId,
    display_name: displayName || current.display_name || "",
    rank_no: normalizedRank,
    power_value: Number.isFinite(parsedPower) ? Math.max(parsedPower, 0) : null,
    updated_at: new Date().toISOString(),
  });
}

function updateSeasonPlayerPowerCacheFromPlayers(seasonId, players = []) {
  if (!seasonId) return;
  (players || []).forEach((player) => {
    const playerId = player?.id || player?.player_id || "";
    const rankNo = normalizeSeasonRankNo(player?.player_rank ?? player?.rank_no_snapshot ?? player?.rank_no);
    if (!playerId || !rankNo) return;
    cacheSeasonPlayerPower(seasonId, playerId, {
      displayName: player.display_name || "",
      rankNo,
    });
  });
  writeSeasonPlayerPowerCache();
}

function updateSeasonPlayerPowerCacheFromMatches(matches = []) {
  (matches || []).forEach((match) => {
    const seasonId = match?.season_id || "";
    if (!seasonId) return;
    const shouldPreserveActiveSeasonCache = Boolean(activeSeason?.id && seasonId === activeSeason.id);
    parseRecentMatchPlayers(match.players).forEach((player) => {
      const playerId = player?.player_id || player?.id || "";
      const rankNo = normalizeSeasonRankNo(player?.rank_no_snapshot ?? player?.player_rank_snapshot ?? player?.player_rank);
      const powerValue = player?.power_value_snapshot;
      if (!playerId || (!rankNo && (powerValue === null || powerValue === undefined || powerValue === ""))) return;
      if (shouldPreserveActiveSeasonCache) {
        const cached = getCachedSeasonPlayerPower(seasonId, playerId);
        if (normalizeSeasonRankNo(cached?.rank_no) || Number.isFinite(Number(cached?.power_value))) {
          return;
        }
      }
      cacheSeasonPlayerPower(seasonId, playerId, {
        displayName: player.display_name || "",
        rankNo,
        powerValue,
      });
    });
  });
  writeSeasonPlayerPowerCache();
}

function getSeasonInitialScore(seasonId = activeSeason?.id) {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const value = Number(targetSeason?.rule_config?.initial_score ?? 5);
  return Number.isFinite(value) ? value : 5;
}

function getSeasonWinPoints(seasonId = activeSeason?.id, ruleMode = "standard") {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const key = ruleMode === "exhibition" ? "exhibition_win_points" : "win_points";
  const fallback = ruleMode === "exhibition"
    ? Number(targetSeason?.rule_config?.win_points ?? 3)
    : 3;
  const value = Number(targetSeason?.rule_config?.[key] ?? fallback);
  return Number.isFinite(value) ? value : 3;
}

function getSeasonLossPoints(seasonId = activeSeason?.id, ruleMode = "standard") {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const key = ruleMode === "exhibition" ? "exhibition_loss_points" : "loss_points";
  const fallback = ruleMode === "exhibition"
    ? Number(targetSeason?.rule_config?.loss_points ?? 0)
    : 0;
  const value = Number(targetSeason?.rule_config?.[key] ?? fallback);
  return Number.isFinite(value) ? value : 0;
}

function getSeasonPowerGapStep(seasonId = activeSeason?.id, ruleMode = "standard") {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const key = ruleMode === "exhibition" ? "exhibition_power_gap_step" : "power_gap_step";
  const fallback = ruleMode === "exhibition"
    ? Number(targetSeason?.rule_config?.power_gap_step ?? 0)
    : 0;
  const value = Number(targetSeason?.rule_config?.[key] ?? fallback);
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function getSeasonPowerGapDelta(seasonId = activeSeason?.id, ruleMode = "standard") {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const key = ruleMode === "exhibition" ? "exhibition_power_gap_delta" : "power_gap_delta";
  const fallback = ruleMode === "exhibition"
    ? Number(targetSeason?.rule_config?.power_gap_delta ?? 0)
    : 0;
  const value = Number(targetSeason?.rule_config?.[key] ?? fallback);
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function getSeasonParticipationPoints(seasonId = activeSeason?.id) {
  const targetSeason = seasonId && activeSeason?.id === seasonId
    ? activeSeason
    : allSeasons.find((season) => season.id === seasonId);
  const value = Number(targetSeason?.rule_config?.participation_points ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getMatchPlayerRank(player, fallbackRankMap = null, seasonId = activeSeason?.id) {
  const playerId = player?.player_id || player?.id || "";
  const cachedRank = normalizeSeasonRankNo(getCachedSeasonPlayerPower(seasonId, playerId)?.rank_no);
  if (seasonId && activeSeason?.id === seasonId) {
    if (cachedRank) return cachedRank;
    if (playerId && fallbackRankMap instanceof Map) {
      return normalizeSeasonRankNo(fallbackRankMap.get(playerId));
    }
  }
  const directRank = normalizeSeasonRankNo(
    player?.rank_no_snapshot ?? player?.player_rank_snapshot ?? player?.player_rank
  );
  if (directRank) return directRank;
  if (cachedRank) return cachedRank;
  if (!playerId || !(fallbackRankMap instanceof Map)) return null;
  return normalizeSeasonRankNo(fallbackRankMap.get(playerId));
}

function getMatchPlayerPowerValue(player, seasonId = activeSeason?.id, fallbackRankMap = null) {
  const playerId = player?.player_id || player?.id || "";
  if (seasonId && activeSeason?.id === seasonId) {
    const cachedPower = getCachedSeasonPlayerPower(seasonId, playerId)?.power_value;
    if (cachedPower !== null && cachedPower !== undefined && cachedPower !== "") {
      const value = Number(cachedPower);
      if (Number.isFinite(value)) return Math.max(value, 0);
    }
    const currentRankNo = getMatchPlayerRank(player, fallbackRankMap, seasonId);
    const currentPowerValue = getSeasonRankPowerValue(currentRankNo, seasonId);
    if (Number.isFinite(Number(currentPowerValue))) {
      return Math.max(Number(currentPowerValue) || 0, 0);
    }
  }

  const rawSnapshotValue = player?.power_value_snapshot;
  if (rawSnapshotValue !== null && rawSnapshotValue !== undefined && rawSnapshotValue !== "") {
    const snapshotValue = Number(rawSnapshotValue);
    if (!Number.isFinite(snapshotValue)) return 0;
    return Math.max(snapshotValue, 0);
  }
  const cachedPower = getCachedSeasonPlayerPower(seasonId, playerId)?.power_value;
  if (cachedPower !== null && cachedPower !== undefined && cachedPower !== "") {
    const value = Number(cachedPower);
    if (Number.isFinite(value)) return Math.max(value, 0);
  }
  const rankNo = getMatchPlayerRank(player, fallbackRankMap, seasonId);
  const powerValue = getSeasonRankPowerValue(rankNo, seasonId);
  return Math.max(Number(powerValue) || 0, 0);
}

function getMatchTeamPowerTotal(players, seasonId = activeSeason?.id, fallbackRankMap = null) {
  return (players || []).reduce((sum, player) => {
    return sum + getMatchPlayerPowerValue(player, seasonId, fallbackRankMap);
  }, 0);
}

function getSeasonRankLabel(rankNo, seasonId = activeSeason?.id) {
  const normalizedRank = normalizeSeasonRankNo(rankNo);
  if (!normalizedRank) return "未分组";
  const customLabel = String(getSeasonRankLabels(seasonId)?.[normalizedRank] || "").trim();
  if (customLabel) return customLabel;
  return getDefaultSeasonRankLabel(normalizedRank);
}

function getSeasonPlayerPowerInputValue(player, seasonId = activeSeason?.id) {
  const rankNo = normalizeSeasonRankNo(player?.player_rank);
  if (!rankNo) return "0";
  const powerValue = getSeasonRankPowerValue(rankNo, seasonId);
  return Number.isInteger(powerValue) ? String(powerValue) : "";
}

function getSeasonPowerDraftSignature() {
  return (seasonPlayers || [])
    .map((player) => `${player.id || ""}:${player.display_name || ""}:${getSeasonPlayerPowerInputValue(player, activeSeason?.id)}`)
    .join("|");
}

function createSeasonPowerDraftState(seasonId = activeSeason?.id) {
  if (!seasonId) return null;
  const rankLabels = getSeasonRankLabels(seasonId);
  return {
    seasonId,
    signature: getSeasonPowerDraftSignature(),
    rankLabels: { ...rankLabels },
    players: (seasonPlayers || []).map((player) => ({
      playerId: player.id || "",
      displayName: player.display_name || "未知选手",
      rawValue: getSeasonPlayerPowerInputValue(player, seasonId),
    })),
  };
}

function getSeasonPowerDraft(mode = "scorer", { reset = false } = {}) {
  if (!activeSeason?.id) {
    seasonPowerDraftState[mode] = null;
    return null;
  }
  if (
    reset
    || !seasonPowerDraftState[mode]
    || seasonPowerDraftState[mode]?.seasonId !== activeSeason.id
    || seasonPowerDraftState[mode]?.signature !== getSeasonPowerDraftSignature()
  ) {
    seasonPowerDraftState[mode] = createSeasonPowerDraftState(activeSeason.id);
  }
  return seasonPowerDraftState[mode];
}

function getSeasonPowerEditorValues(players = []) {
  const defaultValues = Array.from({ length: 10 }, (_, index) => 10 - index);
  const existingValues = [...new Set(
    (players || [])
      .map((player) => {
        const rawValue = String(player.rawValue || "").trim();
        return /^\d+$/.test(rawValue) ? Number(rawValue) : 0;
      })
      .filter((value) => value > 0)
  )].sort((a, b) => b - a);
  const mergedValues = [];
  [...existingValues, ...defaultValues].forEach((value) => {
    if (mergedValues.length >= 10 || mergedValues.includes(value)) return;
    mergedValues.push(value);
  });
  return mergedValues.sort((a, b) => b - a);
}

function buildRankLabelEditorHtml(mode = "scorer") {
  const draft = getSeasonPowerDraft(mode);
  if (!draft?.seasonId) return "";

  const players = (draft.players || [])
    .slice()
    .sort((a, b) => {
      const aPower = Number(a.rawValue || 0);
      const bPower = Number(b.rawValue || 0);
      if (aPower !== bPower) return bPower - aPower;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""), "zh-CN");
    });

  if (!players.length) {
    return '<p class="muted season-player-power-empty">当前还没有可配置战力值的选手。</p>';
  }

  const playersByPower = new Map();
  players.forEach((player) => {
    const normalizedPower = /^\d+$/.test(String(player.rawValue || "").trim())
      ? Number(player.rawValue)
      : 0;
    if (!playersByPower.has(normalizedPower)) {
      playersByPower.set(normalizedPower, []);
    }
    playersByPower.get(normalizedPower).push(player);
  });

  const renderPlayerRows = (groupPlayers = []) => {
    if (!groupPlayers.length) {
      return '<p class="season-player-power-empty-line muted">暂无选手</p>';
    }
    return groupPlayers.map((player) => {
      const inputValue = String(player.rawValue || "").trim();
      const participationLabel = Number(inputValue) > 0 ? "参赛" : "未参赛";
      return `
        <label class="season-player-power-row">
          <span class="season-player-power-name">${escapeHtml(player.displayName || "未知选手")}</span>
          <input
            type="number"
            step="1"
            min="0"
            inputmode="numeric"
            class="season-player-power-input"
            value="${escapeHtml(inputValue)}"
            placeholder="战力"
            data-role="season-player-power-input"
            data-player-id="${escapeHtml(player.playerId)}"
          />
          <span class="season-player-power-status">${participationLabel}</span>
        </label>
      `;
    }).join("");
  };

  const positivePowerValues = getSeasonPowerEditorValues(players);
  const rankedGroupsHtml = positivePowerValues.map((powerValue, index) => {
    const rankNo = index + 1;
    const groupPlayers = playersByPower.get(powerValue) || [];
    return `
      <section class="season-player-power-group">
        <div class="season-player-power-group-head">
          <div class="season-player-power-title-block">
            <input
              type="text"
              maxlength="12"
              class="season-player-power-title-input"
              value="${escapeHtml(String(draft.rankLabels?.[rankNo] || "").trim() || getDefaultSeasonRankLabel(rankNo))}"
              aria-label="修改 Rank ${rankNo} 名称"
              data-role="season-rank-name-input"
              data-rank="${rankNo}"
            />
          </div>
          <div class="season-player-power-head-meta">
            <span class="season-player-power-value">战力 ${escapeHtml(String(powerValue))}</span>
            <span class="season-player-power-count">${groupPlayers.length} 人</span>
          </div>
        </div>
        <div class="season-player-power-grid">
          ${renderPlayerRows(groupPlayers)}
        </div>
      </section>
    `;
  }).join("");
  const unrankedPlayers = playersByPower.get(0) || [];

  return `
    <div class="season-player-power-ranked-grid">
      ${rankedGroupsHtml}
    </div>
    <section class="season-player-power-group season-player-power-unranked">
      <div class="season-player-power-group-head">
        <strong>未参赛</strong>
        <div class="season-player-power-head-meta">
          <span class="season-player-power-count">${unrankedPlayers.length} 人</span>
        </div>
      </div>
      <div class="season-player-power-grid">
        ${renderPlayerRows(unrankedPlayers)}
      </div>
    </section>
  `;
}

function renderSingleRankLabelEditor(mode = "scorer", options = {}) {
  const canManage = isCurrentRoleScorer() && Boolean(activeSeason?.id);
  const container = mode === "admin" ? adminRankLabelEditors : scorerRankLabelEditors;
  const button = mode === "admin" ? adminSaveRankLabelsBtn : scorerSaveRankLabelsBtn;
  if (container) {
    container.innerHTML = canManage ? buildRankLabelEditorHtml(mode) : "";
    container.hidden = !canManage;
    container.classList.toggle("season-rank-settings-animating", Boolean(options.animate));
    if (options.animate) {
      window.setTimeout(() => container.classList.remove("season-rank-settings-animating"), 240);
    }
  }
  if (button) {
    button.hidden = !canManage;
    button.disabled = !canManage;
  }

  if (!canManage || !options.focusPlayerId) return;
  const selector = `[data-role="season-player-power-input"][data-player-id="${escapeCssIdentifier(options.focusPlayerId)}"]`;
  const targetInput = container?.querySelector(selector);
  if (targetInput instanceof HTMLInputElement) {
    focusDialogElement(targetInput);
    const end = targetInput.value.length;
    targetInput.setSelectionRange(end, end);
  }
}

function renderRankLabelEditors() {
  renderSingleRankLabelEditor("scorer");
  renderSingleRankLabelEditor("admin");
  if (isCurrentRoleScorer() && activeSeason?.id) {
    applyStaticSiteCopy();
  }
}

function updateSeasonPowerDraftPlayerValue(mode = "scorer", playerId = "", rawValue = "") {
  const draft = getSeasonPowerDraft(mode);
  if (!draft || !playerId) return;
  draft.players = draft.players.map((entry) => (
    entry.playerId === playerId ? { ...entry, rawValue: String(rawValue || "").trim() } : entry
  ));
}

function updateSeasonPowerDraftLabel(mode = "scorer", rankNo = 0, label = "") {
  const draft = getSeasonPowerDraft(mode);
  const normalizedRank = normalizeSeasonRankNo(rankNo);
  if (!draft || !normalizedRank) return;
  draft.rankLabels[normalizedRank] = String(label || "").trim();
}

function clearSeasonPowerDraftCommitTimer(mode = "scorer", playerId = "") {
  const timers = seasonPowerDraftCommitTimers[mode];
  const timerId = timers?.get(playerId);
  if (!timerId) return;
  window.clearTimeout(timerId);
  timers.delete(playerId);
}

function scheduleSeasonPowerDraftCommit(mode = "scorer", playerId = "") {
  if (!playerId) return;
  clearSeasonPowerDraftCommitTimer(mode, playerId);
  const timers = seasonPowerDraftCommitTimers[mode];
  timers.set(playerId, window.setTimeout(() => {
    timers.delete(playerId);
    renderSingleRankLabelEditor(mode, {
      animate: true,
      focusPlayerId: playerId,
    });
  }, 2000));
}

function flushSeasonPowerDraftCommit(mode = "scorer", playerId = "", { restoreFocus = false } = {}) {
  if (!playerId) return;
  clearSeasonPowerDraftCommitTimer(mode, playerId);
  renderSingleRankLabelEditor(mode, {
    animate: true,
    focusPlayerId: restoreFocus ? playerId : "",
  });
}

function openSeasonPowerModal(mode = "scorer") {
  if (!isCurrentRoleScorer() || !activeSeason?.id) return;
  getSeasonPowerDraft(mode, { reset: true });
  renderSingleRankLabelEditor(mode);
  setManagedDialogOpen(mode === "admin" ? "adminPower" : "scorerPower", true, {
    initialFocus: (mode === "admin" ? adminRankLabelEditors : scorerRankLabelEditors)
      ?.querySelector('[data-role="season-player-power-input"]') || undefined,
  });
}

function buildPlayerRankGroups(players, seasonId = activeSeason?.id, { includeEmpty = false } = {}) {
  const rankCount = getSeasonRankCount(seasonId);
  const groups = [];
  for (let rankNo = 1; rankNo <= rankCount; rankNo += 1) {
    const rankPlayers = (players || []).filter((player) => normalizeSeasonRankNo(player.player_rank) === rankNo);
    if (includeEmpty || rankPlayers.length) {
      groups.push({
        key: `rank-${rankNo}`,
        rankNo,
        title: getSeasonRankLabel(rankNo, seasonId),
        players: rankPlayers,
      });
    }
  }
  return groups;
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
    team: player.team || mapSideToTeam(player.side),
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

function normalizeMatchDayAttendanceNoteRow(row) {
  if (!row) return null;
  const playerInfo = Array.isArray(row.players) ? row.players[0] : row.players;
  return {
    id: row.id || "",
    match_day_id: row.match_day_id || null,
    season_id: row.season_id || null,
    match_date: row.match_date || "",
    player_id: row.player_id || "",
    status: row.status || "",
    note: row.note ?? "",
    created_at: row.created_at || "",
    display_name: playerInfo?.display_name || getPlayerDisplayNameById(row.player_id) || "未知选手",
  };
}

function applyRecentMatchDayContext(matches = [], matchDays = []) {
  if (!Array.isArray(matches) || !matches.length || !Array.isArray(matchDays) || !matchDays.length) {
    return matches;
  }

  const matchDayById = new Map();
  const matchDayBySeasonDate = new Map();
  matchDays.forEach((matchDay) => {
    if (!matchDay) return;
    if (matchDay.id) {
      matchDayById.set(matchDay.id, matchDay);
    }
    const matchDayKey = `${matchDay.season_id || ""}::${matchDay.match_date || ""}`;
    if (matchDay.match_date && !matchDayBySeasonDate.has(matchDayKey)) {
      matchDayBySeasonDate.set(matchDayKey, matchDay);
    }
  });

  return matches.map((match) => {
    if (!match) return match;
    const matchDayKey = `${match.season_id || ""}::${match.match_date || ""}`;
    const matchedDay = (
      (match.match_day_id ? matchDayById.get(match.match_day_id) : null)
      || matchDayBySeasonDate.get(matchDayKey)
      || null
    );
    if (!matchedDay) {
      return match;
    }
    return {
      ...match,
      match_day_id: match.match_day_id || matchedDay.id || null,
      season_id: match.season_id || matchedDay.season_id || null,
      day_is_active: match.day_is_active || Boolean(matchedDay.is_active),
    };
  });
}

function getEffectiveMatchPlayerLedgerDelta(entries = [], fallbackDelta = 0) {
  if (!Array.isArray(entries) || !entries.length) {
    const fallback = Number(fallbackDelta ?? 0);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  const rawTotal = entries.reduce((sum, entry) => {
    const delta = Number(entry?.points_delta ?? 0);
    return Number.isFinite(delta) ? sum + delta : sum;
  }, 0);

  if (!entries.some((entry) => entry?.entry_type === "match_result")) {
    return rawTotal;
  }

  let total = 0;

  entries.forEach((entry) => {
    const delta = Number(entry?.points_delta ?? 0);
    if (!Number.isFinite(delta) || delta === 0) return;

    if (entry.entry_type === "match_result") {
      total += delta;
      return;
    }

    if (entry.entry_type === "item_effect") {
      const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
      const appliedMultiplier = Number(metadata?.applied_multiplier);
      const basePointsDelta = Number(metadata?.base_points_delta);
      const appliedSpecialToken = normalizeItemScoreSpecialToken(metadata?.applied_special);
      const isResetToInitialWinScore = Boolean(metadata?.reset_to_initial_win_score)
        || appliedSpecialToken === RESET_ITEM_SCORE_SPECIAL_TOKEN;

      if (
        !isResetToInitialWinScore
        && Number.isFinite(appliedMultiplier)
        && Number.isFinite(basePointsDelta)
        && basePointsDelta !== 0
      ) {
        total += basePointsDelta * (appliedMultiplier - 1);
        return;
      }
    }

    total += delta;
  });

  return Number.isFinite(total) ? total : rawTotal;
}

function getMatchPlayerItemEffectDelta(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  const total = entries.reduce((sum, entry) => {
    if (entry?.entry_type !== "item_effect") return sum;
    const delta = Number(entry?.points_delta ?? 0);
    return Number.isFinite(delta) ? sum + delta : sum;
  }, 0);
  return Number.isFinite(total) ? total : 0;
}

function attachMatchPlayerLedgerDeltas(matches = [], rows = []) {
  if (!Array.isArray(matches) || !matches.length) return matches;
  const entriesByKey = new Map();
  const reversedLedgerIds = new Set(
    (rows || [])
      .map((row) => row?.reversal_of_id)
      .filter(Boolean)
  );

  (rows || []).forEach((row) => {
    if (!row?.player_id || !row?.match_id) return;
    if (row.id && reversedLedgerIds.has(row.id)) return;
    if (row.entry_type === "rollback" || row.reversal_of_id) return;
    const delta = Number(row?.points_delta ?? 0);
    if (!Number.isFinite(delta) || delta === 0) return;
    const key = `${row.match_id}:${row.player_id}`;
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, []);
    }
    entriesByKey.get(key).push(row);
  });

  return matches.map((match) => ({
    ...match,
    players: (match.players || []).map((player) => ({
      ...player,
      score_change: getEffectiveMatchPlayerLedgerDelta(
        entriesByKey.get(`${match.match_id || ""}:${player.player_id || ""}`) || [],
        player.score_change
      ),
      item_effect_delta: getMatchPlayerItemEffectDelta(
        entriesByKey.get(`${match.match_id || ""}:${player.player_id || ""}`) || []
      ),
    })),
  }));
}

function getTeamLabel(team) {
  return team === "A" ? "天辉方" : team === "B" ? "夜魇方" : "未知方";
}

function buildHighlightedPlayerTextHtml(text, players = []) {
  const rawText = String(text || "");
  const highlightedNames = [...new Set(
    (players || [])
      .map((player) => stripPlayerNameMeta(player.display_name || ""))
      .filter(Boolean)
  )].sort((a, b) => b.length - a.length);

  if (!rawText || !highlightedNames.length) {
    return escapeHtml(rawText);
  }

  const nameSet = new Set(highlightedNames);
  const pattern = new RegExp(`(${highlightedNames.map((name) => escapeRegExp(name)).join("|")})`, "g");

  return rawText
    .split(pattern)
    .map((part) => (nameSet.has(part)
      ? `<span class="match-note-player-name">${escapeHtml(part)}</span>`
      : escapeHtml(part)))
    .join("");
}

function getMatchEffectLogsByTeam(match, players, doubleDowns) {
  const getEffectItemLabel = (label = "") => {
    const normalized = String(label || "未命名道具").replace(/己方|对方/g, "").trim();
    return normalized || "未命名道具";
  };
  const playerMap = new Map(players.map((player) => [player.player_id, player]));
  const normalizedDoubleDowns = normalizeMatchDoubleDowns(doubleDowns, players);
  const logsByTeam = { A: [], B: [] };
  const effectCandidatesByTarget = new Map();
  const sourceEntries = [];
  const isWinnerPending = !hasRecordedWinner(match?.winner_team);
  const isResetEffectApplicableForTeam = (specialToken, targetTeam) => (
    !isResetToInitialWinScoreMultiplier(0, specialToken)
    || !hasRecordedWinner(match?.winner_team)
    || match.winner_team === targetTeam
  );
  const getTeamScoreDirection = (targetTeam) => {
    if (targetTeam && hasRecordedWinner(match?.winner_team)) {
      return match.winner_team === targetTeam ? 1 : -1;
    }
    const teamDeltas = players
      .filter((player) => player.team === targetTeam)
      .map((player) => Number(player.score_change ?? 0))
      .filter((delta) => Number.isFinite(delta) && delta !== 0);
    if (!teamDeltas.length) return 1;
    const total = teamDeltas.reduce((sum, delta) => sum + delta, 0);
    return total < 0 ? -1 : 1;
  };
  const createTargetEntry = (sourceEntry, targetPlayer) => ({
    effectId: `${sourceEntry.sourceLogKey}:${targetPlayer.player_id || ""}`,
    sourceEntry,
    targetPlayerId: targetPlayer.player_id || "",
    targetTeam: targetPlayer.team || "",
    itemEntry: sourceEntry.itemEntry,
    isConsumed: false,
  });

  normalizedDoubleDowns.forEach((item, itemIndex) => {
    const itemEntry = getMatchInteractionItemById(
      item.item_catalog_id || (item.mode === "team" ? LEGACY_MATCH_ITEM_IDS.team : LEGACY_MATCH_ITEM_IDS.personal)
    );
    const itemLabel = getEffectItemLabel(itemEntry?.name || "未命名道具");
    const baseMultiplier = item.item_catalog_id ? getItemCatalogScoreDeltaMultiplier(itemEntry) : 1;
    const baseSpecialToken = item.item_catalog_id ? getItemCatalogScoreDeltaSpecialToken(itemEntry) : "";
    const isRecordOnly = Boolean(item.item_catalog_id && isItemCatalogRecordOnly(itemEntry));
    const actorName = stripPlayerNameMeta(playerMap.get(item.user_player_id)?.display_name || "未知选手");
    const targetPlayers = item.mode === "team"
      ? players.filter((player) => player.team === item.target_team)
      : players.filter((player) => player.player_id === item.target_player_id);
    const sourceEntry = {
      sourceLogKey: `${itemIndex}:${item.mode}:${item.item_catalog_id || "legacy"}:${item.user_player_id || ""}:${item.target_team || ""}:${item.target_player_id || ""}:${item.source_team || ""}`,
      actorName: item.mode === "team" && item.payment_mode === "split" ? "" : actorName,
      mode: item.mode === "team" ? "team" : "single",
      isSplitTeamPayment: item.mode === "team" && item.payment_mode === "split",
      sourceTeam: item.source_team || "",
      targetTeam: item.mode === "team"
        ? (item.target_team || "")
        : (targetPlayers[0]?.team || ""),
      targetPlayerId: item.target_player_id || targetPlayers[0]?.player_id || "",
      relationText: item.mode === "team"
        ? "全队"
        : (item.user_player_id && item.user_player_id === (targetPlayers[0]?.player_id || "")
          ? "自己"
          : stripPlayerNameMeta(targetPlayers[0]?.display_name || "未知选手")),
      itemEntry,
      itemLabel,
      appliedMultiplier: baseMultiplier,
      appliedSpecialToken: baseSpecialToken,
      isRecordOnly,
      stackedMultiplier: null,
      stackedSpecialToken: "",
      stackedWithLabel: "",
      isTriggered: isRecordOnly
        ? true
        : (!isResetToInitialWinScoreMultiplier(baseMultiplier, baseSpecialToken)
          || targetPlayers.some((player) => Number(player.score_change ?? 0) > 0)),
    };
    sourceEntries.push(sourceEntry);

    if (isRecordOnly) {
      return;
    }

    targetPlayers.forEach((targetPlayer) => {
      const key = targetPlayer.player_id || "";
      if (!key) return;
      if (!effectCandidatesByTarget.has(key)) {
        effectCandidatesByTarget.set(key, []);
      }
      effectCandidatesByTarget.get(key).push(createTargetEntry(sourceEntry, targetPlayer));
    });
  });

  effectCandidatesByTarget.forEach((effects) => {
    while (true) {
      let bestPair = null;
      for (let index = 0; index < effects.length; index += 1) {
        const current = effects[index];
        if (current.isConsumed || !current.itemEntry?.id || current.sourceEntry?.isRecordOnly) continue;
        for (let peerIndex = index + 1; peerIndex < effects.length; peerIndex += 1) {
          const peer = effects[peerIndex];
          if (peer.isConsumed || !peer.itemEntry?.id || peer.sourceEntry?.isRecordOnly) continue;
          const stackRule = getItemCatalogScoreStackMultiplier(current.itemEntry, peer.itemEntry);
          if (stackRule === null) continue;
          if (!isResetEffectApplicableForTeam(stackRule.specialToken, current.targetTeam)) continue;
          const candidate = {
            left: current,
            right: peer,
            stackMultiplier: stackRule.multiplier,
            stackSpecialToken: stackRule.specialToken,
          };
          if (
            !bestPair
            || getItemScoreMultiplierPriority(candidate.stackMultiplier, candidate.stackSpecialToken)
              > getItemScoreMultiplierPriority(bestPair.stackMultiplier, bestPair.stackSpecialToken)
            || (
              getItemScoreMultiplierPriority(candidate.stackMultiplier, candidate.stackSpecialToken)
                === getItemScoreMultiplierPriority(bestPair.stackMultiplier, bestPair.stackSpecialToken)
              && `${current.itemEntry.id}:${peer.itemEntry.id}` < `${bestPair.left.itemEntry.id}:${bestPair.right.itemEntry.id}`
            )
          ) {
            bestPair = candidate;
          }
        }
      }

      if (!bestPair) break;
      bestPair.left.isConsumed = true;
      bestPair.right.isConsumed = true;
      [
        [bestPair.left, bestPair.right],
        [bestPair.right, bestPair.left],
      ].forEach(([current, peer]) => {
        if (current.sourceEntry?.mode !== "single") return;
        current.sourceEntry.stackedMultiplier = bestPair.stackMultiplier;
        current.sourceEntry.stackedSpecialToken = bestPair.stackSpecialToken;
        current.sourceEntry.stackedWithLabel = peer.sourceEntry?.itemLabel || "";
      });
    }
  });

  sourceEntries.forEach((entry) => {
    const resolvedMultiplier = entry.mode === "single" && entry.stackedMultiplier !== null
      ? entry.stackedMultiplier
      : entry.appliedMultiplier;
    const resolvedSpecialToken = entry.mode === "single" && entry.stackedMultiplier !== null
      ? entry.stackedSpecialToken
      : entry.appliedSpecialToken;
    const scoreDirection = getTeamScoreDirection(entry.targetTeam);
    const isResetEffect = isResetToInitialWinScoreMultiplier(resolvedMultiplier, resolvedSpecialToken);
    const isApplicable = isResetEffectApplicableForTeam(resolvedSpecialToken, entry.targetTeam);
    const tone = isWinnerPending
      ? "rest"
      : (entry.isRecordOnly
      ? "rest"
      : ((!isApplicable && isResetEffect)
      ? (scoreDirection < 0 ? "danger" : "rest")
      : (isResetEffect
      ? "gold"
      : (resolvedMultiplier === 0 ? "rest" : (scoreDirection < 0 ? "danger" : "gold")))));
    const itemDescriptionLabel = entry.isSplitTeamPayment
      ? `平分${entry.itemLabel}`
      : entry.itemLabel;
    let description = "";
    if (entry.isRecordOnly) {
      description = entry.mode === "team"
        ? itemDescriptionLabel
        : entry.itemLabel;
    } else if (isWinnerPending) {
      description = "结果待补";
    } else if (!isApplicable && isResetEffect) {
      description = entry.mode === "team"
        ? `${itemDescriptionLabel}，不生效`
        : `${entry.itemLabel}，${entry.relationText}不生效`;
    } else if (entry.mode === "single" && entry.stackedMultiplier !== null) {
      description = `${entry.itemLabel}，${entry.relationText}叠加后${formatItemScoreEffectText(resolvedMultiplier, scoreDirection, resolvedSpecialToken)}`;
    } else if (entry.mode === "team") {
      description = `${itemDescriptionLabel}，全队${formatItemScoreEffectText(resolvedMultiplier, scoreDirection, resolvedSpecialToken)}`;
    } else {
      description = `${entry.itemLabel}，${entry.relationText}${formatItemScoreEffectText(resolvedMultiplier, scoreDirection, resolvedSpecialToken)}`;
    }
    if (entry.targetTeam && logsByTeam[entry.targetTeam]) {
      const prefixedDescription = !entry.actorName && entry.sourceTeam && entry.sourceTeam !== entry.targetTeam
        ? `对方${description}`
        : description;
      logsByTeam[entry.targetTeam].push({
        actorName: entry.actorName || "",
        description: prefixedDescription,
        tone,
      });
    }
  });

  Object.values(logsByTeam).forEach((entries) => {
    entries.sort((left, right) => {
      const leftActor = String(left.actorName || "");
      const rightActor = String(right.actorName || "");
      if (leftActor !== rightActor) {
        return leftActor.localeCompare(rightActor, "zh-CN");
      }
      return String(left.description || "").localeCompare(String(right.description || ""), "zh-CN");
    });
  });

  return logsByTeam;
}

function getMatchNoteLines(match) {
  return String(match.note || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripPlayerNameMeta(name) {
  return String(name || "")
    .replace(/\s*（[^）]*）/g, "")
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

function getCompactPlayerDisplayName(name) {
  const normalized = stripPlayerNameMeta(name || "未知选手").replace(/\s+/g, "");
  if (!normalized) return "未知";
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    return normalized.slice(0, 4);
  }
  return normalized.slice(0, 6);
}

function getMatchDayPlayerNames(matches) {
  const seen = new Set();
  const names = [];

  (matches || []).forEach((match) => {
    parseRecentMatchPlayers(match.players).forEach((player) => {
      const normalizedName = stripPlayerNameMeta(player.display_name);
      if (!normalizedName || seen.has(normalizedName)) return;
      seen.add(normalizedName);
      names.push(normalizedName);
    });
  });

  return names;
}

function getSeasonMetaById(seasonId) {
  if (!seasonId) return null;
  if (activeSeason?.id === seasonId) return activeSeason;
  return (allSeasons || []).find((season) => season.id === seasonId) || null;
}

function getSeasonDisplayName(seasonId) {
  const season = getSeasonMetaById(seasonId);
  return season?.name || "未命名赛季";
}

function getSeasonStatus(seasonId) {
  return String(getSeasonMetaById(seasonId)?.status || "").toLowerCase();
}

function isSeasonArchivedInDatabase(seasonId) {
  return getSeasonStatus(seasonId) === "archived";
}

function isSeasonEditableForMatchRecords(seasonId) {
  const status = getSeasonStatus(seasonId);
  return status === "draft" || status === "active";
}

function canModifyMatchRecordsForSeason(seasonId) {
  return (
    (isCurrentRoleScorer() && isSeasonEditableForMatchRecords(seasonId))
    || isAdminHistoryRepairActiveForSeason(seasonId)
  );
}

function getSeasonReadOnlyReason(seasonId) {
  if (isSeasonArchivedInDatabase(seasonId)) {
    return "该赛季已导入 GitHub，只能查看不能修改。";
  }
  if (getSeasonStatus(seasonId) === "closed") {
    return "该赛季已完结；仅管理员可从管理面板开启临时历史维修。";
  }
  return "该赛季当前不可修改。";
}

function ensureMatchRecordEditable(matchId, actionLabel = "修改") {
  const match = getSavedMatchById(matchId);
  if (!match) {
    setMessage(`未找到要${actionLabel}的比赛记录。`, true);
    return false;
  }
  if (!canModifyMatchRecordsForSeason(match.season_id || activeSeason?.id || "")) {
    setMessage(getSeasonReadOnlyReason(match.season_id || ""), true);
    return false;
  }
  return true;
}

function getDateMonthKey(dateString) {
  return String(dateString || "").slice(0, 7);
}

function shouldOpenSeasonGroupByDefault(seasonMeta, groups, options = {}) {
  if (!seasonMeta) return true;
  const isLoaded = options.isLoaded !== false;
  const isLoading = Boolean(options.isLoading);
  if (!isLoaded && !isLoading) return false;
  const hasActiveDay = (groups || []).some((group) => group.day_is_active);
  if (hasActiveDay) return true;
  if (activeSeason?.id && seasonMeta.id === activeSeason.id) return true;
  if (openRecentMatchSeasons.has(seasonMeta.id)) return true;

  const todayMonth = getDateMonthKey(getBeijingBusinessDateString());
  const startMonth = getDateMonthKey(seasonMeta.start_date);
  const isEnded = Boolean(seasonMeta.end_date) || seasonMeta.is_active === false;

  if (seasonMeta.is_active) return true;
  if (isEnded) return false;
  return Boolean(startMonth && startMonth === todayMonth);
}

function shouldListSeasonInRecentMatches(season, groupedSeasonIds) {
  if (!season?.id) return false;
  if (groupedSeasonIds?.has?.(season.id)) return true;
  if (activeSeason?.id && season.id === activeSeason.id) return true;
  const status = String(season.status || "").toLowerCase();
  return status === "closed" || status === "archived";
}

function getSeasonRecentSortKey(seasonMeta, groups = []) {
  const seasonStart = String(seasonMeta?.start_at || seasonMeta?.start_date || "").trim();
  if (seasonStart) return seasonStart;
  const groupDate = String(groups?.[0]?.match_date || groups?.[0]?.started_at || "").trim();
  if (groupDate) return groupDate;
  return "";
}

function buildRecentMatchSeasonGroups(groups) {
  const seasonMap = new Map();

  (groups || []).forEach((group) => {
    const seasonId = group.season_id || "season-unknown";
    if (!seasonMap.has(seasonId)) {
      const seasonMeta = getSeasonMetaById(group.season_id);
      seasonMap.set(seasonId, {
        season_id: group.season_id || null,
        season_name: seasonMeta?.name || "未命名赛季",
        season_meta: seasonMeta,
        groups: [],
      });
    }
    seasonMap.get(seasonId).groups.push(group);
  });

  const groupedSeasonIds = new Set(
    [...seasonMap.values()]
      .map((entry) => entry.season_id)
      .filter(Boolean)
  );
  (allSeasons || [])
    .filter((season) => shouldListSeasonInRecentMatches(season, groupedSeasonIds))
    .forEach((season) => {
      if (seasonMap.has(season.id)) return;
      seasonMap.set(season.id, {
        season_id: season.id,
        season_name: season.name || "未命名赛季",
        season_meta: season,
        groups: [],
      });
    });

  return [...seasonMap.values()]
    .map((entry) => {
      entry.groups.sort((a, b) => {
        if (a.match_date !== b.match_date) {
          return String(b.match_date).localeCompare(String(a.match_date), "zh-CN");
        }
        const aStarted = new Date(a.started_at || 0).getTime();
        const bStarted = new Date(b.started_at || 0).getTime();
        return bStarted - aStarted;
      });
      return entry;
    })
    .sort((a, b) => {
      const aStart = getSeasonRecentSortKey(a.season_meta, a.groups);
      const bStart = getSeasonRecentSortKey(b.season_meta, b.groups);
      return bStart.localeCompare(aStart, "zh-CN");
    });
}

function buildRecentMatchDayGroups(matches, matchDays = [], attendanceNotes = []) {
  const groupMap = new Map();
  const seasonDateGroupKeyMap = new Map();

  function ensureGroup(preferredGroupKey, seasonId, matchDate, factory) {
    const seasonDateKey = getMatchDaySeasonDateKey(seasonId, matchDate);
    const resolvedGroupKey = (
      (seasonDateKey ? seasonDateGroupKeyMap.get(seasonDateKey) : "")
      || preferredGroupKey
    );

    if (!groupMap.has(resolvedGroupKey)) {
      groupMap.set(resolvedGroupKey, factory(resolvedGroupKey));
    }

    if (seasonDateKey && !seasonDateGroupKeyMap.has(seasonDateKey)) {
      seasonDateGroupKeyMap.set(seasonDateKey, resolvedGroupKey);
    }

    return groupMap.get(resolvedGroupKey);
  }

  (matchDays || []).forEach((matchDay) => {
    const groupKey = getMatchDayGroupKey(matchDay);
    ensureGroup(groupKey, matchDay.season_id || null, matchDay.match_date || "", (resolvedGroupKey) => ({
      group_key: resolvedGroupKey,
      match_day_id: matchDay.id || null,
      season_id: matchDay.season_id || null,
      match_date: matchDay.match_date || "历史比赛",
      started_at: matchDay.started_at || null,
      closed_at: matchDay.closed_at || null,
      day_is_active: Boolean(matchDay.is_active),
      note: matchDay.note || "",
      matches: [],
      attendance_notes: [],
      participants: [],
    }));
  });

  (matches || []).forEach((match) => {
    const groupKey = getMatchDayGroupKey(match.match_day_id, match.match_date || formatArchiveDate(match.created_at));
    const group = ensureGroup(
      groupKey,
      match.season_id || null,
      match.match_date || formatArchiveDate(match.created_at) || "",
      (resolvedGroupKey) => ({
        group_key: resolvedGroupKey,
        match_day_id: match.match_day_id || null,
        season_id: match.season_id || null,
        match_date: match.match_date || formatArchiveDate(match.created_at) || "历史比赛",
        started_at: match.created_at || null,
        closed_at: null,
        day_is_active: Boolean(match.day_is_active),
        note: "",
        matches: [],
        attendance_notes: [],
        participants: [],
      })
    );
    if (!group.match_day_id && match.match_day_id) {
      group.match_day_id = match.match_day_id;
    }
    if (!group.season_id && match.season_id) {
      group.season_id = match.season_id;
    }
    if ((!group.match_date || group.match_date === "历史比赛") && match.match_date) {
      group.match_date = match.match_date;
    }
    if (!group.started_at && match.created_at) {
      group.started_at = match.created_at;
    }
    if (match.day_is_active) {
      group.day_is_active = true;
    }
    group.matches.push(match);
  });

  (attendanceNotes || []).forEach((entry) => {
    const groupKey = getMatchDayGroupKey(entry.match_day_id, entry.match_date);
    const group = ensureGroup(groupKey, entry.season_id || null, entry.match_date || "", (resolvedGroupKey) => ({
      group_key: resolvedGroupKey,
        match_day_id: entry.match_day_id || null,
        season_id: entry.season_id || null,
        match_date: entry.match_date || "历史比赛",
        started_at: entry.created_at || null,
        closed_at: null,
        day_is_active: false,
        note: "",
        matches: [],
        attendance_notes: [],
        participants: [],
      })
    );
    if (!group.match_day_id && entry.match_day_id) {
      group.match_day_id = entry.match_day_id;
    }
    if (!group.season_id && entry.season_id) {
      group.season_id = entry.season_id;
    }
    if ((!group.match_date || group.match_date === "历史比赛") && entry.match_date) {
      group.match_date = entry.match_date;
    }
    if (!group.started_at && entry.created_at) {
      group.started_at = entry.created_at;
    }
    group.attendance_notes.push(entry);
  });

  return [...groupMap.values()]
    .map((group) => {
      group.matches.sort(compareRecentMatchesInGroup);
      group.attendance_notes.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return aTime - bTime;
      });
      group.participants = getMatchDayParticipantEntries(group.matches);
      return group;
    })
    .sort((a, b) => {
      if (a.match_date !== b.match_date) {
        return String(b.match_date).localeCompare(String(a.match_date), "zh-CN");
      }
      const aStarted = new Date(a.started_at || 0).getTime();
      const bStarted = new Date(b.started_at || 0).getTime();
      return bStarted - aStarted;
    });
}

function getOrderedSingleDoubleCandidates(player, candidates, teamMap, itemEntry = null) {
  const selfCandidate = [];
  const allyCandidates = [];
  const opponentCandidates = [];
  const playerTeam = teamMap.get(player.id);
  const allowedRelations = new Set(itemEntry ? getItemCatalogAllowedSingleRelations(itemEntry) : []);

  candidates.forEach((candidate) => {
    const candidateTeam = teamMap.get(candidate.id);
    if (!candidateTeam || !playerTeam) return;
    const relationKey = getSingleRelationKey(player.id, candidate.id, teamMap);
    if (!allowedRelations.has(relationKey)) return;
    if (relationKey === "self") {
      selfCandidate.push(candidate);
      return;
    }
    if (relationKey === "ally") {
      allyCandidates.push(candidate);
      return;
    }
    if (relationKey === "opponent") {
      opponentCandidates.push(candidate);
    }
  });

  return [...selfCandidate, ...allyCandidates, ...opponentCandidates];
}

function isSelfOnlySingleRelationItem(itemEntry = null) {
  const allowedRelations = itemEntry ? getItemCatalogAllowedSingleRelations(itemEntry) : [];
  return allowedRelations.length === 1 && allowedRelations[0] === "self";
}

function shouldHideRestDayBanner(group) {
  if (!group || (group.matches?.length || 0) > 0 || group.day_is_active) return false;
  return String(group.match_date || "") < getBeijingBusinessDateString();
}

function isCurrentBusinessDayGroup(group) {
  if (!group) return false;
  return String(group.match_date || "") === getBeijingBusinessDateString();
}

function renderRecentMatches(groups) {
  recentMatchesList.innerHTML = "";
  const highestRewardIds = getHighestRewardPlayerIds(leaderboardPlayers);
  const hardcoreLoseIds = getHardcoreLoseTaggedPlayerIds(leaderboardPlayers);
  const activeSeasonRankMap = new Map(
    seasonPlayers
      .filter((player) => player.is_in_season)
      .map((player) => [player.id, normalizeSeasonRankNo(player.player_rank)])
  );
  recentMatchDayGroupsData = groups || [];
  const seasonGroups = buildRecentMatchSeasonGroups(recentMatchDayGroupsData);

  if (!seasonGroups.length) {
    recentMatchesEmpty.style.display = "block";
    renderTodayPlayers();
    return;
  }

  recentMatchesEmpty.style.display = "none";
  renderTodayPlayers();

  seasonGroups.forEach((seasonEntry) => {
    const seasonDetails = document.createElement("details");
    const seasonMeta = seasonEntry.season_meta;
    const dayGroups = seasonEntry.groups || [];
    const visibleDayGroups = dayGroups.filter((group) => !shouldHideRestDayBanner(group));
    const seasonId = seasonEntry.season_id || "";
    const isSeasonLoaded = !seasonId || recentMatchLoadedSeasonIds.has(seasonId);
    const isSeasonLoading = Boolean(seasonId && recentMatchLoadingSeasonIds.has(seasonId));
    const seasonLoadError = seasonId ? recentMatchSeasonLoadErrors.get(seasonId) || "" : "";
    const totalMatches = dayGroups.reduce((sum, group) => sum + (group.matches?.length || 0), 0);
    const { matchDayCount, restDayCount } = getSeasonRecentMatchCalendarStats(seasonMeta, dayGroups);
    const seasonSummaryText = !isSeasonLoaded
      ? (isSeasonLoading ? "正在加载比赛记录..." : (seasonLoadError ? "加载失败，展开可重试" : "点击展开后加载比赛记录"))
      : `${matchDayCount} 个比赛日 · ${restDayCount} 个休息日 · ${totalMatches} 场比赛`;
    const seasonStatusLabel = isSeasonArchivedInDatabase(seasonId) ? "GitHub 归档 · 只读" : "";
    const isSeasonOpen = shouldOpenSeasonGroupByDefault(seasonMeta, visibleDayGroups, {
      isLoaded: isSeasonLoaded,
      isLoading: isSeasonLoading,
    });
    if (seasonId && isSeasonOpen && (isSeasonLoaded || isSeasonLoading)) {
      openRecentMatchSeasons.add(seasonId);
      writeOpenRecentMatchSeasons();
    }
    seasonDetails.className = "recent-match-season-group";
    seasonDetails.dataset.seasonId = seasonId;
    seasonDetails.open = isSeasonOpen;
    seasonDetails.dataset.expanded = isSeasonOpen ? "true" : "false";
    seasonDetails.addEventListener("toggle", () => {
      if (seasonId) {
        if (seasonDetails.open || (activeSeason?.id && seasonId === activeSeason.id)) {
          openRecentMatchSeasons.add(seasonId);
        } else {
          openRecentMatchSeasons.delete(seasonId);
        }
        writeOpenRecentMatchSeasons();
      }
      seasonDetails.dataset.expanded = seasonDetails.open ? "true" : "false";
      if (seasonDetails.open && seasonId && !recentMatchLoadedSeasonIds.has(seasonId)) {
        void loadRecentMatchesForSeason(seasonId, { keepOpen: true });
      }
    });

    seasonDetails.innerHTML = `
      <summary class="recent-match-season-summary">
        <div class="recent-match-season-title-block">
          <strong>${escapeHtml(seasonEntry.season_name || getSeasonDisplayName(seasonId))}</strong>
          <span class="muted">${escapeHtml([seasonSummaryText, seasonStatusLabel].filter(Boolean).join(" · "))}</span>
        </div>
        <span class="match-day-toggle">
          <span class="match-day-toggle-icon" aria-hidden="true"></span>
        </span>
      </summary>
      <div class="recent-match-season-content"></div>
    `;

    const seasonContent = seasonDetails.querySelector(".recent-match-season-content");

    if (!visibleDayGroups.length) {
      const placeholder = document.createElement("article");
      placeholder.className = "recent-match-card recent-match-card-empty";
      const placeholderLabel = seasonLoadError
        ? "加载失败"
        : (!isSeasonLoaded || isSeasonLoading ? "载入中" : "无记录");
      placeholder.innerHTML = `
        <span class="recent-match-round-badge">${escapeHtml(placeholderLabel)}</span>
      `;
      seasonContent.appendChild(placeholder);
    }

    visibleDayGroups.forEach((group) => {
      if (shouldHideRestDayBanner(group)) {
        return;
      }
      const details = document.createElement("details");
    const matches = group.matches || [];
    const isActiveDay = Boolean(group.day_is_active);
    const isBusinessDay = isCurrentBusinessDayGroup(group);
    const canModifyGroup = canModifyMatchRecordsForSeason(group.season_id || seasonId || activeSeason?.id || "");
    const participantEntries = group.participants || [];
    const matchDayPlayerCount = participantEntries.length;
    const matchDayMatchCount = matches.length;
    const playerSummaryHtml = buildMatchDayPlayerSummaryHtml(participantEntries, group.attendance_notes || []);
    const attendancePanelOpen = openMatchDayAttendanceGroups.has(group.group_key);
    const attendanceToggleLabel = attendancePanelOpen ? "收起迟到选手登记" : "登记迟到选手";
    details.dataset.matchDate = group.match_date;
    details.dataset.groupKey = group.group_key;
    details.className = `match-day-group${isActiveDay ? " match-day-group-active-day" : " match-day-group-archive-day"}`;
    details.open = isBusinessDay || isActiveDay || openRecentMatchGroups.has(group.group_key);
    details.dataset.expanded = details.open ? "true" : "false";
    details.addEventListener("toggle", () => {
      if (details.open) {
        openRecentMatchGroups.add(group.group_key);
      } else {
        openRecentMatchGroups.delete(group.group_key);
        openMatchDayAttendanceGroups.delete(group.group_key);
        const attendancePanel = details.querySelector(".match-day-attendance-panel");
        const attendanceToggleButton = details.querySelector('[data-role="toggle-match-day-attendance"]');
        if (attendancePanel) {
          attendancePanel.hidden = true;
          attendancePanel.classList.remove("match-day-attendance-panel-open");
        }
        if (attendanceToggleButton) {
          attendanceToggleButton.classList.remove("match-day-copy-btn-active");
          attendanceToggleButton.setAttribute("aria-pressed", "false");
          attendanceToggleButton.setAttribute("aria-label", "登记迟到选手");
          attendanceToggleButton.setAttribute("title", "登记迟到选手");
        }
      }
      updateRecentMatchGroupSummary(details, isActiveDay);
    });

    details.innerHTML = `
      <summary>
        <div class="match-day-summary">
          <div class="match-day-summary-meta">
            <strong>${escapeHtml(formatMatchDaySummaryLabel(group.match_date))}</strong>
            <span class="match-day-player-count">${matchDayPlayerCount} 人</span>
            <span class="match-day-match-count">${matchDayMatchCount} 场</span>
          </div>
          ${playerSummaryHtml}
        </div>
        <span class="match-day-summary-actions">
          ${canModifyGroup ? `
          <button
            type="button"
            class="match-day-copy-btn match-day-attendance-trigger-btn${attendancePanelOpen ? " match-day-copy-btn-active" : ""}"
            data-role="toggle-match-day-attendance"
            data-group-key="${escapeHtml(group.group_key)}"
            aria-label="${attendanceToggleLabel}"
            aria-pressed="${attendancePanelOpen ? "true" : "false"}"
            title="${attendanceToggleLabel}"
          >
            <span class="match-day-action-icon match-day-action-icon-attendance" aria-hidden="true"></span>
          </button>
          ` : ""}
          <button
            type="button"
            class="match-day-copy-btn"
            data-role="copy-match-day-report"
            data-group-key="${escapeHtml(group.group_key)}"
            aria-label="复制当日战斗简报"
            title="复制当日战斗简报"
          >
            <span class="match-day-action-icon match-day-action-icon-copy" aria-hidden="true"></span>
          </button>
        </span>
      </summary>
      <div class="match-day-content">
        <div class="match-day-content-inner">
          ${buildMatchDayAttendancePanelHtml(group, canModifyGroup)}
          <div class="match-day-matches"></div>
        </div>
      </div>
    `;
    updateRecentMatchGroupSummary(details, isActiveDay);
    details.querySelector("summary")?.addEventListener("click", () => {
      window.setTimeout(() => updateRecentMatchGroupSummary(details, isActiveDay), 0);
    });

    const content = details.querySelector(".match-day-matches");

    if (!matches.length) {
      const emptyCard = document.createElement("article");
      emptyCard.className = "recent-match-card recent-match-card-empty";
      emptyCard.innerHTML = `
        <span class="recent-match-round-badge">比赛日占位</span>
        <div class="recent-match-head">
          <div class="recent-match-title">
            <strong class="recent-match-result-pending">${isActiveDay ? "当日暂无比赛记录" : "当日未记录比赛"}</strong>
          </div>
        </div>
        <div class="recent-match-meta">
          <span class="muted recent-match-meta-time">${escapeHtml(group.match_date || "未知日期")}</span>
        </div>
      `;
      content.appendChild(emptyCard);
    }

    matches.forEach((match, matchIndex) => {
      const players = parseRecentMatchPlayers(match.players);
      const teamAPlayers = getOrderedSavedMatchTeamPlayers(players, "A");
      const teamBPlayers = getOrderedSavedMatchTeamPlayers(players, "B");
      const teamAPowerTotal = getMatchTeamPowerTotal(teamAPlayers, match.season_id || activeSeason?.id, activeSeasonRankMap);
      const teamBPowerTotal = getMatchTeamPowerTotal(teamBPlayers, match.season_id || activeSeason?.id, activeSeasonRankMap);
      const teamAPowerBadgeClass = teamAPowerTotal > teamBPowerTotal ? " recent-match-team-power-badge-leading" : "";
      const teamBPowerBadgeClass = teamBPowerTotal > teamAPowerTotal ? " recent-match-team-power-badge-leading" : "";
      const winnerLabel = getWinnerLabel(match.winner_team);
      const roundBadgeLabel = `第 ${matchIndex + 1} 场 · ${winnerLabel}`;
      const resultToneClass = match.winner_team === "A"
        ? "recent-match-result-a"
        : (match.winner_team === "B" ? "recent-match-result-b" : "recent-match-result-pending");
      const matchDateLabel = match.match_date || formatArchiveDate(match.created_at) || "未知日期";
      const doubleDowns = normalizeMatchDoubleDowns(match.double_downs, players);
      const effectLogsByTeam = getMatchEffectLogsByTeam(match, players, doubleDowns);
      const noteLines = getMatchNoteLines(match);
      const noteLogHtml = noteLines.length
        ? `<div class="match-extra-logs">${noteLines.map((line) => `<p class="muted match-extra-log-line">${buildHighlightedPlayerTextHtml(line, players)}</p>`).join("")}</div>`
        : "";
      const buildEffectLogHtml = (team) => effectLogsByTeam[team]?.length
        ? `<div class="match-effect-logs">${effectLogsByTeam[team].map((item) => `
          <p class="match-effect-log-line match-effect-log-line-${item.tone}">
            ${item.actorName ? `<span class="match-note-player-name">${escapeHtml(item.actorName)}</span>` : ""}${buildHighlightedPlayerTextHtml(item.description || "", players)}
          </p>
        `).join("")}</div>`
        : "";
      const renderPlayerList = (teamPlayers) => teamPlayers.map((player) => `
        <li>
          <span class="recent-match-player">
            <span class="recent-match-player-main">
              ${buildDecoratedPlayerNameHtml(player.player_id, player.display_name || "未知选手", {
                players: leaderboardPlayers,
                highestRewardIds,
                hardcoreLoseIds,
                rank: getLeaderboardRankByPlayerId(player.player_id, leaderboardPlayers),
                wrapperClassName: "player-name-stack recent-match-player-name",
              })}
              ${buildPlayerKdaSummaryHtml(player)}
            </span>
            ${buildMatchPlayerScoreDeltaHtml(player)}
          </span>
        </li>
      `).join("");
      const card = document.createElement("article");
      const matchTimeLabel = formatShortLocalTime(match.created_at);
      const matchMetaLabel = matchTimeLabel ? `${matchDateLabel} ${matchTimeLabel}` : matchDateLabel;
      const canModifyMatch = canModifyMatchRecordsForSeason(match.season_id || group.season_id || seasonId || "");
      const actionButtonsHtml = canModifyMatch
        ? `
          <div class="recent-match-actions" aria-label="比赛记录操作">
            <button
              class="button-secondary edit-match-btn"
              data-match-id="${match.match_id}"
              aria-label="修改记录"
              title="修改记录"
            ></button>
            <button
              class="button-danger delete-match-btn"
              data-match-id="${match.match_id}"
              aria-label="删除记录"
              title="删除记录"
            ></button>
          </div>
        `
        : "";

      card.className = `recent-match-card${canModifyMatch ? " recent-match-card-draggable" : ""}`;
      card.dataset.matchId = match.match_id || "";
      card.dataset.groupKey = group.group_key || "";
      card.innerHTML = `
        <span
          class="recent-match-round-badge ${resultToneClass}${match.is_exhibition ? " recent-match-round-badge-exhibition" : ""}${canModifyMatch ? " recent-match-round-badge-draggable" : ""}"
          ${canModifyMatch
            ? `data-role="drag-match" data-match-id="${escapeHtml(match.match_id || "")}" data-group-key="${escapeHtml(group.group_key || "")}" title="拖拽调整顺序" aria-label="拖拽调整顺序"`
            : ""}
        >
          <span class="recent-match-round-text">${escapeHtml(roundBadgeLabel)}</span>
        </span>
        <div class="recent-match-meta${canModifyMatch ? " recent-match-meta-with-actions" : ""}">
          <span class="muted recent-match-meta-time">${escapeHtml(matchMetaLabel)}</span>
          ${actionButtonsHtml}
        </div>
        <div class="recent-match-teams">
          <div class="recent-match-team${match.winner_team === "A" ? " recent-match-team-winner" : ""}">
            <div class="recent-match-team-head">
              <h3>天辉方</h3>
              <span class="recent-match-team-power-badge${teamAPowerBadgeClass}">${formatScore(teamAPowerTotal)}</span>
            </div>
            <ul>${renderPlayerList(teamAPlayers)}</ul>
            ${buildEffectLogHtml("A")}
          </div>
          <div class="recent-match-team${match.winner_team === "B" ? " recent-match-team-winner" : ""}">
            <div class="recent-match-team-head">
              <h3>夜魇方</h3>
              <span class="recent-match-team-power-badge${teamBPowerBadgeClass}">${formatScore(teamBPowerTotal)}</span>
            </div>
            <ul>${renderPlayerList(teamBPlayers)}</ul>
            ${buildEffectLogHtml("B")}
          </div>
        </div>
        ${noteLogHtml}
      `;
      content.appendChild(card);
    });

      seasonContent.appendChild(details);
    });

    recentMatchesList.appendChild(seasonDetails);
  });
}

async function loadActiveSeason() {
  const { data, error } = await db
    .from("seasons")
    .select("id, code, name, status, start_at, end_at, rule_config")
    .order("start_at", { ascending: false });

  if (error) {
    activeSeason = null;
    allSeasons = [];
    updateSeasonInfo();
    return;
  }

  const seasons = (data || []).map(normalizeSeasonMeta);
  allSeasons = seasons;
  const resolvedSeason = seasons.find((season) => season.status === "active")
    || seasons.find((season) => season.status === "draft")
    || seasons[0]
    || null;

  activeSeason = resolvedSeason;
  updateSeasonInfo();
  renderSeasonRolloverAction();
  renderSeasonArchiveExportOptions();
  renderBackfillForm();
  void refreshAutomaticBackgroundImage();
}

function scrollToPanelTarget(targetId) {
  const target = document.getElementById(targetId);
  if (!target) {
    setScorerPanelMessage("目标区域不存在，暂时无法跳转。", true);
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  setScorerPanelMessage("");
}

async function loadSeasons() {
  const { data, error } = await db
    .from("seasons")
    .select("id, code, name, status, start_at, end_at, rule_config")
    .order("start_at", { ascending: false });

  if (error) {
    console.error("加载赛季列表失败：", error);
    allSeasons = activeSeason ? [{ id: activeSeason.id, name: activeSeason.name }] : [];
    renderBackfillForm();
    return;
  }

  allSeasons = (data || []).map(normalizeSeasonMeta);
  renderSeasonArchiveExportOptions();

  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
}

async function loadPlayersForSeason(seasonId) {
  if (!seasonId) {
    backfillPlayers = [];
    backfillPlayersSeasonId = "";
    renderBackfillForm();
    return;
  }

  const { data, error } = await db
    .from("season_memberships")
    .select(`
      player_id,
      rank_no,
      join_status,
      players (
        display_name
      )
    `)
    .eq("season_id", seasonId);

  if (error) {
    console.error("加载补录赛季选手失败：", error);
    backfillPlayers = [];
    backfillPlayersSeasonId = "";
    renderBackfillForm();
    setBackfillMessage(`加载赛季选手失败：${error.message}`, true);
    return;
  }

  backfillPlayers = (data || [])
    .filter((row) => row.join_status === "active" || row.join_status === "captain")
    .map((row) => ({
      id: row.player_id,
      display_name: row.players?.display_name || "未知选手",
      player_rank: normalizeSeasonRankNo(row.rank_no),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));
  backfillPlayersSeasonId = seasonId;

  updateSeasonPlayerPowerCacheFromPlayers(seasonId, backfillPlayers);
  renderBackfillForm();
}

async function ensureBackfillSeasonSelectionLoaded({ forcePlayers = false } = {}) {
  if (!allSeasons.length) {
    await loadSeasons();
  }

  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }

  if (!backfillSeasonSelect.value) {
    renderBackfillForm();
    return;
  }

  if (forcePlayers || backfillPlayersSeasonId !== backfillSeasonSelect.value) {
    await loadPlayersForSeason(backfillSeasonSelect.value);
  } else if (isBackfillFormOpen) {
    renderBackfillForm();
  }
}

async function loadActiveMatchDay() {
  activeMatchDay = null;
  renderMatchDayStatus();
}

async function loadSeasonPlayers() {
  scoreDetailSeasonCache.clear();
  loadSeasonSignupFeePaidState();
  const playersQuery = db
    .from("players")
    .select("id, display_name")
    .order("display_name", { ascending: true });
  const participantsQuery = activeSeason?.id
    ? db
      .from("season_memberships")
      .select("player_id, rank_no, join_status")
      .eq("season_id", activeSeason.id)
    : Promise.resolve({ data: [], error: null });
  const [playersResult, participantsResult] = await Promise.all([
    playersQuery,
    participantsQuery,
  ]);

  if (playersResult.error) {
    allPlayersDirectory = [];
    seasonPlayers = [];
    renderAccessScorerOptions();
    renderSeasonPlayersPanel();
    renderSignupOptions();
    renderMatchForm();
    renderAdminAddScorerOptions();
    renderScorerManualScoreOptions();
    renderAdminManualScoreOptions();
    setMessage(`加载玩家失败：${playersResult.error.message}`, true);
    return;
  }

  allPlayersDirectory = (playersResult.data || []).map((player) => ({
    id: player.id,
    display_name: player.display_name || "未知选手",
  })).sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));

  let participantIds = new Set();
  let participantRanks = new Map();
  let rewardStats = new Map();

  if (!participantsResult.error) {
    const activeMemberships = (participantsResult.data || []).filter((row) =>
      row.join_status === "active" || row.join_status === "captain"
    );
    participantIds = new Set(activeMemberships.map((row) => row.player_id));
    participantRanks = new Map(
      activeMemberships.map((row) => [row.player_id, normalizeSeasonRankNo(row.rank_no)])
    );
  }

  seasonPlayers = (playersResult.data || []).map((player) => {
    const stats = rewardStats.get(player.id);
    return {
      id: player.id,
      is_in_season: participantIds.has(player.id),
      player_rank: normalizeSeasonRankNo(participantRanks.get(player.id)),
      display_name: player.display_name,
      reward_floor_bonus: Number(stats?.reward_floor_bonus ?? 0),
      reward_double_bonus: Number(stats?.reward_double_bonus ?? 0),
      reward_points: stats?.reward_points ?? SEASON_BASE_SPONSOR_AMOUNT,
      reward_minimum: SEASON_BASE_SPONSOR_AMOUNT + Number(stats?.reward_floor_bonus ?? 0) + Number(stats?.reward_double_bonus ?? 0),
      reward_extra_points: stats?.reward_extra_points ?? 0,
    };
  });

  seasonPlayers.sort((a, b) => {
    if (a.is_in_season !== b.is_in_season) {
      return a.is_in_season ? -1 : 1;
    }

    const aRank = normalizeSeasonRankNo(a.player_rank) ?? 99;
    const bRank = normalizeSeasonRankNo(b.player_rank) ?? 99;
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.display_name.localeCompare(b.display_name, "zh-CN");
  });

  updateSeasonPlayerPowerCacheFromPlayers(
    activeSeason?.id,
    seasonPlayers.filter((player) => player.is_in_season)
  );
  writeCachedHomePlayerDirectorySnapshot({
    activeSeasonId: activeSeason?.id,
    seasonRows: seasonPlayers,
    playerDirectory: allPlayersDirectory,
  });
  renderSeasonPlayersPanel();
  renderAccessScorerOptions();
  refreshRewardPanelSelectionUi();
  renderAdminAddScorerOptions();
  renderPlayerManagementOptions();
  renderScorerManualScoreOptions();
  renderAdminManualScoreOptions();
  renderAdminPlayerBackgroundSettings();
  void refreshAutomaticBackgroundImage();
}

async function loadTodayPlayers() {
  todayPlayers = [];
  renderTodayPlayers();
}

async function refreshPlayerDrivenViews() {
  await Promise.all([
    loadActiveMatchDay(),
    loadSeasonPlayers(),
    loadRoleMembers(),
    loadTodayPlayers(),
  ]);
  renderQueue(queueEntries);
  renderSignupOptions();
  renderMatchForm();
  if (isMatchFormOpen) {
    refreshMatchSelectOptions();
  }
  if (isBackfillFormOpen) {
    await ensureBackfillSeasonSelectionLoaded();
    refreshBackfillSelectOptions();
  }
  setMatchFormOpen(isMatchFormOpen);
  setBackfillFormOpen(isBackfillFormOpen);
}

async function loadPrimaryHomeData() {
  await Promise.all([
    loadActiveMatchDay(),
    loadSeasonPlayers(),
    loadRoleMembers(),
    loadTodayPlayers(),
  ]);

  renderQueue(queueEntries);
  renderSignupOptions();
  renderMatchForm();

  if (isMatchFormOpen) {
    refreshMatchSelectOptions();
  }

  setMatchFormOpen(isMatchFormOpen);
  setBackfillFormOpen(isBackfillFormOpen);
}

async function loadLeaderboard() {
  leaderboardDisplaySeasonName = activeSeason?.name || "";
  leaderboardDisplaySeasonId = activeSeason?.id || null;
  let targetSeasonId = activeSeason?.id || null;
  let targetSeasonName = activeSeason?.name || "";
  const manualSeason = getManualLeaderboardSeason();

  if (manualSeason?.id) {
    targetSeasonId = manualSeason.id;
    targetSeasonName = manualSeason.name || targetSeasonName;
  } else if (shouldShowPreviousSeasonLeaderboard()) {
    const previousSeason = getPreviousSeasonForLeaderboard();
    if (previousSeason?.id) {
      targetSeasonId = previousSeason.id;
      targetSeasonName = previousSeason.name || targetSeasonName;
    }
  }

  let result = { data: [], error: null };
  let manualScoreTotals = new Map();
  let bonusScoreTotals = new Map();
  manualScoreTotalsByPlayerId = new Map();
  if (targetSeasonId) {
    const [leaderboardResult, manualTotalsResult, bonusTotalsResult] = await Promise.allSettled([
      db
        .from("v_leaderboard")
        .select("season_id, player_id, display_name, matches_played, wins, losses, win_rate, score_total")
        .eq("season_id", targetSeasonId)
        .order("score_total", { ascending: false })
        .order("wins", { ascending: false })
        .order("matches_played", { ascending: false })
        .order("display_name", { ascending: true }),
      loadManualScoreTotalsBySeason(targetSeasonId),
      loadBonusScoreTotalsBySeason(targetSeasonId),
    ]);

    if (leaderboardResult.status === "fulfilled") {
      result = leaderboardResult.value;
    } else {
      result = { data: [], error: leaderboardResult.reason };
    }

    if (manualTotalsResult.status === "fulfilled") {
      manualScoreTotals = manualTotalsResult.value;
    } else {
      console.error("加载人工积分汇总失败：", manualTotalsResult.reason);
    }

    if (bonusTotalsResult.status === "fulfilled") {
      bonusScoreTotals = bonusTotalsResult.value;
    } else {
      console.error("加载加成积分汇总失败：", bonusTotalsResult.reason);
    }
  }

  leaderboardDisplaySeasonName = targetSeasonName;
  leaderboardDisplaySeasonId = targetSeasonId;
  renderBrandMonthBadge();

  if (result.error) {
    console.error("加载排行榜失败：", result.error);
    setMessage(`加载排行榜失败：${result.error.message}`, true);
    if (!leaderboardDisplaySeasonId || leaderboardDisplaySeasonId === activeSeason?.id) {
      updateSeasonRewardTotal(null);
    }
    renderLeaderboard([]);
    return;
  }

  manualScoreTotalsByPlayerId = manualScoreTotals;
  if (targetSeasonId) {
    await loadParticipationPointsTable(targetSeasonId);
  }
  const leaderboardData = applyParticipationPointsToLeaderboardPlayers((result.data || []).map((player) => {
    const playerId = player.player_id || player.user_id;
    const bonusScore = Number(bonusScoreTotals.get(playerId) ?? 0);
    const totalScore = Number(player.score_total ?? 0);
    return {
      wins: Number(player.wins ?? 0),
      losses: Number(player.losses ?? 0),
      games_played: getEffectiveLeaderboardGames(
        player.matches_played,
        player.wins,
        player.losses
      ),
      player_id: playerId,
      display_name: player.display_name || "未知选手",
      result_score: totalScore - bonusScore,
      bonus_score: bonusScore,
      win_rate: (() => {
        const wins = Number(player.wins ?? 0);
        const gamesPlayed = getEffectiveLeaderboardGames(
          player.matches_played,
          player.wins,
          player.losses
        );
        if (!gamesPlayed) return 0;
        return Number(((wins / gamesPlayed) * 100).toFixed(2));
      })(),
      manual_score: Number(manualScoreTotals.get(playerId) ?? 0),
      reward_points: 0,
      reward_minimum: SEASON_BASE_SPONSOR_AMOUNT,
      reward_extra_points: 0,
    };
  }), targetSeasonId);
  renderLeaderboard(leaderboardData);
  const targetSeason = getSeasonMetaById(targetSeasonId);
  const championRow = sortLeaderboardPlayers(leaderboardData)[0] || null;
  if (targetSeason?.code && isEndedSeasonForChampion(targetSeason) && championRow) {
    const cache = readSeasonChampionCache();
    cache[targetSeason.code] = {
      seasonId: targetSeason.id,
      seasonName: targetSeason.name || targetSeason.code,
      championName: stripPlayerNameMeta(championRow.display_name || "未知选手") || "未知选手",
      playerId: championRow.player_id || championRow.id || "",
      score: Number.isFinite(Number(championRow.score)) ? Number(championRow.score) : null,
      cachedAt: Date.now(),
    };
    writeSeasonChampionCache(cache);
    void refreshAutomaticBackgroundImage();
  }
}

async function fetchRecentMatchRowsForSeason(seasonId) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from("v_match_detail")
      .select("match_id, season_id, match_no, match_date, status, winner_side, notes, metadata, created_at, submitted_at, approved_at, players")
      .eq("season_id", seasonId)
      .order("match_date", { ascending: false })
      .order("match_no", { ascending: false })
      .range(offset, offset + RECENT_MATCH_SEASON_PAGE_SIZE - 1);

    if (error) throw error;

    const pageRows = data || [];
    rows.push(...pageRows);
    if (pageRows.length < RECENT_MATCH_SEASON_PAGE_SIZE) break;
    offset += RECENT_MATCH_SEASON_PAGE_SIZE;
  }

  return rows;
}

async function fetchScoreLedgerRowsForMatchIds(matchIds = []) {
  const rows = [];
  const chunkSize = 150;

  for (let index = 0; index < matchIds.length; index += chunkSize) {
    const chunk = matchIds.slice(index, index + chunkSize);
    const { data, error } = await db
      .from("score_ledger")
      .select("id, player_id, match_id, entry_type, points_delta, reversal_of_id, metadata")
      .in("match_id", chunk)
      .order("created_at", { ascending: true });

    if (error) throw error;
    rows.push(...(data || []));
  }

  return rows;
}

function resolveAttendanceNotesWithMatchDays(attendanceRows = [], matchDays = []) {
  const matchDayById = new Map(
    matchDays
      .filter((matchDay) => matchDay?.id)
      .map((matchDay) => [matchDay.id, matchDay])
  );
  const matchDayBySeasonDate = new Map(
    matchDays
      .filter((matchDay) => matchDay?.match_date)
      .map((matchDay) => [`${matchDay.season_id || ""}::${matchDay.match_date || ""}`, matchDay])
  );

  return (attendanceRows || [])
    .map((row) => normalizeMatchDayAttendanceNoteRow(row))
    .filter(Boolean)
    .map((entry) => {
      const matchDayKey = `${entry.season_id || ""}::${entry.match_date || ""}`;
      const matchedDay = (
        (entry.match_day_id ? matchDayById.get(entry.match_day_id) : null)
        || matchDayBySeasonDate.get(matchDayKey)
        || null
      );
      if (!matchedDay) {
        return entry;
      }
      return {
        ...entry,
        match_day_id: entry.match_day_id || matchedDay.id || null,
        season_id: entry.season_id || matchedDay.season_id || null,
      };
    });
}

async function loadRecentMatchSeasonBundle(seasonId) {
  const rows = await fetchRecentMatchRowsForSeason(seasonId);
  let normalizedMatches = (rows || [])
    .map((row) => normalizeMatchRecordFromView(row))
    .filter(Boolean);
  const recentMatchDates = [...new Set(normalizedMatches.map((match) => match.match_date).filter(Boolean))];
  let normalizedMatchDays = [];
  let normalizedAttendanceNotes = [];

  if (normalizedMatches.length) {
    let matchDaysQuery = db
      .from("match_days")
      .select("id, season_id, match_date, started_at, closed_at, is_active, note")
      .eq("season_id", seasonId);
    let attendanceNotesQuery = db
      .from("match_day_attendance_notes")
      .select("id, match_day_id, season_id, match_date, player_id, status, note, created_at, players ( display_name )")
      .eq("season_id", seasonId);

    if (recentMatchDates.length) {
      matchDaysQuery = matchDaysQuery.in("match_date", recentMatchDates);
      attendanceNotesQuery = attendanceNotesQuery.in("match_date", recentMatchDates);
    }

    const [
      { data: matchDaysData, error: matchDaysError },
      { data: attendanceRows, error: attendanceError },
    ] = await Promise.all([matchDaysQuery, attendanceNotesQuery]);

    if (matchDaysError && !isMissingPublicTableError(matchDaysError, "match_days")) {
      console.error("加载比赛日失败：", matchDaysError);
    }
    if (attendanceError && !isMissingPublicTableError(attendanceError, "match_day_attendance_notes")) {
      console.error("加载迟到登记失败：", attendanceError);
    }

    normalizedMatchDays = matchDaysError ? [] : (matchDaysData || []);
    normalizedMatches = applyRecentMatchDayContext(normalizedMatches, normalizedMatchDays);
    normalizedAttendanceNotes = attendanceError
      ? []
      : resolveAttendanceNotesWithMatchDays(attendanceRows || [], normalizedMatchDays);
  }

  const matchIds = normalizedMatches
    .map((match) => match.match_id)
    .filter(Boolean);

  if (matchIds.length) {
    try {
      const scoreRows = await fetchScoreLedgerRowsForMatchIds(matchIds);
      normalizedMatches = attachMatchPlayerLedgerDeltas(normalizedMatches, scoreRows);
    } catch (error) {
      console.error("加载比赛选手积分变动失败：", error);
    }
  }

  return {
    matches: normalizedMatches,
    matchDays: normalizedMatchDays,
    attendanceNotes: normalizedAttendanceNotes,
  };
}

function replaceRecentMatchSeasonData(seasonId, bundle) {
  recentMatchesData = [
    ...recentMatchesData.filter((match) => match.season_id !== seasonId),
    ...(bundle.matches || []),
  ];
  recentMatchDaysData = [
    ...recentMatchDaysData.filter((matchDay) => matchDay.season_id !== seasonId),
    ...(bundle.matchDays || []),
  ];
  recentMatchAttendanceNotesData = [
    ...recentMatchAttendanceNotesData.filter((entry) => entry.season_id !== seasonId),
    ...(bundle.attendanceNotes || []),
  ];
}

function renderRecentMatchState() {
  updateSeasonPlayerPowerCacheFromMatches(recentMatchesData);
  updateFinishTodayMatchDayButtonLabel();
  const groupedData = buildRecentMatchDayGroups(
    recentMatchesData,
    recentMatchDaysData,
    recentMatchAttendanceNotesData
  );
  renderRecentMatches(groupedData);
  if (leaderboardPlayers?.length) {
    renderLeaderboard(leaderboardPlayers);
  }
}

async function loadRecentMatchesForSeason(seasonId, options = {}) {
  const targetSeasonId = String(seasonId || "").trim();
  if (!targetSeasonId) {
    renderRecentMatchState();
    return;
  }

  if (recentMatchSeasonLoadPromises.has(targetSeasonId)) {
    return recentMatchSeasonLoadPromises.get(targetSeasonId);
  }

  recentMatchLoadingSeasonIds.add(targetSeasonId);
  recentMatchSeasonLoadErrors.delete(targetSeasonId);
  if (options.keepOpen) {
    openRecentMatchSeasons.add(targetSeasonId);
    writeOpenRecentMatchSeasons();
  }
  renderRecentMatchState();

  const loadPromise = (async () => {
    const bundle = await loadRecentMatchSeasonBundle(targetSeasonId);
    replaceRecentMatchSeasonData(targetSeasonId, bundle);
    recentMatchLoadedSeasonIds.add(targetSeasonId);
    recentMatchSeasonLoadErrors.delete(targetSeasonId);
  })();

  recentMatchSeasonLoadPromises.set(targetSeasonId, loadPromise);

  try {
    await loadPromise;
  } catch (error) {
    console.error("加载最近比赛失败：", error);
    recentMatchSeasonLoadErrors.set(targetSeasonId, getErrorMessage(error));
  } finally {
    recentMatchLoadingSeasonIds.delete(targetSeasonId);
    recentMatchSeasonLoadPromises.delete(targetSeasonId);
    scoreDetailSeasonCache.clear();
    renderRecentMatchState();
  }
}

async function loadRecentMatches() {
  scoreDetailSeasonCache.clear();
  const targetSeasonId = activeSeason?.id || "";
  const targetSeasonStatus = getSeasonStatus(targetSeasonId);
  if (!targetSeasonId || (targetSeasonStatus !== "active" && targetSeasonStatus !== "draft")) {
    renderRecentMatchState();
    return;
  }

  await loadRecentMatchesForSeason(targetSeasonId, { keepOpen: true });
}

async function resetCurrentSeason() {
  if (!ensureAdminAccess("仅管理员可重置当前赛季。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可重置的赛季。", true);
    return;
  }

  const confirmed = await confirmAction(
    `确认重置 ${activeSeason.name} 吗？这会清空本赛季比赛记录、积分、赛季完结确认和选手道具数量，但会保留选手名单、战力配置和道具目录。`,
    { title: "重置赛季", confirmLabel: "继续", danger: true }
  );

  if (!confirmed) {
    return;
  }

  const confirmText = await promptAction(
    "请输入“重置赛季”以继续执行：",
    "",
    {
      title: "重置赛季确认",
      inputLabel: "确认文字",
      placeholder: "重置赛季",
      confirmLabel: "重置赛季",
      danger: true,
    }
  );

  if (confirmText !== "重置赛季") {
    setMessage("未输入正确确认文字，已取消重置。", true);
    return;
  }

  const localExternalLogs = readExternalDonationLogs(activeSeason.id)
    .filter((log) => !log.is_cancelled);

  if (localExternalLogs.length) {
    const lines = [
      `${activeSeason.name} 场外赞助备忘`,
      `导出时间：${formatLocalTime(new Date().toISOString())}`,
      "",
      ...localExternalLogs.map((log) =>
        `${formatLocalTime(log.created_at)}  ${log.donor_name || "场外赞助"}  +${Number(log.amount ?? 0)}`
      ),
    ];
    downloadTextFile(
      `${activeSeason.name}-场外赞助备忘.txt`,
      lines.join("\n")
    );
  }

  resetSeasonBtn.disabled = true;
  setMessage(`正在重置 ${activeSeason.name}...`);

  const { data, error } = await db.rpc("reset_current_season", {
    p_season_id: activeSeason.id,
  });

  resetSeasonBtn.disabled = false;

  if (error) {
    setMessage(`重置赛季失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  setMatchMessage("");
  clearMatchForm();
  setMatchFormOpen(false);
  writeExternalDonationLogs(activeSeason.id, []);
  itemInventoryLogRows = [];
  setMessage(`已重置 ${activeSeason.name}，清空了比赛/积分/道具数量，并从总表同步了 ${data ?? 0} 名选手；原有战力配置已保留。`);
  appendAdminActionLog(`重置了赛季 ${activeSeason.name}。`);
  await loadRewardLogs();
  requestImmediateRefresh({
    seasonContext: true,
  });

  renderAdminAddScorerOptions();
  renderScorerManualScoreOptions();
  renderAdminManualScoreOptions();
}

function getSeasonRuleInputs(messageTarget = "admin", ruleMode = "standard") {
  const isExhibition = ruleMode === "exhibition";
  if (messageTarget === "scorer") {
    return {
      winInput: isExhibition ? scorerSeasonExhibitionWinPointsInput : scorerSeasonWinPointsInput,
      lossInput: isExhibition ? scorerSeasonExhibitionLossPointsInput : scorerSeasonLossPointsInput,
      powerGapStepInput: isExhibition ? scorerSeasonExhibitionPowerGapStepInput : scorerSeasonPowerGapStepInput,
      powerGapDeltaInput: isExhibition ? scorerSeasonExhibitionPowerGapDeltaInput : scorerSeasonPowerGapDeltaInput,
      panelMessage: setScorerPanelMessage,
    };
  }

  return {
    winInput: isExhibition ? adminSeasonExhibitionWinPointsInput : adminSeasonWinPointsInput,
    lossInput: isExhibition ? adminSeasonExhibitionLossPointsInput : adminSeasonLossPointsInput,
    powerGapStepInput: isExhibition ? adminSeasonExhibitionPowerGapStepInput : adminSeasonPowerGapStepInput,
    powerGapDeltaInput: isExhibition ? adminSeasonExhibitionPowerGapDeltaInput : adminSeasonPowerGapDeltaInput,
    panelMessage: setAdminPanelMessage,
  };
}

async function recalculateSeasonScoresForPanel(messageTarget = "admin") {
  if (!ensureScorerAccess("仅记分员或管理员可重新汇算当前分数。")) return null;
  const { panelMessage } = getSeasonRuleInputs(messageTarget);

  if (!activeSeason?.id) {
    panelMessage("当前没有可操作的赛季。", true);
    setMessage("当前没有可操作的赛季。", true);
    return null;
  }

  panelMessage("正在按赛季首场开始重新汇算积分...");

  let { data, error } = await db.rpc("recalculate_season_scores", {
    p_season_id: activeSeason.id,
  });

  if (error && String(error.message || "").includes("recalculate_season_scores")) {
    const fallbackResult = await db.rpc("recalculate_all_scores");
    data = fallbackResult.data || null;
    error = fallbackResult.error || null;
  }

  if (error) {
    const hint = getLatestSchemaMigrationHint(error);
    const suffix = hint ? ` ${hint}` : "";
    panelMessage(`重新汇算失败：${error.message}${suffix}`, true);
    setMessage(`重新汇算失败：${error.message}${suffix}`, true);
    return null;
  }

  const recalculatedMatches = Number(data?.matches_recalculated ?? 0);
  panelMessage(`已完成重新汇算，本次重算 ${recalculatedMatches} 场比赛。`);
  setMessage(`已完成 ${activeSeason.name || "当前赛季"} 的积分重算。`);
  requestImmediateRefresh({
    seasonContext: true,
    leaderboard: true,
    recentMatches: true,
    rewardLogs: true,
  });
  return data;
}

async function recalculateCurrentScores() {
  return recalculateSeasonScoresForPanel("admin");
}

async function recalculateCurrentScoresForScorer() {
  return recalculateSeasonScoresForPanel("scorer");
}

async function saveSeasonInitialScore(messageTarget = "admin") {
  const panelMessage = messageTarget === "scorer" ? setScorerPanelMessage : setAdminPanelMessage;
  const input = messageTarget === "scorer" ? scorerSeasonInitialScoreInput : adminSeasonInitialScoreInput;
  if (!ensureScorerAccess("仅记分员或管理员可设置赛季初始分。")) return;
  if (!activeSeason?.id) {
    panelMessage("当前没有可操作的赛季。", true);
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const parsed = Number(input?.value ?? "");
  if (!Number.isFinite(parsed)) {
    panelMessage("赛季初始分必须是数字。", true);
    setMessage("赛季初始分必须是数字。", true);
    return;
  }

  panelMessage("正在保存赛季初始分...");

  const { data, error } = await db.rpc("set_season_initial_score", {
    p_season_id: activeSeason.id,
    p_initial_score: parsed,
  });

  if (error) {
    panelMessage(`保存赛季初始分失败：${error.message}`, true);
    setMessage(`保存赛季初始分失败：${error.message}`, true);
    return;
  }

  syncUpdatedSeasonMeta(data);
  panelMessage(`赛季初始分已更新为 ${formatScore(parsed)}。`);
  setMessage(`赛季初始分已更新为 ${formatScore(parsed)}。`);
  requestImmediateRefresh({
    seasonContext: true,
    leaderboard: true,
  });
}

async function saveSeasonMatchPointRules(messageTarget = "admin", ruleMode = "standard") {
  if (!ensureScorerAccess("仅记分员或管理员可设置胜负变动积分。")) return;
  if (!activeSeason?.id) {
    const { panelMessage } = getSeasonRuleInputs(messageTarget, ruleMode);
    panelMessage("当前没有可操作的赛季。", true);
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const {
    winInput,
    lossInput,
    powerGapStepInput,
    powerGapDeltaInput,
    panelMessage,
  } = getSeasonRuleInputs(messageTarget, ruleMode);
  const isExhibition = ruleMode === "exhibition";
  const ruleLabel = isExhibition ? "娱乐赛" : "正赛";

  const winPoints = Number(winInput?.value ?? "");
  const lossPoints = Number(lossInput?.value ?? "");
  const rawPowerGapStep = String(powerGapStepInput?.value ?? "").trim();
  const rawPowerGapDelta = String(powerGapDeltaInput?.value ?? "").trim();
  const powerGapStep = rawPowerGapStep === "" ? 0 : Number(rawPowerGapStep);
  const powerGapDelta = rawPowerGapDelta === "" ? 0 : Number(rawPowerGapDelta);

  if (!Number.isFinite(winPoints) || !Number.isFinite(lossPoints)) {
    panelMessage("胜负变动积分必须都是数字。", true);
    setMessage("胜负变动积分必须都是数字。", true);
    return;
  }
  if (!Number.isInteger(powerGapStep) || powerGapStep < 0) {
    panelMessage("战力差 K 必须是大于等于 0 的整数。", true);
    setMessage("战力差 K 必须是大于等于 0 的整数。", true);
    return;
  }
  if (!Number.isFinite(powerGapDelta) || powerGapDelta < 0) {
    panelMessage("每档修正 N 必须是大于等于 0 的数字。", true);
    setMessage("每档修正 N 必须是大于等于 0 的数字。", true);
    return;
  }

  const confirmed = await confirmAction(
    `确认保存${ruleLabel}积分规则吗？\n\n胜方基础加分：${formatScore(winPoints)}\n负方基础扣分：${formatScore(lossPoints)}\n战力差 K：${powerGapStep}\n每档修正 N：${formatScore(powerGapDelta)}`,
    { title: `保存${ruleLabel}积分规则`, confirmLabel: "保存" }
  );
  if (!confirmed) {
    panelMessage(`已取消保存${ruleLabel}积分规则。`);
    return;
  }

  panelMessage(`正在保存${ruleLabel}积分规则...`);

  let { data, error } = await db.rpc("set_season_match_point_rules", {
    p_season_id: activeSeason.id,
    p_win_points: winPoints,
    p_loss_points: lossPoints,
    p_power_gap_step: powerGapStep,
    p_power_gap_delta: powerGapDelta,
    p_participation_points: isExhibition ? null : getSeasonParticipationPoints(activeSeason.id),
    p_rule_mode: ruleMode,
  });

  const canFallbackToDirectSeasonUpdate = Boolean(
    error
    && String(error.message || "").includes("set_season_match_point_rules")
    && activeSeason?.id
  );

  if (canFallbackToDirectSeasonUpdate) {
    const nextRuleConfig = {
      ...(activeSeason?.rule_config && typeof activeSeason.rule_config === "object" ? activeSeason.rule_config : {}),
      ...(isExhibition ? {
        exhibition_win_points: winPoints,
        exhibition_loss_points: lossPoints,
        exhibition_power_gap_step: powerGapStep,
        exhibition_power_gap_delta: powerGapDelta,
      } : {
        win_points: winPoints,
        loss_points: lossPoints,
        power_gap_step: powerGapStep,
        power_gap_delta: powerGapDelta,
      }),
    };
    const fallbackResult = await db
      .from("seasons")
      .update({ rule_config: nextRuleConfig })
      .eq("id", activeSeason.id)
      .select("id, code, name, status, start_at, end_at, rule_config")
      .single();

    data = fallbackResult.data || null;
    error = fallbackResult.error || null;
  }

  if (error) {
    const hint = getLatestSchemaMigrationHint(error);
    const suffix = hint ? ` ${hint}` : "";
    panelMessage(`保存${ruleLabel}积分规则失败：${error.message}${suffix}`, true);
    setMessage(`保存${ruleLabel}积分规则失败：${error.message}${suffix}`, true);
    return;
  }

  syncUpdatedSeasonMeta(data);
  const ruleSummary = `胜 ${formatScore(winPoints)} / 负 ${formatScore(lossPoints)} / K=${powerGapStep} / N=${formatScore(powerGapDelta)}`;
  const recalcResult = await recalculateSeasonScoresForPanel(messageTarget);
  if (!recalcResult) {
    panelMessage(`${ruleLabel}积分规则已保存为 ${ruleSummary}，但历史积分尚未重算。`, true);
    setMessage(`${ruleLabel}积分规则已保存为 ${ruleSummary}，但历史积分尚未重算。`, true);
    return;
  }

  panelMessage(`${ruleLabel}积分规则已更新为 ${ruleSummary}，并已按首场开始重算当前赛季积分。`);
  setMessage(`${ruleLabel}积分规则已更新为 ${ruleSummary}。`);
}

async function clearSignupQueueForScorer() {
  if (!ensureScorerAccess("仅记分员或管理员可清空报名队列。")) return;
  setScorerPanelMessage("当前数据库结构未接入报名队列。", true);
  setMessage("当前数据库结构未接入报名队列。", true);
}

function formatManualScoreAnchorSummary(result) {
  const anchorDate = String(result?.anchorMatchDate || "").trim();
  const anchorMatchNo = Number(result?.anchorMatchNo ?? NaN);
  if (anchorDate && Number.isFinite(anchorMatchNo) && anchorMatchNo > 0) {
    return `默认挂在 ${anchorDate} 第 ${anchorMatchNo} 场之后`;
  }
  if (anchorDate) {
    return `默认挂在 ${anchorDate} 当日已记录比赛之前`;
  }
  return "已按当前比赛日默认排序";
}

function getManualAdjustmentNoteText(reason, fallbackText = "") {
  const rawReason = String(reason || "").trim();
  if (!rawReason || rawReason === "人工加分" || rawReason === "人工扣分") {
    return fallbackText;
  }
  return rawReason;
}

function getManualScoreHistoryAnchorLabel(entry) {
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const anchorDate = String(metadata.anchor_match_date || "").trim();
  const anchorMatchNo = Number(metadata.anchor_match_no ?? NaN);
  if (!anchorDate) return "";
  const anchorDateLabel = formatLongDisplayDate(anchorDate) || anchorDate;
  if (Number.isFinite(anchorMatchNo) && anchorMatchNo > 0) {
    return `${anchorDateLabel} · 第 ${anchorMatchNo} 场后`;
  }
  return `${anchorDateLabel} · 当日尾部`;
}

function getManualScoreHistoryGroupDate(entry) {
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  return String(
    metadata.anchor_match_date
    || getBeijingBusinessDateString(entry?.created_at)
    || formatArchiveDate(entry?.created_at)
    || "unknown"
  ).trim();
}

function getManualScoreHistoryGroupLabel(groupDate) {
  if (!groupDate || groupDate === "unknown") return "未知日期";
  return formatLongDisplayDate(groupDate) || String(groupDate);
}

function buildManualScoreHistoryItemHtml(entry, mode = "scorer") {
  const playerName = stripPlayerNameMeta(
    getPlayerDisplayNameById(entry.player_id)
    || seasonPlayers.find((player) => player.id === entry.player_id)?.display_name
    || "未知选手"
  ) || "未知选手";
  const pointsDelta = Number(entry.points_delta ?? 0);
  const amountLabel = formatSignedScore(pointsDelta);
  const actionLabel = pointsDelta >= 0 ? "人工加分" : "人工扣分";
  const amountToneClass = pointsDelta > 0
    ? "manual-score-history-amount-positive"
    : (pointsDelta < 0 ? "manual-score-history-amount-negative" : "manual-score-history-amount-neutral");
  const noteText = getManualAdjustmentNoteText(entry.reason, "");
  const metaLabel = getManualScoreHistoryAnchorLabel(entry)
    || getManualScoreHistoryGroupLabel(getManualScoreHistoryGroupDate(entry));
  const noteHtml = noteText
    ? `<p class="manual-score-history-note">${escapeHtml(noteText)}</p>`
    : "";

  return `
    <article class="manual-score-history-item">
      <div class="manual-score-history-item-head">
        <div class="manual-score-history-item-main">
          <strong class="manual-score-history-player">${escapeHtml(playerName)}</strong>
          <span class="manual-score-history-amount ${amountToneClass}">${escapeHtml(amountLabel)}</span>
        </div>
        <button
          type="button"
          class="button-secondary manual-score-history-remove-btn"
          data-adjustment-id="${escapeHtml(entry.id || "")}"
          data-player-name="${escapeHtml(playerName)}"
          data-action-label="${escapeHtml(`${actionLabel} ${amountLabel}`)}"
          data-message-target="${escapeHtml(mode)}"
        >移除</button>
      </div>
      <p class="muted manual-score-history-meta">${escapeHtml(metaLabel)}</p>
      ${noteHtml}
    </article>
  `;
}

async function applyManualScoreAdjustment(kind, options = {}) {
  if (!ensureScorerAccess("仅记分员或管理员可执行人工积分调整。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const mode = options.messageTarget === "admin" ? "admin" : "scorer";
  const panelMessage = mode === "admin" ? setAdminPanelMessage : setScorerPanelMessage;
  const config = getManualScoreControlConfig(mode);
  const selectedPlayers = seasonPlayers.filter((player) => config.selectedIds.has(player.id) && player.is_in_season);
  const rawAmount = String(config.amountInput?.value ?? "").trim();
  const parsedAmount = rawAmount === "" ? NaN : Number(rawAmount);
  const absAmount = Math.abs(parsedAmount);
  const pointsDelta = kind === "death_finger" ? -absAmount : absAmount;
  const actionLabel = pointsDelta < 0 ? "扣分" : "加分";

  if (!selectedPlayers.length) {
    setManualScoreModalMessage(mode, "请至少选择一名选手。", true);
    return;
  }
  if (!Number.isFinite(absAmount) || absAmount <= 0) {
    setManualScoreModalMessage(mode, "请输入大于 0 的分值。", true);
    return;
  }

  const rawNote = String(config.noteInput?.value ?? "").trim();
  const reason = rawNote || `人工${actionLabel}`;
  const selectedLabel = selectedPlayers.length === 1
    ? selectedPlayers[0].display_name
    : `${selectedPlayers.length} 名选手`;
  const confirmed = await confirmAction(
    `确认对 ${selectedLabel}${actionLabel} ${formatScore(absAmount)} 分吗？`,
    { title: `人工${actionLabel}`, confirmLabel: "确认" }
  );
  if (!confirmed) {
    setManualScoreModalMessage(mode, `已取消${actionLabel}。`);
    return;
  }

  const pendingText = `正在为 ${selectedLabel}${actionLabel} ${formatScore(absAmount)} 分...`;
  setManualScoreModalMessage(mode, pendingText);
  panelMessage(pendingText);

  const results = await Promise.allSettled(
    selectedPlayers.map((player) => invokeFunction("manual-adjust-score", {
      seasonId: activeSeason.id,
      playerId: player.id,
      pointsDelta,
      reason,
    }))
  );

  const successResults = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failureResults = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  if (!successResults.length) {
    const message = failureResults[0]?.message || `人工${actionLabel}失败。`;
    setManualScoreModalMessage(mode, message, true);
    panelMessage(message, true);
    setMessage(message, true);
    return;
  }

  const anchorSummary = formatManualScoreAnchorSummary(successResults[0]);
  const successMessage = failureResults.length
    ? `已为 ${successResults.length} 名选手${actionLabel} ${formatScore(absAmount)} 分；另有 ${failureResults.length} 人失败。${anchorSummary}。`
    : `已为 ${successResults.length} 名选手${actionLabel} ${formatScore(absAmount)} 分。${anchorSummary}。`;
  const errorMessage = failureResults[0]?.message || "";

  setManualScoreModalMessage(
    mode,
    failureResults.length ? `${successMessage}${errorMessage ? ` 失败原因：${errorMessage}` : ""}` : successMessage,
    failureResults.length > 0
  );
  panelMessage(successMessage, failureResults.length > 0);
  setMessage(successMessage, failureResults.length > 0);
  appendAdminActionLog(
    `对 ${selectedLabel}人工${actionLabel} ${formatScore(absAmount)} 分。${rawNote ? `备注：${rawNote}。` : ""}${anchorSummary}。`
  );

  scoreDetailSeasonCache.clear();
  await requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
  await loadManualScoreHistory();

  if (!failureResults.length) {
    resetManualScoreControls(mode);
    setManagedDialogOpen(mode === "admin" ? "adminManualScore" : "scorerManualScore", false);
  } else {
    updateManualScoreControlState(mode);
  }
}

async function revokeManualScoreAdjustment(adjustmentId, playerName, actionLabel, options = {}) {
  if (!ensureScorerAccess("仅记分员或管理员可撤销人工积分调整。")) return;
  const normalizedId = String(adjustmentId || "").trim();
  if (!normalizedId) return;

  const mode = options.messageTarget === "admin" ? "admin" : "scorer";
  const useManualModalMessage = options.messageTarget === "admin" || options.messageTarget === "scorer";
  const setContextMessage = useManualModalMessage
    ? (text = "", isError = false) => setManualScoreModalMessage(mode, text, isError)
    : setScoreDetailMessage;
  const panelMessage = mode === "admin" ? setAdminPanelMessage : setScorerPanelMessage;
  const actorLabel = getCurrentAccessActorLabel();
  const resolvedPlayerName = stripPlayerNameMeta(playerName || "该选手") || "该选手";
  const resolvedActionLabel = String(actionLabel || "这条人工积分记录").trim() || "这条人工积分记录";
  const confirmed = await confirmAction(
    `确认移除 ${resolvedPlayerName} 的“${resolvedActionLabel}”吗？`,
    { title: "移除人工积分", confirmLabel: "移除", danger: true }
  );
  if (!confirmed) {
    setContextMessage("已取消移除。");
    return;
  }

  const pendingText = `正在移除 ${resolvedPlayerName} 的人工积分记录...`;
  setContextMessage(pendingText);
  if (useManualModalMessage) {
    panelMessage(pendingText);
  }

  try {
    const { error } = await db.rpc("revoke_manual_score_adjustment", {
      p_adjustment_id: normalizedId,
      p_reason: `${actorLabel} 撤销人工积分调整`,
    });
    if (error) {
      throw error;
    }

    scoreDetailSeasonCache.clear();
    await requestImmediateRefresh({
      leaderboard: true,
      recentMatches: true,
    });
    await loadManualScoreHistory();

    if (scoreDetailState?.playerId && scoreDetailState?.seasonId) {
      await openScoreDetailModal(scoreDetailState.playerId);
    }

    const successMessage = `已移除 ${resolvedPlayerName} 的“${resolvedActionLabel}”。`;
    setContextMessage(successMessage);
    if (useManualModalMessage) {
      panelMessage(successMessage);
    }
    setMessage(successMessage);
    appendAdminActionLog(`移除了 ${resolvedPlayerName} 的“${resolvedActionLabel}”。`);
  } catch (error) {
    const message = `移除人工积分失败：${getErrorMessage(error)}`;
    setContextMessage(message, true);
    if (useManualModalMessage) {
      panelMessage(message, true);
    }
    setMessage(message, true);
  }
}

async function persistSeasonPlayerRank(playerId, playerRank) {
  const targetRank = normalizeSeasonRankNo(playerRank);
  const { data, error } = await db.rpc("set_season_player_rank", {
    p_season_id: activeSeason.id,
    p_player_id: playerId,
    p_rank_no: targetRank,
  });

  return { data, error };
}

async function setSeasonRankCount(nextValue, messageTarget = "scorer") {
  return saveSeasonRankCountValue(nextValue, messageTarget);
}

async function saveSeasonRankCountValue(nextValue, messageTarget = "scorer", options = {}) {
  if (!ensureScorerAccess("仅记分员或管理员可调整 Rank 数量。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const panelMessage = messageTarget === "admin" ? setAdminPanelMessage : setScorerPanelMessage;
  const parsed = Number(nextValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    panelMessage("Rank 数量必须是 1 到 12 之间的整数。", true);
    return null;
  }

  if (!options.silent) {
    panelMessage("正在保存 Rank 数量...");
  }
  const { data, error } = await db.rpc("set_season_rank_count", {
    p_season_id: activeSeason.id,
    p_rank_count: parsed,
  });

  if (error) {
    panelMessage(`保存 Rank 数量失败：${error.message}`, true);
    return null;
  }

  syncUpdatedSeasonMeta(data);
  if (!options.silent) {
    panelMessage(`当前赛季 Rank 数量已更新为 ${parsed}。`);
    setMessage(`当前赛季 Rank 数量已更新为 ${parsed}。`);
    requestImmediateRefresh({ playerDriven: true });
  }
  return {
    parsed,
    season: data,
  };
}

async function saveSeasonRankLabels(messageTarget = "scorer") {
  if (!ensureScorerAccess("仅记分员或管理员可修改选手战力值。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const mode = messageTarget === "admin" ? "admin" : "scorer";
  const panelMessage = messageTarget === "admin" ? setAdminPanelMessage : setScorerPanelMessage;
  const draft = getSeasonPowerDraft(mode);
  const entries = (draft?.players || []).map((entry) => {
    const rawValue = String(entry.rawValue || "").trim();
    return {
      playerId: entry.playerId || "",
      rawValue,
      powerValue: rawValue === "" ? 0 : Number(rawValue),
    };
  });

  if (!entries.length) {
    panelMessage("当前没有可保存的选手战力值。", true);
    return;
  }

  for (const entry of entries) {
    if (!entry.playerId) {
      panelMessage("存在缺少选手信息的战力值输入。", true);
      return;
    }
    if (
      entry.rawValue !== ""
      && (!/^\d+$/.test(entry.rawValue) || !Number.isSafeInteger(entry.powerValue))
    ) {
      const playerName = seasonPlayers.find((player) => player.id === entry.playerId)?.display_name || "该选手";
      panelMessage(`${playerName} 的战力值必须是大于等于 0 的整数；0 表示不参加当前赛季。`, true);
      return;
    }
  }

  const powerValues = [...new Set(
    entries
      .filter((entry) => entry.powerValue > 0)
      .map((entry) => entry.powerValue)
  )].sort((a, b) => b - a);

  if (powerValues.length > 12) {
    panelMessage("当前数据库最多支持 12 个 Rank 档位，请减少不同战力值的数量。", true);
    return;
  }

  const targetRankCount = Math.max(powerValues.length, 1);
  const rankByPowerValue = new Map(powerValues.map((value, index) => [value, index + 1]));
  const targetRankByPlayerId = new Map(
    entries.map((entry) => [
      entry.playerId,
      entry.powerValue > 0 ? rankByPowerValue.get(entry.powerValue) : null,
    ])
  );
  const changedPlayers = seasonPlayers.filter((player) => {
    if (!targetRankByPlayerId.has(player.id)) return false;
    const targetRank = normalizeSeasonRankNo(targetRankByPlayerId.get(player.id));
    return normalizeSeasonRankNo(player.player_rank) !== targetRank
      || Boolean(player.is_in_season) !== Boolean(targetRank);
  });

  const rankSummary = powerValues.length
    ? powerValues.map((value, index) => `${getDefaultSeasonRankLabel(index + 1)}=战力 ${value}`).join("，")
    : "无参赛选手";
  const confirmed = await confirmAction(
    `确认保存选手战力值吗？\n\n将生成 ${targetRankCount} 个 Rank 档位：${rankSummary}\n将更新 ${changedPlayers.length} 名选手的参赛/Rank 状态。`,
    { title: "保存选手战力值", confirmLabel: "保存" }
  );
  if (!confirmed) {
    panelMessage("已取消保存选手战力值。");
    return;
  }

  panelMessage("正在保存选手战力值...");

  const rankCountResult = await saveSeasonRankCountValue(targetRankCount, messageTarget, { silent: true });
  if (!rankCountResult) {
    return;
  }

  let lastUpdatedSeason = rankCountResult.season || null;
  const rankProfileEntries = powerValues.length
    ? powerValues.map((value, index) => ({ rankNo: index + 1, powerValue: value }))
    : [{ rankNo: 1, powerValue: null }];
  const currentRankLabels = getSeasonRankLabels(activeSeason.id);
  const nextRankLabels = new Map(
    Object.entries(draft?.rankLabels || {}).map(([rank, label]) => [
      Number(rank || 0),
      String(label || "").trim(),
    ])
  );

  for (const entry of rankProfileEntries) {
    const { data, error } = await db.rpc("set_season_rank_profile", {
      p_season_id: activeSeason.id,
      p_rank_no: entry.rankNo,
      p_label: (nextRankLabels.has(entry.rankNo)
        ? nextRankLabels.get(entry.rankNo)
        : String(currentRankLabels?.[entry.rankNo] || "").trim()) || null,
      p_power_value: entry.powerValue,
    });

    if (error) {
      panelMessage(`保存 Rank 档位战力失败：${error.message}`, true);
      return;
    }
    lastUpdatedSeason = data;
  }

  for (const player of seasonPlayers) {
    if (!targetRankByPlayerId.has(player.id)) continue;
    const targetRank = targetRankByPlayerId.get(player.id) || null;
    if (
      normalizeSeasonRankNo(player.player_rank) === normalizeSeasonRankNo(targetRank)
      && Boolean(player.is_in_season) === Boolean(targetRank)
    ) {
      continue;
    }

    const { error } = await persistSeasonPlayerRank(player.id, targetRank);
    if (error) {
      panelMessage(`保存 ${player.display_name || "该选手"} 的战力值失败：${error.message}`, true);
      await loadSeasonPlayers();
      return;
    }
  }

  if (lastUpdatedSeason) {
    syncUpdatedSeasonMeta(lastUpdatedSeason);
  }

  const recalcResult = await recalculateSeasonScoresForPanel(messageTarget);
  if (!recalcResult) {
    panelMessage(`选手战力值已保存，当前生成 ${targetRankCount} 个 Rank 档位，但历史积分尚未重算。`, true);
    setMessage(`选手战力值已保存，当前生成 ${targetRankCount} 个 Rank 档位，但历史积分尚未重算。`, true);
  } else {
    panelMessage(`选手战力值已保存，当前生成 ${targetRankCount} 个 Rank 档位，并已按当前战力重算本赛季历史积分。`);
    setMessage(`选手战力值已保存，当前生成 ${targetRankCount} 个 Rank 档位。`);
  }
  seasonPowerDraftCommitTimers[mode].forEach((timerId) => window.clearTimeout(timerId));
  seasonPowerDraftCommitTimers[mode].clear();
  seasonPowerDraftState[mode] = null;
  await loadSeasonPlayers();
  await loadLeaderboard();
  await loadRecentMatches();
  if (!getManagedDialogModal(mode === "admin" ? "adminPower" : "scorerPower")?.hidden) {
    getSeasonPowerDraft(mode, { reset: true });
    renderSingleRankLabelEditor(mode);
  }
}

async function loadQueue() {
  queueEntries = [];
  renderQueue(queueEntries);
  renderSignupOptions();
}

async function signup() {
  if (!isActiveSeasonReadyForMatches()) {
    setMessage(getActiveSeasonMatchGateMessage() || "当前赛季尚未开放比赛登记。", true);
    return;
  }

  if (!activeMatchDay) {
    setMessage("请先发起当日比赛，再开启报名。", true);
    return;
  }

  const playerId = arguments[0];

  if (!playerId) {
    setMessage("缺少选手信息，无法报名。", true);
    return;
  }
  setMessage("正在报名...");

  const payload = {
    player_id: playerId,
    is_active: true,
    status: "active",
  };

  if (activeSeason?.id) {
    payload.season_id = activeSeason.id;
  }

  const optimisticEntry = createOptimisticQueueEntry(playerId, getPlayerDisplayNameById(playerId), {
    season_id: payload.season_id ?? null,
  });
  queueEntries = [...queueEntries, optimisticEntry];
  rerenderQueueLocally();

  const { error } = await db.from("signup_queue").insert([payload]);

  if (error) {
    queueEntries = queueEntries.filter((entry) => entry.id !== optimisticEntry.id);
    rerenderQueueLocally();
    if (error.message.includes("signup_queue_one_active_per_player")) {
      setMessage("该玩家已经在报名队列中。", true);
      return;
    }

    setMessage(`报名失败：${error.message}`, true);
    return;
  }

  setMessage("报名成功。");
  requestImmediateRefresh({ queue: true });
}

async function cancelSignupByEntry(entryId, playerName, buttonEl) {
  if (!entryId) {
    setMessage("缺少报名记录，无法取消。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const targetEntry = queueEntries.find((row) => row.id === entryId) || null;
  const previousEntry = targetEntry ? { ...targetEntry } : null;
  if (targetEntry) {
    targetEntry.is_active = false;
    targetEntry.status = "cancelled";
    targetEntry.cancelled_at = new Date().toISOString();
    rerenderQueueLocally();
  }

  setMessage(`正在取消 ${playerName || "该玩家"} 的报名...`);

  const { error } = await db
    .from("signup_queue")
    .update({
      is_active: false,
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (error) {
    if (targetEntry && previousEntry) {
      Object.assign(targetEntry, previousEntry);
      rerenderQueueLocally();
    }
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(`取消报名失败：${error.message}`, true);
    return;
  }

  setMessage(`${playerName || "该玩家"} 已取消报名，队列中会保留取消记录。`);
  requestImmediateRefresh({ queue: true });
}

async function cancelSignupByPlayer(playerId, playerName, buttonEl) {
  const entry = queueEntries.find(
    (row) => row.player_id === playerId && row.is_active === true && row.status !== "confirmed"
  );

  if (!entry) {
    setMessage(`${playerName || "该玩家"} 当前不在报名队列中。`, true);
    return;
  }

  await cancelSignupByEntry(entry.id, playerName, buttonEl);
}

async function reSignupByEntry(entryId, playerName, buttonEl) {
  if (!entryId) {
    setMessage("缺少报名记录，无法重新报名。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const targetEntry = queueEntries.find((row) => row.id === entryId) || null;
  const previousEntry = targetEntry ? { ...targetEntry } : null;
  if (targetEntry) {
    targetEntry.is_active = true;
    targetEntry.status = "active";
    targetEntry.cancelled_at = null;
    targetEntry.created_at = new Date().toISOString();
    rerenderQueueLocally();
  }

  setMessage(`正在为 ${playerName || "该玩家"} 重新报名...`);

  const { error } = await db
    .from("signup_queue")
    .update({
      is_active: true,
      status: "active",
      cancelled_at: null,
      created_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  if (error) {
    if (targetEntry && previousEntry) {
      Object.assign(targetEntry, previousEntry);
      rerenderQueueLocally();
    }
    if (buttonEl) {
      buttonEl.disabled = false;
    }

    if (error.message.includes("signup_queue_one_active_per_player")) {
      setMessage("该玩家已经在报名队列中。", true);
      return;
    }

    setMessage(`重新报名失败：${error.message}`, true);
    return;
  }

  setMessage(`${playerName || "该玩家"} 已重新进入报名队列。`);
  requestImmediateRefresh({ queue: true });
}

async function confirmQueueToTodayPlayers() {
  if (!ensureScorerAccess("仅记分员或管理员可确认到齐。")) return;
  if (!isActiveSeasonReadyForMatches()) {
    setMessage(getActiveSeasonMatchGateMessage() || "当前赛季尚未开放比赛登记。", true);
    return;
  }
  confirmQueueBtn.disabled = true;
  setMessage("正在确认已就位的选手...");

  const { data, error } = await db.rpc("confirm_queue_to_today_players", {
    p_season_id: activeSeason?.id || null,
  });

  if (error) {
    setMessage(`确认已就位选手失败：${error.message}`, true);
    await loadQueue();
    return;
  }

  setMessage(`已确认已就位选手 ${data ?? 0} 人，未就位的报名选手仍保留在队列中。`);
  appendAdminActionLog(`确认了 ${data ?? 0} 名已就位选手。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function clearSignupQueueForTesting() {
  if (!ensureAdminAccess("仅管理员可测试清空报名队列。")) return;
  const confirmed = await confirmAction(
    "确认清空当前赛季的全部报名队列记录吗？这会删除报名中、已取消和已确认记录。",
    { title: "清空报名队列", confirmLabel: "清空", danger: true }
  );

  if (!confirmed) {
    return;
  }

  clearQueueBtn.disabled = true;
  setMessage("正在清空报名队列...");

  const { data, error } = await db.rpc("clear_signup_queue_for_testing", {
    p_season_id: activeSeason?.id || null,
  });

  clearQueueBtn.disabled = false;

  if (error) {
    setMessage(`清空报名队列失败：${error.message}`, true);
    return;
  }

  setMessage(`已清空当前赛季报名队列，共删除 ${data ?? 0} 条记录。`);
  appendAdminActionLog(`测试清空了报名队列，共删除 ${data ?? 0} 条记录。`);
  requestImmediateRefresh({ queue: true });
}

async function clearTodayPlayersForTesting() {
  if (!ensureAdminAccess("仅管理员可测试清空当日选手。")) return;
  const confirmed = await confirmAction(
    "确认清空当前赛季的当日选手名单吗？",
    { title: "清空当日选手", confirmLabel: "清空", danger: true }
  );

  if (!confirmed) {
    return;
  }

  setMessage("正在清空当日选手名单...");

  const { data, error } = await db.rpc("clear_today_players_for_testing", {
    p_season_id: activeSeason?.id || null,
  });

  if (error) {
    setMessage(`清空当日选手名单失败：${error.message}`, true);
    return;
  }

  setMessage(`已清空当日选手名单，共删除 ${data ?? 0} 条记录。`);
  appendAdminActionLog(`测试清空了当日选手，共删除 ${data ?? 0} 条记录。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function startMatchDay() {
  if (!isActiveSeasonReadyForMatches()) {
    setMessage(getActiveSeasonMatchGateMessage() || "当前赛季尚未开放比赛登记。", true);
    return;
  }

  matchStartTimeInput.value = normalizeTimeInput(matchStartTimeInput.value);
  const startTime = matchStartTimeInput.value || "19:30";

  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    setMessage("请按 24 小时制填写开始时间，例如 19:30。", true);
    return;
  }

  startMatchDayBtn.disabled = true;
  setMessage("正在发起当日比赛...");

  const { error } = await db.rpc("start_match_day", {
    p_season_id: activeSeason?.id || null,
    p_note: null,
  });

  if (error) {
    startMatchDayBtn.disabled = false;
    setMessage(`发起当日比赛失败：${error.message}`, true);
    return;
  }

  writeStoredMatchDayStartTime({
    seasonId: activeSeason?.id || null,
    matchDate: getBeijingBusinessDateString(),
    startTime: formatTime24(startTime),
  });
  matchStartTimeInput.value = "";
  setMessage("当日比赛已发起，可以开始报名和记录比赛。");
  appendAdminActionLog(`发起了一次比赛，开始时间为 ${formatTime24(startTime)}。`);
  requestImmediateRefresh({
    playerDriven: true,
    recentMatches: true,
  });
}

async function cancelMatchDay() {
  const confirmed = await confirmAction(
    "确认取消当前已发起的比赛吗？这会清空当前赛季的报名队列和当日选手名单。",
    { title: "取消比赛日", confirmLabel: "确认取消", danger: true }
  );

  if (!confirmed) {
    return;
  }

  startMatchDayBtn.disabled = true;
  setMessage("正在取消当日比赛...");

  const { error } = await db.rpc("cancel_active_match_day", {
    p_season_id: activeSeason?.id || null,
  });

  if (error) {
    startMatchDayBtn.disabled = false;
    setMessage(`取消发起失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  clearStoredMatchDayStartTime();
  matchStartTimeInput.value = "";
  setMessage("已取消当日比赛发起。");
  appendAdminActionLog("取消了当前比赛日。");
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
    recentMatches: true,
  });
}

async function finishTodayMatchDay() {
  if (!ensureScorerAccess("仅记分员或管理员可结束比赛日。")) return;
  if (!activeSeason?.id) {
    setMessage("当前缺少可用赛季，暂时无法完结今日比赛。", true);
    return;
  }

  const actionContext = getFinishMatchDayActionContext(activeSeason.id);
  const targetMatchCount = actionContext.targetMatchCount;
  const targetLabel = actionContext.targetDate === actionContext.businessDate ? "今日比赛" : `${actionContext.targetDate} 比赛日`;
  const confirmed = await confirmAction(
    targetMatchCount > 0
      ? `确认将${targetLabel}标记为全部完结吗？这会立刻执行一次积分汇算，并清空相关报名队列与当日名单。`
      : `确认将${targetLabel}标记为全部完结吗？当前没有已记录比赛，也会执行一次积分汇算，并清空相关报名队列与当日名单。`,
    { title: "完结比赛日", confirmLabel: "确认完结" }
  );
  if (!confirmed) {
    return;
  }

  finishTodayMatchDayButtons.forEach((button) => {
    button.disabled = true;
  });

  setMessage("正在完结比赛日并汇算...");
  setMatchMessage("正在完结比赛日并汇算...");
  setBackfillMessage("");

  let data = null;
  let error = null;

  if (actionContext.targetDate === actionContext.businessDate && targetMatchCount > 0) {
    ({ data, error } = await db.rpc("finalize_active_match_day", {
      p_season_id: activeSeason.id,
    }));
  } else {
    const cancelResult = await db.rpc("cancel_active_match_day", {
      p_season_id: activeSeason.id,
    });
    error = cancelResult.error || null;

    if (!error) {
      const recalcResult = await db.rpc("recalculate_all_scores");
      error = recalcResult.error || null;
      data = !error;
    }
  }

  finishTodayMatchDayButtons.forEach((button) => {
    button.disabled = false;
  });

  if (error) {
    const failurePrefix = "完结比赛日失败";
    setMessage(`${failurePrefix}：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    setMatchMessage(`${failurePrefix}：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    return;
  }

  if (!data) {
    setMessage("当前没有可结束的比赛日记录。");
    setMatchMessage("当前没有可结束的比赛日记录。");
    return;
  }

  clearStoredMatchDayStartTime();
  matchStartTimeInput.value = "";
  setMessage(`${targetLabel}已全部完结，积分已完成汇算。`);
  setMatchMessage(`${targetLabel}已全部完结，积分已完成汇算。`);
  appendAdminActionLog(`手动完结了 ${actionContext.targetDate} 比赛日并触发了一次积分汇算。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
    leaderboard: true,
    recentMatches: true,
  });
}

async function markQueuePlayerReady(playerId, playerName, buttonEl) {
  if (!activeMatchDay) {
    setMessage("请先发起当日比赛。", true);
    return;
  }

  if (!playerId) {
    setMessage("缺少选手信息，无法就位。", true);
    return;
  }

  if (todayPlayers.some((player) => (player.player_id || player.id) === playerId)) {
    setMessage(`${playerName || "该玩家"} 已在当日选手名单中。`);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const optimisticEntry = createOptimisticTodayPlayer(playerId, playerName, {
    season_id: activeSeason?.id || null,
    source: "queue",
  });
  addTodayPlayerLocally(optimisticEntry);
  rerenderPlayerDrivenLocally();

  setMessage(`正在将 ${playerName || "该玩家"} 标记为就位...`);

  const payload = {
    player_id: playerId,
    play_date: getBeijingBusinessDateString(),
    source: "queue",
  };

  if (activeSeason?.id) {
    payload.season_id = activeSeason.id;
  }

  const { error } = await db.from("daily_player_roster").insert([payload]);

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    removeTodayPlayerLocallyByEntryId(optimisticEntry.id);
    rerenderPlayerDrivenLocally();
    setMessage(`选手就位失败：${error.message}`, true);
    return;
  }

  setMessage(`${playerName || "该玩家"} 已开机入场。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function cancelQueuePlayerReady(entryId, playerName, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可取消已就位选手。")) return;
  if (!entryId) {
    setMessage("缺少就位记录，无法取消。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const removedEntry = removeTodayPlayerLocallyByEntryId(entryId);
  if (removedEntry) {
    rerenderPlayerDrivenLocally();
  }

  setMessage(`正在取消 ${playerName || "该玩家"} 的就位状态...`);

  const { error } = await db.from("daily_player_roster").delete().eq("id", entryId);

  if (error) {
    if (removedEntry) {
      addTodayPlayerLocally(removedEntry);
      rerenderPlayerDrivenLocally();
    }
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(`取消就位失败：${error.message}`, true);
    return;
  }

  setMessage(`${playerName || "该玩家"} 已取消就位。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function addMatchDayAttendanceNote(matchDayId, seasonId, matchDate, status, playerIds, groupKey, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可补记每日名单。")) return;
  const targetPlayerIds = (Array.isArray(playerIds) ? playerIds : [playerIds]).filter(Boolean);
  if (!targetPlayerIds.length || !status) {
    setMessage("缺少比赛日或选手信息，无法补记。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  let resolvedMatchDayId = matchDayId || "";
  const resolvedSeasonId = seasonId || activeSeason?.id || null;
  const resolvedMatchDate = matchDate || activeMatchDay?.match_date || "";
  if (!canModifyMatchRecordsForSeason(resolvedSeasonId)) {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(getSeasonReadOnlyReason(resolvedSeasonId), true);
    return;
  }

  if (!resolvedMatchDayId && resolvedSeasonId && resolvedMatchDate) {
    if (
      activeMatchDay?.id
      && activeMatchDay.match_date === resolvedMatchDate
      && (!activeSeason?.id || activeSeason.id === resolvedSeasonId)
    ) {
      resolvedMatchDayId = activeMatchDay.id;
    } else {
      const matchDayResult = await db
        .from("match_days")
        .select("id")
        .eq("season_id", resolvedSeasonId)
        .eq("match_date", resolvedMatchDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (matchDayResult.error && !isMissingPublicTableError(matchDayResult.error, "match_days")) {
        if (buttonEl) {
          buttonEl.disabled = false;
        }
        const schemaHint = getLatestSchemaMigrationHint(matchDayResult.error);
        setMessage(`查找比赛日失败：${matchDayResult.error.message}${schemaHint ? ` ${schemaHint}` : ""}`, true);
        return;
      }

      resolvedMatchDayId = matchDayResult.data?.id || "";
    }
  }

  if (!resolvedMatchDayId && (!resolvedSeasonId || !resolvedMatchDate)) {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage("当前比赛日信息不完整，无法登记迟到选手。", true);
    return;
  }

  // Allow legacy / backfilled match records to attach attendance notes by season+date
  // even when no concrete match_day row can be resolved yet.
  const resolvedAttendanceMatchDayId = resolvedMatchDayId || null;
  const optimisticNoteIds = targetPlayerIds
    .map((playerId) => addMatchDayAttendanceNoteLocally(
      resolvedAttendanceMatchDayId,
      resolvedSeasonId,
      resolvedMatchDate,
      playerId,
      status,
      "",
      { groupKey }
    ))
    .filter(Boolean);
  setMessage(`正在登记${status === "absent" ? "迟到" : "补记"}名单（${targetPlayerIds.length} 人）...`);

  const payload = targetPlayerIds.map((playerId) => ({
    match_day_id: resolvedAttendanceMatchDayId,
    season_id: resolvedSeasonId,
    match_date: resolvedMatchDate || null,
    player_id: playerId,
    status,
  }));

  const { error } = await db.from("match_day_attendance_notes").insert(payload);

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    optimisticNoteIds.forEach((noteId) => removeMatchDayAttendanceNoteLocally(noteId));
    const schemaHint = getLatestSchemaMigrationHint(error);
    setMessage(
      `登记${status === "absent" ? "迟到" : "补记"}名单失败：${error.message}${schemaHint ? ` ${schemaHint}` : "。请先在 Supabase 执行最新 SQL。"}`,
      true
    );
    return;
  }

  clearMatchDayAttendanceSelection(groupKey);
  setMessage(`已登记${status === "absent" ? "迟到" : "补记"}名单（${targetPlayerIds.length} 人）。`);
  if (resolvedSeasonId) {
    recentMatchLoadedSeasonIds.delete(resolvedSeasonId);
    void loadRecentMatchesForSeason(resolvedSeasonId, { keepOpen: true });
  }
  requestImmediateRefresh({
    playerDriven: true,
    recentMatches: true,
  });
}

async function removeMatchDayAttendanceNote(noteId, playerName, statusLabel, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可移除每日补记名单。")) return;
  if (!noteId) return;
  const attendanceEntry = recentMatchAttendanceNotesData.find((entry) => entry.id === noteId) || null;
  if (attendanceEntry?.season_id && !canModifyMatchRecordsForSeason(attendanceEntry.season_id)) {
    setMessage(getSeasonReadOnlyReason(attendanceEntry.season_id), true);
    return;
  }
  const resolvedStatusLabel = statusLabel || "补记";
  const confirmed = await confirmAction(
    `确认移除 ${playerName || "该选手"} 的${resolvedStatusLabel}记录吗？`,
    { title: "移除补记记录", confirmLabel: "移除", danger: true }
  );
  if (!confirmed) return;

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const removedState = removeMatchDayAttendanceNoteLocally(noteId);
  setMessage(`正在移除 ${playerName || "该选手"} 的${resolvedStatusLabel}记录...`);

  const { error } = await db.from("match_day_attendance_notes").delete().eq("id", noteId);

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    if (removedState?.entry) {
      restoreMatchDayAttendanceNoteLocally(removedState.entry);
    }
    setMessage(`移除补记名单失败：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    return;
  }

  setMessage(`${playerName || "该选手"} 的补记状态已移除。`);
  if (removedState?.entry?.season_id) {
    recentMatchLoadedSeasonIds.delete(removedState.entry.season_id);
    void loadRecentMatchesForSeason(removedState.entry.season_id, { keepOpen: true });
  }
  requestImmediateRefresh({
    playerDriven: true,
    recentMatches: true,
  });
}

function getSelectionStateByFormType(formType) {
  return formType === "backfill"
    ? { selections: backfillTeamSelections, assignments: backfillHeroAssignments }
    : { selections: matchTeamSelections, assignments: matchHeroAssignments };
}

function rerenderSelectionsByFormType(formType) {
  if (formType === "backfill") {
    renderBackfillForm();
    return;
  }

  renderMatchForm();
}

function togglePlayerSelection(formType, teamKey, playerId) {
  if (!["teamA", "teamB"].includes(teamKey) || !playerId) {
    return;
  }

  const { selections, assignments } = getSelectionStateByFormType(formType);
  const oppositeTeamKey = teamKey === "teamA" ? "teamB" : "teamA";

  if (selections[teamKey].includes(playerId)) {
    selections[teamKey] = selections[teamKey].filter((id) => id !== playerId);
    delete assignments[playerId];
    rerenderSelectionsByFormType(formType);
    return;
  }

  if (selections[oppositeTeamKey].includes(playerId)) {
    return;
  }

  if (selections[teamKey].length >= TEAM_SIZE) {
    if (formType === "backfill") {
      setBackfillMessage(`每边最多选择 ${TEAM_SIZE} 名选手。`, true);
    } else {
      setMatchMessage(`每边最多选择 ${TEAM_SIZE} 名选手。`, true);
    }
    return;
  }

  selections[teamKey] = [...selections[teamKey], playerId];
  if (formType === "backfill") {
    setBackfillMessage("");
  } else {
    setMatchMessage("");
  }
  rerenderSelectionsByFormType(formType);
}

function renderHeroSuggestions(searchTerm = "") {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  if (!isHeroSearchReady(normalizedSearch)) {
    heroSearchSuggestions.hidden = true;
    heroSearchSuggestions.innerHTML = "";
    return;
  }

  const heroes = getFilteredHeroes(searchTerm).slice(0, 12);

  if (!heroes.length) {
    heroSearchSuggestions.hidden = false;
    heroSearchSuggestions.innerHTML = '<div class="hero-search-empty">没有匹配到英雄</div>';
    return;
  }

  heroSearchSuggestions.hidden = false;
  heroSearchSuggestions.innerHTML = heroes.map((hero) => `
    <button type="button" class="hero-search-option" data-hero-name="${escapeHtml(hero)}">
      <span>${escapeHtml(getHeroDisplayName(hero))}</span>
      <small>${escapeHtml(hero)}</small>
    </button>
  `).join("");
}

function renderHeroOptions(searchTerm = "") {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
  const filteredHeroes = getFilteredHeroes(searchTerm);

  heroSelect.innerHTML = ['<option value="">不选择英雄</option>']
    .concat(
      filteredHeroes.map((hero) => (
        `<option value="${escapeHtml(hero)}">${escapeHtml(getHeroDisplayName(hero))}</option>`
      ))
    )
    .join("");

  if (heroPickerState?.currentHero && filteredHeroes.includes(heroPickerState.currentHero)) {
    heroSelect.value = heroPickerState.currentHero;
  } else if (!filteredHeroes.includes(heroSelect.value)) {
    heroSelect.value = "";
  }

  if (normalizedSearch && filteredHeroes.length === 0) {
    setHeroPickerMessage("没有匹配到英雄，可以换英文、中文或拼音首字母再试。", true);
    renderHeroSuggestions(searchTerm);
    return;
  }

  setHeroPickerMessage("");
  renderHeroSuggestions(searchTerm);
}

function openHeroPicker(state) {
  heroPickerState = state;
  setDialogOpen(heroPickerModal, true, { initialFocus: heroSearchInput });
  heroPickerTitle.textContent = `${state.playerName} 的英雄`;
  heroPickerSubtitle.textContent = state.isSavedMatch
    ? "可随时补填、修改或清空该选手本场使用的英雄。"
    : "当前为可选项，可先留空，保存比赛后也能再修改。";
  heroSearchInput.value = "";
  renderHeroOptions("");
  heroSelect.value = state.currentHero || "";
  heroSearchInput.focus();
}

function closeHeroPicker() {
  heroPickerState = null;
  setDialogOpen(heroPickerModal, false);
  heroSearchInput.value = "";
  heroSearchSuggestions.hidden = true;
  heroSearchSuggestions.innerHTML = "";
  heroSelect.value = "";
  setHeroPickerMessage("");
}

async function saveHeroSelection(heroName) {
  if (!heroPickerState) return;

  const normalizedHero = heroName || null;

  if (heroPickerState.isSavedMatch) {
    setHeroPickerMessage("当前数据库结构未保存英雄与 KDA，比赛存档仅保留阵容、胜负与双倍信息。", true);
    return;
  }

  const targetAssignments = heroPickerState.formType === "backfill"
    ? backfillHeroAssignments
    : matchHeroAssignments;

  if (normalizedHero) {
    targetAssignments[heroPickerState.playerId] = normalizedHero;
  } else {
    delete targetAssignments[heroPickerState.playerId];
  }

  if (heroPickerState.formType === "backfill") {
    refreshBackfillSelectOptions();
  } else {
    refreshMatchSelectOptions();
  }
  closeHeroPicker();
}

function getHeroAssignmentsForSelectedPlayers(teamIds, assignments) {
  return teamIds.map((playerId) => assignments[playerId] || null);
}

function getSelectedTeamIds(prefix) {
  return [...(matchTeamSelections[prefix] || [])];
}

function validateMatchPlayers(teamAIds, teamBIds) {
  if (teamAIds.some((id) => !id) || teamBIds.some((id) => !id)) {
    return "请为两队各选择 5 名选手。";
  }

  const allIds = [...teamAIds, ...teamBIds];
  const uniqueIds = new Set(allIds);

  if (uniqueIds.size !== allIds.length) {
    return "同一名选手不能在一场比赛中重复出现。";
  }

  return "";
}

function validateBackfillPlayers(teamAIds, teamBIds) {
  if (!backfillSeasonSelect.value) {
    return "请选择赛季。";
  }

  if (!backfillDateInput.value) {
    return "请选择补录比赛日期。";
  }

  const selectedSeason = allSeasons.find((season) => season.id === backfillSeasonSelect.value) || null;
  if (selectedSeason?.start_date && backfillDateInput.value < selectedSeason.start_date) {
    return `补录比赛日期不能早于 ${selectedSeason.start_date}。`;
  }

  if (
    isAdminHistoryRepairActiveForSeason(selectedSeason?.id || "")
    && selectedSeason?.end_date
    && backfillDateInput.value > selectedSeason.end_date
  ) {
    return `历史维修日期不能晚于 ${selectedSeason.end_date}。`;
  }

  if (!editingMatchId && backfillDateInput.value > getPreviousBeijingBusinessDateString()) {
    return "补录比赛日期只能选择今天之前。";
  }

  if (backfillPlayers.length < TEAM_SIZE * 2) {
    return "该赛季选手不足 10 人，无法补录比赛。";
  }

  if (teamAIds.some((id) => !id) || teamBIds.some((id) => !id)) {
    return "请为两队各选择 5 名选手。";
  }

  const allIds = [...teamAIds, ...teamBIds];
  const uniqueIds = new Set(allIds);

  if (uniqueIds.size !== allIds.length) {
    return "同一名选手不能在一场比赛中重复出现。";
  }

  return "";
}

function buildPlayerAssignmentsPayload(teamAIds, teamBIds, heroAssignments = {}, kdaAssignments = {}) {
  return [...teamAIds, ...teamBIds].map((playerId) => {
    const heroName = heroAssignments[playerId] || null;
    const kdaEntry = normalizeKdaEntry(kdaAssignments[playerId] || {});
    return {
      player_id: playerId,
      hero_name: heroName,
      kills: kdaEntry.kills,
      deaths: kdaEntry.deaths,
      assists: kdaEntry.assists,
    };
  }).filter((item) =>
    item.hero_name
    || item.kills !== null
    || item.deaths !== null
    || item.assists !== null
  );
}

function shouldRetryWithoutExhibitionFlag(error, functionName) {
  const message = String(error?.message || "");
  return message.includes(functionName) && message.includes("p_is_exhibition");
}

async function recordMatch() {
  if (!ensureScorerAccess("仅记分员或管理员可登记比赛。")) return;
  if (!isActiveSeasonReadyForMatches()) {
    setMatchMessage(getActiveSeasonMatchGateMessage() || "当前赛季尚未开放比赛登记。", true);
    return;
  }
  if (!activeMatchDay && !activeSeason?.id) {
    setMatchMessage("当前缺少可用赛季，暂时无法保存今日比赛。", true);
    return;
  }
  const teamAIds = getSelectedTeamIds("teamA");
  const teamBIds = getSelectedTeamIds("teamB");
  const winner = winnerSelect.value || null;
  const matchNoteValue = matchNoteInput.value.trim() || null;
  const currentMatchHeroAssignments = { ...matchHeroAssignments };
  const currentMatchKdaAssignments = { ...matchKdaAssignments };
  const { error: doubleError, payload: doubleDownPayload } = buildDoubleDownPayload("match");
  const playerAssignments = buildPlayerAssignmentsPayload(
    teamAIds,
    teamBIds,
    matchHeroAssignments,
    matchKdaAssignments
  );
  const validationError = validateMatchPlayers(teamAIds, teamBIds);

  if (validationError) {
    setMatchMessage(validationError, true);
    return;
  }

  if (doubleError) {
    setMatchMessage(doubleError, true);
    return;
  }

  const selectedPlayers = [
    ...getPlayersInSelectionOrder(teamAIds, seasonPlayers).map((player) => ({ ...player, team: "A", player_id: player.id })),
    ...getPlayersInSelectionOrder(teamBIds, seasonPlayers).map((player) => ({ ...player, team: "B", player_id: player.id })),
  ];
  const resetEffectError = validateResetEffectUsage(winner, doubleDownPayload, selectedPlayers);
  if (resetEffectError) {
    setMatchMessage(resetEffectError, true);
    showBlockingAlert(resetEffectError);
    return;
  }

  recordMatchBtn.disabled = true;
  setMatchMessage(activeMatchDay ? "正在记录比赛..." : "正在保存今日比赛...");

  let matchId = null;
  let error = null;

  const matchPayload = {
    p_season_id: activeSeason?.id || null,
    p_radiant_player_ids: teamAIds,
    p_dire_player_ids: teamBIds,
    p_winner_side: mapWinnerTeamToSide(winner),
    p_note: matchNoteValue,
    p_double_downs: doubleDownPayload,
    p_match_date: getBeijingBusinessDateString(),
    p_is_exhibition: isMatchExhibition,
  };
  ({ data: matchId, error } = await db.rpc("record_match_result", matchPayload));

  if (error && !isMatchExhibition && shouldRetryWithoutExhibitionFlag(error, "record_match_result")) {
    const { p_is_exhibition: ignoredFlag, ...legacyMatchPayload } = matchPayload;
    ({ data: matchId, error } = await db.rpc("record_match_result", legacyMatchPayload));
  }

  recordMatchBtn.disabled = false;

  if (error) {
    reportMatchOperationFailure("match", buildMatchOperationFailureMessage("记录比赛失败", error));
    return;
  }

  const loggedMatch = buildOptimisticMatchRecord(
    matchId,
    activeSeason?.id || null,
    activeMatchDay?.id || null,
    activeMatchDay?.match_date || getBeijingBusinessDateString(),
    winner,
    matchNoteValue,
    teamAIds,
    teamBIds,
    currentMatchHeroAssignments,
    currentMatchKdaAssignments,
    doubleDownPayload,
    new Date().toISOString(),
    isMatchExhibition
  );

  clearMatchForm();
  setMatchFormOpen(false);
  renderMatchForm();
  upsertRecentMatchLocally(loggedMatch);
  setMatchMessage(
    `${winner ? "比赛记录成功，积分榜已刷新。" : "比赛记录已保存，当前未计分，补填胜负后才会变动积分。"}${playerAssignments.length ? " 当前数据库未保存英雄或 KDA。" : ""}`
  );
  appendAdminActionLog(buildMatchActionLogText("添加", loggedMatch));
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
  });
}

async function recordBackfillMatch() {
  if (!ensureScorerAccess("仅记分员或管理员可补录比赛。")) return;
  const teamAIds = [...backfillTeamSelections.teamA];
  const teamBIds = [...backfillTeamSelections.teamB];
  const winner = backfillWinnerSelect.value || null;
  const isEditing = Boolean(editingMatchId);
  const targetMatchId = editingMatchId;
  const targetSeasonId = backfillSeasonSelect.value;
  const targetMatchDate = backfillDateInput.value;
  const isHistoricalRepair = isAdminHistoryRepairActiveForSeason(targetSeasonId);
  if (isEditing) {
    if (!ensureMatchRecordEditable(targetMatchId, "修改")) return;
  } else if (!canModifyMatchRecordsForSeason(targetSeasonId)) {
    setBackfillMessage(getSeasonReadOnlyReason(targetSeasonId), true);
    return;
  }
  const backfillNoteValue = backfillMatchNoteInput.value.trim() || null;
  const currentBackfillHeroAssignments = { ...backfillHeroAssignments };
  const currentBackfillKdaAssignments = { ...backfillKdaAssignments };
  const { error: doubleError, payload: doubleDownPayload } = buildDoubleDownPayload("backfill");
  const heroAssignments = buildPlayerAssignmentsPayload(
    teamAIds,
    teamBIds,
    backfillHeroAssignments,
    backfillKdaAssignments
  );
  const validationError = validateBackfillPlayers(teamAIds, teamBIds);

  if (validationError) {
    setBackfillMessage(validationError, true);
    return;
  }

  if (doubleError) {
    setBackfillMessage(doubleError, true);
    return;
  }

  if (!isEditing && targetSeasonId === activeSeason?.id) {
    const selectedPlayers = [
      ...getPlayersInSelectionOrder(teamAIds, backfillPlayers).map((player) => ({ ...player, team: "A", player_id: player.id })),
      ...getPlayersInSelectionOrder(teamBIds, backfillPlayers).map((player) => ({ ...player, team: "B", player_id: player.id })),
    ];
    const resetEffectError = validateResetEffectUsage(winner, doubleDownPayload, selectedPlayers);
    if (resetEffectError) {
      setBackfillMessage(resetEffectError, true);
      showBlockingAlert(resetEffectError);
      return;
    }
  }

  recordBackfillBtn.disabled = true;
  setBackfillMessage(isEditing ? "正在保存比赛修改..." : "正在补录比赛...");

  let matchId = targetMatchId;
  let error = null;
  const updatePayload = {
    p_match_id: targetMatchId,
    p_radiant_player_ids: teamAIds,
    p_dire_player_ids: teamBIds,
    p_winner_side: mapWinnerTeamToSide(winner),
    p_note: backfillNoteValue,
    p_match_date: targetMatchDate,
    p_double_downs: doubleDownPayload,
    p_is_exhibition: isBackfillExhibition,
  };
  const backfillPayload = {
    p_season_id: targetSeasonId,
    p_radiant_player_ids: teamAIds,
    p_dire_player_ids: teamBIds,
    p_winner_side: mapWinnerTeamToSide(winner),
    p_note: backfillNoteValue,
    p_match_date: targetMatchDate,
    p_double_downs: doubleDownPayload,
    p_is_exhibition: isBackfillExhibition,
  };
  const repairReason = isHistoricalRepair ? adminHistoryRepairState.reason : "";
  const optimisticMatch = buildOptimisticMatchRecord(
    targetMatchId || `optimistic-${Date.now()}`,
    targetSeasonId,
    null,
    targetMatchDate,
    winner,
    backfillNoteValue,
    teamAIds,
    teamBIds,
    currentBackfillHeroAssignments,
    currentBackfillKdaAssignments,
    doubleDownPayload,
    new Date().toISOString(),
    isBackfillExhibition
  );
  const originalMatchForLog = isEditing ? getSavedMatchById(targetMatchId) : null;
  if (originalMatchForLog?.match_no != null) {
    optimisticMatch.match_no = originalMatchForLog.match_no;
  }

  if (isEditing) {
    const updateFunctionName = isHistoricalRepair
      ? "admin_update_historical_match_repair"
      : "update_match_result";
    const targetUpdatePayload = isHistoricalRepair
      ? { ...updatePayload, p_reason: repairReason }
      : updatePayload;
    ({ data: matchId, error } = await db.rpc(updateFunctionName, targetUpdatePayload));
    if (!isHistoricalRepair && error && !isBackfillExhibition && shouldRetryWithoutExhibitionFlag(error, "update_match_result")) {
      const { p_is_exhibition: ignoredFlag, ...legacyUpdatePayload } = updatePayload;
      ({ data: matchId, error } = await db.rpc("update_match_result", legacyUpdatePayload));
    }
  } else {
    const backfillFunctionName = isHistoricalRepair
      ? "admin_record_historical_match_repair"
      : "record_match_result_backfill";
    const targetBackfillPayload = isHistoricalRepair
      ? { ...backfillPayload, p_reason: repairReason }
      : backfillPayload;
    ({ data: matchId, error } = await db.rpc(backfillFunctionName, targetBackfillPayload));
    if (!isHistoricalRepair && error && !isBackfillExhibition && shouldRetryWithoutExhibitionFlag(error, "record_match_result_backfill")) {
      const { p_is_exhibition: ignoredFlag, ...legacyBackfillPayload } = backfillPayload;
      ({ data: matchId, error } = await db.rpc("record_match_result_backfill", legacyBackfillPayload));
    }
  }

  recordBackfillBtn.disabled = false;

  if (error) {
    if (isEditing) {
      reportMatchOperationFailure("backfill", buildMatchOperationFailureMessage("保存比赛修改失败", error));
    } else {
      reportMatchOperationFailure("backfill", buildMatchOperationFailureMessage("补录比赛失败", error));
    }
    return;
  }

  const loggedMatch = {
    ...optimisticMatch,
    match_id: matchId,
  };

  if (isEditing) {
    removeRecentMatchLocally(targetMatchId);
    upsertRecentMatchLocally(loggedMatch);
    clearBackfillForm();
    setBackfillFormOpen(false);
    renderBackfillForm();
  } else {
    clearBackfillForm();
    setBackfillFormOpen(false);
    renderBackfillForm();
    upsertRecentMatchLocally(loggedMatch);
  }
  setMessage(
    `${isEditing ? "比赛修改已保存。" : (winner ? "历史比赛补录成功。" : "历史比赛已归档，当前未计分，补填胜负后才会变动积分。")}${heroAssignments.length ? " 当前数据库未保存英雄或 KDA。" : ""}`
  );
  appendAdminActionLog(buildMatchActionLogText(isEditing ? "修改" : "补录", loggedMatch, targetMatchDate));
  if (targetSeasonId) {
    recentMatchLoadedSeasonIds.delete(targetSeasonId);
    void loadRecentMatchesForSeason(targetSeasonId, { keepOpen: true });
  }
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
  });
}

async function startEditingMatch(matchId) {
  if (!ensureScorerAccess("仅记分员或管理员可修改比赛记录。")) return;
  if (!ensureMatchRecordEditable(matchId, "修改")) return;
  const match = getSavedMatchById(matchId);
  if (!match) {
    setMessage("未找到要修改的比赛记录。", true);
    return;
  }

  const players = parseRecentMatchPlayers(match.players);
  const teamAPlayers = getOrderedSavedMatchTeamPlayers(players, "A");
  const teamBPlayers = getOrderedSavedMatchTeamPlayers(players, "B");

  if (teamAPlayers.length !== TEAM_SIZE || teamBPlayers.length !== TEAM_SIZE) {
    setMessage("这场比赛的阵容数据不完整，暂时无法修改。", true);
    return;
  }

  backfillSeasonSelect.value = match.season_id || activeSeason?.id || "";
  await loadPlayersForSeason(backfillSeasonSelect.value);
  clearBackfillForm();
  editingMatchId = matchId;
  backfillDateInput.value = match.match_date || getPreviousBeijingBusinessDateString();
  backfillMatchNoteInput.value = String(match.note || "");
  isBackfillExhibition = Boolean(match.is_exhibition);
  backfillTeamSelections = {
    teamA: teamAPlayers.map((player) => player.player_id),
    teamB: teamBPlayers.map((player) => player.player_id),
  };
  backfillHeroAssignments = Object.fromEntries(
    players
      .filter((player) => player.player_id && player.hero_name)
      .map((player) => [player.player_id, player.hero_name])
  );
  backfillKdaAssignments = Object.fromEntries(
    players.map((player) => [player.player_id, {
      kills: normalizeKdaValue(player.kills),
      deaths: normalizeKdaValue(player.deaths),
      assists: normalizeKdaValue(player.assists),
    }])
  );
  backfillDoubleState = createEmptyDoubleState();
  normalizeMatchDoubleDowns(match.double_downs, players).forEach((entry) => {
    if (entry.mode === "team") {
      upsertTeamDoubleConfig("backfill", entry.source_team === "A" ? "A" : "B", {
        itemCatalogId: entry.item_catalog_id || LEGACY_MATCH_ITEM_IDS.team,
        targetTeam: entry.target_team || "",
        paymentMode: entry.payment_mode || "solo",
        userPlayerId: entry.payment_mode === "solo" ? (entry.user_player_id || "") : "",
      });
      return;
    }

    backfillDoubleState.singles.push({
      item_catalog_id: entry.item_catalog_id || LEGACY_MATCH_ITEM_IDS.personal,
      user_player_id: entry.user_player_id || "",
      target_player_id: entry.target_player_id || "",
    });
  });
  setWinnerSelection("backfill", match.winner_team || "");
  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderBackfillForm();
  setMessage(`正在修改比赛记录。`);
}

async function deleteMatch(matchId, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可删除比赛记录。")) return;
  if (!matchId) return;
  if (!ensureMatchRecordEditable(matchId, "删除")) return;

  const matchGroupForLog = findRecentMatchGroupByMatchId(matchId);
  const matchForLog = (
    getSavedMatchById(matchId)
    || matchGroupForLog?.group?.matches?.find((match) => match.match_id === matchId)
    || null
  );
  const actionLogText = buildMatchActionLogText("删除", matchForLog);

  const confirmed = await requestDeleteMatchConfirmation();
  if (!confirmed) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMessage("比赛记录已从本地移除，正在同步数据库...");
  setMatchMessage("比赛记录已从本地移除，正在同步数据库...");
  await animateRecentMatchRemoval(matchId);
  const removedMatchState = removeRecentMatchLocally(matchId);

  const seasonId = String(matchForLog?.season_id || "");
  const isHistoricalRepair = isAdminHistoryRepairActiveForSeason(seasonId);
  const deleteFunctionName = isHistoricalRepair
    ? "admin_delete_historical_match_repair"
    : "delete_match_and_recalculate";
  const deletePayload = isHistoricalRepair
    ? { p_match_id: matchId, p_reason: adminHistoryRepairState.reason }
    : { p_match_id: matchId };
  const { error } = await db.rpc(deleteFunctionName, deletePayload);

  if (error) {
    restoreRecentMatchLocally(removedMatchState);
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(`删除比赛失败：${error.message}。已恢复本地显示。`, true);
    setMatchMessage(`删除比赛失败：${error.message}。已恢复本地显示。`, true);
    return;
  }

  const deleteSuccessMessage = isHistoricalRepair
    ? "历史比赛记录已删除，相关积分与附件已同步清理，并已写入长期审计。"
    : "比赛记录已删除，积分已按全部比赛记录重算。";
  setMessage(deleteSuccessMessage);
  setMatchMessage(deleteSuccessMessage);
  appendAdminActionLog(actionLogText);
  if (matchForLog?.season_id) {
    recentMatchLoadedSeasonIds.delete(matchForLog.season_id);
    void loadRecentMatchesForSeason(matchForLog.season_id, { keepOpen: true });
  }
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
  });
}

async function persistRecentMatchSwap(matchId, targetMatchId) {
  const rpcAttempts = [
    { p_match_id: matchId, p_target_match_id: targetMatchId },
    { p_source_match_id: matchId, p_target_match_id: targetMatchId },
    { p_match_id: matchId, p_before_match_id: targetMatchId },
  ];

  let lastError = null;
  let succeeded = false;

  for (const params of rpcAttempts) {
    const { error } = await db.rpc("reorder_matches_within_day", params);
    if (!error) {
      succeeded = true;
      break;
    }
    lastError = error;
    const message = String(error.message || "");
    const likelySignatureMismatch = (
      message.includes("function public.reorder_matches_within_day")
      || message.includes("Could not find the function public.reorder_matches_within_day")
      || message.includes("function reorder_matches_within_day")
      || message.includes("No function matches")
      || message.includes("PGRST")
    );
    if (!likelySignatureMismatch) {
      break;
    }
  }

  return succeeded ? null : lastError;
}

async function swapMatchesWithinDay(matchId, targetMatchId) {
  if (!ensureScorerAccess("仅记分员或管理员可调整场次顺序。")) return;
  if (!matchId || !targetMatchId || matchId === targetMatchId) return;
  if (!ensureMatchRecordEditable(matchId, "调整")) return;
  if (!ensureMatchRecordEditable(targetMatchId, "调整")) return;

  const localSwap = swapRecentMatchesLocally(matchId, targetMatchId);
  if (!localSwap) return;

  const lastError = await persistRecentMatchSwap(matchId, targetMatchId);

  if (lastError) {
    restoreRecentMatchOrderLocally(localSwap.groupKey, localSwap.previousOrder);
    setMessage(`调整比赛顺序失败：${lastError?.message || "当前数据库未提供可用的场次重排接口。"}`, true);
    return;
  }

  setMessage("比赛顺序已更新。");
  const seasonId = getSavedMatchById(matchId)?.season_id || "";
  if (seasonId) {
    recentMatchLoadedSeasonIds.delete(seasonId);
    void loadRecentMatchesForSeason(seasonId, { keepOpen: true });
  }
  requestImmediateRefresh({
    recentMatches: true,
  });
}

async function reorderMatchesWithinDayToOrder(groupKey, nextOrder) {
  if (!ensureScorerAccess("仅记分员或管理员可调整场次顺序。")) return;
  if (!groupKey || !Array.isArray(nextOrder) || !nextOrder.length) return;
  if (!nextOrder.every((matchId) => ensureMatchRecordEditable(matchId, "调整"))) return;

  const localReorder = applyRecentMatchOrderLocally(groupKey, nextOrder);
  if (!localReorder) return;

  const swapSteps = getRecentMatchOrderSwapSteps(localReorder.previousOrder, localReorder.nextOrder);
  let lastError = null;

  for (const [matchId, targetMatchId] of swapSteps) {
    lastError = await persistRecentMatchSwap(matchId, targetMatchId);
    if (lastError) break;
  }

  if (lastError) {
    restoreRecentMatchOrderLocally(localReorder.groupKey, localReorder.previousOrder);
    setMessage(`调整比赛顺序失败：${lastError?.message || "当前数据库未提供可用的场次重排接口。"}`, true);
    return;
  }

  setMessage("比赛顺序已更新。");
  const seasonId = getSavedMatchById(nextOrder[0])?.season_id || "";
  if (seasonId) {
    recentMatchLoadedSeasonIds.delete(seasonId);
    void loadRecentMatchesForSeason(seasonId, { keepOpen: true });
  }
  requestImmediateRefresh({
    recentMatches: true,
  });
}

function subscribeRealtime() {
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  realtimeChannel = db
    .channel("app-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "seasons" },
      () => {
        scheduleRefresh({ seasonContext: true });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          leaderboard: true,
          rewardLogs: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "season_memberships" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          leaderboard: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "season_end_confirmations" },
      () => {
        scheduleRefresh({
          seasonEndConfirmations: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_days" },
      () => {
        scheduleRefresh({
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_day_attendance_notes" },
      () => {
        scheduleRefresh({
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_players" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "score_ledger" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "manual_score_adjustments" },
      () => {
        scoreDetailSeasonCache.clear();
        scheduleRefresh({
          leaderboard: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "season_participation_point_rules" },
      (payload) => {
        const seasonId = payload?.new?.season_id || payload?.old?.season_id || activeSeason?.id || "";
        if (seasonId) {
          participationPointsTableBySeasonId.delete(seasonId);
          clearHomeLeaderboardCacheForSeason(activeSeason?.id);
        } else {
          participationPointsTableBySeasonId.clear();
        }
        scheduleRefresh({
          leaderboard: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reward_donations" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          rewardLogs: true,
        });
      }
    )
    .subscribe((status) => {
      console.info("[realtime] app-realtime status:", status);
    });
}

if (seasonToggleBtn) {
  seasonToggleBtn.addEventListener("click", () => {
    setSeasonPanelOpen(!isSeasonPanelOpen);
  });
}
if (homeStealthToggle) {
  homeStealthToggle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setHomeStealthMode(!isHomeStealthMode);
  });
}
if (brandMonthBadge) {
  brandMonthBadge.addEventListener("click", () => {
    openLeaderboardSeasonSelect().catch((error) => {
      console.error("打开积分榜赛季选择失败：", error);
      setMessage(`打开积分榜赛季选择失败：${error.message || "未知错误"}`, true);
    });
  });
}
if (leaderboardSeasonSelect) {
  leaderboardSeasonSelect.addEventListener("change", () => {
    selectLeaderboardSeason(leaderboardSeasonSelect.value).catch((error) => {
      console.error("切换积分榜赛季失败：", error);
      setMessage(`切换积分榜赛季失败：${error.message || "未知错误"}`, true);
      hideLeaderboardSeasonSelect();
    });
  });
  leaderboardSeasonSelect.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.activeElement !== leaderboardSeasonSelect) {
        hideLeaderboardSeasonSelect();
      }
    }, 120);
  });
  leaderboardSeasonSelect.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideLeaderboardSeasonSelect();
      brandMonthBadge?.focus();
    }
  });
}
scorerModeBtn.addEventListener("click", () => {
  if (!isCurrentRoleScorerOnly()) return;
  setScorerPanelOpen(!isScorerPanelOpen);
});
adminModeBtn.addEventListener("click", () => {
  if (!isCurrentRoleAdmin()) return;
  setAdminPanelOpen(!isAdminPanelOpen);
  applyRolePermissions();
});
scorerExitModeBtn.addEventListener("click", exitAccessRole);
adminExitModeBtn.addEventListener("click", exitAccessRole);
closeScorerPanelBtn.addEventListener("click", () => setScorerPanelOpen(false));
closeAdminPanelBtn.addEventListener("click", () => setAdminPanelOpen(false));
if (adminHistoryRepairToggleBtn) {
  adminHistoryRepairToggleBtn.addEventListener("click", async () => {
    if (!isCurrentRoleAdmin()) return;
    isAdminHistoryRepairControlsOpen = !isAdminHistoryRepairControlsOpen;
    if (isAdminHistoryRepairControlsOpen) await loadSeasons();
    renderAdminHistoryRepairControls();
  });
}
if (adminStartHistoryRepairBtn) {
  adminStartHistoryRepairBtn.addEventListener("click", startAdminHistoryRepairMode);
}
if (adminStopHistoryRepairBtn) {
  adminStopHistoryRepairBtn.addEventListener("click", () => stopAdminHistoryRepairMode());
}
resetSeasonBtn.addEventListener("click", resetCurrentSeason);
if (scorerOpenSeasonRulesBtn) {
  scorerOpenSeasonRulesBtn.addEventListener("click", () => {
    if (!isCurrentRoleScorer() || !activeSeason?.id) return;
    setManagedDialogOpen("scorerSeasonRule", true, {
      initialFocus: scorerSeasonInitialScoreInput || scorerSeasonWinPointsInput || undefined,
    });
  });
}
if (adminOpenSeasonRulesBtn) {
  adminOpenSeasonRulesBtn.addEventListener("click", () => {
    if (!isCurrentRoleScorer() || !activeSeason?.id) return;
    setManagedDialogOpen("adminSeasonRule", true, {
      initialFocus: isCurrentRoleAdmin() ? adminSeasonInitialScoreInput || undefined : adminSeasonWinPointsInput || undefined,
    });
  });
}
if (scorerOpenPowerManagementBtn) {
  scorerOpenPowerManagementBtn.addEventListener("click", () => openSeasonPowerModal("scorer"));
}
if (adminOpenPowerManagementBtn) {
  adminOpenPowerManagementBtn.addEventListener("click", () => openSeasonPowerModal("admin"));
}
if (scorerOpenManualScoreBtn) {
  scorerOpenManualScoreBtn.addEventListener("click", () => openManualScoreModal("scorer"));
}
if (adminOpenManualScoreBtn) {
  adminOpenManualScoreBtn.addEventListener("click", () => openManualScoreModal("admin"));
}
if (scorerOpenPlayerManagementBtn) {
  scorerOpenPlayerManagementBtn.addEventListener("click", () => {
    if (!isCurrentRoleScorer()) return;
    renderPlayerManagementOptions();
    setManagedDialogOpen("scorerPlayerManagement", true, { initialFocus: scorerQuickAddPlayerInput || undefined });
  });
}
if (adminOpenPlayerManagementBtn) {
  adminOpenPlayerManagementBtn.addEventListener("click", async () => {
    if (!isCurrentRoleScorer()) return;
    renderPlayerManagementOptions();
    setManagedDialogOpen("adminPlayerManagement", true, { initialFocus: adminQuickAddPlayerInput || undefined });
    await loadInactivePlayersForAdmin({ force: true });
  });
}
if (scorerOpenLogsBtn) {
  scorerOpenLogsBtn.addEventListener("click", async () => {
    if (!isCurrentRoleScorer()) return;
    await loadSeasonActionLogs();
    setManagedDialogOpen("scorerActionLogs", true, { initialFocus: closeScorerActionLogsBtn || undefined });
  });
}
if (adminOpenLogsBtn) {
  adminOpenLogsBtn.addEventListener("click", async () => {
    if (!isCurrentRoleScorer()) return;
    await loadSeasonActionLogs();
    setManagedDialogOpen("adminActionLogs", true, { initialFocus: closeAdminActionLogsBtn || undefined });
  });
}
if (scorerOpenItemHistoryBtn) {
  scorerOpenItemHistoryBtn.addEventListener("click", async () => {
    await openItemInventoryLogsModal("scorer");
  });
}
if (adminOpenItemHistoryBtn) {
  adminOpenItemHistoryBtn.addEventListener("click", async () => {
    await openItemInventoryLogsModal("admin");
  });
}
if (leaderboardPowerViewBtn) {
  leaderboardPowerViewBtn.addEventListener("click", () => {
    renderLeaderboardPowerView();
    setManagedDialogOpen("leaderboardPowerView", true, { initialFocus: closeLeaderboardPowerViewBtn || undefined });
  });
}
if (leaderboardParticipationViewBtn) {
  leaderboardParticipationViewBtn.addEventListener("click", () => {
    renderLeaderboardParticipationView();
    setManagedDialogOpen("leaderboardParticipationView", true, { initialFocus: closeLeaderboardParticipationViewBtn || undefined });
  });
}
if (leaderboardChampionsBtn) {
  leaderboardChampionsBtn.addEventListener("click", () => {
    openLeaderboardChampions().catch((error) => {
      console.error("打开历届冠军失败：", error);
      leaderboardChampionsStatusText = `冠军读取失败：${error.message || "未知错误"}`;
      isLeaderboardChampionsLoading = false;
      renderLeaderboardChampions();
    });
  });
}
if (leaderboardLifetimeRewardsBtn) {
  leaderboardLifetimeRewardsBtn.addEventListener("click", () => {
    openLeaderboardLifetimeRewards().catch((error) => {
      console.error("打开历届赞助总额失败：", error);
      isLifetimeRewardTotalsLoading = false;
      renderLeaderboardLifetimeRewards();
      showGlobalToast(`历届赞助总额读取失败：${getErrorMessage(error)}`, true);
    });
  });
}
seasonRolloverEntries.forEach(({ button }) => {
  button.addEventListener("click", confirmSeasonRollover);
});
if (adminRecalculateScoresBtn) {
  adminRecalculateScoresBtn.addEventListener("click", recalculateCurrentScores);
}
if (adminSaveSeasonInitialScoreBtn) {
  adminSaveSeasonInitialScoreBtn.addEventListener("click", () => saveSeasonInitialScore("admin"));
}
if (scorerSaveSeasonInitialScoreBtn) {
  scorerSaveSeasonInitialScoreBtn.addEventListener("click", () => saveSeasonInitialScore("scorer"));
}
if (adminSaveSeasonMatchPointsBtn) {
  adminSaveSeasonMatchPointsBtn.addEventListener("click", () => saveSeasonMatchPointRules("admin"));
}
if (adminSaveSeasonExhibitionMatchPointsBtn) {
  adminSaveSeasonExhibitionMatchPointsBtn.addEventListener("click", () => saveSeasonMatchPointRules("admin", "exhibition"));
}
if (scorerRecalculateScoresBtn) {
  scorerRecalculateScoresBtn.addEventListener("click", recalculateCurrentScoresForScorer);
}
if (scorerSaveSeasonMatchPointsBtn) {
  scorerSaveSeasonMatchPointsBtn.addEventListener("click", () => saveSeasonMatchPointRules("scorer"));
}
if (scorerSaveSeasonExhibitionMatchPointsBtn) {
  scorerSaveSeasonExhibitionMatchPointsBtn.addEventListener("click", () => saveSeasonMatchPointRules("scorer", "exhibition"));
}
if (adminSeasonInitialScoreInput) {
  adminSeasonInitialScoreInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonInitialScore("admin");
  });
}
if (scorerSeasonInitialScoreInput) {
  scorerSeasonInitialScoreInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonInitialScore("scorer");
  });
}
if (adminSeasonWinPointsInput) {
  adminSeasonWinPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin");
  });
}
if (adminSeasonLossPointsInput) {
  adminSeasonLossPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin");
  });
}
if (adminSeasonPowerGapStepInput) {
  adminSeasonPowerGapStepInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin");
  });
}
if (adminSeasonPowerGapDeltaInput) {
  adminSeasonPowerGapDeltaInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin");
  });
}
if (adminSeasonExhibitionWinPointsInput) {
  adminSeasonExhibitionWinPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin", "exhibition");
  });
}
if (adminSeasonExhibitionLossPointsInput) {
  adminSeasonExhibitionLossPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin", "exhibition");
  });
}
if (adminSeasonExhibitionPowerGapStepInput) {
  adminSeasonExhibitionPowerGapStepInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin", "exhibition");
  });
}
if (adminSeasonExhibitionPowerGapDeltaInput) {
  adminSeasonExhibitionPowerGapDeltaInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("admin", "exhibition");
  });
}
if (scorerSeasonWinPointsInput) {
  scorerSeasonWinPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer");
  });
}
if (scorerSeasonLossPointsInput) {
  scorerSeasonLossPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer");
  });
}
if (scorerSeasonPowerGapStepInput) {
  scorerSeasonPowerGapStepInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer");
  });
}
if (scorerSeasonExhibitionWinPointsInput) {
  scorerSeasonExhibitionWinPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer", "exhibition");
  });
}
if (scorerSeasonExhibitionLossPointsInput) {
  scorerSeasonExhibitionLossPointsInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer", "exhibition");
  });
}
if (scorerSeasonExhibitionPowerGapStepInput) {
  scorerSeasonExhibitionPowerGapStepInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer", "exhibition");
  });
}
if (scorerSeasonPowerGapDeltaInput) {
  scorerSeasonPowerGapDeltaInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer");
  });
}
if (scorerSeasonExhibitionPowerGapDeltaInput) {
  scorerSeasonExhibitionPowerGapDeltaInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveSeasonMatchPointRules("scorer", "exhibition");
  });
}
if (matchExhibitionToggleBtn) {
  matchExhibitionToggleBtn.addEventListener("click", () => {
    isMatchExhibition = !isMatchExhibition;
    renderMatchForm();
  });
}
if (backfillExhibitionToggleBtn) {
  backfillExhibitionToggleBtn.addEventListener("click", () => {
    isBackfillExhibition = !isBackfillExhibition;
    renderBackfillForm();
  });
}
if (scorerFullSignOutBtn) {
  scorerFullSignOutBtn.addEventListener("click", async () => {
    await signOut();
  });
}
if (scorerClearQueueBtn) {
  scorerClearQueueBtn.addEventListener("click", clearSignupQueueForScorer);
}
if (scorerManualScoreChips) {
  scorerManualScoreChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".manual-score-player-chip");
    if (!chip || chip.disabled) return;
    toggleManualScorePlayer(chip.dataset.mode || "scorer", chip.dataset.playerId || "");
  });
}
if (scorerManualScoreNoteInput) {
  scorerManualScoreNoteInput.addEventListener("input", () => updateManualScoreControlState("scorer"));
}
if (scorerManualScoreAmountInput) {
  scorerManualScoreAmountInput.addEventListener("input", () => updateManualScoreControlState("scorer"));
}
if (scorerManualScoreHistoryList) {
  scorerManualScoreHistoryList.addEventListener("click", async (event) => {
    const button = event.target.closest(".manual-score-history-remove-btn");
    if (!(button instanceof HTMLButtonElement)) return;
    await revokeManualScoreAdjustment(
      button.dataset.adjustmentId,
      button.dataset.playerName,
      button.dataset.actionLabel,
      { messageTarget: button.dataset.messageTarget || "scorer" }
    );
  });
}
if (scorerDeathFingerBtn) {
  scorerDeathFingerBtn.addEventListener("click", () => applyManualScoreAdjustment("death_finger", {
    noteInput: scorerManualScoreNoteInput,
  }));
}
if (scorerHealingHandBtn) {
  scorerHealingHandBtn.addEventListener("click", () => applyManualScoreAdjustment("healing_hand", {
    noteInput: scorerManualScoreNoteInput,
  }));
}
if (adminManualScoreChips) {
  adminManualScoreChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".manual-score-player-chip");
    if (!chip || chip.disabled) return;
    toggleManualScorePlayer(chip.dataset.mode || "admin", chip.dataset.playerId || "");
  });
}
if (adminManualScoreNoteInput) {
  adminManualScoreNoteInput.addEventListener("input", () => updateManualScoreControlState("admin"));
}
if (adminManualScoreAmountInput) {
  adminManualScoreAmountInput.addEventListener("input", () => updateManualScoreControlState("admin"));
}
if (adminManualScoreHistoryList) {
  adminManualScoreHistoryList.addEventListener("click", async (event) => {
    const button = event.target.closest(".manual-score-history-remove-btn");
    if (!(button instanceof HTMLButtonElement)) return;
    await revokeManualScoreAdjustment(
      button.dataset.adjustmentId,
      button.dataset.playerName,
      button.dataset.actionLabel,
      { messageTarget: button.dataset.messageTarget || "admin" }
    );
  });
}
if (adminFullSignOutBtn) {
  adminFullSignOutBtn.addEventListener("click", async () => {
    await signOut();
  });
}
if (adminDeathFingerBtn) {
  adminDeathFingerBtn.addEventListener("click", () => applyManualScoreAdjustment("death_finger", {
    noteInput: adminManualScoreNoteInput,
    messageTarget: "admin",
  }));
}
if (adminHealingHandBtn) {
  adminHealingHandBtn.addEventListener("click", () => applyManualScoreAdjustment("healing_hand", {
    noteInput: adminManualScoreNoteInput,
    messageTarget: "admin",
  }));
}
startMatchDayBtn.addEventListener("click", async () => {
  if (activeMatchDay) {
    await cancelMatchDay();
    return;
  }

  await startMatchDay();
});
confirmQueueBtn.addEventListener("click", confirmQueueToTodayPlayers);
clearQueueBtn.addEventListener("click", clearSignupQueueForTesting);
signupAllBtn.addEventListener("click", signupAllPlayers);
adminClearQueueBtn.addEventListener("click", clearSignupQueueForTesting);
adminClearTodayPlayersBtn.addEventListener("click", clearTodayPlayersForTesting);
adminResetSeasonBtn.addEventListener("click", resetCurrentSeason);
if (adminExportSeasonBtn) {
  adminExportSeasonBtn.addEventListener("click", async () => {
    await openSeasonArchiveExportModal();
  });
}
if (adminPrizeDistributionBtn) {
  adminPrizeDistributionBtn.addEventListener("click", () => {
    if (!ensureAdminAccess("仅管理员可分配赛季奖金。")) return;
    setPrizeDistributionModalOpen(true);
  });
}
if (adminParticipationRulesBtn) {
  adminParticipationRulesBtn.addEventListener("click", () => {
    setAdminParticipationRulesModalOpen(true);
  });
}
if (adminBackgroundPickerBtn) {
  adminBackgroundPickerBtn.addEventListener("click", openAdminBackgroundPicker);
}
if (adminBackgroundOptions) {
  adminBackgroundOptions.addEventListener("click", (event) => {
    const optionButton = event.target.closest(".admin-background-option");
    if (!(optionButton instanceof HTMLButtonElement)) return;
    selectAdminBackgroundDraft(optionButton.dataset.backgroundId || "");
  });
}
if (adminBackgroundBrightnessInput) {
  adminBackgroundBrightnessInput.addEventListener("input", () => {
    adminBackgroundBrightnessDraft = normalizeBackgroundBrightnessPercent(adminBackgroundBrightnessInput.value);
    syncAdminBackgroundPreview();
  });
}
if (adminApplyBackgroundBtn) {
  adminApplyBackgroundBtn.addEventListener("click", applyAdminBackgroundDraft);
}
if (adminSetFinalDayBackgroundBtn) {
  adminSetFinalDayBackgroundBtn.addEventListener("click", setFinalDayBackgroundDraft);
}
if (adminBackgroundUploadInput) {
  adminBackgroundUploadInput.addEventListener("change", () => {
    if (adminBackgroundUploadInput.files?.[0]) {
      void uploadAdminBackgroundImage();
      return;
    }
    syncAdminBackgroundUploadState();
  });
}
if (adminPlayerBackgroundSettingsBtn) {
  adminPlayerBackgroundSettingsBtn.addEventListener("click", toggleAdminPlayerBackgroundSettings);
}
if (adminPlayerBackgroundPlayerSelect) {
  adminPlayerBackgroundPlayerSelect.addEventListener("change", () => {
    adminBackgroundPreviewContextText = "";
    adminBackgroundPreviewPlayerId = "";
    syncAdminBackgroundPreview();
  });
}
if (adminSavePlayerBackgroundBtn) {
  adminSavePlayerBackgroundBtn.addEventListener("click", saveAdminPlayerBackgroundSetting);
}
if (adminClearPlayerBackgroundBtn) {
  adminClearPlayerBackgroundBtn.addEventListener("click", () => clearAdminPlayerBackgroundSetting());
}
if (adminPlayerBackgroundList) {
  adminPlayerBackgroundList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".admin-player-background-remove-btn");
    if (removeButton instanceof HTMLButtonElement) {
      clearAdminPlayerBackgroundSetting(removeButton.dataset.playerId || "");
      return;
    }
    const row = event.target.closest(".admin-player-background-row");
    if (!(row instanceof HTMLElement)) return;
    previewAdminPlayerBackground(row.dataset.playerId || "");
  });
  adminPlayerBackgroundList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(".admin-player-background-remove-btn")) return;
    const row = event.target.closest(".admin-player-background-row");
    if (!(row instanceof HTMLElement)) return;
    event.preventDefault();
    previewAdminPlayerBackground(row.dataset.playerId || "");
  });
}
if (adminExportSeasonSelect) {
  adminExportSeasonSelect.addEventListener("change", () => {
    renderSeasonArchiveExportOptions();
  });
}
if (adminConfirmExportSeasonBtn) {
  adminConfirmExportSeasonBtn.addEventListener("click", async () => {
    await exportClosedSeasonArchiveToGithub();
  });
}
if (adminRunPrizeDistributionBtn) {
  adminRunPrizeDistributionBtn.addEventListener("click", runPrizeDistribution);
}
if (adminPrizeDistributionSeedInput) {
  adminPrizeDistributionSeedInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runPrizeDistribution();
  });
}
if (adminCopyPrizeDistributionBtn) {
  adminCopyPrizeDistributionBtn.addEventListener("click", copyPrizeDistributionText);
}
if (adminSaveParticipationRulesBtn) {
  adminSaveParticipationRulesBtn.addEventListener("click", saveAdminParticipationRules);
}
if (adminIdentityEmailSelect) {
  const syncIdentityEmailSelection = () => {
    syncManagedIdentityFormFromEmail(adminIdentityEmailSelect.value || "");
  };
  adminIdentityEmailSelect.addEventListener("change", syncIdentityEmailSelection);
  adminIdentityEmailSelect.addEventListener("input", syncIdentityEmailSelection);
}
if (adminSaveIdentityBtn) {
  adminSaveIdentityBtn.addEventListener("click", saveAdminIdentityMapping);
}
if (adminIdentityUsernameInput) {
  adminIdentityUsernameInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await saveAdminIdentityMapping();
  });
}
if (scorerQuickAddPlayerBtn) {
  scorerQuickAddPlayerBtn.addEventListener("click", async () => {
    const success = await quickAddPlayer(scorerQuickAddPlayerInput?.value || "", { messageTarget: "scorer" });
    if (success && scorerQuickAddPlayerInput) {
      scorerQuickAddPlayerInput.value = "";
    }
  });
}
if (scorerSaveItemBtn) {
  scorerSaveItemBtn.addEventListener("click", async () => {
    await saveItemCatalogEntry("scorer");
  });
}
if (scorerItemCatalogToggleBtn) {
  scorerItemCatalogToggleBtn.addEventListener("click", () => {
    if (!isCurrentRoleScorer()) return;
    resetItemCatalogForm("scorer");
    setItemCatalogEditorOpen("scorer", true);
  });
}
if (scorerItemMatchTargets) {
  scorerItemMatchTargets.addEventListener("click", (event) => {
    const chip = event.target.closest('[data-role="item-target-toggle"]');
    if (!chip || chip.disabled) return;
    toggleItemMatchTarget("scorer", chip.dataset.target || "");
  });
}
if (scorerItemResolutionModeSelect) {
  scorerItemResolutionModeSelect.addEventListener("change", () => {
    handleItemCatalogResolutionModeChange("scorer");
  });
}
if (scorerItemStackTargets) {
  scorerItemStackTargets.addEventListener("click", (event) => {
    const chip = event.target.closest('[data-role="item-stack-toggle"]');
    if (!chip || chip.disabled) return;
    toggleItemScoreStackTarget("scorer", chip.dataset.itemId || "");
  });
}
if (scorerResetItemBtn) {
  scorerResetItemBtn.addEventListener("click", () => resetItemCatalogForm("scorer"));
}
if (adminQuickAddPlayerBtn) {
  adminQuickAddPlayerBtn.addEventListener("click", async () => {
    const success = await quickAddPlayer(adminQuickAddPlayerInput?.value || "", { messageTarget: "admin" });
    if (success && adminQuickAddPlayerInput) {
      adminQuickAddPlayerInput.value = "";
    }
  });
}
if (adminSaveItemBtn) {
  adminSaveItemBtn.addEventListener("click", async () => {
    await saveItemCatalogEntry("admin");
  });
}
if (adminItemCatalogToggleBtn) {
  adminItemCatalogToggleBtn.addEventListener("click", () => {
    if (!isCurrentRoleScorer()) return;
    resetItemCatalogForm("admin");
    setItemCatalogEditorOpen("admin", true);
  });
}
if (adminItemMatchTargets) {
  adminItemMatchTargets.addEventListener("click", (event) => {
    const chip = event.target.closest('[data-role="item-target-toggle"]');
    if (!chip || chip.disabled) return;
    toggleItemMatchTarget("admin", chip.dataset.target || "");
  });
}
if (adminItemResolutionModeSelect) {
  adminItemResolutionModeSelect.addEventListener("change", () => {
    handleItemCatalogResolutionModeChange("admin");
  });
}
if (adminItemStackTargets) {
  adminItemStackTargets.addEventListener("click", (event) => {
    const chip = event.target.closest('[data-role="item-stack-toggle"]');
    if (!chip || chip.disabled) return;
    toggleItemScoreStackTarget("admin", chip.dataset.itemId || "");
  });
}
if (adminResetItemBtn) {
  adminResetItemBtn.addEventListener("click", () => resetItemCatalogForm("admin"));
}
renderItemMatchTargetSelector("scorer", []);
renderItemMatchTargetSelector("admin", []);
renderItemScoreStackSelector("scorer", []);
renderItemScoreStackSelector("admin", []);
syncItemCatalogFormState("scorer");
syncItemCatalogFormState("admin");
if (scorerDeactivatePlayerBtn) {
  scorerDeactivatePlayerBtn.addEventListener("click", async () => {
    const success = await deactivatePlayer(selectedRenamePlayerIds.scorer || "", { messageTarget: "scorer" });
    if (success) {
      selectRenamePlayer("scorer", "");
    }
  });
}
if (adminDeactivatePlayerBtn) {
  adminDeactivatePlayerBtn.addEventListener("click", async () => {
    const success = await deactivatePlayer(selectedRenamePlayerIds.admin || "", { messageTarget: "admin" });
    if (success) {
      selectRenamePlayer("admin", "");
    }
  });
}
if (adminRestorePlayerBtn) {
  adminRestorePlayerBtn.addEventListener("click", async () => {
    await restoreInactivePlayer(selectedInactivePlayerId || "");
  });
}
if (adminHardDeletePlayerBtn) {
  adminHardDeletePlayerBtn.addEventListener("click", async () => {
    await hardDeleteInactivePlayer(selectedInactivePlayerId || "");
  });
}
if (adminRenamePlayerBtn) {
  adminRenamePlayerBtn.addEventListener("click", async () => {
    const success = await renamePlayer(selectedRenamePlayerIds.admin || "", adminRenamePlayerInput?.value || "", {
      messageTarget: "admin",
    });
    if (success) {
      if (adminRenamePlayerInput) {
        adminRenamePlayerInput.value = "";
      }
      selectRenamePlayer("admin", "");
    }
  });
}
if (scorerRenamePlayerBtn) {
  scorerRenamePlayerBtn.addEventListener("click", async () => {
    const success = await renamePlayer(selectedRenamePlayerIds.scorer || "", scorerRenamePlayerInput?.value || "", {
      messageTarget: "scorer",
    });
    if (success) {
      if (scorerRenamePlayerInput) {
        scorerRenamePlayerInput.value = "";
      }
      selectRenamePlayer("scorer", "");
    }
  });
}
if (scorerRenamePlayerInput) {
  scorerRenamePlayerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const success = await renamePlayer(selectedRenamePlayerIds.scorer || "", scorerRenamePlayerInput?.value || "", {
      messageTarget: "scorer",
    });
    if (success) {
      scorerRenamePlayerInput.value = "";
      selectRenamePlayer("scorer", "");
    }
  });
}
if (adminRenamePlayerInput) {
  adminRenamePlayerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const success = await renamePlayer(selectedRenamePlayerIds.admin || "", adminRenamePlayerInput?.value || "", {
      messageTarget: "admin",
    });
    if (success) {
      adminRenamePlayerInput.value = "";
      selectRenamePlayer("admin", "");
    }
  });
}
recordMatchBtn.addEventListener("click", recordMatch);
recordBackfillBtn.addEventListener("click", recordBackfillMatch);

openMatchFormBtn.addEventListener("click", () => {
  if (!canUseMatchRecordingForm()) {
    setMessage("当前缺少可用赛季，暂时无法添加当日比赛。", true);
    return;
  }
  clearMatchForm();
  setMatchFormOpen(true);
  setBackfillFormOpen(false);
  renderMatchForm();
});

finishTodayMatchDayButtons.forEach((button) => {
  button.addEventListener("click", finishTodayMatchDay);
});

openBackfillFormBtn.addEventListener("click", async () => {
  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
  backfillDateInput.value = backfillDateInput.value || getPreviousBeijingBusinessDateString();
  clearBackfillForm();
  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderBackfillForm();
  await ensureBackfillSeasonSelectionLoaded({ forcePlayers: true });
  refreshBackfillSelectOptions();
});

if (backfillDateShell) {
  backfillDateShell.addEventListener("click", (event) => {
    if (event.target === backfillDateInput || backfillDateInput.disabled) {
      return;
    }

    if (typeof backfillDateInput.showPicker === "function") {
      backfillDateInput.showPicker();
      return;
    }

    backfillDateInput.focus();
    backfillDateInput.click();
  });
}

closeMatchFormBtn.addEventListener("click", () => {
  clearMatchForm();
  setMatchFormOpen(false);
  renderMatchForm();
});

closeBackfillFormBtn.addEventListener("click", () => {
  clearBackfillForm();
  setBackfillFormOpen(false);
  renderBackfillForm();
});

matchFormPanel.addEventListener("click", (event) => {
  const winnerToggle = event.target.closest('[data-role="winner-toggle"]');
  if (winnerToggle) {
    toggleWinnerSelection(winnerToggle.dataset.formType || "match", winnerToggle.dataset.winner || "");
    return;
  }

  const teamDoubleToggle = event.target.closest('[data-role="team-double-toggle"]');
  if (teamDoubleToggle) {
    const formType = teamDoubleToggle.dataset.formType || "match";
    const team = teamDoubleToggle.dataset.team || "A";
    const itemId = teamDoubleToggle.dataset.itemId || "";
    teamDoublePickerOpen[formType][team] = teamDoublePickerOpen[formType][team] === itemId ? "" : itemId;
    renderInlineTeamDoubleControls(formType, !canUseMatchRecordingForm());
    return;
  }

  const teamDoubleMode = event.target.closest('[data-role="team-double-mode"]');
  if (teamDoubleMode) {
    const team = teamDoubleMode.dataset.team === "A" ? "A" : "B";
    const itemCatalogId = teamDoubleMode.dataset.itemId || LEGACY_MATCH_ITEM_IDS.team;
    const config = getTeamDoubleConfig("match", team, itemCatalogId);
    const targetTeam = teamDoubleMode.dataset.targetTeam || "";
    const paymentMode = teamDoubleMode.dataset.paymentMode === "split" ? "split" : "solo";
    const isSameSelection = itemCatalogId === config.itemCatalogId
      && targetTeam === config.targetTeam
      && paymentMode === config.paymentMode;
    if (!targetTeam || isSameSelection) {
      removeTeamDoubleConfig("match", team, itemCatalogId);
    } else {
      upsertTeamDoubleConfig("match", team, {
        itemCatalogId,
        targetTeam,
        paymentMode,
        userPlayerId: "",
      });
    }
    teamDoublePickerOpen.match[team] = !isSameSelection && targetTeam && paymentMode === "solo" ? itemCatalogId : "";
    renderInlineTeamDoubleControls("match", !canUseMatchRecordingForm());
    refreshMatchSelectOptions();
    return;
  }

  const teamDoublePayer = event.target.closest('[data-role="team-double-payer"]');
  if (teamDoublePayer) {
    const team = teamDoublePayer.dataset.team === "A" ? "A" : "B";
    const itemCatalogId = teamDoublePayer.dataset.itemId || LEGACY_MATCH_ITEM_IDS.team;
    const currentConfig = getTeamDoubleConfig("match", team, itemCatalogId);
    upsertTeamDoubleConfig("match", team, {
      ...currentConfig,
      itemCatalogId,
      userPlayerId: currentConfig.userPlayerId === (teamDoublePayer.dataset.playerId || "") ? "" : (teamDoublePayer.dataset.playerId || ""),
    });
    teamDoublePickerOpen.match[team] = "";
    renderInlineTeamDoubleControls("match", !canUseMatchRecordingForm());
    refreshMatchSelectOptions();
    return;
  }

  const playerDoubleToggle = event.target.closest('[data-role="player-double-toggle"]');
  if (playerDoubleToggle) {
    const playerId = playerDoubleToggle.dataset.playerId || "";
    const itemId = playerDoubleToggle.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    const itemEntry = getMatchInteractionItemById(itemId);
    if (isSelfOnlySingleRelationItem(itemEntry)) {
      toggleSingleDoubleTarget("match", playerId, playerId, itemId);
      singleDoublePickerOpen.match[playerId] = "";
    } else {
      singleDoublePickerOpen.match[playerId] = singleDoublePickerOpen.match[playerId] === itemId ? "" : itemId;
    }
    refreshMatchSelectOptions();
    return;
  }

  const playerDoubleClear = event.target.closest('[data-role="player-double-clear"]');
  if (playerDoubleClear) {
    const userPlayerId = playerDoubleClear.dataset.userPlayerId || "";
    const itemCatalogId = playerDoubleClear.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    clearSingleDoubleTargets("match", userPlayerId, itemCatalogId);
    singleDoublePickerOpen.match[userPlayerId] = itemCatalogId;
    refreshMatchSelectOptions();
    return;
  }

  const playerDoubleTarget = event.target.closest('[data-role="player-double-target"]');
  if (playerDoubleTarget) {
    const userPlayerId = playerDoubleTarget.dataset.userPlayerId || "";
    const targetPlayerId = playerDoubleTarget.dataset.targetPlayerId || "";
    const itemCatalogId = playerDoubleTarget.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    toggleSingleDoubleTarget("match", userPlayerId, targetPlayerId, itemCatalogId);
    singleDoublePickerOpen.match[userPlayerId] = itemCatalogId;
    refreshMatchSelectOptions();
    return;
  }

  const heroButton = event.target.closest('[data-role="hero-picker"]');
  if (heroButton) {
    openHeroPicker({
      formType: "match",
      playerId: heroButton.dataset.playerId,
      playerName: heroButton.dataset.playerName,
      currentHero: matchHeroAssignments[heroButton.dataset.playerId] || "",
      isSavedMatch: false,
    });
    return;
  }

  const chip = event.target.closest(".match-player-chip");
  if (!chip || chip.disabled) return;

  togglePlayerSelection(chip.dataset.formType || "match", chip.dataset.team, chip.dataset.playerId);
});

backfillFormPanel.addEventListener("change", async (event) => {
  if (event.target === backfillSeasonSelect) {
    clearBackfillForm();
    await loadPlayersForSeason(backfillSeasonSelect.value);
    return;
  }
});

backfillFormPanel.addEventListener("click", (event) => {
  const winnerToggle = event.target.closest('[data-role="winner-toggle"]');
  if (winnerToggle) {
    toggleWinnerSelection(winnerToggle.dataset.formType || "backfill", winnerToggle.dataset.winner || "");
    return;
  }

  const teamDoubleToggle = event.target.closest('[data-role="team-double-toggle"]');
  if (teamDoubleToggle) {
    const formType = teamDoubleToggle.dataset.formType || "backfill";
    const team = teamDoubleToggle.dataset.team || "A";
    const itemId = teamDoubleToggle.dataset.itemId || "";
    teamDoublePickerOpen[formType][team] = teamDoublePickerOpen[formType][team] === itemId ? "" : itemId;
    renderInlineTeamDoubleControls(formType, !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    return;
  }

  const teamDoubleMode = event.target.closest('[data-role="team-double-mode"]');
  if (teamDoubleMode) {
    const team = teamDoubleMode.dataset.team === "A" ? "A" : "B";
    const itemCatalogId = teamDoubleMode.dataset.itemId || LEGACY_MATCH_ITEM_IDS.team;
    const config = getTeamDoubleConfig("backfill", team, itemCatalogId);
    const targetTeam = teamDoubleMode.dataset.targetTeam || "";
    const paymentMode = teamDoubleMode.dataset.paymentMode === "split" ? "split" : "solo";
    const isSameSelection = itemCatalogId === config.itemCatalogId
      && targetTeam === config.targetTeam
      && paymentMode === config.paymentMode;
    if (!targetTeam || isSameSelection) {
      removeTeamDoubleConfig("backfill", team, itemCatalogId);
    } else {
      upsertTeamDoubleConfig("backfill", team, {
        itemCatalogId,
        targetTeam,
        paymentMode,
        userPlayerId: "",
      });
    }
    teamDoublePickerOpen.backfill[team] = !isSameSelection && targetTeam && paymentMode === "solo" ? itemCatalogId : "";
    renderInlineTeamDoubleControls("backfill", !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    refreshBackfillSelectOptions();
    return;
  }

  const teamDoublePayer = event.target.closest('[data-role="team-double-payer"]');
  if (teamDoublePayer) {
    const team = teamDoublePayer.dataset.team === "A" ? "A" : "B";
    const itemCatalogId = teamDoublePayer.dataset.itemId || LEGACY_MATCH_ITEM_IDS.team;
    const currentConfig = getTeamDoubleConfig("backfill", team, itemCatalogId);
    upsertTeamDoubleConfig("backfill", team, {
      ...currentConfig,
      itemCatalogId,
      userPlayerId: currentConfig.userPlayerId === (teamDoublePayer.dataset.playerId || "") ? "" : (teamDoublePayer.dataset.playerId || ""),
    });
    teamDoublePickerOpen.backfill[team] = "";
    renderInlineTeamDoubleControls("backfill", !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    refreshBackfillSelectOptions();
    return;
  }

  const playerDoubleToggle = event.target.closest('[data-role="player-double-toggle"]');
  if (playerDoubleToggle) {
    const playerId = playerDoubleToggle.dataset.playerId || "";
    const itemId = playerDoubleToggle.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    const itemEntry = getMatchInteractionItemById(itemId);
    if (isSelfOnlySingleRelationItem(itemEntry)) {
      toggleSingleDoubleTarget("backfill", playerId, playerId, itemId);
      singleDoublePickerOpen.backfill[playerId] = "";
    } else {
      singleDoublePickerOpen.backfill[playerId] = singleDoublePickerOpen.backfill[playerId] === itemId ? "" : itemId;
    }
    refreshBackfillSelectOptions();
    return;
  }

  const playerDoubleClear = event.target.closest('[data-role="player-double-clear"]');
  if (playerDoubleClear) {
    const userPlayerId = playerDoubleClear.dataset.userPlayerId || "";
    const itemCatalogId = playerDoubleClear.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    clearSingleDoubleTargets("backfill", userPlayerId, itemCatalogId);
    singleDoublePickerOpen.backfill[userPlayerId] = itemCatalogId;
    refreshBackfillSelectOptions();
    return;
  }

  const playerDoubleTarget = event.target.closest('[data-role="player-double-target"]');
  if (playerDoubleTarget) {
    const userPlayerId = playerDoubleTarget.dataset.userPlayerId || "";
    const targetPlayerId = playerDoubleTarget.dataset.targetPlayerId || "";
    const itemCatalogId = playerDoubleTarget.dataset.itemId || LEGACY_MATCH_ITEM_IDS.personal;
    toggleSingleDoubleTarget("backfill", userPlayerId, targetPlayerId, itemCatalogId);
    singleDoublePickerOpen.backfill[userPlayerId] = itemCatalogId;
    refreshBackfillSelectOptions();
    return;
  }

  const heroButton = event.target.closest('[data-role="hero-picker"]');
  if (heroButton) {
    openHeroPicker({
      formType: "backfill",
      playerId: heroButton.dataset.playerId,
      playerName: heroButton.dataset.playerName,
      currentHero: backfillHeroAssignments[heroButton.dataset.playerId] || "",
      isSavedMatch: false,
    });
    return;
  }

  const chip = event.target.closest(".match-player-chip");
  if (!chip || chip.disabled) return;

  togglePlayerSelection(chip.dataset.formType || "backfill", chip.dataset.team, chip.dataset.playerId);
});

queueList.addEventListener("click", async (event) => {
  const reSignupButton = event.target.closest(".queue-resignup-btn");
  if (reSignupButton) {
    await reSignupByEntry(
      reSignupButton.dataset.entryId,
      reSignupButton.dataset.playerName,
      reSignupButton
    );
    return;
  }

  const unreadyButton = event.target.closest(".queue-unready-btn");
  if (unreadyButton) {
    await cancelQueuePlayerReady(
      unreadyButton.dataset.rosterEntryId,
      unreadyButton.dataset.playerName,
      unreadyButton
    );
    return;
  }

  const readyButton = event.target.closest(".queue-ready-btn");
  if (readyButton) {
    await markQueuePlayerReady(
      readyButton.dataset.playerId,
      readyButton.dataset.playerName,
      readyButton
    );
  }
});

signupPlayerGrid.addEventListener("click", async (event) => {
  const button = event.target.closest(".signup-player-chip");
  if (!button || button.disabled) return;

  if (button.dataset.action === "signup") {
    await signup(button.dataset.playerId);
    return;
  }

  if (button.dataset.action === "cancel") {
    await cancelSignupByPlayer(
      button.dataset.playerId,
      button.dataset.playerName,
      button
    );
    return;
  }

  if (button.dataset.action === "resignup") {
    await reSignupByEntry(
      button.dataset.entryId,
      button.dataset.playerName,
      button
    );
  }
});

recentMatchesList.addEventListener("click", async (event) => {
  const toggleAttendanceButton = event.target.closest('[data-role="toggle-match-day-attendance"]');
  if (toggleAttendanceButton) {
    event.preventDefault();
    event.stopPropagation();
    const groupKey = toggleAttendanceButton.dataset.groupKey || "";
    const groupElement = recentMatchesList.querySelector(
      `.match-day-group[data-group-key="${escapeCssIdentifier(groupKey)}"]`
    );
    if (groupElement && !groupElement.open) {
      groupElement.open = true;
      groupElement.dataset.expanded = "true";
      openRecentMatchGroups.add(groupElement.dataset.groupKey || "");
    }
    const attendancePanel = groupElement?.querySelector(".match-day-attendance-panel");
    if (attendancePanel) {
      const willOpen = attendancePanel.hidden;
      if (groupKey) {
        if (willOpen) {
          openMatchDayAttendanceGroups.add(groupKey);
        } else {
          openMatchDayAttendanceGroups.delete(groupKey);
        }
      }
      attendancePanel.hidden = !willOpen;
      attendancePanel.classList.toggle("match-day-attendance-panel-open", willOpen);
      toggleAttendanceButton.classList.toggle("match-day-copy-btn-active", willOpen);
      toggleAttendanceButton.setAttribute("aria-pressed", willOpen ? "true" : "false");
      const nextLabel = willOpen ? "收起迟到选手登记" : "登记迟到选手";
      toggleAttendanceButton.setAttribute("aria-label", nextLabel);
      toggleAttendanceButton.setAttribute("title", nextLabel);
    }
    return;
  }

  const copyMatchDayButton = event.target.closest('[data-role="copy-match-day-report"]');
  if (copyMatchDayButton) {
    event.preventDefault();
    event.stopPropagation();
    await copyMatchDayBattleReport(copyMatchDayButton.dataset.groupKey, copyMatchDayButton);
    return;
  }

  const attendancePlayerChip = event.target.closest('[data-role="attendance-player-chip"]');
  if (attendancePlayerChip) {
    toggleMatchDayAttendanceSelection(
      attendancePlayerChip.dataset.groupKey || "",
      attendancePlayerChip.dataset.playerId || ""
    );
    renderRecentMatches(recentMatchDayGroupsData);
    return;
  }

  const attendanceAddButton = event.target.closest(".match-day-attendance-add-btn");
  if (attendanceAddButton) {
    const selectedIds = [
      ...(matchDayAttendanceSelectedIdsByGroup.get(attendanceAddButton.dataset.groupKey || "") || new Set()),
    ];
    await addMatchDayAttendanceNote(
      attendanceAddButton.dataset.matchDayId,
      attendanceAddButton.dataset.seasonId,
      attendanceAddButton.dataset.matchDate,
      attendanceAddButton.dataset.status,
      selectedIds,
      attendanceAddButton.dataset.groupKey || "",
      attendanceAddButton
    );
    return;
  }

  const attendanceRemoveButton = event.target.closest(".match-day-attendance-remove-btn");
  if (attendanceRemoveButton) {
    await removeMatchDayAttendanceNote(
      attendanceRemoveButton.dataset.noteId,
      attendanceRemoveButton.dataset.playerName,
      attendanceRemoveButton.dataset.statusLabel,
      attendanceRemoveButton
    );
    return;
  }

  const savedMatchWinnerButton = event.target.closest('[data-role="saved-match-winner"]');
  if (savedMatchWinnerButton) {
    await updateSavedMatchWinner(
      savedMatchWinnerButton.dataset.matchId,
      savedMatchWinnerButton.dataset.winnerTeam || "",
      savedMatchWinnerButton
    );
    return;
  }

  const playerButton = event.target.closest('[data-role="saved-hero-picker"]');
  if (playerButton) {
    if (!isCurrentRoleScorer()) return;
    openHeroPicker({
      matchId: playerButton.dataset.matchId,
      playerId: playerButton.dataset.playerId,
      playerName: playerButton.dataset.playerName,
      currentHero: playerButton.dataset.heroName || "",
      isSavedMatch: true,
    });
    return;
  }

  const editButton = event.target.closest(".edit-match-btn");
  if (editButton) {
    await startEditingMatch(editButton.dataset.matchId);
    return;
  }

  const button = event.target.closest(".delete-match-btn");
  if (!button) return;

  await deleteMatch(button.dataset.matchId, button);
});

if (recentMatchesList) {
  recentMatchesList.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const handle = getClosestElement(event.target, '[data-role="drag-match"]');
    if (!handle) return;
    if (!isRecentMatchDragHotspotHit(handle, event.clientX, event.clientY)) return;
    const matchId = handle.dataset.matchId || "";
    const groupKey = handle.dataset.groupKey || "";
    if (!matchId || !groupKey) return;

    const card = handle.closest(".recent-match-card");
    if (!card) return;

    event.preventDefault();
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(event.pointerId);
    }
    recentMatchDragState = {
      matchId,
      groupKey,
      targetMatchId: "",
      pointerId: event.pointerId,
      isDragging: false,
      startX: event.clientX,
      startY: event.clientY,
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      animationFrame: 0,
      card,
      handle,
    };
  });

  window.addEventListener("pointermove", (event) => {
    if (!recentMatchDragState) return;
    if (event.pointerId !== recentMatchDragState.pointerId) return;
    updateRecentMatchPointerDrag(event.clientX, event.clientY);
    if (recentMatchDragState?.isDragging) {
      event.preventDefault();
    }
  });

  window.addEventListener("pointerup", async (event) => {
    if (!recentMatchDragState) return;
    if (event.pointerId !== recentMatchDragState.pointerId) return;
    event.preventDefault();
    if (!recentMatchDragState.isDragging) {
      resetRecentMatchPointerDrag(recentMatchDragState.card, { animateBack: false });
      return;
    }
    const sourceMatchId = recentMatchDragState.matchId;
    const targetMatchId = updateRecentMatchPointerTarget(event.clientX, event.clientY) || recentMatchDragState.targetMatchId || "";
    const dragCard = recentMatchDragState.card;
    resetRecentMatchPointerDrag(dragCard, { animateBack: !targetMatchId || targetMatchId === sourceMatchId });

    if (!targetMatchId || targetMatchId === sourceMatchId) {
      return;
    }

    await swapMatchesWithinDay(sourceMatchId, targetMatchId);
  });

  window.addEventListener("pointercancel", (event) => {
    if (!recentMatchDragState) return;
    if (event.pointerId !== recentMatchDragState.pointerId) return;
    resetRecentMatchPointerDrag(recentMatchDragState.card, { animateBack: true });
  });

}

if (scorerSaveRankLabelsBtn) {
  scorerSaveRankLabelsBtn.addEventListener("click", () => saveSeasonRankLabels("scorer"));
}

if (adminSaveRankLabelsBtn) {
  adminSaveRankLabelsBtn.addEventListener("click", () => saveSeasonRankLabels("admin"));
}

if (scorerRankLabelEditors) {
  scorerRankLabelEditors.addEventListener("input", (event) => {
    const powerInput = event.target.closest('[data-role="season-player-power-input"]');
    if (powerInput) {
      updateSeasonPowerDraftPlayerValue("scorer", powerInput.dataset.playerId || "", powerInput.value || "");
      scheduleSeasonPowerDraftCommit("scorer", powerInput.dataset.playerId || "");
      return;
    }
    const rankInput = event.target.closest('[data-role="season-rank-name-input"]');
    if (rankInput) {
      updateSeasonPowerDraftLabel("scorer", rankInput.dataset.rank || 0, rankInput.value || "");
    }
  });
  scorerRankLabelEditors.addEventListener("change", (event) => {
    const powerInput = event.target.closest('[data-role="season-player-power-input"]');
    if (!powerInput) return;
    flushSeasonPowerDraftCommit("scorer", powerInput.dataset.playerId || "");
  });
  scorerRankLabelEditors.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const input = event.target.closest('[data-role="season-player-power-input"], [data-role="season-rank-name-input"]');
    if (!input) return;
    event.preventDefault();
    await saveSeasonRankLabels("scorer");
  });
}

if (adminRankLabelEditors) {
  adminRankLabelEditors.addEventListener("input", (event) => {
    const powerInput = event.target.closest('[data-role="season-player-power-input"]');
    if (powerInput) {
      updateSeasonPowerDraftPlayerValue("admin", powerInput.dataset.playerId || "", powerInput.value || "");
      scheduleSeasonPowerDraftCommit("admin", powerInput.dataset.playerId || "");
      return;
    }
    const rankInput = event.target.closest('[data-role="season-rank-name-input"]');
    if (rankInput) {
      updateSeasonPowerDraftLabel("admin", rankInput.dataset.rank || 0, rankInput.value || "");
    }
  });
  adminRankLabelEditors.addEventListener("change", (event) => {
    const powerInput = event.target.closest('[data-role="season-player-power-input"]');
    if (!powerInput) return;
    flushSeasonPowerDraftCommit("admin", powerInput.dataset.playerId || "");
  });
  adminRankLabelEditors.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    const input = event.target.closest('[data-role="season-player-power-input"], [data-role="season-rank-name-input"]');
    if (!input) return;
    event.preventDefault();
    await saveSeasonRankLabels("admin");
  });
}

seasonRewardTotal.addEventListener("click", () => {
  setRewardPanelOpen(!isRewardPanelOpen);
  refreshRewardPanelSelectionUi();
  if (isRewardPanelOpen) {
    loadRewardLogs();
  }
});

closeRewardPanelBtn.addEventListener("click", () => {
  setRewardPanelOpen(false);
});

rewardPlayerPicker.addEventListener("click", (event) => {
  const button = event.target.closest('[data-role="reward-player-chip"]');
  if (!button || button.disabled) return;
  selectRewardPlayer(button.dataset.playerId || "");
});

addRewardBtn.addEventListener("click", addRewardExtra);


rewardExtraInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await addRewardExtra();
});

matchStartTimeInput.addEventListener("blur", () => {
  matchStartTimeInput.value = normalizeTimeInput(matchStartTimeInput.value);
});

rewardLogsList.addEventListener("click", async (event) => {
  const signupFeeToggleButton = event.target.closest('[data-role="signup-fee-paid-toggle"]');
  if (signupFeeToggleButton) {
    await toggleSignupFeePaid(signupFeeToggleButton.dataset.playerId, signupFeeToggleButton);
    return;
  }

  const button = event.target.closest(".cancel-reward-log-btn");
  if (!button) return;

  await cancelRewardDonation(
    button.dataset.donationId,
    button.dataset.playerName,
    button
  );
});

if (itemInventoryLogsList) {
  itemInventoryLogsList.addEventListener("click", (event) => {
    const backButton = event.target.closest('[data-role="item-history-back"]');
    if (backButton) {
      itemInventoryLogSelectedPlayerId = "";
      renderItemInventoryLogs();
      return;
    }

    const playerButton = event.target.closest('[data-role="item-history-open-player"]');
    if (playerButton) {
      itemInventoryLogSelectedPlayerId = playerButton.dataset.playerId || "";
      renderItemInventoryLogs();
    }
  });
}

[
  [scorerSeasonRuleBackdrop, () => setManagedDialogOpen("scorerSeasonRule", false)],
  [adminSeasonRuleBackdrop, () => setManagedDialogOpen("adminSeasonRule", false)],
  [scorerPowerBackdrop, () => setManagedDialogOpen("scorerPower", false)],
  [adminPowerBackdrop, () => setManagedDialogOpen("adminPower", false)],
  [scorerPlayerManagementBackdrop, () => setManagedDialogOpen("scorerPlayerManagement", false)],
  [adminPlayerManagementBackdrop, () => setManagedDialogOpen("adminPlayerManagement", false)],
  [scorerManualScoreBackdrop, () => setManagedDialogOpen("scorerManualScore", false)],
  [adminManualScoreBackdrop, () => setManagedDialogOpen("adminManualScore", false)],
  [scorerItemCatalogBackdrop, () => setManagedDialogOpen("scorerItemCatalog", false)],
  [adminItemCatalogBackdrop, () => setManagedDialogOpen("adminItemCatalog", false)],
  [scorerActionLogsBackdrop, () => setManagedDialogOpen("scorerActionLogs", false)],
  [adminActionLogsBackdrop, () => setManagedDialogOpen("adminActionLogs", false)],
  [itemInventoryLogsBackdrop, () => setManagedDialogOpen("itemInventoryLogs", false)],
  [leaderboardPowerViewBackdrop, () => setManagedDialogOpen("leaderboardPowerView", false)],
  [leaderboardParticipationViewBackdrop, () => setManagedDialogOpen("leaderboardParticipationView", false)],
  [leaderboardChampionsBackdrop, () => setManagedDialogOpen("leaderboardChampions", false)],
  [leaderboardLifetimeRewardsBackdrop, () => setManagedDialogOpen("leaderboardLifetimeRewards", false)],
  [playerRelationBackdrop, () => setManagedDialogOpen("playerRelation", false)],
  [adminBackgroundPickerBackdrop, () => setManagedDialogOpen("adminBackgroundPicker", false)],
].forEach(([node, handler]) => {
  if (node) {
    node.addEventListener("click", handler);
  }
});

[
  [closeScorerSeasonRuleBtn, () => setManagedDialogOpen("scorerSeasonRule", false)],
  [closeAdminSeasonRuleBtn, () => setManagedDialogOpen("adminSeasonRule", false)],
  [closeScorerPowerBtn, () => setManagedDialogOpen("scorerPower", false)],
  [closeAdminPowerBtn, () => setManagedDialogOpen("adminPower", false)],
  [closeScorerPlayerManagementBtn, () => setManagedDialogOpen("scorerPlayerManagement", false)],
  [closeAdminPlayerManagementBtn, () => setManagedDialogOpen("adminPlayerManagement", false)],
  [closeScorerManualScoreBtn, () => setManagedDialogOpen("scorerManualScore", false)],
  [closeAdminManualScoreBtn, () => setManagedDialogOpen("adminManualScore", false)],
  [closeScorerItemCatalogBtn, () => setManagedDialogOpen("scorerItemCatalog", false)],
  [closeAdminItemCatalogBtn, () => setManagedDialogOpen("adminItemCatalog", false)],
  [closeScorerActionLogsBtn, () => setManagedDialogOpen("scorerActionLogs", false)],
  [closeAdminActionLogsBtn, () => setManagedDialogOpen("adminActionLogs", false)],
  [closeItemInventoryLogsBtn, () => setManagedDialogOpen("itemInventoryLogs", false)],
  [closeLeaderboardPowerViewBtn, () => setManagedDialogOpen("leaderboardPowerView", false)],
  [closeLeaderboardParticipationViewBtn, () => setManagedDialogOpen("leaderboardParticipationView", false)],
  [closeLeaderboardChampionsBtn, () => setManagedDialogOpen("leaderboardChampions", false)],
  [closeLeaderboardLifetimeRewardsBtn, () => setManagedDialogOpen("leaderboardLifetimeRewards", false)],
  [closePlayerRelationBtn, () => setManagedDialogOpen("playerRelation", false)],
  [closeAdminBackgroundPickerBtn, () => setManagedDialogOpen("adminBackgroundPicker", false)],
].forEach(([node, handler]) => {
  if (node) {
    node.addEventListener("click", handler);
  }
});

if (accessModalBackdrop) {
  accessModalBackdrop.addEventListener("click", () => setAccessModalOpen(false));
}

closeAccessModalBtn.addEventListener("click", () => setAccessModalOpen(false));
confirmAccessBtn.addEventListener("click", confirmAccessRole);
if (accessPasswordInput) {
  accessPasswordInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await confirmAccessRole();
  });
}

scorerMembersList.addEventListener("click", async (event) => {
  const editIdentityButton = event.target.closest(".admin-edit-identity-btn");
  if (editIdentityButton) {
    const identity = adminManagedAccounts.find((entry) => entry.id === editIdentityButton.dataset.identityId) || null;
    if (identity) {
      populateManagedIdentityForm(identity);
      adminIdentityUsernameInput?.focus();
    }
    return;
  }
  const resetPasswordButton = event.target.closest(".admin-reset-password-btn");
  if (resetPasswordButton) {
    await resetManagedIdentityPassword(resetPasswordButton.dataset.identityId || "");
    return;
  }
  const clearIdentityDevicesButton = event.target.closest(".admin-clear-identity-devices-btn");
  if (clearIdentityDevicesButton) {
    await clearManagedIdentityRememberedDevices(clearIdentityDevicesButton.dataset.identityId || "");
    return;
  }
  const deleteIdentityButton = event.target.closest(".admin-delete-identity-btn");
  if (deleteIdentityButton) {
    await deleteManagedIdentity(deleteIdentityButton.dataset.identityId || "");
    return;
  }
  return;
});

function bindItemCatalogListEvents(listEl, mode = "scorer") {
  if (!listEl) return;
  listEl.addEventListener("click", async (event) => {
    const actionButton = event.target.closest(".item-catalog-player-action-btn");
    if (actionButton) {
      await applyItemCatalogInventoryAction(
        actionButton.dataset.mode || mode,
        actionButton.dataset.itemId || "",
        actionButton.dataset.playerId || "",
        actionButton.dataset.action || ""
      );
      return;
    }

    const playerChipButton = event.target.closest(".item-catalog-player-chip-btn");
    if (playerChipButton) {
      const nextSelection = {
        mode: playerChipButton.dataset.mode || mode,
        itemId: playerChipButton.dataset.itemId || "",
        playerId: playerChipButton.dataset.playerId || "",
      };
      itemCatalogPendingPlayerAction = isSelectedItemCatalogPlayerAction(
        nextSelection.mode,
        nextSelection.itemId,
        nextSelection.playerId
      ) ? null : nextSelection;
      renderItemCatalogManagement("scorer");
      renderItemCatalogManagement("admin");
      return;
    }

    const editButton = event.target.closest(".item-catalog-edit-btn");
    if (editButton) {
      const entry = itemCatalogEntries.find((item) => item.id === editButton.dataset.itemId) || null;
      if (!entry) return;
      populateItemCatalogForm(entry, mode);
      return;
    }

    const deleteButton = event.target.closest(".item-catalog-delete-btn");
    if (!deleteButton) return;
    await deleteItemCatalogEntry(
      deleteButton.dataset.mode || mode,
      deleteButton.dataset.itemId || ""
    );
  });
}

bindItemCatalogListEvents(scorerItemCatalogList, "scorer");
bindItemCatalogListEvents(adminItemCatalogList, "admin");

if (scorerPanel) {
  scorerPanel.addEventListener("click", (event) => {
    const button = event.target.closest(".scorer-panel-nav-btn");
    if (!button) return;
    scrollToPanelTarget(button.dataset.scrollTarget || "");
  });
}

closeHeroPickerBtn.addEventListener("click", closeHeroPicker);
heroPickerBackdrop.addEventListener("click", closeHeroPicker);
heroSearchInput.addEventListener("input", () => {
  renderHeroOptions(heroSearchInput.value);
});
heroSearchInput.addEventListener("compositionend", () => {
  renderHeroOptions(heroSearchInput.value);
});
heroSearchInput.addEventListener("focus", () => {
  renderHeroSuggestions(heroSearchInput.value);
});
heroSearchSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest(".hero-search-option");
  if (!option) return;

  const heroName = option.dataset.heroName;
  heroSelect.value = heroName;
  heroSearchInput.value = getHeroDisplayName(heroName);
  heroSearchSuggestions.hidden = true;
  heroSearchSuggestions.innerHTML = "";
  setHeroPickerMessage("");
});
saveHeroBtn.addEventListener("click", async () => {
  await saveHeroSelection(heroSelect.value);
});
clearHeroBtn.addEventListener("click", async () => {
  heroSelect.value = "";
  await saveHeroSelection("");
});
if (leaderboardCompactBtn) {
  leaderboardCompactBtn.addEventListener("click", () => {
    setLeaderboardCompactMode(!isLeaderboardCompact);
  });
}

if (leaderboardCopyBtn) {
  leaderboardCopyBtn.addEventListener("click", copyLeaderboardSummary);
}

if (leaderboardScoreSortBtn) {
  leaderboardScoreSortBtn.addEventListener("click", () => {
    leaderboardSortMode = leaderboardSortMode === "win_loss" ? "total" : "win_loss";
    renderLeaderboard(leaderboardPlayers);
  });
}

if (leaderboardBody) {
  leaderboardBody.addEventListener("click", async (event) => {
    const trigger = event.target.closest('[data-role="score-detail"]');
    if (trigger) {
      const playerId = trigger.dataset.playerId || "";
      if (!playerId) return;
      if (isMobileViewport()) {
        event.preventDefault();
        event.stopPropagation();
        toggleLeaderboardScoreComposition(trigger);
        return;
      }
      clearLeaderboardScoreCompositionState({ clearFocus: true });
      await openScoreDetailModal(playerId);
      return;
    }

    const relationTrigger = event.target.closest('[data-role="player-relation"]');
    if (!relationTrigger) return;
    const playerId = relationTrigger.dataset.playerId || "";
    if (!playerId) return;
    await openPlayerRelationModal(playerId, {
      seasonId: PLAYER_RELATION_ALL_SEASONS_VALUE,
    });
  });
}

if (playerRelationPlayerChips) {
  playerRelationPlayerChips.addEventListener("click", async (event) => {
    const chip = event.target instanceof HTMLElement ? event.target.closest('[data-role="player-relation-chip"]') : null;
    if (!(chip instanceof HTMLButtonElement)) return;
    const nextPlayerId = chip.dataset.playerId || "";
    await switchPlayerRelationPlayer(nextPlayerId);
  });
}

if (playerRelationSeasonSelect) {
  playerRelationSeasonSelect.addEventListener("change", async () => {
    playerRelationState.seasonId = playerRelationSeasonSelect.value || PLAYER_RELATION_ALL_SEASONS_VALUE;
    syncPlayerRelationMinGamesForSeason(playerRelationState.seasonId);
    await loadAndRenderPlayerRelationStats();
  });
}

if (playerRelationViewToggleBtn) {
  playerRelationViewToggleBtn.addEventListener("click", () => {
    playerRelationState.viewMode = playerRelationState.viewMode === "overview" ? "detail" : "overview";
    renderPlayerRelationModalView();
  });
}

if (playerRelationMinGamesInput) {
  playerRelationMinGamesInput.addEventListener("change", () => {
    applyPlayerRelationMinGamesInputValue();
    renderPlayerRelationModalView();
  });
}

if (playerRelationTableBody?.parentElement) {
  playerRelationTableBody.parentElement.addEventListener("click", (event) => {
    const sortButton = event.target.closest('[data-role="player-relation-sort"]');
    if (!sortButton) return;
    const nextKey = sortButton.dataset.sortKey || "win_rate";
    if (playerRelationState.sortKey === nextKey) {
      playerRelationState.sortDirection = playerRelationState.sortDirection === "asc" ? "desc" : "asc";
    } else {
      playerRelationState.sortKey = nextKey;
      playerRelationState.sortDirection = nextKey === "related_player_name" || nextKey === "relation_type" ? "asc" : "desc";
    }
    renderPlayerRelationModalView();
  });
}

if (scoreDetailList) {
  scoreDetailList.addEventListener("click", async (event) => {
    const button = event.target.closest(".revoke-manual-score-btn");
    if (!button) return;
    await revokeManualScoreAdjustment(
      button.dataset.adjustmentId,
      button.dataset.playerName,
      button.dataset.actionLabel
    );
  });
}

if (closeScoreDetailBtn) {
  closeScoreDetailBtn.addEventListener("click", closeScoreDetailModal);
}

if (scoreDetailBackdrop) {
  scoreDetailBackdrop.addEventListener("click", closeScoreDetailModal);
}

if (systemPromptBackdrop) {
  systemPromptBackdrop.addEventListener("click", () => settleSystemPrompt(false));
}

if (systemPromptCancelBtn) {
  systemPromptCancelBtn.addEventListener("click", () => settleSystemPrompt(false));
}

if (systemPromptConfirmBtn) {
  systemPromptConfirmBtn.addEventListener("click", () => settleSystemPrompt(true));
}

if (systemPromptInput) {
  systemPromptInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    settleSystemPrompt(true);
  });
}

if (deleteMatchConfirmBackdrop) {
  deleteMatchConfirmBackdrop.addEventListener("click", () => settleDeleteMatchConfirmation(false));
}

if (adminExportSeasonBackdrop) {
  adminExportSeasonBackdrop.addEventListener("click", () => setSeasonArchiveExportModalOpen(false));
}

if (closeAdminExportSeasonBtn) {
  closeAdminExportSeasonBtn.addEventListener("click", () => setSeasonArchiveExportModalOpen(false));
}

if (adminPrizeDistributionBackdrop) {
  adminPrizeDistributionBackdrop.addEventListener("click", () => setPrizeDistributionModalOpen(false));
}

if (closeAdminPrizeDistributionBtn) {
  closeAdminPrizeDistributionBtn.addEventListener("click", () => setPrizeDistributionModalOpen(false));
}

if (adminParticipationRulesBackdrop) {
  adminParticipationRulesBackdrop.addEventListener("click", () => setAdminParticipationRulesModalOpen(false));
}

if (closeAdminParticipationRulesBtn) {
  closeAdminParticipationRulesBtn.addEventListener("click", () => setAdminParticipationRulesModalOpen(false));
}

if (cancelDeleteMatchBtn) {
  cancelDeleteMatchBtn.addEventListener("click", () => settleDeleteMatchConfirmation(false));
}

if (confirmDeleteMatchBtn) {
  confirmDeleteMatchBtn.addEventListener("click", () => settleDeleteMatchConfirmation(true));
}

if (scoreDetailSummary) {
  scoreDetailSummary.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-filter-mode]");
    if (!card || !scoreDetailState?.playerId) return;
    const nextMode = card.dataset.filterMode || "all";
    scoreDetailFilterMode = scoreDetailFilterMode === nextMode ? "all" : nextMode;
    await openScoreDetailModal(scoreDetailState.playerId);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    const openModal = getOpenDialogModal();
    if (!openModal) return;
    const focusableElements = getDialogFocusableElements(openModal);
    if (!focusableElements.length) {
      event.preventDefault();
      return;
    }
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
    return;
  }
  if (event.key === "Escape" && systemPromptModal && !systemPromptModal.hidden) {
    settleSystemPrompt(false);
    return;
  }
  if (event.key === "Escape" && deleteMatchConfirmModal && !deleteMatchConfirmModal.hidden) {
    settleDeleteMatchConfirmation(false);
    return;
  }
  if (event.key === "Escape" && adminExportSeasonModal && !adminExportSeasonModal.hidden) {
    setSeasonArchiveExportModalOpen(false);
    return;
  }
  if (event.key === "Escape" && adminPrizeDistributionModal && !adminPrizeDistributionModal.hidden) {
    setPrizeDistributionModalOpen(false);
    return;
  }
  if (event.key === "Escape" && adminParticipationRulesModal && !adminParticipationRulesModal.hidden) {
    setAdminParticipationRulesModalOpen(false);
    return;
  }
  if (event.key === "Escape" && accessModal && !accessModal.hidden) {
    setAccessModalOpen(false);
    return;
  }
  if (event.key === "Escape" && !heroPickerModal.hidden) {
    closeHeroPicker();
    return;
  }
  if (event.key === "Escape" && scoreDetailModal && !scoreDetailModal.hidden) {
    closeScoreDetailModal();
    return;
  }
  if (event.key === "Escape") {
    const managedEntry = managedDialogEntries.find((entry) => entry.modal && !entry.modal.hidden);
    if (managedEntry) {
      managedEntry.close();
    }
  }
});

document.addEventListener("click", (event) => {
  const clickTarget = event.target instanceof Element ? event.target : null;
  if (!clickTarget?.closest(".leaderboard-score-wrap")) {
    clearLeaderboardScoreCompositionState({ clearFocus: false });
  }

  if (
    !heroPickerModal.hidden &&
    !heroSearchInput.contains(event.target) &&
    !heroSearchSuggestions.contains(event.target)
  ) {
    heroSearchSuggestions.hidden = true;
    heroSearchSuggestions.innerHTML = "";
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (!authSession || !isCurrentRoleAdmin()) return;
  void refreshGitHubRepositoryStorageStatus();
});

function readStoredAccessSession() {
  try {
    const raw = window.localStorage.getItem(ACCESS_SESSION_STORAGE_KEY);
    if (!raw) return { role: "viewer", memberId: "", playerId: "" };
    const parsed = JSON.parse(raw);
    return {
      role: parsed?.role || "viewer",
      memberId: "",
      playerId: "",
    };
  } catch {
    return { role: "viewer", memberId: "", playerId: "" };
  }
}

function readAccessUiHiddenFlag() {
  try {
    return window.localStorage.getItem(ACCESS_UI_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeAccessUiHiddenFlag(isHidden) {
  isAccessUiHidden = Boolean(isHidden);
  try {
    if (!isAccessUiHidden) {
      window.localStorage.removeItem(ACCESS_UI_HIDDEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACCESS_UI_HIDDEN_STORAGE_KEY, "true");
  } catch (_error) {
    // Ignore storage failures and keep in-memory state.
  }
}

function hasVisibleAuthSession() {
  return Boolean(authSession) && !isAccessUiHidden;
}

function readRememberedScorerPlayerId() {
  return "";
}

function writeRememberedScorerPlayerId() {}

function getOrCreateLocalDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return "device-fallback";
  }
}

function readSkipNextScorerReconnect() {
  return false;
}

function setSkipNextScorerReconnect() {}

function writeStoredAccessSession(session = {}) {
  currentAccessSession = {
    role: session.role || "viewer",
    memberId: "",
    playerId: "",
  };
  try {
    window.localStorage.setItem(ACCESS_SESSION_STORAGE_KEY, JSON.stringify(currentAccessSession));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function clearStoredAccessSession() {
  currentAccessSession = { role: "viewer", memberId: "", playerId: "" };
  try {
    window.localStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage failures.
  }
}

function tryReconnectRememberedScorer() {
  return false;
}

function tryReconnectRememberedAdmin() {
  return false;
}

function getRoleMembersByRole() {
  return [];
}

function getRoleMembersByRoleAll() {
  return [];
}

function getPendingScorerApplications() {
  return [];
}

function getRoleAssignmentById() {
  return null;
}

function getPrimaryAdminMember() {
  return null;
}

function canCurrentUserManageRoles() {
  return false;
}

function isCurrentRoleScorer() {
  return currentAccessSession.role === "scorer" || currentAccessSession.role === "admin";
}

function isCurrentRoleAdmin() {
  return currentAccessSession.role === "admin";
}

function isCurrentRoleScorerOnly() {
  return currentAccessSession.role === "scorer";
}

function getCurrentAccessActorLabel() {
  if (!hasVisibleAuthSession()) return copyText("runtime.common.viewer", "游客");
  return authProfile?.display_name || authAccessRole?.username || authSession.user?.email || getAccessRoleLabel();
}

function applyAccessModalMode() {
  if (accessModalTitle) {
    accessModalTitle.textContent = copyText("runtime.accessModal.title", "账号登录");
  }
  setOptionalText(accessModalHint, copyText("runtime.accessModal.hint", ""));
  setOptionalText(accessScorerPickerTitle, copyText("accessModal.playerPickerLabel", ""));
  setOptionalText(accessScorerPickerHint, copyText("accessModal.playerPickerHint", ""));
  if (accessScorerPicker) {
    accessScorerPicker.hidden = false;
  }
  renderAccessScorerOptions();
}

function setAccessModalOpen(isOpen) {
  applyAccessModalMode();
  if (!accessModal) return;
  setDialogOpen(accessModal, isOpen, { initialFocus: authUsernameInput || confirmAccessBtn });
  if (isOpen) {
    setAccessMessage("");
    return;
  }
  if (authPasswordInput) {
    authPasswordInput.value = "";
  }
  setAccessMessage("");
}

function getRolePanelSummaryText() {
  return formatCopyText(
    "runtime.rolePanels.adminSummaryLoggedIn",
    {
      role: getAccessRoleLabel(),
      lastUpdated: getLastUpdatedDisplayText(),
      githubStorage: getGitHubRepositoryStorageDisplayText(),
      supabaseUsage: getSupabaseSystemUsageDisplayText(),
    },
    `当前登录身份：${getAccessRoleLabel()};   最后更新于${getLastUpdatedDisplayText()};   GitHub：${getGitHubRepositoryStorageDisplayText()};   ${getSupabaseSystemUsageDisplayText()}`
  );
}

function buildRolePanelSummaryMetricHtml(label, value, className) {
  return `<span class="role-panel-summary-part role-panel-summary-storage ${className}">${escapeHtml(label)}<span class="role-panel-summary-storage-value">${escapeHtml(value)}</span></span>`;
}

function renderRolePanelSummary(node, hasVisibleSession) {
  if (!node) return;
  node.classList.add("role-panel-summary");
  if (!hasVisibleSession) {
    node.textContent = copyText("runtime.rolePanels.adminSummaryLoggedOut", "请先登录管理员账号。");
    return;
  }

  const role = getAccessRoleLabel();
  const lastUpdated = getLastUpdatedDisplayText();
  const githubStorage = getGitHubRepositoryStorageDisplayText();
  const supabaseUsage = getSupabaseSystemUsageDisplayText();
  const supabaseSeparatorIndex = supabaseUsage.indexOf("：");
  const supabaseLabel = supabaseSeparatorIndex >= 0 ? supabaseUsage.slice(0, supabaseSeparatorIndex + 1) : "";
  const supabaseValue = supabaseSeparatorIndex >= 0 ? supabaseUsage.slice(supabaseSeparatorIndex + 1) : supabaseUsage;

  node.setAttribute("aria-label", getRolePanelSummaryText());
  node.innerHTML = [
    `<span class="role-panel-summary-part">当前登录身份：<span class="role-panel-summary-value">${escapeHtml(role)}</span></span>`,
    `<span class="role-panel-summary-separator">;</span>`,
    `<span class="role-panel-summary-part">最后更新于<span class="role-panel-summary-value">${escapeHtml(lastUpdated)}</span></span>`,
    `<span class="role-panel-summary-separator">;</span>`,
    buildRolePanelSummaryMetricHtml("GitHub：", githubStorage, "role-panel-summary-storage-github"),
    `<span class="role-panel-summary-separator">;</span>`,
    buildRolePanelSummaryMetricHtml(supabaseLabel || "数据库：", supabaseValue, "role-panel-summary-storage-database"),
  ].join("");
}

function renderRoleMembers() {
  const hasVisibleSession = hasVisibleAuthSession();
  if (scorerMembersCount) {
    scorerMembersCount.textContent = hasVisibleSession && isCurrentRoleAdmin()
      ? `${adminManagedAccounts.length} 个账号映射`
      : (hasVisibleSession
        ? copyText("runtime.rolePanels.roleControlLoggedIn", "账号角色控制")
        : copyText("runtime.rolePanels.roleControlLoggedOut", "未登录"));
  }
  renderRolePanelSummary(scorerPanelSummary, hasVisibleSession);
  renderRolePanelSummary(adminPanelSummary, hasVisibleSession);
  renderScorerPanelSummary();
  renderManagedIdentityEmailOptions();
  renderManagedIdentityList();

  const scorerCard = scorerMembersList?.closest(".admin-panel-card");
  if (scorerCard) {
    scorerCard.hidden = !isCurrentRoleAdmin();
  }
  if (adminAddScorerSelect) {
    adminAddScorerSelect.hidden = true;
    adminAddScorerSelect.disabled = true;
  }
  if (adminAddScorerBtn) {
    adminAddScorerBtn.hidden = true;
    adminAddScorerBtn.disabled = true;
  }
  if (adminClearScorerRememberBtn) {
    adminClearScorerRememberBtn.hidden = true;
    adminClearScorerRememberBtn.disabled = true;
  }
  if (adminIdentityEmailSelect) {
    adminIdentityEmailSelect.hidden = !isCurrentRoleAdmin();
  }
  if (adminIdentityUsernameInput) {
    adminIdentityUsernameInput.hidden = !isCurrentRoleAdmin();
  }
  if (adminSaveIdentityBtn) {
    adminSaveIdentityBtn.hidden = !isCurrentRoleAdmin();
  }
  renderItemCatalogManagement("scorer");
  renderItemCatalogManagement("admin");
}

function applyRolePermissions() {
  const canScore = isCurrentRoleScorer();
  const isAdmin = isCurrentRoleAdmin();
  const isScorerOnly = isCurrentRoleScorerOnly();
  const hasVisibleSession = hasVisibleAuthSession();

  if (openAuthModalBtn) {
    openAuthModalBtn.hidden = hasVisibleSession;
    openAuthModalBtn.textContent = copyText("runtime.common.signIn", "账号登录");
  }
  if (signOutBtn) {
    signOutBtn.hidden = true;
    signOutBtn.disabled = true;
  }

  if (scorerModeBtn) {
    scorerModeBtn.hidden = !isScorerOnly;
    scorerModeBtn.textContent = isScorerPanelOpen
      ? copyText("runtime.common.scorerModeOpen", "收起记录")
      : copyText("runtime.common.scorerModeClosed", "记录员模式");
  }

  if (adminModeBtn) {
    adminModeBtn.hidden = !isAdmin;
    adminModeBtn.textContent = isAdminPanelOpen
      ? copyText("runtime.common.adminModeOpen", "收起管理")
      : copyText("runtime.common.adminModeClosed", "管理员模式");
  }
  if (adminHistoryRepairToggleBtn) {
    adminHistoryRepairToggleBtn.hidden = !isAdmin;
    adminHistoryRepairToggleBtn.disabled = !isAdmin;
  }
  if (!isAdmin && adminHistoryRepairState.seasonId) {
    stopAdminHistoryRepairMode("");
  }

  resetSeasonBtn.hidden = true;
  clearQueueBtn.hidden = true;
  if (todayPlayersSection) {
    todayPlayersSection.hidden = true;
  }
  if (matchDaySection) {
    matchDaySection.hidden = true;
  }

  startMatchDayBtn.hidden = true;
  matchStartTimeInput.disabled = Boolean(activeMatchDay);
  if (signupAllBtn) {
    signupAllBtn.hidden = !canScore;
  }
  confirmQueueBtn.hidden = !canScore;
  openMatchFormBtn.hidden = !canScore;
  finishTodayMatchDayButtons.forEach((button) => {
    button.hidden = !canScore;
    button.disabled = !canScore || !activeSeason?.id;
  });
  openBackfillFormBtn.hidden = !canScore;
  recordMatchBtn.hidden = !canScore;
  recordBackfillBtn.hidden = !canScore;
  if (rewardEntryShell) {
    rewardEntryShell.hidden = !canScore;
  }
  addRewardBtn.hidden = !canScore;
  addRewardBtn.disabled = !canScore;
  rewardExtraInput.hidden = !canScore;
  rewardExtraInput.disabled = !canScore;
  if (rewardMinimumHint) {
    rewardMinimumHint.hidden = !canScore;
  }
  if (rewardMessageEl) {
    rewardMessageEl.hidden = !canScore;
  }
  adminClearQueueBtn.hidden = true;
  adminClearQueueBtn.disabled = !isAdmin;
  adminClearTodayPlayersBtn.disabled = !isAdmin;
  adminResetSeasonBtn.disabled = !isAdmin;
  if (adminFullSignOutBtn) {
    adminFullSignOutBtn.disabled = !hasVisibleSession || !isAdmin;
  }
  if (adminRecalculateScoresBtn) {
    adminRecalculateScoresBtn.disabled = !isAdmin || !activeSeason?.id;
  }
  if (adminBackgroundPickerBtn) {
    adminBackgroundPickerBtn.disabled = !isAdmin;
  }
  if (adminApplyBackgroundBtn) {
    adminApplyBackgroundBtn.disabled = !isAdmin || !getAdminBackgroundOptionById(adminBackgroundDraftId);
  }
  if (adminSetFinalDayBackgroundBtn) {
    adminSetFinalDayBackgroundBtn.disabled = !isAdmin || !getAdminBackgroundOptionById(adminBackgroundDraftId);
  }
  if (adminPlayerBackgroundSettingsBtn) {
    adminPlayerBackgroundSettingsBtn.disabled = !isAdmin;
  }
  if (adminBackgroundUploadInput) {
    adminBackgroundUploadInput.disabled = !isAdmin || adminBackgroundUploadInProgress;
  }
  if (scorerRecalculateScoresBtn) {
    scorerRecalculateScoresBtn.disabled = !canScore || !activeSeason?.id;
  }
  if (scorerClearQueueBtn) {
    scorerClearQueueBtn.hidden = true;
    scorerClearQueueBtn.disabled = !canScore || !activeSeason?.id;
  }
  if (adminResetSeasonBtn) {
    adminResetSeasonBtn.hidden = !isAdmin;
  }
  if (adminResetSeasonRow) {
    adminResetSeasonRow.hidden = !isAdmin;
  }
  renderSeasonArchiveExportOptions();
  updateManualScoreControlState("scorer");
  updateManualScoreControlState("admin");
  if (!isScorerOnly) {
    setScorerPanelOpen(false);
  }
  if (!isAdmin) {
    setSeasonArchiveExportModalOpen(false);
    setPrizeDistributionModalOpen(false);
    setAdminParticipationRulesModalOpen(false);
    setManagedDialogOpen("adminBackgroundPicker", false);
    setAdminPanelOpen(false);
    setManagedDialogOpen("adminSeasonRule", false);
    setManagedDialogOpen("adminPower", false);
    setManagedDialogOpen("adminPlayerManagement", false);
    setManagedDialogOpen("adminManualScore", false);
    setManagedDialogOpen("adminItemCatalog", false);
    setManagedDialogOpen("adminActionLogs", false);
  }
  if (!canScore) {
    setManagedDialogOpen("itemInventoryLogs", false);
    setManagedDialogOpen("scorerSeasonRule", false);
    setManagedDialogOpen("scorerPower", false);
    setManagedDialogOpen("scorerPlayerManagement", false);
    setManagedDialogOpen("scorerManualScore", false);
    setManagedDialogOpen("scorerItemCatalog", false);
    setManagedDialogOpen("scorerActionLogs", false);
  }

  syncGitHubRepositoryStorageAutoRefresh();
  renderRoleMembers();
  renderPlayerManagementOptions();
  renderRewardLogs();
}

async function loadRoleMembers() {
  roleMembers = [];
  renderRoleMembers();
  applyRolePermissions();
}

async function quickAddPlayer(displayName, { messageTarget = "admin" } = {}) {
  const trimmedName = String(displayName || "").trim();
  const setPanelMessage = messageTarget === "scorer" ? setScorerPanelMessage : setAdminPanelMessage;
  const canOperate = messageTarget === "scorer"
    ? ensureScorerAccess("仅记分员或管理员可新增总表选手。")
    : ensureAdminAccess("仅管理员可新增总表选手。");

  if (!canOperate) return false;
  if (!trimmedName) {
    setPanelMessage(copyText("runtime.players.quickAddMissingName", "请输入选手名字。"), true);
    return false;
  }

  setPanelMessage(copyText("runtime.players.quickAddPending", "正在添加选手..."));
  const { data, error } = await db.rpc("create_player_quick", {
    p_display_name: trimmedName,
  });

  if (error) {
    setPanelMessage(
      formatCopyText("runtime.players.quickAddFailed", { message: error.message }, `添加选手失败：${error.message}`),
      true
    );
    return false;
  }

  const resolvedName = data?.display_name || trimmedName;
  setPanelMessage(formatCopyText("runtime.players.quickAddSuccess", { name: resolvedName }, `已添加选手：${resolvedName}`));
  setMessage(formatCopyText("runtime.players.quickAddSuccess", { name: resolvedName }, `已添加选手：${resolvedName}`));
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 添加了总表选手 ${data?.display_name || trimmedName}。`);
  await loadSeasonPlayers();
  requestImmediateRefresh({
    playerDriven: true,
  });
  return true;
}

async function renamePlayer(playerId, nextName, { messageTarget = "admin" } = {}) {
  const setPanelMessage = messageTarget === "scorer" ? setScorerPanelMessage : setAdminPanelMessage;
  if (!ensureScorerAccess("仅记分员或管理员可为总表选手更名。")) return false;

  const trimmedName = String(nextName || "").trim();
  if (!playerId) {
    setPanelMessage(copyText("runtime.players.renameMissingTarget", "请先选择要更名的选手。"), true);
    return false;
  }
  if (!trimmedName) {
    setPanelMessage(copyText("runtime.players.renameMissingName", "请输入新的选手名字。"), true);
    return false;
  }

  const currentPlayer = allPlayersDirectory.find((player) => player.id === playerId);
  if (currentPlayer && currentPlayer.display_name === trimmedName) {
    setPanelMessage(copyText("runtime.players.renameSameName", "新名字和当前名字相同。"), true);
    return false;
  }

  setPanelMessage(copyText("runtime.players.renamePending", "正在更新选手名字..."));
  const { data, error } = await db.rpc("rename_player_quick", {
    p_player_id: playerId,
    p_display_name: trimmedName,
  });

  if (error) {
    setPanelMessage(
      formatCopyText("runtime.players.renameFailed", { message: error.message }, `更名失败：${error.message}`),
      true
    );
    return false;
  }

  const currentName = currentPlayer?.display_name || "该选手";
  const nextDisplayName = data?.display_name || trimmedName;
  setPanelMessage(
    formatCopyText(
      "runtime.players.renameSuccess",
      { from: currentName, to: nextDisplayName },
      `已将 ${currentName} 更名为 ${nextDisplayName}。`
    )
  );
  setMessage(
    formatCopyText("runtime.players.renameToast", { name: nextDisplayName }, `已更新选手名字：${nextDisplayName}`)
  );
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 将 ${currentPlayer?.display_name || "该选手"} 更名为 ${data?.display_name || trimmedName}。`);
  requestImmediateRefresh({
    playerDriven: true,
  });
  return true;
}

async function loadInactivePlayersForAdmin({ force = false } = {}) {
  if (!isCurrentRoleAdmin()) {
    inactivePlayersDirectory = [];
    inactivePlayersStatus = "idle";
    selectedInactivePlayerId = "";
    renderPlayerManagementOptions();
    return [];
  }
  if (!force && inactivePlayersStatus === "ready") {
    renderPlayerManagementOptions();
    return inactivePlayersDirectory;
  }

  inactivePlayersStatus = "loading";
  renderPlayerManagementOptions();

  const { data, error } = await db.rpc("admin_list_inactive_players");
  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    inactivePlayersDirectory = [];
    inactivePlayersStatus = "error";
    selectedInactivePlayerId = "";
    setAdminPanelMessage(`加载已删除选手失败：${error.message}${migrationHint ? `。${migrationHint}` : ""}`, true);
    renderPlayerManagementOptions();
    return [];
  }

  inactivePlayersDirectory = (data || []).map((player) => ({
    id: player.id,
    display_name: player.display_name || "未知选手",
  })).sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));
  inactivePlayersStatus = "ready";
  if (
    selectedInactivePlayerId
    && !inactivePlayersDirectory.some((player) => player.id === selectedInactivePlayerId)
  ) {
    selectedInactivePlayerId = "";
  }
  renderPlayerManagementOptions();
  return inactivePlayersDirectory;
}

function clearPlayerVisibilityCaches() {
  clearHomePlayerDirectoryCacheForSeason(activeSeason?.id);
  clearHomeLeaderboardCacheForSeason(activeSeason?.id);
}

async function deactivatePlayer(playerId, { messageTarget = "admin" } = {}) {
  const setPanelMessage = messageTarget === "scorer" ? setScorerPanelMessage : setAdminPanelMessage;
  const canOperate = messageTarget === "scorer"
    ? ensureScorerAccess("仅记分员或管理员可隐藏总表选手。")
    : ensureAdminAccess("仅管理员可隐藏总表选手。");
  if (!canOperate) return false;

  const selectedPlayer = allPlayersDirectory.find((player) => player.id === playerId) || null;
  if (!selectedPlayer) {
    setPanelMessage(copyText("runtime.players.deleteMissingTarget", "请先选择要删除的选手。"), true);
    return false;
  }

  const playerName = selectedPlayer.display_name || "该选手";
  const confirmed = await confirmAction(
    formatCopyText(
      "runtime.players.deleteConfirm",
      { name: playerName },
      `确认删除选手「${playerName}」吗？该操作不会从数据库真实删除记录，可由管理员恢复。`
    ),
    { title: "删除选手", confirmLabel: "删除", danger: true }
  );
  if (!confirmed) return false;

  setPanelMessage(copyText("runtime.players.deletePending", "正在删除选手..."));
  const { data, error } = await db.rpc("deactivate_player_quick", {
    p_player_id: playerId,
  });

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    setPanelMessage(
      formatCopyText("runtime.players.deleteFailed", { message: `${error.message}${migrationHint ? `。${migrationHint}` : ""}` }, `删除选手失败：${error.message}${migrationHint ? `。${migrationHint}` : ""}`),
      true
    );
    return false;
  }

  clearPlayerVisibilityCaches();
  selectedRenamePlayerIds.scorer = "";
  selectedRenamePlayerIds.admin = "";
  inactivePlayersStatus = "idle";
  const resolvedName = data?.display_name || playerName;
  const successMessage = formatCopyText("runtime.players.deleteSuccess", { name: resolvedName }, `已删除选手：${resolvedName}`);
  setPanelMessage(successMessage);
  setMessage(successMessage);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 删除了总表选手 ${resolvedName}（仅前端隐藏）。`);
  await loadSeasonPlayers();
  if (isCurrentRoleAdmin()) {
    await loadInactivePlayersForAdmin({ force: true });
  }
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    recentMatches: true,
    rewardLogs: true,
  });
  return true;
}

async function restoreInactivePlayer(playerId) {
  if (!ensureAdminAccess("仅管理员可恢复已删除选手。")) return false;
  const selectedPlayer = inactivePlayersDirectory.find((player) => player.id === playerId) || null;
  if (!selectedPlayer) {
    setAdminPanelMessage(copyText("runtime.players.restoreMissingTarget", "请先选择要恢复的已删除选手。"), true);
    return false;
  }

  setAdminPanelMessage(copyText("runtime.players.restorePending", "正在恢复选手..."));
  const { data, error } = await db.rpc("admin_restore_player_quick", {
    p_player_id: playerId,
  });

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    setAdminPanelMessage(
      formatCopyText("runtime.players.restoreFailed", { message: `${error.message}${migrationHint ? `。${migrationHint}` : ""}` }, `恢复选手失败：${error.message}${migrationHint ? `。${migrationHint}` : ""}`),
      true
    );
    return false;
  }

  clearPlayerVisibilityCaches();
  selectedInactivePlayerId = "";
  const resolvedName = data?.display_name || selectedPlayer.display_name || "该选手";
  const successMessage = formatCopyText("runtime.players.restoreSuccess", { name: resolvedName }, `已恢复选手：${resolvedName}`);
  setAdminPanelMessage(successMessage);
  setMessage(successMessage);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 恢复了已删除选手 ${resolvedName}。`);
  await loadSeasonPlayers();
  await loadInactivePlayersForAdmin({ force: true });
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    recentMatches: true,
    rewardLogs: true,
  });
  return true;
}

async function hardDeleteInactivePlayer(playerId) {
  if (!ensureAdminAccess("仅管理员可永久删除选手。")) return false;
  const selectedPlayer = inactivePlayersDirectory.find((player) => player.id === playerId) || null;
  if (!selectedPlayer) {
    setAdminPanelMessage(copyText("runtime.players.hardDeleteMissingTarget", "请先选择要永久删除的已删除选手。"), true);
    return false;
  }

  const playerName = selectedPlayer.display_name || "该选手";
  const confirmed = await confirmAction(
    formatCopyText(
      "runtime.players.hardDeleteConfirm",
      { name: playerName },
      `确认从数据库永久删除「${playerName}」吗？此操作不可恢复。`
    ),
    { title: "永久删除选手", confirmLabel: "继续", danger: true }
  );
  if (!confirmed) return false;

  const typedName = await promptAction(
    formatCopyText(
      "runtime.players.hardDeleteNamePrompt",
      { name: playerName },
      `请再次输入选手名字「${playerName}」确认永久删除。`
    ),
    "",
    {
      title: "永久删除确认",
      inputLabel: "选手名字",
      placeholder: playerName,
      confirmLabel: "永久删除",
      danger: true,
    }
  );
  if (typedName !== playerName) {
    setAdminPanelMessage(copyText("runtime.players.hardDeleteNameMismatch", "确认文字不匹配，已取消永久删除。"), true);
    return false;
  }

  setAdminPanelMessage(copyText("runtime.players.hardDeletePending", "正在永久删除选手..."));
  const { data, error } = await db.rpc("admin_delete_player_permanently", {
    p_player_id: playerId,
  });

  if (error) {
    const migrationHint = getLatestSchemaMigrationHint(error);
    setAdminPanelMessage(
      formatCopyText("runtime.players.hardDeleteFailed", { message: `${error.message}${migrationHint ? `。${migrationHint}` : ""}` }, `永久删除选手失败：${error.message}${migrationHint ? `。${migrationHint}` : ""}`),
      true
    );
    return false;
  }

  clearPlayerVisibilityCaches();
  selectedInactivePlayerId = "";
  const resolvedName = data?.display_name || playerName;
  const successMessage = formatCopyText("runtime.players.hardDeleteSuccess", { name: resolvedName }, `已从数据库永久删除选手：${resolvedName}`);
  setAdminPanelMessage(successMessage);
  setMessage(successMessage);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 从数据库永久删除了已删除选手 ${resolvedName}。`);
  await loadSeasonPlayers();
  await loadInactivePlayersForAdmin({ force: true });
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    recentMatches: true,
    rewardLogs: true,
  });
  return true;
}

async function loadCurrentAccessRole() {
  const { data, error } = await db.rpc("get_current_access_role");

  if (error) {
    throw error;
  }

  authAccessRole = ((Array.isArray(data) ? data[0] : data) || {
    username: null,
    auth_email_normalized: normalizeEmail(authSession?.user?.email),
    role: null,
    is_admin: false,
    is_scorekeeper: false,
    is_scorer: false,
  });
}

async function loadAdminManagedAccounts() {
  if (!authSession || !isCurrentRoleAdmin()) {
    adminManagedAccounts = [];
    adminAvailableAuthEmails = [];
    adminEditingIdentityId = "";
    renderRoleMembers();
    return;
  }

  let accountRows = [];
  let authUsers = [];

  try {
    const result = await invokeFunction("admin-list-users", {});
    accountRows = Array.isArray(result?.accounts) ? result.accounts : [];
    authUsers = Array.isArray(result?.authUsers) ? result.authUsers : [];
  } catch (_error) {
    const { data, error } = await db.rpc("admin_list_auth_identities");
    if (error) {
      throw error;
    }
    accountRows = Array.isArray(data) ? data : [];
    authUsers = [];
  }

  adminManagedAccounts = accountRows.map((entry) => ({
    ...entry,
    auth_email: entry.auth_email || entry.auth_email_normalized || "",
    auth_email_normalized: normalizeEmail(entry.auth_email_normalized || entry.auth_email || ""),
    username: entry.username || "",
    role: entry.role === "admin" ? "admin" : "scorekeeper",
  }));
  adminAvailableAuthEmails = authUsers
    .map((entry) => normalizeEmail(entry.email))
    .filter(Boolean);
  renderRoleMembers();
}

async function saveAdminIdentityMapping() {
  if (!ensureAdminAccess("仅管理员可维护账号映射。")) return;
  const email = normalizeEmail(adminIdentityEmailSelect?.value || "");
  const username = normalizeUsername(adminIdentityUsernameInput?.value || "");

  if (!email) {
    setAdminPanelMessage("请先选择邮箱。", true);
    return;
  }
  if (!username) {
    setAdminPanelMessage("请输入用户名。", true);
    return;
  }
  if (!isValidManagedIdentityUsername(username)) {
    setAdminPanelMessage("用户名只能包含 1-10 位中文。", true);
    return;
  }

  const existingByEmail = getManagedIdentityByEmail(email);
  const targetId = adminEditingIdentityId || existingByEmail?.id || "";
  const role = (adminManagedAccounts.find((entry) => entry.id === targetId)?.role)
    || existingByEmail?.role
    || "scorekeeper";
  if (existingByEmail && targetId && existingByEmail.id !== targetId) {
    setAdminPanelMessage("该邮箱已经绑定到其他账号映射。", true);
    return;
  }
  const duplicateUsername = adminManagedAccounts.find((entry) => entry.username === username && entry.id !== targetId);
  if (duplicateUsername) {
    setAdminPanelMessage("该用户名已被其他账号占用。", true);
    return;
  }

  if (adminSaveIdentityBtn) {
    adminSaveIdentityBtn.disabled = true;
  }
  setAdminPanelMessage(targetId ? "正在更新账号映射..." : "正在保存账号映射...");

  const payload = {
    p_identity_id: targetId || null,
    p_username: username,
    p_auth_email: email,
    p_role: role,
    p_is_active: true,
    p_auth_user_id: null,
  };

  const { error } = await db.rpc("admin_upsert_auth_identity", payload);

  if (adminSaveIdentityBtn) {
    adminSaveIdentityBtn.disabled = false;
  }

  if (error) {
    setAdminPanelMessage(`保存账号映射失败：${error.message}`, true);
    return;
  }

  setAdminPanelMessage(`账号映射已保存：${email} -> ${username}`);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 将 ${email} 映射为 ${username}（${getManagedIdentityRoleLabel(role)}）。`);
  await loadAdminManagedAccounts();
  populateManagedIdentityForm({
    id: targetId,
    auth_email: email,
    username,
    role,
  });
}

async function resetManagedIdentityPassword(identityId) {
  if (!ensureAdminAccess("仅管理员可修改账号密码。")) return;
  const identity = adminManagedAccounts.find((entry) => entry.id === identityId) || null;
  if (!identity) {
    setAdminPanelMessage("账号不存在，请刷新后重试。", true);
    return;
  }
  if (!identity.auth_user_id) {
    setAdminPanelMessage("该账号尚未绑定 Auth 用户，暂时无法修改密码。", true);
    return;
  }

  const password = await promptAction(
    `请输入 ${identity.username || "该账号"} 的新密码`,
    "",
    {
      title: "修改账号密码",
      inputLabel: "新密码",
      inputType: "password",
      confirmLabel: "保存密码",
    }
  );
  if (password === null) return;

  const passwordError = validateManagedIdentityPassword(password);
  if (passwordError) {
    setAdminPanelMessage(passwordError, true);
    return;
  }

  setAdminPanelMessage("正在修改密码...");
  try {
    await invokeFunction("admin-reset-password", {
      identityId,
      password,
    });
  } catch (error) {
    setAdminPanelMessage(`修改密码失败：${getErrorMessage(error)}`, true);
    return;
  }

  setAdminPanelMessage(`密码已更新：${identity.username || "该账号"}`);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 修改了 ${identity.username || "该账号"} 的登录密码。`);
}

async function clearManagedIdentityRememberedDevices(identityId) {
  if (!ensureAdminAccess("仅管理员可清空账号登录状态。")) return;
  const identity = adminManagedAccounts.find((entry) => entry.id === identityId) || null;
  if (!identity) {
    setAdminPanelMessage("账号不存在，请刷新后重试。", true);
    return;
  }

  const confirmed = await confirmAction(
    `确认清空 ${identity.username || "该账号"} 的登录状态记录吗？`,
    { title: "清空登录状态", confirmLabel: "清空", danger: true }
  );
  if (!confirmed) return;

  setAdminPanelMessage("正在清空登录状态...");
  const { data, error } = await db.rpc("admin_clear_auth_identity_devices", {
    p_identity_id: identityId,
  });

  if (error) {
    setAdminPanelMessage(`清空登录状态失败：${error.message}`, true);
    return;
  }

  const clearedCount = Number(data ?? 0);
  setAdminPanelMessage(`已清空登录状态：${identity.username || "该账号"}${clearedCount ? `（${clearedCount} 条）` : ""}`);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 清空了 ${identity.username || "该账号"} 的登录状态记录。`);
}

async function deleteManagedIdentity(identityId) {
  if (!ensureAdminAccess("仅管理员可删除记分员账号。")) return;
  const identity = adminManagedAccounts.find((entry) => entry.id === identityId) || null;
  if (!identity) {
    setAdminPanelMessage("账号不存在，请刷新后重试。", true);
    return;
  }

  const confirmed = await confirmAction(
    `确认删除 ${identity.username || "该账号"} 的账号映射吗？`,
    { title: "删除账号映射", confirmLabel: "删除", danger: true }
  );
  if (!confirmed) return;

  const previousAccounts = clonePlainObject(adminManagedAccounts);
  adminManagedAccounts = adminManagedAccounts.filter((entry) => entry.id !== identityId);
  if (adminEditingIdentityId === identityId) {
    populateManagedIdentityForm(null);
  }
  renderRoleMembers();
  setAdminPanelMessage("账号映射已从本地列表删除，正在同步数据库...");
  const { data, error } = await db.rpc("admin_delete_auth_identity", {
    p_identity_id: identityId,
  });

  if (error) {
    adminManagedAccounts = previousAccounts;
    renderRoleMembers();
    setAdminPanelMessage(`删除账号映射失败：${error.message}`, true);
    return;
  }

  const deleted = Array.isArray(data) ? (data[0] ?? null) : data;
  const deletedName = deleted?.username || identity.username || "该账号";
  setAdminPanelMessage(`已删除账号映射：${deletedName}`);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 删除了记分员账号映射 ${deletedName}。`);
  await loadAdminManagedAccounts();
}

async function rememberCurrentDevice() {
  if (!authSession?.user?.id) return;
  const localDeviceId = getOrCreateLocalDeviceId();
  const deviceLabel = `${navigator.platform || "unknown"} | ${navigator.userAgent || "browser"}`.slice(0, 120);
  const { error } = await db.rpc("remember_current_device", {
    p_device_id: localDeviceId,
    p_device_label: deviceLabel,
  });

  if (error) {
    console.error("记录登录设备失败：", error);
    if (String(error.message || "").includes("3 remembered devices")) {
      showGlobalToast("该账号最多记住 3 台设备，系统已拒绝新增设备。", true);
    }
  }
}

function syncCurrentAccessSession() {
  if (!authSession || !authAccessRole) {
    clearStoredAccessSession();
    return;
  }

  const email = normalizeEmail(authSession.user?.email);
  const boundEmail = normalizeEmail(
    authAccessRole.auth_email_normalized || authAccessRole.email_normalized
  );

  if (boundEmail && email && boundEmail !== email) {
    clearStoredAccessSession();
    return;
  }

  if (authAccessRole.is_admin || authAccessRole.role === "admin") {
    writeStoredAccessSession({ role: "admin" });
    return;
  }

  if (
    authAccessRole.is_scorekeeper
    || authAccessRole.is_scorer
    || authAccessRole.role === "scorekeeper"
    || authAccessRole.role === "scorer"
  ) {
    writeStoredAccessSession({ role: "scorer" });
    return;
  }

  clearStoredAccessSession();
}

async function handleAuthSession(session, options = {}) {
  authSession = session || null;

  if (!authSession) {
    writeAccessUiHiddenFlag(false);
    authProfile = null;
    authAccessRole = null;
    adminManagedAccounts = [];
    adminAvailableAuthEmails = [];
    adminEditingIdentityId = "";
    resetSupabaseSystemUsageStatus();
    clearStoredAccessSession();
    renderRoleMembers();
    applyRolePermissions();
    if (options.refresh) {
      requestImmediateRefresh({
        playerDriven: true,
        seasonContext: true,
        leaderboard: true,
        rewardLogs: true,
        recentMatches: true,
      });
    }
    return;
  }

  if (options.activateSession) {
    writeAccessUiHiddenFlag(false);
  }

  if (isAccessUiHidden && !options.activateSession) {
    authProfile = null;
    authAccessRole = null;
    adminManagedAccounts = [];
    adminAvailableAuthEmails = [];
    adminEditingIdentityId = "";
    resetSupabaseSystemUsageStatus();
    clearStoredAccessSession();
    setScorerPanelOpen(false);
    setAdminPanelOpen(false);
    renderRoleMembers();
    applyRolePermissions();
    if (options.refresh) {
      requestImmediateRefresh({
        playerDriven: true,
        seasonContext: true,
        leaderboard: true,
        rewardLogs: true,
        recentMatches: true,
      });
    }
    return;
  }

  const profileResult = await db.rpc("ensure_my_profile");
  if (profileResult.error) {
    throw profileResult.error;
  }
  authProfile = profileResult.data || null;

  const bindResult = await db.rpc("bind_auth_identity");
  if (bindResult.error) {
    throw bindResult.error;
  }

  await loadCurrentAccessRole();
  syncCurrentAccessSession();
  if (!isCurrentRoleAdmin()) {
    adminManagedAccounts = [];
    adminAvailableAuthEmails = [];
    adminEditingIdentityId = "";
    resetSupabaseSystemUsageStatus();
  } else {
    prepareSupabaseSystemUsageStatusForAdmin();
  }
  renderRoleMembers();
  applyRolePermissions();
  setAccessModalOpen(false);

  runWhenBrowserIdle(() => {
    if (isCurrentRoleAdmin()) {
      loadAdminManagedAccounts().catch((error) => {
        adminManagedAccounts = [];
        adminAvailableAuthEmails = [];
        adminEditingIdentityId = "";
        console.error("加载管理员账号映射失败：", error);
      });
      refreshGitHubRepositoryStorageStatus();
      refreshSupabaseSystemUsageStatus();
    }
    rememberCurrentDevice().catch((error) => {
      console.error("同步记住设备状态失败：", error);
    });
  }, 1200);

  if (options.refresh) {
    requestImmediateRefresh({
      playerDriven: true,
      seasonContext: true,
      leaderboard: true,
      rewardLogs: true,
      recentMatches: true,
    });
  }
}

async function loginWithUsernamePassword() {
  const username = String(authUsernameInput?.value ?? "").trim();
  const password = authPasswordInput?.value ?? "";

  if (!username) {
    setAccessMessage(copyText("runtime.accessModal.missingUsername", "请输入用户名或邮箱。"), true);
    return;
  }

  if (!password) {
    setAccessMessage(copyText("runtime.accessModal.missingPassword", "请输入密码。"), true);
    return;
  }

  if (confirmAccessBtn) {
    confirmAccessBtn.disabled = true;
  }
  setAccessMessage(copyText("runtime.accessModal.loggingIn", "正在登录..."));

  try {
    if (username.includes("@")) {
      const { data, error } = await db.auth.signInWithPassword({
        email: username,
        password,
      });

      if (error) {
        throw error;
      }

      if (!data?.session) {
        throw new Error("服务端未返回有效会话。");
      }
    } else {
      const data = await invokeFunction("username-login", {
        username: normalizeUsername(username),
        password,
      });

      const session = data?.session;
      if (!session?.access_token || !session?.refresh_token) {
        throw new Error("服务端未返回有效会话。");
      }

      const { error } = await db.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (error) {
        throw error;
      }
    }

    if (authPasswordInput) {
      authPasswordInput.value = "";
    }
    setAccessMessage(copyText("runtime.accessModal.loginSuccessSyncing", "登录成功，正在同步权限..."));
    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    await handleAuthSession(sessionData.session, { refresh: true, activateSession: true });
  } catch (error) {
    setAccessMessage(error.message || copyText("runtime.accessModal.loginFailed", "登录失败。"), true);
  } finally {
    if (confirmAccessBtn) {
      confirmAccessBtn.disabled = false;
    }
  }
}

async function confirmAccessRole() {
  await loginWithUsernamePassword();
}

async function signOut() {
  try {
    const { error } = await db.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("退出登录失败：", error);
    showGlobalToast(`退出登录失败：${error.message}`, true);
    return;
  }

  writeAccessUiHiddenFlag(false);
  authSession = null;
  authProfile = null;
  authAccessRole = null;
  resetSupabaseSystemUsageStatus();
  clearStoredAccessSession();
  setScorerPanelOpen(false);
  setAdminPanelOpen(false);
  setAccessModalOpen(false);
  renderRoleMembers();
  applyRolePermissions();
  requestImmediateRefresh({
    playerDriven: true,
    seasonContext: true,
    leaderboard: true,
    rewardLogs: true,
    recentMatches: true,
  });
  showGlobalToast("已清除登录状态，请重新输入邮箱/用户名和密码登录。");
}

async function exitAccessRole() {
  const previousRole = currentAccessSession.role;
  if (previousRole === "viewer") return;

  if (previousRole === "scorer") {
    const confirmed = await confirmAction(
      "确认退出当前记分员身份吗？",
      { title: "退出记分员身份", confirmLabel: "退出" }
    );
    if (!confirmed) return;
    setSkipNextScorerReconnect(true);
  }

  writeAccessUiHiddenFlag(true);
  setAccessModalOpen(false);
  await handleAuthSession(authSession, { refresh: true });

  if (previousRole === "admin") {
    showGlobalToast("已退出到游客状态，点击“账号登录”可直接恢复管理员身份。");
    return;
  }

  showGlobalToast("已退出到游客状态，点击“账号登录”可直接恢复当前账号。");
}

function getSeasonEndConfirmationActorName(entry) {
  if (!entry) return "未知身份";
  if (authSession?.user?.id && entry.user_id === authSession.user.id) {
    return getCurrentAccessActorLabel();
  }
  return entry.role === "admin" ? "管理员" : "记分员";
}

function getSeasonEndScorerConfirmationCount() {
  return seasonEndConfirmations.filter((entry) =>
    entry.role === "scorekeeper" || entry.role === "scorer"
  ).length;
}

function renderSeasonRolloverAction() {
  if (!seasonRolloverEntries.length) return;

  const canScore = isCurrentRoleScorer();
  const hasSeason = Boolean(activeSeason?.id);
  const hasCurrentConfirmation = seasonEndConfirmations.some((entry) => entry.user_id === authSession?.user?.id);
  const scorerNames = seasonEndConfirmations
    .filter((entry) => entry.role === "scorekeeper" || entry.role === "scorer")
    .map((entry) => getSeasonEndConfirmationActorName(entry));
  const scorerText = scorerNames.length ? `已确认：${scorerNames.join("、")}。` : "";

  seasonRolloverEntries.forEach(({ block, button, status }) => {
    block.hidden = !canScore;
    block.style.display = canScore ? "" : "none";
    button.hidden = !canScore;
    status.hidden = !canScore;
  });

  if (!canScore) {
    return;
  }

  if (!seasonEndFeatureAvailable) {
    seasonRolloverEntries.forEach(({ button, status }) => {
      button.disabled = true;
      button.textContent = "赛季完结";
      status.textContent = "赛季完结功能尚未同步到数据库，请先执行最新 SQL。";
    });
    return;
  }

  if (!hasSeason) {
    seasonRolloverEntries.forEach(({ button, status }) => {
      button.disabled = true;
      button.textContent = "赛季完结";
      status.textContent = "当前没有可完结的赛季。";
    });
    return;
  }

  const windowInfo = getSeasonRolloverWindowInfo(activeSeason);
  const scorerCount = getSeasonEndScorerConfirmationCount();
  const roleHint = currentAccessSession.role === "admin"
    ? "管理员可直接完结当前赛季。"
    : "需要至少 1 位记分员登记确认后才会正式完结。";

  seasonRolloverEntries.forEach(({ button, status }) => {
    button.disabled = !windowInfo.isOpen;
    button.textContent = hasCurrentConfirmation ? "已登记赛季完结" : "赛季完结";
    status.textContent = !windowInfo.isOpen
      ? `开放时间：北京时间 ${windowInfo.cutoffLabel}`
      : `当前记分员确认 ${scorerCount}/${SEASON_ROLLOVER_REQUIRED_SCORER_CONFIRMATIONS}。${roleHint}${scorerText ? ` ${scorerText}` : ""}`;
  });
}

async function loadSeasonEndConfirmations() {
  if (!seasonEndFeatureAvailable || !activeSeason?.id) {
    seasonEndConfirmations = [];
    renderSeasonRolloverAction();
    return;
  }

  const { data, error } = await db
    .from("season_end_confirmations")
    .select("id, season_id, user_id, role, created_at")
    .eq("season_id", activeSeason.id)
    .order("created_at", { ascending: true });

  if (error) {
    if (String(error.message || "").includes("season_end_confirmations")) {
      seasonEndFeatureAvailable = false;
    } else {
      console.error("加载赛季完结确认失败：", error);
    }
    seasonEndConfirmations = [];
    renderSeasonRolloverAction();
    return;
  }

  seasonEndConfirmations = data || [];
  renderSeasonRolloverAction();
}

async function confirmSeasonRollover() {
  if (!ensureScorerAccess("仅记分员或管理员可登记赛季完结确认。")) return;
  if (!activeSeason?.id) {
    showSeasonRolloverFeedback("当前没有可完结的赛季。", true);
    return;
  }
  if (!seasonEndFeatureAvailable) {
    showSeasonRolloverFeedback("赛季完结功能尚未同步到数据库，请先执行最新 SQL。", true);
    return;
  }
  if (!authSession?.user?.id) {
    showSeasonRolloverFeedback("请先登录后再登记赛季完结确认。", true);
    return;
  }

  const windowInfo = getSeasonRolloverWindowInfo(activeSeason);
  if (!windowInfo.isOpen) {
    showSeasonRolloverFeedback(`赛季完结将于北京时间 ${windowInfo.cutoffLabel} 开放。`, true);
    return;
  }

  const confirmText = await promptAction(
    "请输入“确认赛季完结”以登记当前确认：",
    "",
    {
      title: "赛季完结确认",
      inputLabel: "确认文字",
      placeholder: "确认赛季完结",
      confirmLabel: "登记确认",
      danger: true,
    }
  );
  if (confirmText !== "确认赛季完结") {
    showSeasonRolloverFeedback("未输入正确确认文字，已取消赛季完结登记。", true);
    return;
  }

  seasonRolloverEntries.forEach(({ button }) => {
    button.disabled = true;
  });
  showSeasonRolloverFeedback("正在登记赛季完结确认...");

  const { data, error } = await db.rpc("confirm_season_rollover", {
    p_season_id: activeSeason.id,
  });

  if (error) {
    seasonRolloverEntries.forEach(({ button }) => {
      button.disabled = false;
    });
    showSeasonRolloverFeedback(buildSeasonRolloverFailureMessage(error), true);
    await loadSeasonEndConfirmations();
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const scorerCount = Number(result?.scorer_confirmation_count ?? 0);
  const finalized = Boolean(result?.finalized);
  const actorRole = result?.actor_role === "scorekeeper" ? "scorer" : (result?.actor_role || currentAccessSession.role);

  if (finalized) {
    await handleSeasonRolloverFinalization(result);
    return;
  }

  showSeasonRolloverFeedback(actorRole === "admin"
    ? `管理员已登记，但当前仍需至少 ${SEASON_ROLLOVER_REQUIRED_SCORER_CONFIRMATIONS} 位记分员确认；当前记分员确认 ${scorerCount}/${SEASON_ROLLOVER_REQUIRED_SCORER_CONFIRMATIONS}。`
    : `确认已登记，当前记分员确认 ${scorerCount}/${SEASON_ROLLOVER_REQUIRED_SCORER_CONFIRMATIONS}。`);
  appendAdminActionLog(`${getCurrentAccessActorLabel()} 登记了赛季完结确认。`);
  await loadSeasonEndConfirmations();
}

if (openAuthModalBtn) {
  openAuthModalBtn.addEventListener("click", async () => {
    if (authSession && isAccessUiHidden) {
      await handleAuthSession(authSession, { refresh: true, activateSession: true });
      return;
    }
    setAccessModalOpen(true);
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await signOut();
  });
}

if (authUsernameInput) {
  authUsernameInput.addEventListener("input", () => {
    renderAccessScorerOptions();
  });
  authUsernameInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await confirmAccessRole();
  });
}

if (accessScorerChips) {
  accessScorerChips.addEventListener("click", (event) => {
    const chip = event.target instanceof HTMLElement ? event.target.closest(".access-scorer-chip") : null;
    if (!(chip instanceof HTMLButtonElement)) return;
    const displayName = chip.dataset.displayName || chip.textContent || "";
    if (authUsernameInput) {
      authUsernameInput.value = stripPlayerNameMeta(displayName);
    }
    renderAccessScorerOptions();
    authPasswordInput?.focus();
  });
}

[scorerRenamePlayerChips, adminRenamePlayerChips].forEach((container) => {
  if (!container) return;
  container.addEventListener("click", (event) => {
    const chip = event.target instanceof HTMLElement ? event.target.closest('[data-role="rename-player-chip"]') : null;
    if (!(chip instanceof HTMLButtonElement)) return;
    const mode = chip.dataset.mode === "admin" ? "admin" : "scorer";
    selectRenamePlayer(mode, chip.dataset.playerId || "");
    if (mode === "admin") {
      adminRenamePlayerInput?.focus();
    } else {
      scorerRenamePlayerInput?.focus();
    }
  });
});

if (adminInactivePlayerChips) {
  adminInactivePlayerChips.addEventListener("click", (event) => {
    const chip = event.target instanceof HTMLElement ? event.target.closest('[data-role="inactive-player-chip"]') : null;
    if (!(chip instanceof HTMLButtonElement)) return;
    selectInactivePlayer(chip.dataset.playerId || "");
  });
}

if (authPasswordInput) {
  authPasswordInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await confirmAccessRole();
  });
}

if (scorerQuickAddPlayerInput) {
  scorerQuickAddPlayerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const success = await quickAddPlayer(scorerQuickAddPlayerInput.value || "", { messageTarget: "scorer" });
    if (success) {
      scorerQuickAddPlayerInput.value = "";
    }
  });
}

if (adminQuickAddPlayerInput) {
  adminQuickAddPlayerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const success = await quickAddPlayer(adminQuickAddPlayerInput.value || "", { messageTarget: "admin" });
    if (success) {
      adminQuickAddPlayerInput.value = "";
    }
  });
}

if (adminRenamePlayerInput) {
  adminRenamePlayerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const success = await renamePlayer(selectedRenamePlayerIds.admin || "", adminRenamePlayerInput.value || "", {
      messageTarget: "admin",
    });
    if (success) {
      adminRenamePlayerInput.value = "";
      selectRenamePlayer("admin", "");
    }
  });
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION") {
    return;
  }
  if (event === "TOKEN_REFRESHED") {
    authSession = session || authSession;
    return;
  }
  handleAuthSession(session, { refresh: true }).catch((error) => {
    console.error("同步登录状态失败：", error);
    showGlobalToast(`同步登录状态失败：${error.message}`, true);
  });
});

async function init() {
  const failedSteps = [];
  let loadingScreenDismissed = false;
  const runInitStep = async (label, action) => {
    try {
      await action();
    } catch (error) {
      failedSteps.push(label);
      console.error(`[init] ${label} 失败：`, error);
    }
  };
  const dismissLoadingScreen = () => {
    if (loadingScreenDismissed) return;
    loadingScreenDismissed = true;
    hideLoadingScreen();
  };

  try {
    isAccessUiHidden = readAccessUiHiddenFlag();
    applyStaticSiteCopy();
    hydrateLifetimeRewardTotalsCache();
    await loadAdminBackgroundImageOptions();
    await loadSharedBackgroundImageSettings();
    await applyFirstAvailableBackgroundImage();
    renderLastUpdatedTime();
    renderBrandMonthBadge();
    setMatchFormOpen(false);
    setBackfillFormOpen(false);
    setSeasonPanelOpen(false);
    setRewardPanelOpen(false);
    setLeaderboardCompactMode(false);
    selectRewardPlayer("");
    renderHeroOptions();
    scheduleRestDayBoundaryRefresh();
    matchStartTimeInput.value = formatTime24(readStoredMatchDayStartTime()?.startTime || "");
    backfillDateInput.value = getPreviousBeijingBusinessDateString();
    renderMatchForm();
    renderBackfillForm();
    renderSeasonPlayersPanel();
    renderRewardLogs();
    renderItemCatalogManagement("scorer");
    renderItemCatalogManagement("admin");
    updateSeasonInfo();
    renderMatchDayStatus();
    renderRoleMembers();
    applyRolePermissions();
    await runInitStep("同步登录状态", async () => {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      await handleAuthSession(data.session);
    });
    await runInitStep("加载当前赛季", loadActiveSeason);
    await runInitStep("加载场次积分表", () => loadParticipationPointsTable(activeSeason?.id));
    hydrateWarmHomeCacheForActiveSeason();
    const primaryHomeLoadPromise = Promise.all([
      runInitStep("加载基础数据", loadPrimaryHomeData),
      runInitStep("加载积分榜", loadLeaderboard),
      runInitStep("加载道具目录", () => loadItemCatalog({ loadUsageSummary: false })),
    ]);
    await primaryHomeLoadPromise;
    await runInitStep("加载最近比赛", loadRecentMatches);
    runWhenBrowserIdle(() => {
      void refreshAutomaticBackgroundImage({ allowChampionLookup: true });
    }, DEFERRED_HOME_DATA_TIMEOUT_MS);
    dismissLoadingScreen();
    await runInitStep("建立实时订阅", async () => {
      subscribeRealtime();
    });
    if (!hasScheduledDeferredInit) {
      hasScheduledDeferredInit = true;
      deferredInitPromise = new Promise((resolve) => {
        runWhenBrowserIdle(() => {
          Promise.all([
            runInitStep("加载报名队列", loadQueue),
            runInitStep("加载赛季赞助", loadRewardLogs),
            runInitStep("加载道具数量统计", loadItemCatalogUsageSummary),
            runInitStep("加载赛季完结状态", loadSeasonEndConfirmations),
            runInitStep("加载本地操作记录", loadSeasonActionLogs),
          ]).then(() => {
            if (failedSteps.length) {
              setMessage(`部分数据加载失败：${failedSteps.join("、")}。其它可用内容已继续显示，请刷新后再试。`, true);
            }
            resolve();
          });
        }, DEFERRED_HOME_DATA_TIMEOUT_MS);
      });
    }

    if (failedSteps.length) {
      setMessage(`部分数据加载失败：${failedSteps.join("、")}。其它可用内容已继续显示，请刷新后再试。`, true);
    }
  } finally {
    dismissLoadingScreen();
  }
}

init();
