const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";
const TEAM_SIZE = 5;
const LOADING_SCREEN_MIN_MS = 900;

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loadingScreen = document.getElementById("loadingScreen");
const lastUpdatedText = document.getElementById("lastUpdatedText");
const signupPlayerGrid = document.getElementById("signupPlayerGrid");
const signupEmpty = document.getElementById("signupEmpty");
const messageEl = document.getElementById("message");
const seasonToggleBtn = document.getElementById("seasonToggleBtn");
const seasonPlayersPanel = document.getElementById("seasonPlayersPanel");
const seasonPanelTitle = document.getElementById("seasonPanelTitle");
const seasonPlayersCount = document.getElementById("seasonPlayersCount");
const seasonPlayersList = document.getElementById("seasonPlayersList");
const seasonPlayersEmpty = document.getElementById("seasonPlayersEmpty");
const seasonRewardTotal = document.getElementById("seasonRewardTotal");
const rewardPanel = document.getElementById("rewardPanel");
const closeRewardPanelBtn = document.getElementById("closeRewardPanelBtn");
const rewardPlayerSelect = document.getElementById("rewardPlayerSelect");
const rewardOutsideNameInput = document.getElementById("rewardOutsideNameInput");
const rewardExtraInput = document.getElementById("rewardExtraInput");
const addRewardBtn = document.getElementById("addRewardBtn");
const rewardMinimumHint = document.getElementById("rewardMinimumHint");
const rewardMessageEl = document.getElementById("rewardMessage");
const koiPlayerSelect = document.getElementById("koiPlayerSelect");
const setKoiBtn = document.getElementById("setKoiBtn");
const rewardLogsList = document.getElementById("rewardLogsList");
const rewardLogsEmpty = document.getElementById("rewardLogsEmpty");
const resetSeasonBtn = document.getElementById("resetSeasonBtn");
const startMatchDayBtn = document.getElementById("startMatchDayBtn");
const matchStartTimeInput = document.getElementById("matchStartTimeInput");
const matchDayStatus = document.getElementById("matchDayStatus");
const matchStartTimeDisplay = document.getElementById("matchStartTimeDisplay");
const matchDayInfo = document.getElementById("matchDayInfo");
const confirmQueueBtn = document.getElementById("confirmQueueBtn");
const clearQueueBtn = document.getElementById("clearQueueBtn");
const queueList = document.getElementById("queueList");
const queueEmpty = document.getElementById("queueEmpty");
const todayAddPlayerSelect = document.getElementById("todayAddPlayerSelect");
const addTodayPlayerBtn = document.getElementById("addTodayPlayerBtn");
const clearTodayPlayersBtn = document.getElementById("clearTodayPlayersBtn");
const todayPlayersList = document.getElementById("todayPlayersList");
const todayPlayersEmpty = document.getElementById("todayPlayersEmpty");
const todayPlayersCount = document.getElementById("todayPlayersCount");
const leaderboardBody = document.getElementById("leaderboardBody");
const openMatchFormBtn = document.getElementById("openMatchFormBtn");
const openBackfillFormBtn = document.getElementById("openBackfillFormBtn");
const closeMatchFormBtn = document.getElementById("closeMatchFormBtn");
const closeBackfillFormBtn = document.getElementById("closeBackfillFormBtn");
const matchFormPanel = document.getElementById("matchFormPanel");
const backfillFormPanel = document.getElementById("backfillFormPanel");
const matchMessageEl = document.getElementById("matchMessage");
const backfillMessageEl = document.getElementById("backfillMessage");
const seasonInfoEl = document.getElementById("seasonInfo");
const teamAFields = document.getElementById("teamAFields");
const teamBFields = document.getElementById("teamBFields");
const backfillTeamAFields = document.getElementById("backfillTeamAFields");
const backfillTeamBFields = document.getElementById("backfillTeamBFields");
const winnerSelect = document.getElementById("winnerSelect");
const backfillWinnerSelect = document.getElementById("backfillWinnerSelect");
const winnerToggleHint = document.getElementById("winnerToggleHint");
const backfillWinnerToggleHint = document.getElementById("backfillWinnerToggleHint");
const matchNoteInput = document.getElementById("matchNote");
const matchDoublePanel = document.getElementById("matchDoublePanel");
const backfillSeasonSelect = document.getElementById("backfillSeasonSelect");
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

let seasonPlayers = [];
let todayPlayers = [];
let queueEntries = [];
let activeSeason = null;
let activeMatchDay = null;
let allSeasons = [];
let backfillPlayers = [];
let leaderboardPlayers = [];
let rewardLogs = [];
let seasonPlayerRewardTotal = 0;
let externalRewardTotal = 0;
let recentMatchesData = [];
let openRecentMatchGroups = new Set();
let isMatchFormOpen = false;
let isBackfillFormOpen = false;
let isSeasonPanelOpen = false;
let isRewardPanelOpen = false;
let editingMatchId = null;
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
let matchDoubleState = {
  teamAUserId: "",
  teamBUserId: "",
  singles: [],
};
let backfillDoubleState = {
  teamAUserId: "",
  teamBUserId: "",
  singles: [],
};
let heroPickerState = null;
let realtimeChannel = null;
let refreshTimer = null;
let refreshFlushPromise = null;
const loadingStartedAt = Date.now();
const REFRESH_DEBOUNCE_MS = 150;
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
  "Primal Beast": "原始兽",
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
  recentMatches: false,
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
        await loadLeaderboard();
        await loadRewardLogs();
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

      if (pending.recentMatches) {
        await loadRecentMatches();
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

function scheduleRefresh(flags) {
  Object.entries(flags).forEach(([key, value]) => {
    if (value && key in refreshState) {
      refreshState[key] = true;
    }
  });

  if (refreshFlushPromise || refreshTimer) {
    return;
  }

  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    flushRefreshQueue();
  }, REFRESH_DEBOUNCE_MS);
}

function requestImmediateRefresh(flags) {
  scheduleRefresh(flags);
  flushRefreshQueue();
}

function hideLoadingScreen() {
  if (!loadingScreen) return;

  const elapsed = Date.now() - loadingStartedAt;
  const waitMs = Math.max(0, LOADING_SCREEN_MIN_MS - elapsed);

  window.setTimeout(() => {
    loadingScreen.classList.add("is-hidden");
  }, waitMs);
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

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.className = isError ? "message error" : "message";
}

function setMatchMessage(text, isError = false) {
  matchMessageEl.textContent = text;
  matchMessageEl.className = isError ? "message error" : "message";
}

function setBackfillMessage(text, isError = false) {
  backfillMessageEl.textContent = text;
  backfillMessageEl.className = isError ? "message error" : "message";
}

function setHeroPickerMessage(text, isError = false) {
  heroPickerMessage.textContent = text;
  heroPickerMessage.className = isError ? "message error" : "message";
}

function setRewardMessage(text, isError = false) {
  rewardMessageEl.textContent = text;
  rewardMessageEl.className = isError ? "message error" : "message";
}

function formatScore(value) {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return "0";
  return numericValue.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
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
  isMatchFormOpen = isOpen;
  matchFormPanel.hidden = !isOpen;
  openMatchFormBtn.textContent = isOpen ? "正在录入比赛" : "添加一场比赛记录";
  openMatchFormBtn.disabled = isOpen || !activeMatchDay || todayPlayers.length < TEAM_SIZE * 2;
}

function setBackfillFormOpen(isOpen) {
  isBackfillFormOpen = isOpen;
  backfillFormPanel.hidden = !isOpen;
  openBackfillFormBtn.disabled = isOpen;
}

function setSeasonPanelOpen(isOpen) {
  isSeasonPanelOpen = isOpen;
  seasonPlayersPanel.hidden = !isOpen;
  seasonToggleBtn.setAttribute("aria-expanded", String(isOpen));
}

function setRewardPanelOpen(isOpen) {
  isRewardPanelOpen = isOpen;
  rewardPanel.hidden = !isOpen;
  seasonRewardTotal.setAttribute("aria-expanded", String(isOpen));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatLocalTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderLastUpdatedTime() {
  if (!lastUpdatedText) return;

  const raw = document.lastModified;
  if (!raw) {
    lastUpdatedText.textContent = "未知";
    return;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    lastUpdatedText.textContent = raw;
    return;
  }

  lastUpdatedText.textContent = formatLocalTime(date.toISOString()) || raw;
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
      : "未选择则先保存为暂不计入胜负";
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

  const toggleText = details.querySelector(".match-day-toggle-text");
  if (toggleText) {
    toggleText.textContent = details.open ? "点击收起" : "点击展开";
  }

  details.dataset.expanded = details.open ? "true" : "false";
}

function rememberOpenRecentMatchGroups() {
  openRecentMatchGroups = new Set(
    [...recentMatchesList.querySelectorAll(".match-day-group[open]")]
      .map((element) => element.dataset.matchDate)
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

function getBeijingBusinessDateString() {
  const now = new Date();
  const beijing = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })
  );

  if (beijing.getHours() < 2) {
    beijing.setDate(beijing.getDate() - 1);
  }

  const year = beijing.getFullYear();
  const month = String(beijing.getMonth() + 1).padStart(2, "0");
  const day = String(beijing.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getQueueTimestamp(row) {
  const value = row.status === "cancelled" || row.is_active === false
    ? row.cancelled_at || row.created_at
    : row.created_at;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
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

function getTodayMatchPlayers() {
  const seasonRankMap = new Map(seasonPlayers.map((player) => [player.id, player.player_rank || null]));
  return todayPlayers.map((player) => ({
    id: player.player_id || player.id,
    display_name: player.display_name,
    player_rank: seasonRankMap.get(player.player_id || player.id) || null,
  }));
}

function createEmptySingleDoubleEntry() {
  return {
    id: `double-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_player_id: "",
    target_player_id: "",
  };
}

function getSelectedPlayersByFormType(formType) {
  const selections = formType === "backfill" ? backfillTeamSelections : matchTeamSelections;
  const players = formType === "backfill" ? backfillPlayers : getTodayMatchPlayers();
  const teamMap = new Map();

  selections.teamA.forEach((playerId) => teamMap.set(playerId, "A"));
  selections.teamB.forEach((playerId) => teamMap.set(playerId, "B"));

  return players
    .filter((player) => teamMap.has(player.id))
    .map((player) => ({
      ...player,
      team: teamMap.get(player.id),
    }));
}

function getDoubleStateByFormType(formType) {
  return formType === "backfill" ? backfillDoubleState : matchDoubleState;
}

function renderDoublePanel(formType) {
  const panel = formType === "backfill" ? backfillDoublePanel : matchDoublePanel;
  if (!panel) return;

  const doubleState = getDoubleStateByFormType(formType);
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const teamAPlayers = selectedPlayers.filter((player) => player.team === "A");
  const teamBPlayers = selectedPlayers.filter((player) => player.team === "B");
  const buildOptions = (players, currentValue = "", placeholder = "不使用") => {
    const options = [`<option value="">${placeholder}</option>`];
    players.forEach((player) => {
      const selected = player.id === currentValue ? " selected" : "";
      options.push(`<option value="${player.id}"${selected}>${escapeHtml(player.display_name)}</option>`);
    });
    return options.join("");
  };

  panel.innerHTML = `
    <div class="double-panel-head">
      <div>
        <h4>双倍积分</h4>
        <p class="muted">团队双倍与单人双倍互斥。单人双倍可跨队使用，团队双倍必须本队使用。</p>
      </div>
    </div>
    <div class="double-team-grid">
      <label class="double-field">
        <span>天辉团队双倍使用者</span>
        <select data-role="double-team-user" data-form-type="${formType}" data-team="A">
          ${buildOptions(teamAPlayers, doubleState.teamAUserId, "天辉不使用团队双倍")}
        </select>
      </label>
      <label class="double-field">
        <span>夜魇团队双倍使用者</span>
        <select data-role="double-team-user" data-form-type="${formType}" data-team="B">
          ${buildOptions(teamBPlayers, doubleState.teamBUserId, "夜魇不使用团队双倍")}
        </select>
      </label>
    </div>
    <div class="double-single-list">
      <div class="double-single-head">
        <strong>单人双倍</strong>
        <button type="button" class="button-secondary double-add-btn" data-role="double-add" data-form-type="${formType}">添加单人双倍</button>
      </div>
      ${doubleState.singles.length ? doubleState.singles.map((entry) => `
        <div class="double-single-row">
          <select data-role="double-single-user" data-form-type="${formType}" data-entry-id="${entry.id}">
            ${buildOptions(selectedPlayers, entry.user_player_id, "选择使用者")}
          </select>
          <select data-role="double-single-target" data-form-type="${formType}" data-entry-id="${entry.id}">
            ${buildOptions(selectedPlayers, entry.target_player_id, "选择生效人")}
          </select>
          <button type="button" class="button-danger double-remove-btn" data-role="double-remove" data-form-type="${formType}" data-entry-id="${entry.id}">删除</button>
        </div>
      `).join("") : '<p class="muted">当前未设置单人双倍。</p>'}
    </div>
  `;
}

function buildDoubleDownPayload(formType) {
  const doubleState = getDoubleStateByFormType(formType);
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const teamMap = new Map(selectedPlayers.map((player) => [player.id, player.team]));
  const payload = [];

  if (doubleState.teamAUserId) {
    payload.push({
      mode: "team",
      user_player_id: doubleState.teamAUserId,
      target_team: "A",
    });
  }

  if (doubleState.teamBUserId) {
    payload.push({
      mode: "team",
      user_player_id: doubleState.teamBUserId,
      target_team: "B",
    });
  }

  doubleState.singles.forEach((entry) => {
    if (entry.user_player_id && entry.target_player_id) {
      payload.push({
        mode: "single",
        user_player_id: entry.user_player_id,
        target_player_id: entry.target_player_id,
      });
    }
  });

  const doubledTeams = new Set(payload.filter((item) => item.mode === "team").map((item) => item.target_team));
  const doubledTargets = new Set();

  for (const item of payload) {
    if (!teamMap.has(item.user_player_id)) {
      return { error: "双倍积分的使用者必须是本场比赛选手。", payload: [] };
    }

    if (item.mode === "team") {
      if (teamMap.get(item.user_player_id) !== item.target_team) {
        return { error: "团队双倍的使用者必须和生效队伍在同一边。", payload: [] };
      }
      continue;
    }

    if (!teamMap.has(item.target_player_id)) {
      return { error: "单人双倍的生效人必须是本场比赛选手。", payload: [] };
    }

    const targetTeam = teamMap.get(item.target_player_id);
    if (doubledTeams.has(targetTeam)) {
      return { error: "团队双倍与单人双倍不能同时作用于同一队伍。", payload: [] };
    }

    if (doubledTargets.has(item.target_player_id)) {
      return { error: "同一名选手一场比赛只能吃一次单人双倍。", payload: [] };
    }

    doubledTargets.add(item.target_player_id);
  }

  return { error: "", payload };
}

function syncTeamSelections(state, players, assignments = {}) {
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

function renderTeamSelectionUI({
  players,
  selections,
  assignments,
  teamAContainer,
  teamBContainer,
  formType,
}) {
  syncTeamSelections(selections, players, assignments);
  const groupedPlayers = [
    { title: "核心", players: players.filter((player) => player.player_rank === "core") },
    { title: "辅助", players: players.filter((player) => player.player_rank === "support") },
    { title: "未分组", players: players.filter((player) => player.player_rank !== "core" && player.player_rank !== "support") },
  ].filter((group) => group.players.length);
  [
    { container: teamAContainer, teamKey: "teamA", title: "天辉方已选" },
    { container: teamBContainer, teamKey: "teamB", title: "夜魇方已选" },
  ].forEach(({ container, teamKey, title }) => {
    const oppositeTeamKey = teamKey === "teamA" ? "teamB" : "teamA";
    const selectedIds = new Set(selections[teamKey]);
    const oppositeIds = new Set(selections[oppositeTeamKey]);
    const selectedPlayers = players.filter((player) => selectedIds.has(player.id));
    const summaryHtml = selectedPlayers.length
      ? selectedPlayers.map((player) => `
        <button
          type="button"
          class="match-picked-player"
          data-role="hero-picker"
          data-form-type="${formType}"
          data-team="${teamKey}"
          data-player-id="${player.id}"
          data-player-name="${escapeHtml(player.display_name)}"
        >
          <span>${escapeHtml(player.display_name)}</span>
          ${buildHeroBadge(assignments[player.id] || "")}
        </button>
      `).join("")
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
    players: getTodayMatchPlayers(),
    selections: matchTeamSelections,
    assignments: matchHeroAssignments,
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
  const seasonName = activeSeason?.name || "未识别";

  if (activeSeason?.name) {
    seasonInfoEl.textContent = `当前赛季：${activeSeason.name}`;
  } else {
    seasonInfoEl.textContent = "当前未识别到赛季，将使用全局玩家名单。";
  }

  const koiSuffix = activeSeason?.koi_player_id ? " · 已设锦鲤" : "";
  seasonToggleBtn.textContent = `当前赛季：${seasonName}${koiSuffix}`;
  seasonPanelTitle.textContent = `${seasonName} 选手名单`;
}

function updateSeasonRewardTotal(total) {
  if (total == null) {
    seasonRewardTotal.textContent = "本赛季赞助总额：--";
    return;
  }

  seasonRewardTotal.textContent = `本赛季赞助总额：${formatScore(total)}`;
}

function refreshSeasonRewardTotal() {
  updateSeasonRewardTotal(seasonPlayerRewardTotal + externalRewardTotal);
}

function renderRewardPlayerOptions() {
  const options = ['<option value="">请选择选手</option>'];
  const sortedPlayers = [...leaderboardPlayers].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "zh-CN")
  );

  sortedPlayers.forEach((player) => {
    options.push(
      `<option value="${player.player_id || player.id}">${escapeHtml(player.display_name)}</option>`
    );
  });

  rewardPlayerSelect.innerHTML = options.join("");
}

function renderKoiPlayerOptions() {
  const options = ['<option value="">不设置锦鲤</option>'];
  const participants = seasonPlayers
    .filter((player) => player.is_in_season)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));

  participants.forEach((player) => {
    const selected = activeSeason?.koi_player_id === player.id ? " selected" : "";
    options.push(`<option value="${player.id}"${selected}>${escapeHtml(player.display_name)}</option>`);
  });

  koiPlayerSelect.innerHTML = options.join("");
}

function updateRewardMinimumHint() {
  const selectedPlayer = leaderboardPlayers.find(
    (player) => (player.player_id || player.id) === rewardPlayerSelect.value
  );

  if (!selectedPlayer) {
    if (rewardOutsideNameInput.value.trim()) {
      rewardMinimumHint.textContent = `场外赞助人：${rewardOutsideNameInput.value.trim()}`;
      return;
    }

    rewardMinimumHint.textContent = "请选择选手或填写场外赞助姓名后添加额外赞助额。";
    return;
  }

  rewardMinimumHint.textContent = `${selectedPlayer.display_name} 当前最低值 ${Number(selectedPlayer.reward_minimum ?? 20)}，当前额外赞助额 ${Number(selectedPlayer.reward_extra_points ?? 0)}。`;
}

function renderRewardLogs() {
  rewardLogsList.innerHTML = "";

  if (!rewardLogs.length) {
    rewardLogsEmpty.style.display = "block";
    return;
  }

  rewardLogsEmpty.style.display = "none";

  rewardLogs.forEach((log) => {
    const item = document.createElement("div");
    const playerName = log.players?.display_name || log.donor_name || "未知赞助人";
    const statusBadge = log.is_cancelled
      ? '<span class="reward-log-amount reward-log-cancelled">已取消</span>'
      : `<span class="reward-log-amount">+${Number(log.amount ?? 0)}</span>`;
    const actionHtml = log.is_cancelled
      ? ""
      : `<button class="button-danger cancel-reward-log-btn" type="button" data-donation-id="${log.id}" data-player-name="${escapeHtml(playerName)}">取消</button>`;

    item.className = `reward-log-item${log.player_id ? "" : " reward-log-outside"}`;
    item.innerHTML = `
      <div class="reward-log-main">
        <strong>${escapeHtml(playerName)}</strong>
        ${log.player_id ? "" : '<span class="queue-slot">场外赞助</span>'}
        ${statusBadge}
        <span class="muted">${escapeHtml(formatLocalTime(log.created_at))}</span>
      </div>
      <div class="queue-actions">
        ${log.cancelled_at ? `<span class="muted">取消于 ${escapeHtml(formatLocalTime(log.cancelled_at))}</span>` : ""}
        ${actionHtml}
      </div>
    `;
    rewardLogsList.appendChild(item);
  });
}

function renderSeasonPlayersPanel() {
  seasonPlayersList.innerHTML = "";
  seasonPlayersCount.textContent = `${seasonPlayers.length} 人`;

  if (seasonPlayers.length === 0) {
    seasonPlayersEmpty.style.display = "block";
    return;
  }

  seasonPlayersEmpty.style.display = "none";

  const groups = {
    core: seasonPlayers.filter((player) => player.player_rank === "core"),
    support: seasonPlayers.filter((player) => player.player_rank === "support"),
    idle: seasonPlayers.filter((player) => !player.player_rank),
  };

  const renderPlayerCard = (player) => {
    const item = document.createElement("div");
    item.className = `season-player-item${player.is_in_season ? " season-player-item-active" : ""}`;
    const statusBadge = player.is_in_season
      ? `<span class="queue-slot">${player.player_rank === "core" ? "核心" : "辅助"}</span>`
      : '<span class="muted">未参赛</span>';
    item.innerHTML = `
      <div class="season-player-main">
        <strong>${escapeHtml(player.display_name)}</strong>
        ${statusBadge}
      </div>
      <div class="season-player-actions">
        <button
          class="season-player-rank-btn${player.player_rank === "core" ? " season-player-rank-btn-active" : ""}"
          type="button"
          data-role="season-rank"
          data-rank="core"
          data-player-id="${player.id}"
          data-player-name="${escapeHtml(player.display_name)}"
        >
          核心
        </button>
        <button
          class="season-player-rank-btn${player.player_rank === "support" ? " season-player-rank-btn-active" : ""}"
          type="button"
          data-role="season-rank"
          data-rank="support"
          data-player-id="${player.id}"
          data-player-name="${escapeHtml(player.display_name)}"
        >
          辅助
        </button>
      </div>
    `;
    return item;
  };

  const columns = document.createElement("div");
  columns.className = "season-rank-columns";

  [
    { key: "core", title: "核心", empty: "暂无核心选手" },
    { key: "support", title: "辅助", empty: "暂无辅助选手" },
  ].forEach(({ key, title, empty }) => {
    const section = document.createElement("section");
    section.className = "season-rank-column";
    section.innerHTML = `
      <div class="season-rank-head">
        <h3>${title}</h3>
        <span class="queue-slot">${groups[key].length} 人</span>
      </div>
      <div class="season-rank-list"></div>
      <p class="muted season-rank-empty"${groups[key].length ? ' hidden' : ''}>${empty}</p>
    `;

    const list = section.querySelector(".season-rank-list");
    groups[key].forEach((player) => list.appendChild(renderPlayerCard(player)));
    columns.appendChild(section);
  });

  seasonPlayersList.appendChild(columns);

  const idleSection = document.createElement("section");
  idleSection.className = "season-unranked-section";
  idleSection.innerHTML = `
    <div class="season-rank-head">
      <h3>未参赛</h3>
      <span class="queue-slot">${groups.idle.length} 人</span>
    </div>
    <div class="season-unranked-list"></div>
    <p class="muted season-rank-empty"${groups.idle.length ? ' hidden' : ''}>当前所有选手都已设置身份</p>
  `;
  const idleList = idleSection.querySelector(".season-unranked-list");
  groups.idle.forEach((player) => idleList.appendChild(renderPlayerCard(player)));
  seasonPlayersList.appendChild(idleSection);

  renderKoiPlayerOptions();
}

function renderMatchDayStatus() {
  const storedStartTime = readStoredMatchDayStartTime();

  if (activeMatchDay) {
    matchDayStatus.textContent = `${activeMatchDay.match_date} 进行中`;
    matchDayStatus.className = "muted day-status-active";
    matchDayInfo.textContent = "当前比赛日已发起。北京时间次日凌晨 2 点会自动结束并清空报名队列与当日选手。";
    startMatchDayBtn.textContent = "取消发起";
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
    return;
  }

  matchDayStatus.textContent = "未发起";
  matchDayStatus.className = "muted day-status-inactive";
  matchDayInfo.textContent = "需要先发起当日比赛，报名功能才会开放。";
  startMatchDayBtn.textContent = "发起当日比赛";
  startMatchDayBtn.disabled = false;
  matchStartTimeInput.disabled = false;
  matchStartTimeDisplay.textContent = "";
}

function renderSignupOptions() {
  signupPlayerGrid.innerHTML = "";

  const queueByPlayerId = new Map();
  queueEntries.forEach((row) => {
    if (row.status === "confirmed") {
      return;
    }
    queueByPlayerId.set(row.player_id, row);
  });

  const participants = seasonPlayers.filter((player) => player.is_in_season);

  if (!participants.length) {
    signupEmpty.style.display = "block";
    signupEmpty.textContent = "当前赛季暂无可报名选手";
  } else if (!activeMatchDay) {
    signupEmpty.style.display = "block";
    signupEmpty.textContent = "请先发起当日比赛";
  } else {
    signupEmpty.style.display = "none";
  }

  participants.forEach((player) => {
    const entry = queueByPlayerId.get(player.id);
    const isActive = entry?.is_active === true && entry?.status !== "confirmed";
    const isCancelled = entry?.status === "cancelled" || entry?.is_active === false;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "signup-player-chip";
    chip.dataset.playerId = player.id;
    chip.dataset.playerName = player.display_name;

    if (isActive) {
      chip.classList.add("signup-player-chip-active");
      chip.dataset.action = "cancel";
    } else if (isCancelled) {
      chip.classList.add("signup-player-chip-cancelled");
      chip.dataset.action = "resignup";
      chip.dataset.entryId = entry.id;
    } else {
      chip.dataset.action = "signup";
    }

    if (!activeMatchDay) {
      chip.disabled = true;
      chip.classList.add("signup-player-chip-disabled");
    }

    chip.innerHTML = `
      <strong>${escapeHtml(player.display_name)}</strong>
      <small>${isActive ? "已报名，点击取消" : isCancelled ? "已取消，点击恢复" : "点击报名"}</small>
    `;
    signupPlayerGrid.appendChild(chip);
  });

  const todayPlayerIds = new Set(todayPlayers.map((player) => player.player_id || player.id));
  const addablePlayers = seasonPlayers.filter((player) => player.is_in_season && !todayPlayerIds.has(player.id));
  const canAddTodayPlayers = Boolean(activeMatchDay) && addablePlayers.length > 0;
  todayAddPlayerSelect.innerHTML = canAddTodayPlayers
    ? buildOptionsFromPlayers(addablePlayers)
    : `<option value="">${activeMatchDay ? "暂无可添加选手" : "请先发起当日比赛"}</option>`;
  todayAddPlayerSelect.disabled = !canAddTodayPlayers;
  addTodayPlayerBtn.disabled = !canAddTodayPlayers;
  clearTodayPlayersBtn.disabled = !activeMatchDay;
}

function renderMatchForm() {
  refreshMatchSelectOptions();
  renderDoublePanel("match");

  const hasEnoughPlayers = Boolean(activeMatchDay) && todayPlayers.length >= TEAM_SIZE * 2;
  winnerSelect.disabled = !hasEnoughPlayers;
  matchNoteInput.disabled = !hasEnoughPlayers;
  recordMatchBtn.disabled = !hasEnoughPlayers;
  closeMatchFormBtn.disabled = false;
  openMatchFormBtn.disabled = isMatchFormOpen || !hasEnoughPlayers;
  [...matchFormPanel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    button.disabled = !hasEnoughPlayers;
  });
  setWinnerSelection("match", winnerSelect.value);
}

function renderBackfillForm() {
  refreshBackfillSelectOptions();
  renderDoublePanel("backfill");
  backfillSeasonSelect.innerHTML = buildSeasonOptions(allSeasons, backfillSeasonSelect.value);
  const hasEnoughPlayers = backfillPlayers.length >= TEAM_SIZE * 2;
  const hasSeason = Boolean(backfillSeasonSelect.value);
  backfillWinnerSelect.disabled = !hasSeason || !hasEnoughPlayers;
  backfillDateInput.disabled = !hasSeason;
  backfillMatchNoteInput.disabled = !hasSeason || !hasEnoughPlayers;
  recordBackfillBtn.disabled = !hasSeason || !hasEnoughPlayers || !backfillDateInput.value;
  recordBackfillBtn.textContent = editingMatchId ? "保存修改" : "保存补录比赛";
  [...backfillFormPanel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    button.disabled = !hasSeason || !hasEnoughPlayers;
  });
  setWinnerSelection("backfill", backfillWinnerSelect.value);
}

function clearMatchForm() {
  matchTeamSelections = {
    teamA: [],
    teamB: [],
  };
  matchHeroAssignments = {};
  matchDoubleState = {
    teamAUserId: "",
    teamBUserId: "",
    singles: [],
  };
  setWinnerSelection("match", "");
  matchNoteInput.value = "";
  refreshMatchSelectOptions();
  renderDoublePanel("match");
  setMatchMessage("");
}

function clearBackfillForm() {
  editingMatchId = null;
  backfillTeamSelections = {
    teamA: [],
    teamB: [],
  };
  backfillHeroAssignments = {};
  backfillDoubleState = {
    teamAUserId: "",
    teamBUserId: "",
    singles: [],
  };
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
  confirmQueueBtn.disabled = readyEntries.length < 10;

  const visibleRows = allRows.filter((row) =>
    row.is_active === true || row.status === "cancelled"
  );

  if (visibleRows.length === 0) {
    queueEmpty.style.display = "block";
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
    const actionHtml = isCancelled
      ? `<button class="button-secondary queue-resignup-btn" data-entry-id="${row.id}" data-player-name="${escapeHtml(playerName)}">重新报名</button>`
      : hasArrived
        ? `<button class="button-danger queue-unready-btn" data-roster-entry-id="${readyEntry.id}" data-player-name="${escapeHtml(playerName)}">取消就位</button>`
        : `<button class="button-secondary queue-ready-btn" data-entry-id="${row.id}" data-player-id="${row.player_id}" data-player-name="${escapeHtml(playerName)}">就位</button>`;
    let laneLabel = "";

    if (!isCancelled) {
      activeCount += 1;
      laneLabel = activeCount <= 10
        ? `正式队列 #${activeCount}`
        : `替补区 #${activeCount - 10}`;
    }

    li.className = "queue-item";
    if (!isCancelled && activeCount === 10) {
      li.classList.add("queue-cutoff");
    }

    li.innerHTML = `
      <div class="queue-main">
        ${laneLabel ? `<span class="queue-slot">${laneLabel}</span>` : ""}
        <strong>${escapeHtml(playerName)}</strong>
        <span class="${statusClass}">${statusLabel}</span>
        ${!isCancelled && hasArrived ? '<span class="queue-status queue-status-ready">已开机入场</span>' : ""}
      </div>
      <div class="queue-actions">
        <span class="muted">${escapeHtml(metaText)}</span>
        ${actionHtml}
      </div>
    `;
    queueList.appendChild(li);
  });
}

function renderTodayPlayers() {
  todayPlayersList.innerHTML = "";
  todayPlayersCount.textContent = `${todayPlayers.length} 人`;

  if (todayPlayers.length === 0) {
    todayPlayersEmpty.style.display = "block";
    return;
  }

  todayPlayersEmpty.style.display = "none";

  todayPlayers.forEach((player, idx) => {
    const sourceLabel = player.source === "queue" ? "队列到齐" : "临时添加";
    const li = document.createElement("li");
    li.className = "today-player-item";
    li.innerHTML = `
      <div class="today-player-main">
        <span class="queue-slot">当日 #${idx + 1}</span>
        <strong>${escapeHtml(player.display_name)}</strong>
        <span class="today-player-source">${sourceLabel}</span>
      </div>
      <div class="queue-actions">
        <span class="muted">${escapeHtml(formatLocalTime(player.created_at))}</span>
        <button class="button-danger remove-today-player-btn" data-entry-id="${player.id}">移出名单</button>
      </div>
    `;
    todayPlayersList.appendChild(li);
  });
}

function renderLeaderboard(data) {
  leaderboardBody.innerHTML = "";
  leaderboardPlayers = data || [];

  if (!data || data.length === 0) {
    seasonPlayerRewardTotal = 0;
    refreshSeasonRewardTotal();
    renderRewardPlayerOptions();
    updateRewardMinimumHint();
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="muted">暂无排行榜数据</td>';
    leaderboardBody.appendChild(tr);
    return;
  }

  seasonPlayerRewardTotal = data.reduce(
    (sum, player) => sum + Number(player.reward_points ?? 0),
    0
  );
  refreshSeasonRewardTotal();
  renderRewardPlayerOptions();
  updateRewardMinimumHint();

  data.forEach((player, idx) => {
    const tr = document.createElement("tr");
    const rank = idx + 1;
    if (rank === 1) {
      tr.className = "leaderboard-row-top1";
    } else if (rank <= 3) {
      tr.className = "leaderboard-row-top23";
    } else if (rank <= 5) {
      tr.className = "leaderboard-row-top45";
    }
    tr.innerHTML = `
      <td><span class="leaderboard-rank">${rank}</span></td>
      <td>${escapeHtml(player.display_name)}</td>
      <td>${formatScore(player.score)}</td>
      <td>${player.games_played ?? 0}</td>
      <td>${Number(player.reward_points ?? 0)}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

async function addRewardExtra() {
  const playerId = rewardPlayerSelect.value;
  const outsideName = rewardOutsideNameInput.value.trim();
  const selectedPlayer = leaderboardPlayers.find(
    (player) => (player.player_id || player.id) === playerId
  );
  const extraAmount = Number.parseInt(rewardExtraInput.value, 10);

  if (!playerId && !outsideName) {
    setRewardMessage("请先选择选手或填写场外赞助姓名。", true);
    return;
  }

  if (!Number.isInteger(extraAmount) || extraAmount < 0) {
    setRewardMessage("额外赞助额必须是大于等于 0 的整数。", true);
    return;
  }

  addRewardBtn.disabled = true;
  setRewardMessage(`正在添加赞助记录...`);

  if (outsideName && !playerId) {
    const localLogs = readExternalDonationLogs(activeSeason?.id || null);
    localLogs.unshift({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      season_id: activeSeason?.id || null,
      player_id: null,
      donor_name: outsideName,
      amount: extraAmount,
      is_cancelled: false,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      is_local: true,
    });
    writeExternalDonationLogs(activeSeason?.id || null, localLogs);
    addRewardBtn.disabled = false;
    rewardExtraInput.value = "";
    rewardOutsideNameInput.value = "";
    rewardPlayerSelect.value = "";
    setRewardMessage(`${outsideName} 的场外赞助已记录在本地。`);
    await loadRewardLogs();
    updateRewardMinimumHint();
    return;
  }

  const { error } = await db.rpc("add_player_reward_extra", {
    p_player_id: playerId || null,
    p_extra_amount: extraAmount,
    p_season_id: activeSeason?.id || null,
    p_donor_name: null,
  });

  addRewardBtn.disabled = false;

  if (error) {
    setRewardMessage(`添加赞助失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  rewardExtraInput.value = "";
  rewardOutsideNameInput.value = "";
  rewardPlayerSelect.value = "";
  setRewardMessage(`${selectedPlayer?.display_name || outsideName} 已增加赞助额 ${extraAmount}。`);
  updateRewardMinimumHint();
  requestImmediateRefresh({
    playerDriven: true,
    leaderboard: true,
    rewardLogs: true,
  });
}

async function loadRewardLogs() {
  let query = db
    .from("reward_donations")
    .select(`
      id,
      season_id,
      player_id,
      donor_name,
      amount,
      is_cancelled,
      cancelled_at,
      created_at,
      players (
        display_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  const { data, error } = await query;

  const localExternalLogs = readExternalDonationLogs(activeSeason?.id || null);

  if (error) {
    console.error("加载赞助记录失败：", error);
    rewardLogs = [...localExternalLogs];
    externalRewardTotal = localExternalLogs
      .filter((log) => !log.is_cancelled)
      .reduce((sum, log) => sum + Number(log.amount ?? 0), 0);
    refreshSeasonRewardTotal();
    renderRewardLogs();
    return;
  }

  rewardLogs = [...localExternalLogs, ...(data || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  externalRewardTotal = rewardLogs
    .filter((log) => !log.is_cancelled && !log.player_id)
    .reduce((sum, log) => sum + Number(log.amount ?? 0), 0);
  refreshSeasonRewardTotal();
  renderRewardLogs();
}

async function cancelRewardDonation(donationId, playerName, buttonEl) {
  const confirmed = window.confirm(`确认取消 ${playerName} 这条赞助记录吗？`);

  if (!confirmed) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setRewardMessage(`正在取消 ${playerName} 的赞助记录...`);

  const localLogs = readExternalDonationLogs(activeSeason?.id || null);
  const localIndex = localLogs.findIndex((log) => log.id === donationId);

  if (localIndex >= 0) {
    localLogs[localIndex] = {
      ...localLogs[localIndex],
      is_cancelled: true,
      cancelled_at: new Date().toISOString(),
    };
    writeExternalDonationLogs(activeSeason?.id || null, localLogs);
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setRewardMessage(`${playerName} 的场外赞助记录已取消。`);
    await loadRewardLogs();
    return;
  }

  const { error } = await db.rpc("cancel_reward_donation", {
    p_donation_id: donationId,
    p_season_id: activeSeason?.id || null,
  });

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    setRewardMessage(`取消赞助记录失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
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

function renderRecentMatches(data) {
  recentMatchesData = data || [];
  recentMatchesList.innerHTML = "";

  if (!recentMatchesData || recentMatchesData.length === 0) {
    recentMatchesEmpty.style.display = "block";
    return;
  }

  recentMatchesEmpty.style.display = "none";

  const groups = new Map();

  recentMatchesData.forEach((match) => {
    const key = match.match_date || formatArchiveDate(match.created_at) || "历史比赛";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(match);
  });

  groups.forEach((matches, matchDate) => {
    const details = document.createElement("details");
    const isActiveDay = matches.some((match) => match.day_is_active);
    details.dataset.matchDate = matchDate;
    details.className = "match-day-group";
    details.open = isActiveDay || openRecentMatchGroups.has(matchDate);
    details.dataset.expanded = details.open ? "true" : "false";
    details.addEventListener("toggle", () => {
      if (details.open) {
        openRecentMatchGroups.add(matchDate);
      } else {
        openRecentMatchGroups.delete(matchDate);
      }
      updateRecentMatchGroupSummary(details, isActiveDay);
    });

    details.innerHTML = `
      <summary>
        <div class="match-day-summary">
          <strong>${escapeHtml(matchDate)}</strong>
          <span class="queue-slot">${matches.length} 场</span>
          <span class="winner-badge match-day-summary-badge">${isActiveDay ? "进行中" : "已归档"}</span>
        </div>
        <span class="match-day-toggle">
          <span class="match-day-toggle-icon" aria-hidden="true"></span>
          <span class="muted match-day-toggle-text">${details.open ? "点击收起" : "点击展开"}</span>
        </span>
      </summary>
      <div class="match-day-content">
        <div class="match-day-content-inner"></div>
      </div>
    `;
    updateRecentMatchGroupSummary(details, isActiveDay);
    details.querySelector("summary")?.addEventListener("click", () => {
      window.setTimeout(() => updateRecentMatchGroupSummary(details, isActiveDay), 0);
    });

    const content = details.querySelector(".match-day-content-inner");

    matches.forEach((match) => {
      const players = parseRecentMatchPlayers(match.players);
      const teamAPlayers = players.filter((player) => player.team === "A");
      const teamBPlayers = players.filter((player) => player.team === "B");
      const winnerLabel = getWinnerLabel(match.winner_team);
      const matchDateLabel = match.match_date || formatArchiveDate(match.created_at) || "未知日期";
      const doubleDowns = parseRecentMatchPlayers(match.double_downs);
      const doubleSummary = doubleDowns.length
        ? `<p class="muted">双倍积分：${escapeHtml(doubleDowns.map((item) => item.mode === "team" ? `${item.target_team === "A" ? "天辉" : "夜魇"}团队双倍` : "单人双倍").join("、"))}</p>`
        : "";
      const renderPlayerList = (teamPlayers) => teamPlayers.map((player) => `
        <li>
          <button
            type="button"
            class="recent-match-player"
            data-role="saved-hero-picker"
            data-match-id="${match.match_id}"
            data-player-id="${player.player_id}"
            data-player-name="${escapeHtml(player.display_name || "未知选手")}"
            data-hero-name="${escapeHtml(player.hero_name || "")}"
          >
            <span>${escapeHtml(player.display_name || "未知选手")}</span>
            ${player.hero_name ? `<span class="match-picked-hero">${escapeHtml(getHeroDisplayName(player.hero_name))}</span>` : '<span class="muted">未选英雄</span>'}
          </button>
        </li>
      `).join("");
      const card = document.createElement("article");

      card.className = "recent-match-card";
      card.innerHTML = `
        <div class="recent-match-head">
          <div class="recent-match-title">
            <strong>${winnerLabel}</strong>
            <span class="winner-badge">${getMatchStatusBadge(match.winner_team)}</span>
          </div>
          <div class="queue-actions">
            <button class="button-secondary edit-match-btn" data-match-id="${match.match_id}">修改记录</button>
            <button class="button-danger delete-match-btn" data-match-id="${match.match_id}">删除记录</button>
          </div>
        </div>
        <div class="recent-match-meta">
          <span class="muted">比赛日期：${escapeHtml(matchDateLabel)}</span>
          <span class="muted">登记时间：${escapeHtml(formatLocalTime(match.created_at))}</span>
        </div>
        <div class="recent-match-teams">
          <div class="recent-match-team${match.winner_team === "A" ? " recent-match-team-winner" : ""}">
            <h3>天辉方</h3>
            <ul>${renderPlayerList(teamAPlayers)}</ul>
          </div>
          <div class="recent-match-team${match.winner_team === "B" ? " recent-match-team-winner" : ""}">
            <h3>夜魇方</h3>
            <ul>${renderPlayerList(teamBPlayers)}</ul>
          </div>
        </div>
        ${doubleSummary}
        ${match.note ? `<p class="muted">${escapeHtml(match.note)}</p>` : ""}
      `;
      content.appendChild(card);
    });

    recentMatchesList.appendChild(details);
  });
}

async function loadActiveSeason() {
  const { data, error } = await db
    .from("seasons")
    .select("id, name, koi_player_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    activeSeason = null;
    updateSeasonInfo();
    return;
  }

  activeSeason = data || null;
  updateSeasonInfo();
}

async function loadSeasons() {
  const { data, error } = await db
    .from("seasons")
    .select("id, name, start_date, is_active")
    .gte("start_date", "2026-04-01")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("加载赛季列表失败：", error);
    allSeasons = activeSeason ? [{ id: activeSeason.id, name: activeSeason.name }] : [];
    renderBackfillForm();
    return;
  }

  allSeasons = data || [];

  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
}

async function loadPlayersForSeason(seasonId) {
  if (!seasonId) {
    backfillPlayers = [];
    renderBackfillForm();
    return;
  }

  const { data, error } = await db
    .from("season_players")
    .select(`
      player_id,
      player_rank,
      players (
        display_name
      )
    `)
    .eq("season_id", seasonId)
    .order("player_id", { ascending: true });

  if (error) {
    console.error("加载补录赛季选手失败：", error);
    backfillPlayers = [];
    renderBackfillForm();
    setBackfillMessage(`加载赛季选手失败：${error.message}`, true);
    return;
  }

  backfillPlayers = (data || []).map((row) => ({
    id: row.player_id,
    display_name: row.players?.display_name || "未知选手",
    player_rank: row.player_rank || null,
  })).sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"));

  renderBackfillForm();
}

async function loadActiveMatchDay() {
  let query = db
    .from("match_days")
    .select("id, season_id, match_date, started_at, closed_at, is_active, note")
    .eq("is_active", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("加载比赛日失败：", error);
    activeMatchDay = null;
    renderMatchDayStatus();
    return;
  }

  activeMatchDay = data || null;
  renderMatchDayStatus();
}

async function loadSeasonPlayers() {
  const playersResult = await db
    .from("players")
    .select("id, display_name, reward_floor_bonus, reward_extra_points")
    .order("display_name", { ascending: true });

  if (playersResult.error) {
    seasonPlayers = [];
    renderSeasonPlayersPanel();
    renderSignupOptions();
    renderMatchForm();
    setMessage(`加载玩家失败：${playersResult.error.message}`, true);
    return;
  }

  let participantIds = new Set();
  let participantRanks = new Map();
  let rewardStats = new Map();

  if (activeSeason?.id) {
    const participantsResult = await db
      .from("season_players")
      .select("player_id, player_rank")
      .eq("season_id", activeSeason.id);

    if (!participantsResult.error) {
      participantIds = new Set((participantsResult.data || []).map((row) => row.player_id));
      participantRanks = new Map((participantsResult.data || []).map((row) => [row.player_id, row.player_rank]));
    }

    const statsResult = await db
      .from("season_player_stats")
      .select("player_id, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points")
      .eq("season_id", activeSeason.id);

    if (!statsResult.error) {
      rewardStats = new Map((statsResult.data || []).map((row) => [row.player_id, row]));
    }
  }

  seasonPlayers = (playersResult.data || []).map((player) => {
    const stats = rewardStats.get(player.id);
    return {
      id: player.id,
      is_in_season: participantIds.has(player.id),
      player_rank: participantRanks.get(player.id) || null,
      display_name: player.display_name,
      reward_points: stats?.reward_points ?? (20 + Number(player.reward_floor_bonus ?? 0) + Number(player.reward_extra_points ?? 0)),
      reward_minimum: 20 + Number(stats?.reward_floor_bonus ?? player.reward_floor_bonus ?? 0) + Number(stats?.reward_double_bonus ?? 0),
      reward_extra_points: stats?.reward_extra_points ?? player.reward_extra_points ?? 0,
    };
  });

  seasonPlayers.sort((a, b) => {
    if (a.is_in_season !== b.is_in_season) {
      return a.is_in_season ? -1 : 1;
    }

    const rankOrder = { core: 0, support: 1 };
    const aRank = rankOrder[a.player_rank] ?? 9;
    const bRank = rankOrder[b.player_rank] ?? 9;
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.display_name.localeCompare(b.display_name, "zh-CN");
  });

  renderSeasonPlayersPanel();
}

async function loadTodayPlayers() {
  let query = db
    .from("current_day_players")
    .select("id, season_id, play_date, player_id, display_name, source, note, created_at")
    .order("created_at", { ascending: true });

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  let { data, error } = await query;

  if (error && error.message.includes("season_id")) {
    ({ data, error } = await db
      .from("current_day_players")
      .select("id, play_date, player_id, display_name, source, note, created_at")
      .order("created_at", { ascending: true }));
  }

  if (error) {
    console.error("加载当日名单失败：", error);
    todayPlayers = [];
    renderTodayPlayers();
    return;
  }

  todayPlayers = data || [];
  renderTodayPlayers();
}

async function refreshPlayerDrivenViews() {
  await loadActiveMatchDay();
  await loadSeasonPlayers();
  await loadSeasons();
  await loadTodayPlayers();
  renderQueue(queueEntries);
  renderSignupOptions();
  renderMatchForm();
  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
  await loadPlayersForSeason(backfillSeasonSelect.value);
  if (isMatchFormOpen) {
    refreshMatchSelectOptions();
  }
  if (isBackfillFormOpen) {
    refreshBackfillSelectOptions();
  }
  setMatchFormOpen(isMatchFormOpen);
  setBackfillFormOpen(isBackfillFormOpen);
}

async function loadLeaderboard() {
  let result = await db
    .from("current_season_leaderboard")
    .select("player_id, display_name, score, games_played, reward_points, reward_minimum, reward_extra_points")
    .order("score", { ascending: false })
    .order("reward_points", { ascending: false })
    .order("display_name", { ascending: true });

  if (result.error) {
    result = await db
      .from("leaderboard")
      .select("id, display_name, score, games_played, reward_points")
      .order("score", { ascending: false })
      .order("reward_points", { ascending: false })
      .order("display_name", { ascending: true });
  }

  if (result.error) {
    result = await db
      .from("players")
      .select("id, display_name, score, games_played, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points")
      .order("score", { ascending: false })
      .order("reward_points", { ascending: false })
      .order("display_name", { ascending: true });
  }

  if (result.error) {
    console.error("加载排行榜失败：", result.error);
    setMessage(`加载排行榜失败：${result.error.message}`, true);
    updateSeasonRewardTotal(null);
    renderLeaderboard([]);
    return;
  }

  const leaderboardData = (result.data || []).map((player) => ({
    ...player,
    reward_minimum: player.reward_minimum ?? (20 + Number(player.reward_floor_bonus ?? 0) + Number(player.reward_double_bonus ?? 0)),
    reward_extra_points: player.reward_extra_points ?? 0,
  }));
  renderLeaderboard(leaderboardData);
}

async function loadRecentMatches() {
  let query = db
    .from("match_day_recent_matches")
    .select("match_id, match_day_id, season_id, match_date, day_is_active, winner_team, note, created_at, players, double_downs")
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  let { data, error } = await query;

  if (error && (error.message.includes("season_id") || error.message.includes("double_downs"))) {
    ({ data, error } = await db
      .from("recent_matches")
      .select("match_id, winner_team, note, created_at, players")
      .order("created_at", { ascending: false })
      .limit(100));
  }

  if (error) {
    console.error("加载最近比赛失败：", error);
    recentMatchesData = [];
    renderRecentMatches([]);
    return;
  }

  renderRecentMatches(data || []);
}

async function resetCurrentSeason() {
  if (!activeSeason?.id) {
    setMessage("当前没有可重置的赛季。", true);
    return;
  }

  const confirmed = window.confirm(
    `确认重置 ${activeSeason.name} 吗？这会清空本赛季报名、当日名单、比赛日、比赛记录和赛季积分。`
  );

  if (!confirmed) {
    return;
  }

  const confirmText = window.prompt('请输入“重置赛季”以继续执行：', "");

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
  setMessage(`已重置 ${activeSeason.name}，并从总表同步了 ${data ?? 0} 名选手。`);
  await loadRewardLogs();
  requestImmediateRefresh({
    seasonContext: true,
  });
}

async function setSeasonPlayerRank(playerId, playerName, playerRank) {
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const currentPlayer = seasonPlayers.find((player) => player.id === playerId);
  const nextRank = currentPlayer?.player_rank === playerRank ? null : playerRank;

  setMessage(
    nextRank
      ? `正在将 ${playerName} 设为${nextRank === "core" ? "核心" : "辅助"}...`
      : `正在取消 ${playerName} 的赛季参赛...`
  );

  const { data, error } = await db.rpc("set_season_player_rank", {
    p_player_id: playerId,
    p_season_id: activeSeason.id,
    p_player_rank: nextRank,
  });

  if (error) {
    setMessage(`更新赛季选手身份失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  setMessage(
    data
      ? `${playerName} 已设为${data === "core" ? "核心" : "辅助"}。`
      : `${playerName} 已取消当前赛季参赛。`
  );
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
    leaderboard: true,
  });
}

async function setSeasonKoi() {
  if (!activeSeason?.id) {
    setMessage("当前没有可设置的赛季。", true);
    return;
  }

  const playerId = koiPlayerSelect.value || null;
  const playerName = seasonPlayers.find((player) => player.id === playerId)?.display_name || "本赛季锦鲤";
  const isCurrentKoi = !playerId;
  const confirmed = window.confirm(
    isCurrentKoi
      ? "确认取消当前赛季锦鲤吗？"
      : `确认将 ${playerName} 设为 ${activeSeason.name} 的赛季锦鲤吗？`
  );

  if (!confirmed) {
    return;
  }

  setMessage(
    isCurrentKoi ? "正在取消赛季锦鲤并重算积分..." : `正在设置 ${playerName} 为赛季锦鲤并重算积分...`
  );

  const { error } = await db.rpc("set_season_koi", {
    p_player_id: playerId,
    p_season_id: activeSeason.id,
  });

  if (error) {
    setMessage(`设置赛季锦鲤失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  setMessage(
    isCurrentKoi
      ? "已取消赛季锦鲤，并按当前规则重算积分。"
      : `${playerName} 已设为赛季锦鲤，并按当前规则重算积分。`
  );
  requestImmediateRefresh({
    seasonContext: true,
  });
}

async function loadQueue() {
  let query = db
    .from("signup_queue")
    .select(`
      id,
      created_at,
      player_id,
      is_active,
      status,
      cancelled_at,
      season_id,
      players (
        display_name
      )
    `)
    .order("created_at", { ascending: true });

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  let { data, error } = await query;

  if (error && error.message.includes("season_id")) {
    ({ data, error } = await db
      .from("signup_queue")
      .select(`
        id,
        created_at,
        player_id,
        is_active,
        status,
        cancelled_at,
        players (
          display_name
        )
      `)
      .order("created_at", { ascending: true }));
  }

  if (error) {
    setMessage(`加载队列失败：${error.message}`, true);
    return;
  }

  queueEntries = data || [];
  renderQueue(queueEntries);
  renderSignupOptions();
}

async function signup() {
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

  const { error } = await db.from("signup_queue").insert([payload]);

  if (error) {
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
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function clearSignupQueueForTesting() {
  const confirmed = window.confirm("确认清空当前赛季的全部报名队列记录吗？这会删除报名中、已取消和已确认记录。");

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
  requestImmediateRefresh({ queue: true });
}

async function clearTodayPlayersForTesting() {
  const confirmed = window.confirm("确认清空当前赛季的当日选手名单吗？");

  if (!confirmed) {
    return;
  }

  clearTodayPlayersBtn.disabled = true;
  setMessage("正在清空当日选手名单...");

  const { data, error } = await db.rpc("clear_today_players_for_testing", {
    p_season_id: activeSeason?.id || null,
  });

  clearTodayPlayersBtn.disabled = false;

  if (error) {
    setMessage(`清空当日选手名单失败：${error.message}`, true);
    return;
  }

  setMessage(`已清空当日选手名单，共删除 ${data ?? 0} 条记录。`);
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

async function startMatchDay() {
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
  requestImmediateRefresh({
    playerDriven: true,
    recentMatches: true,
  });
}

async function cancelMatchDay() {
  const confirmed = window.confirm("确认取消当前已发起的比赛吗？这会清空当前赛季的报名队列和当日选手名单。");

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
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
    recentMatches: true,
  });
}

async function addTodayPlayer() {
  const playerId = todayAddPlayerSelect.value;

  if (!playerId) {
    setMessage("请先选择要临时添加的选手。", true);
    return;
  }

  const payload = {
    player_id: playerId,
    play_date: getBeijingBusinessDateString(),
    source: "manual",
  };

  if (activeSeason?.id) {
    payload.season_id = activeSeason.id;
  }

  addTodayPlayerBtn.disabled = true;
  setMessage("正在添加当日选手...");

  const { error } = await db.from("daily_player_roster").insert([payload]);
  addTodayPlayerBtn.disabled = false;

  if (error) {
    setMessage(`添加当日选手失败：${error.message}`, true);
    return;
  }

  setMessage("已加入当日选手名单。");
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
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
  if (!entryId) {
    setMessage("缺少就位记录，无法取消。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMessage(`正在取消 ${playerName || "该玩家"} 的就位状态...`);

  const { error } = await db.from("daily_player_roster").delete().eq("id", entryId);

  if (error) {
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

async function removeTodayPlayer(entryId, buttonEl) {
  if (!entryId) return;

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMessage("正在移出当日名单...");

  const { error } = await db.from("daily_player_roster").delete().eq("id", entryId);

  if (error) {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(`移出当日名单失败：${error.message}`, true);
    return;
  }

  setMessage("已移出当日名单。");
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
  });
}

function getSelectionStateByFormType(formType) {
  return formType === "backfill"
    ? { selections: backfillTeamSelections, assignments: backfillHeroAssignments }
    : { selections: matchTeamSelections, assignments: matchHeroAssignments };
}

function rerenderSelectionsByFormType(formType) {
  if (formType === "backfill") {
    refreshBackfillSelectOptions();
    renderDoublePanel("backfill");
    return;
  }

  refreshMatchSelectOptions();
  renderDoublePanel("match");
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
  heroPickerModal.hidden = false;
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
  heroPickerModal.hidden = true;
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
    saveHeroBtn.disabled = true;
    clearHeroBtn.disabled = true;
    setHeroPickerMessage("正在保存英雄...");

    const { error } = await db.rpc("update_match_result_hero", {
      p_match_id: heroPickerState.matchId,
      p_player_id: heroPickerState.playerId,
      p_hero_name: normalizedHero,
    });

    saveHeroBtn.disabled = false;
    clearHeroBtn.disabled = false;

    if (error) {
      setHeroPickerMessage(`保存英雄失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
      return;
    }

    rememberOpenRecentMatchGroups();
    updateRecentMatchHeroLocally(heroPickerState.matchId, heroPickerState.playerId, normalizedHero);
    closeHeroPicker();
    renderRecentMatches(recentMatchesData);
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
  if (todayPlayers.length < TEAM_SIZE * 2) {
    return "当日名单不足 10 人，无法记录比赛。";
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

function validateBackfillPlayers(teamAIds, teamBIds) {
  if (!backfillSeasonSelect.value) {
    return "请选择赛季。";
  }

  if (!backfillDateInput.value) {
    return "请选择补录比赛日期。";
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

async function recordMatch() {
  const teamAIds = getSelectedTeamIds("teamA");
  const teamBIds = getSelectedTeamIds("teamB");
  const winner = winnerSelect.value || null;
  const { error: doubleError, payload: doubleDownPayload } = buildDoubleDownPayload("match");
  const validationError = validateMatchPlayers(teamAIds, teamBIds);

  if (validationError) {
    setMatchMessage(validationError, true);
    return;
  }

  if (doubleError) {
    setMatchMessage(doubleError, true);
    return;
  }

  recordMatchBtn.disabled = true;
  setMatchMessage("正在记录比赛...");

  const { data: matchId, error } = await db.rpc("record_match_result", {
    p_team_a_player_ids: teamAIds,
    p_team_b_player_ids: teamBIds,
    p_winner_team: winner,
    p_note: matchNoteInput.value.trim() || null,
    p_created_by: null,
    p_season_id: activeSeason?.id || null,
    p_double_downs: doubleDownPayload,
  });

  recordMatchBtn.disabled = false;

  if (error) {
    setMatchMessage(
      `记录比赛失败：${error.message}。请先在 Supabase 执行对应 SQL。`,
      true
    );
    return;
  }

  const matchHeroRows = [
    ...teamAIds.map((playerId) => ({ player_id: playerId, hero_name: matchHeroAssignments[playerId] || null })),
    ...teamBIds.map((playerId) => ({ player_id: playerId, hero_name: matchHeroAssignments[playerId] || null })),
  ].filter((item) => item.hero_name);

  if (matchHeroRows.length) {
    const { error: heroError } = await db.rpc("update_match_result_heroes", {
      p_match_id: matchId,
      p_assignments: matchHeroRows,
    });

    if (heroError) {
      setMatchMessage(`比赛已保存，但英雄信息保存失败：${heroError.message}。请先在 Supabase 执行对应 SQL。`, true);
    }
  }

  clearMatchForm();
  setMatchFormOpen(false);
  renderMatchForm();
  setMatchMessage(winner ? "比赛记录成功，积分榜已刷新。" : "比赛记录已保存，当前未计分，补填胜负后才会变动积分。");
  requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
}

async function recordBackfillMatch() {
  const teamAIds = [...backfillTeamSelections.teamA];
  const teamBIds = [...backfillTeamSelections.teamB];
  const winner = backfillWinnerSelect.value || null;
  const isEditing = Boolean(editingMatchId);
  const { error: doubleError, payload: doubleDownPayload } = buildDoubleDownPayload("backfill");
  const heroAssignments = [
    ...teamAIds.map((playerId) => ({ player_id: playerId, hero_name: backfillHeroAssignments[playerId] || null })),
    ...teamBIds.map((playerId) => ({ player_id: playerId, hero_name: backfillHeroAssignments[playerId] || null })),
  ];
  const validationError = validateBackfillPlayers(teamAIds, teamBIds);

  if (validationError) {
    setBackfillMessage(validationError, true);
    return;
  }

  if (doubleError) {
    setBackfillMessage(doubleError, true);
    return;
  }

  recordBackfillBtn.disabled = true;
  setBackfillMessage(isEditing ? "正在保存比赛修改..." : "正在补录比赛...");

  let matchId = editingMatchId;
  let error = null;

  if (isEditing) {
    ({ error } = await db.rpc("update_match_result", {
      p_match_id: editingMatchId,
      p_team_a_player_ids: teamAIds,
      p_team_b_player_ids: teamBIds,
      p_winner_team: winner,
      p_note: backfillMatchNoteInput.value.trim() || null,
      p_created_by: null,
      p_season_id: backfillSeasonSelect.value,
      p_match_date: backfillDateInput.value,
      p_assignments: heroAssignments,
      p_double_downs: doubleDownPayload,
    }));
  } else {
    ({ data: matchId, error } = await db.rpc("record_match_result_backfill", {
      p_team_a_player_ids: teamAIds,
      p_team_b_player_ids: teamBIds,
      p_winner_team: winner,
      p_note: backfillMatchNoteInput.value.trim() || null,
      p_created_by: null,
      p_season_id: backfillSeasonSelect.value,
      p_match_date: backfillDateInput.value,
      p_double_downs: doubleDownPayload,
    }));
  }

  recordBackfillBtn.disabled = false;

  if (error) {
    setBackfillMessage(`${isEditing ? "修改比赛失败" : "补录比赛失败"}：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  const backfillHeroRows = heroAssignments.filter((item) => item.hero_name);

  if (!isEditing && backfillHeroRows.length) {
    const { error: heroError } = await db.rpc("update_match_result_heroes", {
      p_match_id: matchId,
      p_assignments: backfillHeroRows,
    });

    if (heroError) {
      setBackfillMessage(`补录比赛已保存，但英雄信息保存失败：${heroError.message}。请先在 Supabase 执行对应 SQL。`, true);
    }
  }

  clearBackfillForm();
  setBackfillFormOpen(false);
  renderBackfillForm();
  setMessage(
    isEditing
      ? (winner ? "比赛修改成功，积分已按全部记录重算。" : "比赛修改成功，当前未计分，补填胜负后才会变动积分。")
      : (winner ? "历史比赛补录成功。" : "历史比赛已归档，当前未计分，补填胜负后才会变动积分。")
  );
  requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
}

async function startEditingMatch(matchId) {
  rememberOpenRecentMatchGroups();
  const match = recentMatchesData.find((item) => item.match_id === matchId);

  if (!match) {
    setMessage("未找到要编辑的比赛记录。", true);
    return;
  }

  if (!match.season_id) {
    setMessage("这条比赛记录缺少赛季信息，暂时无法编辑。请先执行最新 SQL。", true);
    return;
  }

  const players = parseRecentMatchPlayers(match.players);
  const doubleDowns = parseRecentMatchPlayers(match.double_downs);
  const teamAIds = players.filter((player) => player.team === "A").map((player) => player.player_id);
  const teamBIds = players.filter((player) => player.team === "B").map((player) => player.player_id);

  if (teamAIds.length !== TEAM_SIZE || teamBIds.length !== TEAM_SIZE) {
    setMessage("这条比赛记录的队伍人数异常，暂时无法编辑。", true);
    return;
  }

  backfillSeasonSelect.value = match.season_id;
  backfillDateInput.value = match.match_date || formatArchiveDate(match.created_at) || "";
  await loadPlayersForSeason(match.season_id);

  clearBackfillForm();
  editingMatchId = matchId;
  backfillSeasonSelect.value = match.season_id;
  backfillDateInput.value = match.match_date || formatArchiveDate(match.created_at) || "";
  setWinnerSelection("backfill", match.winner_team || "");
  backfillMatchNoteInput.value = match.note || "";
  backfillTeamSelections = {
    teamA: teamAIds,
    teamB: teamBIds,
  };
  backfillHeroAssignments = Object.fromEntries(
    players.map((player) => [player.player_id, player.hero_name || ""])
  );
  backfillDoubleState = {
    teamAUserId: doubleDowns.find((item) => item.mode === "team" && item.target_team === "A")?.user_player_id || "",
    teamBUserId: doubleDowns.find((item) => item.mode === "team" && item.target_team === "B")?.user_player_id || "",
    singles: doubleDowns
      .filter((item) => item.mode === "single")
      .map((item) => ({
        id: `saved-${item.user_player_id}-${item.target_player_id}`,
        user_player_id: item.user_player_id || "",
        target_player_id: item.target_player_id || "",
      })),
  };

  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderBackfillForm();
  setBackfillMessage("已载入比赛记录，可以直接修改并保存。");
  backfillFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteMatch(matchId, buttonEl) {
  if (!matchId) return;

  const confirmed = window.confirm("确认删除这场比赛记录吗？删除后会按全部比赛记录重新计算积分。");

  if (!confirmed) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMessage("正在删除比赛记录并重算积分...");
  setMatchMessage("正在删除比赛记录并重算积分...");

  const { error } = await db.rpc("delete_match_and_recalculate", {
    p_match_id: matchId,
  });

  if (error) {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMessage(`删除比赛失败：${error.message}`, true);
    setMatchMessage(`删除比赛失败：${error.message}`, true);
    return;
  }

  setMessage("比赛记录已删除，积分已按全部比赛记录重算。");
  setMatchMessage("比赛记录已删除，积分已按全部比赛记录重算。");
  requestImmediateRefresh({
    leaderboard: true,
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
          queue: true,
          leaderboard: true,
          rewardLogs: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "season_players" },
      () => {
        scheduleRefresh({ playerDriven: true });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "season_player_stats" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          leaderboard: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "signup_queue" },
      () => {
        scheduleRefresh({ queue: true });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_days" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "daily_player_roster" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          queue: true,
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
      { event: "*", schema: "public", table: "match_results" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reward_donations" },
      () => {
        scheduleRefresh({
          playerDriven: true,
          leaderboard: true,
          rewardLogs: true,
        });
      }
    )
    .subscribe((status) => {
      console.info("[realtime] app-realtime status:", status);
    });
}

seasonToggleBtn.addEventListener("click", () => {
  setSeasonPanelOpen(!isSeasonPanelOpen);
});
resetSeasonBtn.addEventListener("click", resetCurrentSeason);
startMatchDayBtn.addEventListener("click", async () => {
  if (activeMatchDay) {
    await cancelMatchDay();
    return;
  }

  await startMatchDay();
});
confirmQueueBtn.addEventListener("click", confirmQueueToTodayPlayers);
clearQueueBtn.addEventListener("click", clearSignupQueueForTesting);
addTodayPlayerBtn.addEventListener("click", addTodayPlayer);
clearTodayPlayersBtn.addEventListener("click", clearTodayPlayersForTesting);
recordMatchBtn.addEventListener("click", recordMatch);
recordBackfillBtn.addEventListener("click", recordBackfillMatch);

openMatchFormBtn.addEventListener("click", () => {
  clearMatchForm();
  setMatchFormOpen(true);
  setBackfillFormOpen(false);
  renderMatchForm();
});

openBackfillFormBtn.addEventListener("click", async () => {
  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
  backfillDateInput.value = backfillDateInput.value || getBeijingBusinessDateString();
  await loadPlayersForSeason(backfillSeasonSelect.value);
  clearBackfillForm();
  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderBackfillForm();
});

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

  const addDoubleBtn = event.target.closest('[data-role="double-add"]');
  if (addDoubleBtn) {
    matchDoubleState.singles.push(createEmptySingleDoubleEntry());
    renderDoublePanel("match");
    return;
  }

  const removeDoubleBtn = event.target.closest('[data-role="double-remove"]');
  if (removeDoubleBtn) {
    matchDoubleState.singles = matchDoubleState.singles.filter((entry) => entry.id !== removeDoubleBtn.dataset.entryId);
    renderDoublePanel("match");
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

matchFormPanel.addEventListener("change", (event) => {
  if (event.target.matches('[data-role="double-team-user"]')) {
    matchDoubleState[event.target.dataset.team === "A" ? "teamAUserId" : "teamBUserId"] = event.target.value || "";
    return;
  }

  if (event.target.matches('[data-role="double-single-user"], [data-role="double-single-target"]')) {
    const entry = matchDoubleState.singles.find((item) => item.id === event.target.dataset.entryId);
    if (!entry) return;
    if (event.target.matches('[data-role="double-single-user"]')) {
      entry.user_player_id = event.target.value || "";
    } else {
      entry.target_player_id = event.target.value || "";
    }
  }
});

backfillFormPanel.addEventListener("change", async (event) => {
  if (event.target === backfillSeasonSelect) {
    clearBackfillForm();
    await loadPlayersForSeason(backfillSeasonSelect.value);
    return;
  }

  if (event.target.matches('[data-role="double-team-user"]')) {
    backfillDoubleState[event.target.dataset.team === "A" ? "teamAUserId" : "teamBUserId"] = event.target.value || "";
    return;
  }

  if (event.target.matches('[data-role="double-single-user"], [data-role="double-single-target"]')) {
    const entry = backfillDoubleState.singles.find((item) => item.id === event.target.dataset.entryId);
    if (!entry) return;
    if (event.target.matches('[data-role="double-single-user"]')) {
      entry.user_player_id = event.target.value || "";
    } else {
      entry.target_player_id = event.target.value || "";
    }
  }
});

backfillFormPanel.addEventListener("click", (event) => {
  const winnerToggle = event.target.closest('[data-role="winner-toggle"]');
  if (winnerToggle) {
    toggleWinnerSelection(winnerToggle.dataset.formType || "backfill", winnerToggle.dataset.winner || "");
    return;
  }

  const addDoubleBtn = event.target.closest('[data-role="double-add"]');
  if (addDoubleBtn) {
    backfillDoubleState.singles.push(createEmptySingleDoubleEntry());
    renderDoublePanel("backfill");
    return;
  }

  const removeDoubleBtn = event.target.closest('[data-role="double-remove"]');
  if (removeDoubleBtn) {
    backfillDoubleState.singles = backfillDoubleState.singles.filter((entry) => entry.id !== removeDoubleBtn.dataset.entryId);
    renderDoublePanel("backfill");
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

todayPlayersList.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove-today-player-btn");
  if (!button) return;

  await removeTodayPlayer(button.dataset.entryId, button);
});

recentMatchesList.addEventListener("click", async (event) => {
  const playerButton = event.target.closest('[data-role="saved-hero-picker"]');
  if (playerButton) {
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

seasonPlayersList.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-role="season-rank"]');
  if (!button) return;

  await setSeasonPlayerRank(button.dataset.playerId, button.dataset.playerName, button.dataset.rank);
});

seasonRewardTotal.addEventListener("click", () => {
  setRewardPanelOpen(!isRewardPanelOpen);
  renderRewardPlayerOptions();
  updateRewardMinimumHint();
  if (isRewardPanelOpen) {
    loadRewardLogs();
  }
});

closeRewardPanelBtn.addEventListener("click", () => {
  setRewardPanelOpen(false);
});

rewardPlayerSelect.addEventListener("change", () => {
  if (rewardPlayerSelect.value) {
    rewardOutsideNameInput.value = "";
  }
  updateRewardMinimumHint();
});

rewardOutsideNameInput.addEventListener("input", () => {
  if (rewardOutsideNameInput.value.trim()) {
    rewardPlayerSelect.value = "";
  }
  updateRewardMinimumHint();
});

addRewardBtn.addEventListener("click", addRewardExtra);

setKoiBtn.addEventListener("click", setSeasonKoi);

rewardExtraInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await addRewardExtra();
});

matchStartTimeInput.addEventListener("blur", () => {
  matchStartTimeInput.value = normalizeTimeInput(matchStartTimeInput.value);
});

rewardLogsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".cancel-reward-log-btn");
  if (!button) return;

  await cancelRewardDonation(
    button.dataset.donationId,
    button.dataset.playerName,
    button
  );
});

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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !heroPickerModal.hidden) {
    closeHeroPicker();
  }
});

document.addEventListener("click", (event) => {
  if (
    !heroPickerModal.hidden &&
    !heroSearchInput.contains(event.target) &&
    !heroSearchSuggestions.contains(event.target)
  ) {
    heroSearchSuggestions.hidden = true;
    heroSearchSuggestions.innerHTML = "";
  }
});

async function init() {
  try {
    renderLastUpdatedTime();
    setMatchFormOpen(false);
    setBackfillFormOpen(false);
    setSeasonPanelOpen(false);
    setRewardPanelOpen(false);
    renderHeroOptions();
    matchStartTimeInput.value = formatTime24(readStoredMatchDayStartTime()?.startTime || "");
    backfillDateInput.value = getBeijingBusinessDateString();
    renderMatchForm();
    renderBackfillForm();
    renderSeasonPlayersPanel();
    renderRewardLogs();
    updateSeasonInfo();
    renderMatchDayStatus();
    await loadActiveSeason();
    await refreshPlayerDrivenViews();
    await loadQueue();
    await loadLeaderboard();
    await loadRewardLogs();
    await loadRecentMatches();
    subscribeRealtime();
  } finally {
    hideLoadingScreen();
  }
}

init();
