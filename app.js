const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";
const TEAM_SIZE = 5;
const LOADING_SCREEN_MIN_MS = 900;
const DAY_MS = 24 * 60 * 60 * 1000;
const HARDCORE_TAG_MIN_GAMES = 10;
const HARDCORE_TAG_LOVE_CAP_GAMES = 20;
const HARDCORE_TAG_WIN_RATE_MAX = 40;
const HARDCORE_TAG_QUANTILE = 0.35;
const HARDCORE_TAG_SHOW_THRESHOLD = 0.35;
const ADMIN_ACCESS_PASSWORD = "我是大魔导师";
const SCORER_ACCESS_PASSWORD = "夜神夜神夜神";
const ACCESS_SESSION_STORAGE_KEY = "nd_dota_access_session_v1";
const REMEMBERED_SCORER_PLAYER_KEY = "nd_dota_remembered_scorer_player_v1";
const SKIP_NEXT_SCORER_RECONNECT_KEY = "nd_dota_skip_next_scorer_reconnect_v1";
const DEVICE_ID_STORAGE_KEY = "nd_dota_device_id_v1";
const ADMIN_ACTION_LOGS_STORAGE_PREFIX = "nd_dota_admin_action_logs_";
const LEADERBOARD_COMPACT_STORAGE_KEY = "nd_dota_leaderboard_compact_v1";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loadingScreen = document.getElementById("loadingScreen");
const lastUpdatedText = document.getElementById("lastUpdatedText");
const signupPlayerGrid = document.getElementById("signupPlayerGrid");
const signupEmpty = document.getElementById("signupEmpty");
const messageEl = document.getElementById("message");
const seasonToggleBtn = document.getElementById("seasonToggleBtn");
const adminSecretTrigger = document.getElementById("adminSecretTrigger");
const adminLogoTrigger = document.getElementById("adminLogoTrigger");
const scorerModeBtn = document.getElementById("scorerModeBtn");
const adminModeBtn = document.getElementById("adminModeBtn");
const scorerPanel = document.getElementById("scorerPanel");
const adminPanel = document.getElementById("adminPanel");
const closeScorerPanelBtn = document.getElementById("closeScorerPanelBtn");
const closeAdminPanelBtn = document.getElementById("closeAdminPanelBtn");
const scorerExitModeBtn = document.getElementById("scorerExitModeBtn");
const adminExitModeBtn = document.getElementById("adminExitModeBtn");
const scorerPanelSummary = document.getElementById("scorerPanelSummary");
const scorerPanelStatusText = document.getElementById("scorerPanelStatusText");
const adminPanelSummary = document.getElementById("adminPanelSummary");
const scorerMembersCount = document.getElementById("scorerMembersCount");
const scorerMembersList = document.getElementById("scorerMembersList");
const adminActionLogsList = document.getElementById("adminActionLogsList");
const adminActionLogsEmpty = document.getElementById("adminActionLogsEmpty");
const adminAddScorerSelect = document.getElementById("adminAddScorerSelect");
const adminAddScorerBtn = document.getElementById("adminAddScorerBtn");
const scorerPanelMessage = document.getElementById("scorerPanelMessage");
const adminPanelMessage = document.getElementById("adminPanelMessage");
const adminClearQueueBtn = document.getElementById("adminClearQueueBtn");
const adminClearTodayPlayersBtn = document.getElementById("adminClearTodayPlayersBtn");
const adminResetSeasonBtn = document.getElementById("adminResetSeasonBtn");
const adminClearScorerRememberBtn = document.getElementById("adminClearScorerRememberBtn");
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
const signupAllBtn = document.getElementById("signupAllBtn");
const confirmQueueBtn = document.getElementById("confirmQueueBtn");
const clearQueueBtn = document.getElementById("clearQueueBtn");
const queueList = document.getElementById("queueList");
const queueEmpty = document.getElementById("queueEmpty");
const todayPlayersList = document.getElementById("todayPlayersList");
const todayPlayersEmpty = document.getElementById("todayPlayersEmpty");
const todayPlayersCount = document.getElementById("todayPlayersCount");
const leaderboardCard = document.getElementById("leaderboardCard");
const leaderboardCompactBtn = document.getElementById("leaderboardCompactBtn");
const leaderboardBody = document.getElementById("leaderboardBody");
const openMatchFormBtn = document.getElementById("openMatchFormBtn");
const openBackfillFormBtn = document.getElementById("openBackfillFormBtn");
const recordEntrySection = document.getElementById("recordEntrySection");
const closeMatchFormBtn = document.getElementById("closeMatchFormBtn");
const closeBackfillFormBtn = document.getElementById("closeBackfillFormBtn");
const matchFormPanel = document.getElementById("matchFormPanel");
const backfillFormPanel = document.getElementById("backfillFormPanel");
const recordEntryTitle = document.getElementById("recordEntryTitle");
const matchMessageEl = document.getElementById("matchMessage");
const backfillMessageEl = document.getElementById("backfillMessage");
const seasonInfoEl = document.getElementById("seasonInfo");
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
const accessPasswordInput = document.getElementById("accessPasswordInput");
const accessScorerPicker = document.getElementById("accessScorerPicker");
const accessScorerSelect = document.getElementById("accessScorerSelect");
const accessScorerChips = document.getElementById("accessScorerChips");
const confirmAccessBtn = document.getElementById("confirmAccessBtn");
const accessMessage = document.getElementById("accessMessage");

let seasonPlayers = [];
let todayPlayers = [];
let queueEntries = [];
let activeSeason = null;
let activeMatchDay = null;
let allSeasons = [];
let backfillPlayers = [];
let leaderboardPlayers = [];
let rewardLogs = [];
let rewardCardUsageSummary = new Map();
let seasonPlayerRewardTotal = 0;
let externalRewardTotal = 0;
let recentMatchesData = [];
let recentMatchDayGroupsData = [];
let roleMembersSupportAutoReconnect = true;
let openRecentMatchGroups = new Set();
let isMatchFormOpen = false;
let isBackfillFormOpen = false;
let isSeasonPanelOpen = false;
let isRewardPanelOpen = false;
let isScorerPanelOpen = false;
let isAdminPanelOpen = false;
let isLeaderboardCompact = false;
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
let teamDoublePickerOpen = {
  match: { A: false, B: false },
  backfill: { A: false, B: false },
};
let singleDoublePickerOpen = {
  match: {},
  backfill: {},
};
let roleMembers = [];
let currentAccessSession = {
  role: "viewer",
  memberId: "",
  playerId: "",
};
currentAccessSession = readStoredAccessSession();
let accessModalMode = "scorer";
let heroPickerState = null;
let realtimeChannel = null;
let refreshTimer = null;
let refreshFlushPromise = null;
let placeholderEnsureAttemptKey = "";
const loadingStartedAt = Date.now();
const REFRESH_DEBOUNCE_MS = 150;
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
const refreshSuppressUntil = {
  seasonContext: 0,
  playerDriven: 0,
  queue: 0,
  leaderboard: 0,
  rewardLogs: 0,
  recentMatches: 0,
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

function getAdminActionLogsStorageKey() {
  return `${ADMIN_ACTION_LOGS_STORAGE_PREFIX}${getBeijingBusinessDateString()}`;
}

function cleanupExpiredAdminActionLogs() {
  const activeKey = getAdminActionLogsStorageKey();
  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith(ADMIN_ACTION_LOGS_STORAGE_PREFIX) && key !== activeKey) {
      window.localStorage.removeItem(key);
    }
  });
}

function readAdminActionLogs() {
  cleanupExpiredAdminActionLogs();
  try {
    const raw = window.localStorage.getItem(getAdminActionLogsStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAdminActionLogs(logs) {
  cleanupExpiredAdminActionLogs();
  window.localStorage.setItem(getAdminActionLogsStorageKey(), JSON.stringify(logs));
}

function getCurrentAccessActorLabel() {
  if (currentAccessSession.role === "admin") {
    return "管理员";
  }

  if (currentAccessSession.role === "scorer") {
    const scorerMember = getRoleMembersByRole("scorer").find((member) => member.id === currentAccessSession.memberId);
    if (scorerMember?.display_name) {
      return scorerMember.display_name;
    }
    const player = seasonPlayers.find((item) => item.id === currentAccessSession.playerId);
    if (player?.display_name) {
      return player.display_name;
    }
    return "记分员";
  }

  return "游客";
}

function appendAdminActionLog(action) {
  const text = String(action || "").trim();
  if (!text) return;
  const logs = readAdminActionLogs();
  logs.unshift({
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actor: getCurrentAccessActorLabel(),
    text,
    created_at: new Date().toISOString(),
  });
  writeAdminActionLogs(logs.slice(0, 100));
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

function getWinRateNumber(value, wins = 0, gamesPlayed = 0) {
  const numericValue = Number(value);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : (Number(gamesPlayed ?? 0) > 0 ? (Number(wins ?? 0) / Number(gamesPlayed ?? 0)) * 100 : 0);
  return Math.max(0, Math.min(100, resolvedValue));
}

function formatWinRateValue(value, wins = 0, gamesPlayed = 0) {
  const resolvedValue = getWinRateNumber(value, wins, gamesPlayed);
  return `${resolvedValue.toFixed(1).replace(/\.0$/, "")}%`;
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
  openMatchFormBtn.disabled = !isCurrentRoleScorer() || isMatchFormOpen;
}

function setBackfillFormOpen(isOpen) {
  isBackfillFormOpen = isOpen && isCurrentRoleScorer();
  backfillFormPanel.hidden = !isBackfillFormOpen;
  openBackfillFormBtn.disabled = !isCurrentRoleScorer() || isBackfillFormOpen;
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

function isCurrentRoleScorerOnly() {
  return currentAccessSession.role === "scorer";
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

function setAdminPanelOpen(isOpen) {
  isAdminPanelOpen = isOpen && isCurrentRoleAdmin();
  adminPanel.hidden = !isAdminPanelOpen;
  adminModeBtn.setAttribute("aria-expanded", String(isAdminPanelOpen));
  if (adminModeBtn) {
    adminModeBtn.textContent = isAdminPanelOpen ? "收起管理" : "管理员模式";
  }
  if (isAdminPanelOpen) {
    setScorerPanelOpen(false);
  }
}

function setLeaderboardCompactMode(isCompact) {
  isLeaderboardCompact = Boolean(isCompact);
  leaderboardCard?.classList.toggle("leaderboard-card-compact", isLeaderboardCompact);
  writeStoredLeaderboardCompactState(isLeaderboardCompact);
  if (leaderboardCompactBtn) {
    leaderboardCompactBtn.setAttribute("aria-pressed", String(isLeaderboardCompact));
    leaderboardCompactBtn.setAttribute("aria-label", isLeaderboardCompact ? "展开积分榜" : "收起积分榜");
    leaderboardCompactBtn.title = isLeaderboardCompact ? "展开积分榜" : "收起积分榜";
  }
}

function readStoredAccessSession() {
  try {
    const raw = window.localStorage.getItem(ACCESS_SESSION_STORAGE_KEY);
    if (!raw) return { role: "viewer", memberId: "", playerId: "" };
    const parsed = JSON.parse(raw);
    return {
      role: parsed?.role || "viewer",
      memberId: parsed?.memberId || "",
      playerId: parsed?.playerId || "",
    };
  } catch (error) {
    console.warn("读取本地身份失败：", error);
    return { role: "viewer", memberId: "", playerId: "" };
  }
}

function readRememberedScorerPlayerId() {
  try {
    return window.localStorage.getItem(REMEMBERED_SCORER_PLAYER_KEY) || "";
  } catch (error) {
    console.warn("读取本地记分员身份失败：", error);
    return "";
  }
}

function writeRememberedScorerPlayerId(playerId) {
  try {
    if (!playerId) {
      window.localStorage.removeItem(REMEMBERED_SCORER_PLAYER_KEY);
      return;
    }
    window.localStorage.setItem(REMEMBERED_SCORER_PLAYER_KEY, String(playerId));
  } catch (error) {
    console.warn("写入本地记分员身份失败：", error);
  }
}

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

function shouldSkipNextScorerReconnect() {
  try {
    return window.sessionStorage.getItem(SKIP_NEXT_SCORER_RECONNECT_KEY) === "true";
  } catch {
    return false;
  }
}

function setSkipNextScorerReconnect(shouldSkip) {
  try {
    if (!shouldSkip) {
      window.sessionStorage.removeItem(SKIP_NEXT_SCORER_RECONNECT_KEY);
      return;
    }
    window.sessionStorage.setItem(SKIP_NEXT_SCORER_RECONNECT_KEY, "true");
  } catch {}
}

function writeStoredAccessSession(session) {
  currentAccessSession = {
    role: session?.role || "viewer",
    memberId: session?.memberId || "",
    playerId: session?.playerId || "",
  };

  try {
    window.localStorage.setItem(ACCESS_SESSION_STORAGE_KEY, JSON.stringify(currentAccessSession));
  } catch (error) {
    console.warn("写入本地身份失败：", error);
  }
}

function clearStoredAccessSession() {
  currentAccessSession = { role: "viewer", memberId: "", playerId: "" };
  try {
    window.localStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn("清理本地身份失败：", error);
  }
}

function tryReconnectRememberedScorer() {
  if (shouldSkipNextScorerReconnect()) {
    setSkipNextScorerReconnect(false);
    return false;
  }
  const rememberedPlayerId = readRememberedScorerPlayerId();
  if (!rememberedPlayerId) return false;
  const localDeviceId = getOrCreateLocalDeviceId();
  const scorerMember = getRoleMembersByRole("scorer").find((member) => member.player_id === rememberedPlayerId);
  if (!scorerMember || !scorerMember.allow_auto_reconnect) return false;
  if (!scorerMember.auto_reconnect_device_id || scorerMember.auto_reconnect_device_id !== localDeviceId) return false;

  writeStoredAccessSession({
    role: "scorer",
    memberId: scorerMember.id,
    playerId: scorerMember.player_id || rememberedPlayerId,
  });
  renderRoleMembers();
  applyRolePermissions();
  setMessage(`${scorerMember.display_name || "记分员"} 已自动重连。`);
  return true;
}

function getPrimaryAdminMember() {
  return getRoleMembersByRole("admin")[0] || null;
}

function tryReconnectRememberedAdmin() {
  const adminMember = getPrimaryAdminMember();
  if (!adminMember || !adminMember.allow_auto_reconnect) return false;

  const localDeviceId = getOrCreateLocalDeviceId();
  if (!adminMember.auto_reconnect_device_id || adminMember.auto_reconnect_device_id !== localDeviceId) {
    return false;
  }

  writeStoredAccessSession({
    role: "admin",
    memberId: adminMember.id,
    playerId: "",
  });
  renderRoleMembers();
  applyRolePermissions();
  setMessage("管理员已自动重连。");
  return true;
}

function isCurrentRoleScorer() {
  return currentAccessSession.role === "scorer" || currentAccessSession.role === "admin";
}

function isCurrentRoleAdmin() {
  return currentAccessSession.role === "admin";
}

function canCurrentUserManageRoles() {
  return isCurrentRoleAdmin();
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

function getRoleMembersByRole(role) {
  return roleMembers.filter((member) => member.role === role);
}

function getAdminDisplayName(index) {
  return `管理员 ${String.fromCharCode(65 + index)}`;
}

function getScorerDisplayName(member) {
  return member.display_name || "未命名选手";
}

function renderAdminActionLogs() {
  if (!adminActionLogsList || !adminActionLogsEmpty) return;
  const logs = readAdminActionLogs();
  adminActionLogsList.innerHTML = logs.length
    ? logs.map((log) => `
      <div class="admin-action-log-card">
        <p class="admin-action-log-text">${escapeHtml(log.actor)} 在 ${escapeHtml(formatLocalTime(log.created_at) || "未知时间")} ${escapeHtml(log.text)}</p>
      </div>
    `).join("")
    : "";
  adminActionLogsEmpty.hidden = logs.length > 0;
}

function setAdminPanelMessage(text = "", isError = false) {
  if (!adminPanelMessage) return;
  adminPanelMessage.textContent = text;
  adminPanelMessage.className = isError ? "message error" : "message";
}

function setScorerPanelMessage(text = "", isError = false) {
  if (!scorerPanelMessage) return;
  scorerPanelMessage.textContent = text;
  scorerPanelMessage.className = isError ? "message error" : "message";
}

function setAccessMessage(text = "", isError = false) {
  if (!accessMessage) return;
  accessMessage.textContent = text;
  accessMessage.className = isError ? "message error" : "message";
}

function normalizeAccessPassword(value) {
  return String(value || "").normalize("NFKC").trim();
}

function applyAccessModalMode() {
  const isAdminMode = accessModalMode === "admin";
  if (accessModalTitle) {
    accessModalTitle.textContent = isAdminMode
      ? "噢！你居然直接来到了天地迷宫的大门！"
      : "你居然找到了阿哈利姆迷宫的入口！ 小强，你是从哪来的";
  }
  if (accessModalHint) {
    accessModalHint.textContent = isAdminMode
      ? "请输入管理员口令。"
      : "请输入口令。若为记分员，请在下方点选对应选手后再提交。";
  }
  if (accessScorerPicker) {
    accessScorerPicker.hidden = isAdminMode;
  }
}

function setAccessModalOpen(isOpen, mode = accessModalMode) {
  accessModalMode = mode;
  applyAccessModalMode();
  accessModal.hidden = !isOpen;
  if (!isOpen) {
    accessPasswordInput.value = "";
    accessScorerSelect.value = "";
    if (accessScorerChips) {
      accessScorerChips.querySelectorAll(".access-scorer-chip").forEach((chip) => {
        chip.classList.remove("access-scorer-chip-active");
      });
    }
    setAccessMessage("");
  }
}

function renderAccessScorerOptions() {
  if (!accessScorerSelect) return;
  const scorerPlayerIds = new Set(getRoleMembersByRole("scorer").map((member) => member.player_id));
  const players = seasonPlayers
    .slice()
    .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "", "zh-CN"));
  const options = ['<option value="">若为记分员，请选择对应选手</option>'];
  players.forEach((player) => {
    options.push(`<option value="${player.id}">${escapeHtml(player.display_name || "未命名选手")}</option>`);
  });
  accessScorerSelect.innerHTML = options.join("");
  if (accessScorerChips) {
    accessScorerChips.innerHTML = players.length
      ? players.map((player) => `
        <button
          type="button"
          class="access-scorer-chip${accessScorerSelect.value === player.id ? " access-scorer-chip-active" : ""}"
          data-player-id="${player.id}"
        >
          ${escapeHtml(player.display_name || "未命名选手")}${scorerPlayerIds.has(player.id) ? '<span class="access-scorer-chip-mark">记分员</span>' : ""}
        </button>
      `).join("")
      : '<p class="muted">当前还没有可选选手。</p>';
  }
}

function renderAdminAddScorerOptions() {
  if (!adminAddScorerSelect) return;
  const scorerPlayerIds = new Set(getRoleMembersByRole("scorer").map((member) => member.player_id));
  const options = ['<option value="">请选择总表选手</option>'];
  seasonPlayers
    .filter((player) => !scorerPlayerIds.has(player.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-CN"))
    .forEach((player) => {
      options.push(`<option value="${player.id}">${escapeHtml(player.display_name)}</option>`);
    });
  adminAddScorerSelect.innerHTML = options.join("");
}

function renderScorerPanelSummary() {
  if (!scorerPanelSummary || !scorerPanelStatusText) return;

  if (!isCurrentRoleScorerOnly()) {
    scorerPanelSummary.textContent = "当前未进入记录员模式。";
    scorerPanelStatusText.textContent = "记录员面板仅在记录员身份下显示。";
    return;
  }

  const actorLabel = getCurrentAccessActorLabel();
  const seasonLabel = activeSeason?.name || "未选择赛季";
  const matchDayLabel = activeMatchDay ? "当日比赛进行中" : "未发起当日比赛";
  const queueCount = queueEntries.filter((row) => row.is_active === true && row.status !== "confirmed").length;
  const todayCount = todayPlayers.length;

  scorerPanelSummary.textContent = `${actorLabel} · ${seasonLabel} · ${matchDayLabel}`;
  scorerPanelStatusText.textContent = `当前可直接处理报名、队列到齐、当日名单与比赛记录。报名队列 ${queueCount} 人，当日选手 ${todayCount} 人。`;
}

function renderRoleMembers() {
  const admins = getRoleMembersByRole("admin");
  const scorers = getRoleMembersByRole("scorer");

  if (scorerMembersCount) {
    scorerMembersCount.textContent = `${scorers.length} 人`;
  }
  if (adminPanelSummary) {
    adminPanelSummary.textContent = `管理员 ${admins.length} 人 · 记分员 ${scorers.length} 人`;
  }

  if (scorerMembersList) {
    scorerMembersList.innerHTML = scorers.length
      ? scorers.map((member) => `
        <div class="admin-member-card">
          <div>
            <strong>${escapeHtml(getScorerDisplayName(member))}</strong>
            ${member.allow_auto_reconnect ? '<span class="queue-slot">永久自动重连</span>' : ""}
          </div>
          ${canCurrentUserManageRoles()
            ? `<div class="admin-member-actions">
                <button type="button" class="button-secondary admin-toggle-scorer-reconnect-btn" data-role-member-id="${member.id}" data-allow-auto-reconnect="${member.allow_auto_reconnect ? "true" : "false"}" ${roleMembersSupportAutoReconnect ? "" : "disabled"}>
                  ${roleMembersSupportAutoReconnect
                    ? (member.allow_auto_reconnect ? "关闭永久自动重连" : "启用永久自动重连")
                    : "需执行 SQL 更新"}
                </button>
                <button type="button" class="button-danger admin-remove-scorer-btn" data-role-member-id="${member.id}">移除</button>
              </div>`
            : ""
          }
        </div>
      `).join("")
      : '<p class="muted">暂无记分员</p>';
  }

  renderAccessScorerOptions();
  renderAdminAddScorerOptions();
  renderAdminActionLogs();
  renderScorerPanelSummary();
}

function getRoleAssignmentById(id) {
  return roleMembers.find((member) => member.id === id) || null;
}

function validateStoredAccessSession() {
  const stored = readStoredAccessSession();
  if (stored.role === "admin") {
    if (getRoleMembersByRole("admin").length) {
      currentAccessSession = stored;
      return;
    }
  }

  if (stored.role === "scorer" && stored.memberId) {
    const member = getRoleAssignmentById(stored.memberId);
    if (member?.role === "scorer") {
      currentAccessSession = {
        role: "scorer",
        memberId: member.id,
        playerId: member.player_id || "",
      };
      writeRememberedScorerPlayerId(member.player_id || "");
      return;
    }
  }

  clearStoredAccessSession();
}

function applyRolePermissions() {
  const canScore = isCurrentRoleScorer();
  const isAdmin = isCurrentRoleAdmin();
  const isScorerOnly = isCurrentRoleScorerOnly();

  if (scorerModeBtn) {
    scorerModeBtn.hidden = !isScorerOnly;
    scorerModeBtn.textContent = isScorerPanelOpen ? "收起记录" : "记录员模式";
  }

  if (adminModeBtn) {
    adminModeBtn.hidden = !isAdmin;
    adminModeBtn.textContent = isAdminPanelOpen ? "收起管理" : "管理员模式";
  }

  if (adminLogoTrigger) {
    adminLogoTrigger.classList.remove("league-brand-title-sub-admin");
    adminLogoTrigger.classList.toggle("league-brand-title-sub-scorer", canScore);
    adminLogoTrigger.setAttribute("aria-hidden", canScore ? "false" : "true");
  }

  resetSeasonBtn.hidden = true;
  clearQueueBtn.hidden = true;
  if (recordEntrySection) {
    recordEntrySection.hidden = !canScore;
  }
  if (recordEntryTitle) {
    recordEntryTitle.textContent = "记录比赛";
  }

  startMatchDayBtn.hidden = false;
  matchStartTimeInput.disabled = Boolean(activeMatchDay);
  if (signupAllBtn) {
    signupAllBtn.hidden = !canScore;
  }
  confirmQueueBtn.hidden = !canScore;
  openMatchFormBtn.hidden = !canScore;
  openBackfillFormBtn.hidden = !canScore;
  recordMatchBtn.hidden = !canScore;
  recordBackfillBtn.hidden = !canScore;
  addRewardBtn.hidden = false;
  rewardPlayerSelect.disabled = false;
  rewardOutsideNameInput.disabled = false;
  rewardExtraInput.disabled = false;
  adminAddScorerBtn.disabled = !isAdmin;
  adminAddScorerSelect.disabled = !isAdmin;
  adminClearQueueBtn.disabled = !isAdmin;
  adminClearTodayPlayersBtn.disabled = !isAdmin;
  adminResetSeasonBtn.disabled = !isAdmin;
  adminClearScorerRememberBtn.disabled = !isAdmin;

  if (canScore) {
    setMatchFormOpen(isMatchFormOpen);
    setBackfillFormOpen(isBackfillFormOpen);
    renderMatchForm();
    renderBackfillForm();
  } else {
    setMatchFormOpen(false);
    setBackfillFormOpen(false);
  }

  if (!isAdmin) {
    setAdminPanelOpen(false);
  }
  if (!isScorerOnly) {
    setScorerPanelOpen(false);
  }

  renderScorerPanelSummary();
  renderSeasonPlayersPanel();
  renderRecentMatches(recentMatchDayGroupsData);
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
  const koiPlayerId = options.koiPlayerId !== undefined
    ? options.koiPlayerId
    : (activeSeason?.koi_player_id || null);

  if (koiPlayerId && playerId === koiPlayerId) {
    return "player-name-display player-name-display-koi";
  }

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

function getActiveWinStreakPlayerIds(matches, minStreak = 3) {
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

  return new Set(
    [...streakMap.entries()]
      .filter(([playerId, streak]) => !finishedPlayers.has(playerId) && streak >= minStreak)
      .map(([playerId]) => playerId)
  );
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
  return index >= 0 ? index + 1 : 0;
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
  if (status === "absent") return "报名未到场";
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
  const summaryEntries = [
    ...(participants || []).map((entry) => ({ ...entry, className: "match-day-player-name-participant" })),
    ...(attendanceNotes || [])
      .filter((entry) => entry.status === "standby")
      .map((entry) => ({ ...entry, className: "match-day-player-name-standby" })),
    ...(attendanceNotes || [])
      .filter((entry) => entry.status === "absent")
      .map((entry) => ({ ...entry, className: "match-day-player-name-absent" })),
  ];

  const html = summaryEntries
    .map((entry) => `<span class="match-day-player-name ${entry.className}">${escapeHtml(entry.display_name || "未知选手")}</span>`)
    .join("");
  return html ? `<div class="match-day-player-list">${html}</div>` : "";
}

function buildMatchDayAttendancePanelHtml(group, canScore) {
  if (!canScore) return "";

  const participantEntries = group.participants || [];
  const attendanceNotes = group.attendance_notes || [];
  const availablePlayers = seasonPlayers.filter((player) => (
    player.is_in_season
    && !participantEntries.some((entry) => entry.player_id === player.id)
    && !attendanceNotes.some((entry) => entry.player_id === player.id)
  ));
  const optionsHtml = availablePlayers.length
    ? buildOptionsFromPlayers(availablePlayers)
    : '<option value="">暂无可补记选手</option>';
  const listHtml = attendanceNotes.length
    ? attendanceNotes.map((entry) => `
      <div class="match-day-attendance-note match-day-attendance-note-${entry.status}">
        <div class="match-day-attendance-note-main">
          <span class="match-day-attendance-status">${escapeHtml(getMatchDayAttendanceLabel(entry.status))}</span>
          <strong>${escapeHtml(entry.display_name || "未知选手")}</strong>
          ${entry.note ? `<span class="muted">${escapeHtml(entry.note)}</span>` : ""}
        </div>
        ${canScore ? `<button class="button-secondary match-day-attendance-remove-btn" type="button" data-note-id="${entry.id}" data-player-name="${escapeHtml(entry.display_name || "该选手")}">移除</button>` : ""}
      </div>
    `).join("")
    : '<p class="muted match-day-attendance-empty">暂无补记</p>';

  return `
    <div class="match-day-attendance-panel" data-match-day-key="${group.group_key}">
      <div class="match-day-attendance-panel-head">
        <div>
          <h3>补记名单</h3>
          <p class="muted">补记替补或未到场。</p>
        </div>
      </div>
      ${canScore ? `
        <div class="match-day-attendance-form">
          <select data-role="attendance-player-select" data-match-day-id="${group.match_day_id || ""}" ${availablePlayers.length ? "" : "disabled"}>
            ${optionsHtml}
          </select>
          <div class="match-day-attendance-form-actions">
            <button class="button-secondary match-day-attendance-add-btn" type="button" data-status="standby" data-match-day-id="${group.match_day_id || ""}" data-match-date="${group.match_date || ""}" data-season-id="${group.season_id || ""}" ${group.match_day_id ? "" : "disabled"}>补记替补</button>
            <button class="button-danger match-day-attendance-add-btn" type="button" data-status="absent" data-match-day-id="${group.match_day_id || ""}" data-match-date="${group.match_date || ""}" data-season-id="${group.season_id || ""}" ${group.match_day_id ? "" : "disabled"}>补记未到场</button>
          </div>
        </div>
      ` : ""}
      <div class="match-day-attendance-list">${listHtml}</div>
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

  details.dataset.expanded = details.open ? "true" : "false";
}

function rememberOpenRecentMatchGroups() {
  openRecentMatchGroups = new Set(
    [...recentMatchesList.querySelectorAll(".match-day-group[open]")]
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

function getBackfillDateMaxValue() {
  const latestPastDate = getPreviousBeijingBusinessDateString();
  if (editingMatchId && backfillDateInput.value && backfillDateInput.value > latestPastDate) {
    return backfillDateInput.value;
  }
  return latestPastDate;
}

function getPlaceholderEnsureAttemptKey() {
  return `${activeSeason?.id || "global"}:${getBeijingBusinessDateString()}`;
}

async function ensurePreviousMatchDayPlaceholderOnce() {
  const attemptKey = getPlaceholderEnsureAttemptKey();
  if (placeholderEnsureAttemptKey === attemptKey) {
    return;
  }

  placeholderEnsureAttemptKey = attemptKey;

  try {
    await db.rpc("ensure_previous_match_day_placeholder", {
      p_season_id: activeSeason?.id || null,
    });
  } catch (error) {
    // Ignore when the latest SQL has not been applied yet.
  }
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
  return seasonPlayers.find((player) => player.id === playerId)?.display_name || "未知选手";
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

function getOrCreateRecentMatchDayGroup(matchDayId, matchDate, seasonId, options = {}) {
  const groupKey = getMatchDayGroupKey(matchDayId, matchDate);
  let group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);

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
  }

  return group;
}

function syncRecentMatchDayGroupParticipants(group) {
  if (!group) return;
  group.matches.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  group.attendance_notes.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  group.participants = getMatchDayParticipantEntries(group.matches);
}

function addMatchDayAttendanceNoteLocally(matchDayId, seasonId, matchDate, playerId, status, noteId = "") {
  const group = getOrCreateRecentMatchDayGroup(matchDayId, matchDate, seasonId, {
    day_is_active: Boolean(activeMatchDay && activeMatchDay.id === matchDayId),
  });
  if (group.attendance_notes.some((entry) => entry.player_id === playerId && entry.status === status)) {
    return "";
  }

  const optimisticId = noteId || `temp-attendance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  group.attendance_notes.push({
    id: optimisticId,
    match_day_id: matchDayId || null,
    season_id: seasonId || activeSeason?.id || null,
    match_date: matchDate || null,
    player_id: playerId,
    status,
    note: null,
    created_at: new Date().toISOString(),
    display_name: getPlayerDisplayNameById(playerId),
  });
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
    syncRecentMatchDayGroupParticipants(group);
    sortRecentMatchDayGroupsLocally();
    renderRecentMatches(recentMatchDayGroupsData);
  }
}

function buildOptimisticMatchRecord(matchId, seasonId, matchDayId, matchDate, winner, note, teamAIds, teamBIds, assignments, doubleDowns, createdAt = new Date().toISOString()) {
  const playerMap = new Map(seasonPlayers.map((player) => [player.id, player.display_name]));
  const buildPlayerRows = (ids, team) => ids.map((playerId) => ({
    player_id: playerId,
    display_name: playerMap.get(playerId) || "未知选手",
    team,
    hero_name: assignments[playerId] || null,
    score_change: 0,
    reward_change: 0,
  }));

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
  };
}

function upsertRecentMatchLocally(match) {
  if (!match?.match_id) return;

  const existingIndex = recentMatchesData.findIndex((item) => item.match_id === match.match_id);
  if (existingIndex >= 0) {
    recentMatchesData[existingIndex] = match;
  } else {
    recentMatchesData = [match, ...recentMatchesData];
  }

  const group = getOrCreateRecentMatchDayGroup(match.match_day_id, match.match_date, match.season_id, {
    day_is_active: Boolean(match.day_is_active),
    started_at: match.created_at,
  });
  const groupMatchIndex = group.matches.findIndex((item) => item.match_id === match.match_id);
  if (groupMatchIndex >= 0) {
    group.matches[groupMatchIndex] = match;
  } else {
    group.matches.unshift(match);
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

function moveRecentMatchLocally(matchId, direction) {
  const located = findRecentMatchGroupByMatchId(matchId);
  if (!located) return null;

  const { group, matchIndex } = located;
  const targetIndex = direction === "up" ? matchIndex - 1 : matchIndex + 1;
  if (targetIndex < 0 || targetIndex >= group.matches.length) {
    return null;
  }

  const previousOrder = group.matches.map((item) => item.match_id);
  [group.matches[matchIndex], group.matches[targetIndex]] = [group.matches[targetIndex], group.matches[matchIndex]];
  syncRecentMatchDayGroupParticipants(group);
  renderRecentMatches(recentMatchDayGroupsData);
  return { groupKey: group.group_key, previousOrder };
}

function restoreRecentMatchOrderLocally(groupKey, previousOrder) {
  if (!groupKey || !Array.isArray(previousOrder) || !previousOrder.length) return;
  const group = (recentMatchDayGroupsData || []).find((item) => item.group_key === groupKey);
  if (!group) return;

  const matchMap = new Map(group.matches.map((item) => [item.match_id, item]));
  const restoredMatches = previousOrder
    .map((matchId) => matchMap.get(matchId))
    .filter(Boolean);

  if (restoredMatches.length === group.matches.length) {
    group.matches = restoredMatches;
    syncRecentMatchDayGroupParticipants(group);
    renderRecentMatches(recentMatchDayGroupsData);
  }
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
  const linkedPlayers = getLinkedTodayPlayers();
  const seasonRankMap = new Map(seasonPlayers.map((player) => [player.id, player.player_rank || null]));
  const basePlayers = linkedPlayers.length
    ? linkedPlayers
    : seasonPlayers.filter((player) => player.is_in_season);

  return basePlayers.map((player) => ({
    id: player.player_id || player.id,
    display_name: player.display_name,
    player_rank: seasonRankMap.get(player.player_id || player.id) || null,
  }));
}

function getLinkedTodayPlayers() {
  const linkedPlayers = [];
  const seen = new Set();
  const matchDate = activeMatchDay?.match_date || getBeijingBusinessDateString();
  const todayGroup = (recentMatchDayGroupsData || []).find((group) => group.match_date === matchDate);

  const pushEntry = (entry, source = "roster") => {
    if (!entry) return;
    const playerId = entry.player_id || entry.id || null;
    const displayName = stripPlayerNameMeta(entry.display_name || "未知选手");
    const key = playerId || displayName;
    if (!key || seen.has(key)) return;
    seen.add(key);
    linkedPlayers.push({
      player_id: playerId,
      display_name: displayName,
      source,
    });
  };

  (todayPlayers || []).forEach((entry) => pushEntry(entry, entry.source || "roster"));
  (todayGroup?.participants || []).forEach((entry) => pushEntry(entry, "record"));

  return linkedPlayers;
}

function canUseMatchRecordingForm() {
  return Boolean(activeMatchDay || activeSeason?.id);
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

function getSelectedPlayersWithTeams(formType) {
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const teamMap = new Map(selectedPlayers.map((player) => [player.id, player.team]));
  return { selectedPlayers, teamMap };
}

function normalizeDoubleState(formType) {
  const doubleState = getDoubleStateByFormType(formType);
  const { selectedPlayers, teamMap } = getSelectedPlayersWithTeams(formType);
  const validIds = new Set(selectedPlayers.map((player) => player.id));

  if (!validIds.has(doubleState.teamAUserId) || teamMap.get(doubleState.teamAUserId) !== "A") {
    doubleState.teamAUserId = "";
  }

  if (!validIds.has(doubleState.teamBUserId) || teamMap.get(doubleState.teamBUserId) !== "B") {
    doubleState.teamBUserId = "";
  }

  const usedUsers = new Set();
  const usedTargets = new Set();
  doubleState.singles = doubleState.singles.filter((entry) => {
    if (!validIds.has(entry.user_player_id) || !validIds.has(entry.target_player_id)) {
      return false;
    }

    if (usedUsers.has(entry.user_player_id) || usedTargets.has(entry.target_player_id)) {
      return false;
    }

    const userTeam = teamMap.get(entry.user_player_id);
    const targetTeam = teamMap.get(entry.target_player_id);
    if (!userTeam || !targetTeam) {
      return false;
    }

    if (entry.user_player_id !== entry.target_player_id && userTeam === targetTeam) {
      return false;
    }

    usedUsers.add(entry.user_player_id);
    usedTargets.add(entry.target_player_id);
    return true;
  });
}

function getSingleDoubleTargetByUser(formType, userPlayerId) {
  const doubleState = getDoubleStateByFormType(formType);
  return doubleState.singles.find((entry) => entry.user_player_id === userPlayerId)?.target_player_id || "";
}

function setSingleDoubleTarget(formType, userPlayerId, targetPlayerId) {
  const doubleState = getDoubleStateByFormType(formType);
  doubleState.singles = doubleState.singles.filter((entry) => entry.user_player_id !== userPlayerId);

  if (!targetPlayerId) {
    return;
  }

  doubleState.singles = doubleState.singles.filter((entry) => entry.target_player_id !== targetPlayerId);
  doubleState.singles.push({
    id: `single-${userPlayerId}`,
    user_player_id: userPlayerId,
    target_player_id: targetPlayerId,
  });
}

function buildTeamDoubleOptionsHtml(formType, team, players) {
  const doubleState = getDoubleStateByFormType(formType);
  const currentValue = team === "A" ? doubleState.teamAUserId : doubleState.teamBUserId;

  return players.map((player) => `
    <button
      type="button"
      class="player-double-option${player.id === currentValue ? " player-double-option-active" : ""}"
      data-role="team-double-target"
      data-form-type="${formType}"
      data-team="${team}"
      data-player-id="${player.id}"
    >${escapeHtml(player.display_name)}</button>
  `).join("");
}

function renderInlineTeamDoubleControls(formType, disabled = false) {
  normalizeDoubleState(formType);
  const selectedPlayers = getSelectedPlayersByFormType(formType);
  const doubleState = getDoubleStateByFormType(formType);
  const slotMap = formType === "backfill"
    ? { A: backfillTeamADoubleSlot, B: backfillTeamBDoubleSlot }
    : { A: matchTeamADoubleSlot, B: matchTeamBDoubleSlot };

  ["A", "B"].forEach((team) => {
    const slot = slotMap[team];
    if (!slot) return;

    const players = selectedPlayers.filter((player) => player.team === team);
    const currentValue = team === "A" ? doubleState.teamAUserId : doubleState.teamBUserId;
    const isOpen = teamDoublePickerOpen[formType][team] || Boolean(currentValue);

    slot.innerHTML = `
      <button
        type="button"
        class="team-double-toggle${currentValue ? " team-double-toggle-active" : ""}"
        data-role="team-double-toggle"
        data-form-type="${formType}"
        data-team="${team}"
        ${disabled ? "disabled" : ""}
        aria-expanded="${String(isOpen)}"
        title="${team === "A" ? "天辉" : "夜魇"}团队双倍"
      >◉</button>
      <div class="team-double-options${isOpen ? " team-double-options-open" : ""}">
        <button
          type="button"
          class="player-double-option${!currentValue ? " player-double-option-active" : ""}"
          data-role="team-double-clear"
          data-form-type="${formType}"
          data-team="${team}"
          ${disabled || !isOpen ? "disabled" : ""}
        >不使用</button>
        ${buildTeamDoubleOptionsHtml(formType, team, players)}
      </div>
    `;
  });
}

function renderDoublePanel(formType) {
  const panel = formType === "backfill" ? backfillDoublePanel : matchDoublePanel;
  if (!panel) return;

  panel.innerHTML = `
    <div class="double-panel-head">
      <div>
        <h4>双倍说明</h4>
        <p class="muted">团队双倍请点队伍名旁金币设置使用者。个人双倍请点已选队员旁金币，可对自己或对手使用，不能对队友使用。</p>
      </div>
    </div>
  `;
}

function buildDoubleDownPayload(formType) {
  normalizeDoubleState(formType);
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

    if (item.user_player_id !== item.target_player_id && teamMap.get(item.user_player_id) === teamMap.get(item.target_player_id)) {
      return { error: "个人双倍只能对自己或对手使用，不能对队友使用。", payload: [] };
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

function buildSingleDoubleOptionsHtml(formType, player, allSelectedPlayers) {
  const { teamMap } = getSelectedPlayersWithTeams(formType);
  const currentTargetId = getSingleDoubleTargetByUser(formType, player.id);
  const options = getOrderedSingleDoubleCandidates(player, allSelectedPlayers, teamMap);

  return [
    `
      <button
        type="button"
        class="player-double-option${!currentTargetId ? " player-double-option-active" : ""}"
        data-role="player-double-clear"
        data-form-type="${formType}"
        data-user-player-id="${player.id}"
      >不使用</button>
    `,
    ...options.map((candidate) => {
    const isActive = candidate.id === currentTargetId;
    const label = candidate.id === player.id ? "自己" : candidate.display_name;
    return `
      <button
        type="button"
        class="player-double-option${isActive ? " player-double-option-active" : ""}"
        data-role="player-double-target"
        data-form-type="${formType}"
        data-user-player-id="${player.id}"
        data-target-player-id="${candidate.id}"
      >${escapeHtml(label)}</button>
    `;
    }),
  ].join("");
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
        <div class="match-picked-player-row">
          <div class="match-picked-player-row-main">
            <span class="match-picked-player-name">${escapeHtml(player.display_name)}</span>
            <button
              type="button"
              class="match-picked-player"
              data-role="hero-picker"
              data-form-type="${formType}"
              data-team="${teamKey}"
              data-player-id="${player.id}"
              data-player-name="${escapeHtml(player.display_name)}"
            >
              ${buildHeroBadge(assignments[player.id] || "")}
            </button>
            <button
              type="button"
              class="player-double-toggle${getSingleDoubleTargetByUser(formType, player.id) ? " player-double-toggle-active" : ""}"
              data-role="player-double-toggle"
              data-form-type="${formType}"
              data-player-id="${player.id}"
              aria-expanded="${String(Boolean(singleDoublePickerOpen[formType][player.id] || getSingleDoubleTargetByUser(formType, player.id)))}"
              title="个人双倍"
            >◉</button>
          </div>
          <div class="player-double-options${singleDoublePickerOpen[formType][player.id] || getSingleDoubleTargetByUser(formType, player.id) ? " player-double-options-open" : ""}">
            ${buildSingleDoubleOptionsHtml(formType, player, getSelectedPlayersByFormType(formType))}
          </div>
        </div>
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

const REWARD_CATEGORY_CONFIG = {
  signup_fee: { label: "报名费", tone: "base", order: 10 },
  team_card: { label: "团队积分卡", tone: "card", order: 20 },
  single_card: { label: "双倍积分卡", tone: "card", order: 30 },
  extra_donation: { label: "额外赞助", tone: "extra", order: 40 },
  misc_item: { label: "其它道具", tone: "misc", order: 50 },
};

function getRewardCategoryConfig(kind) {
  return REWARD_CATEGORY_CONFIG[kind] || REWARD_CATEGORY_CONFIG.misc_item;
}

function appendRewardCategory(categories, entry) {
  const amount = Number(entry?.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return;

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

function buildSeasonRewardSummary() {
  const playerMap = getSeasonRewardPlayerMap();
  const extraDonationSummary = new Map();

  rewardLogs.forEach((log) => {
    if (!log.player_id || log.is_cancelled) return;
    const current = extraDonationSummary.get(log.player_id) || { total: 0, count: 0 };
    current.total += Number(log.amount ?? 0);
    current.count += 1;
    extraDonationSummary.set(log.player_id, current);
  });

  return [...playerMap.values()]
    .map((player) => {
      const categories = [];
      const cardUsage = rewardCardUsageSummary.get(player.id) || null;
      const extraDonation = extraDonationSummary.get(player.id) || { total: 0, count: 0 };

      appendRewardCategory(categories, {
        kind: "signup_fee",
        amount: 20,
        count: 1,
      });

      if (cardUsage?.teamAmount > 0) {
        appendRewardCategory(categories, {
          kind: "team_card",
          amount: cardUsage.teamAmount,
          count: cardUsage.teamCount,
        });
      }

      if (cardUsage?.singleAmount > 0) {
        appendRewardCategory(categories, {
          kind: "single_card",
          amount: cardUsage.singleAmount,
          count: cardUsage.singleCount,
        });
      }

      const fallbackCardAmount = Math.max(
        player.reward_double_bonus - Number(cardUsage?.teamAmount ?? 0) - Number(cardUsage?.singleAmount ?? 0),
        0
      );
      if (fallbackCardAmount > 0) {
        appendRewardCategory(categories, {
          kind: "misc_item",
          amount: fallbackCardAmount,
          count: 1,
          label: "其它积分卡",
        });
      }

      if (player.reward_floor_bonus > 0) {
        appendRewardCategory(categories, {
          kind: "misc_item",
          amount: player.reward_floor_bonus,
          count: 1,
          label: "其它道具",
        });
      }

      if (player.reward_extra_points > 0) {
        appendRewardCategory(categories, {
          kind: "extra_donation",
          amount: player.reward_extra_points,
          count: extraDonation.count,
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
    })
    .sort((a, b) => {
      if (b.total !== a.total) {
        return b.total - a.total;
      }

      const leaderboardRankA = leaderboardPlayers.findIndex((player) => (player.player_id || player.id) === a.id);
      const leaderboardRankB = leaderboardPlayers.findIndex((player) => (player.player_id || player.id) === b.id);
      if (leaderboardRankA !== -1 || leaderboardRankB !== -1) {
        if (leaderboardRankA === -1) return 1;
        if (leaderboardRankB === -1) return -1;
        return leaderboardRankA - leaderboardRankB;
      }
      return a.display_name.localeCompare(b.display_name, "zh-CN");
    });
}

function buildRewardCategoryLineHtml(item) {
  const config = getRewardCategoryConfig(item.kind);
  const label = item.label || config.label;
  const metaText = item.count > 1 ? ` · ${item.count} 次` : "";
  return `
    <div class="reward-category-line reward-category-line-${config.tone}">
      <span class="reward-category-name reward-category-name-${config.tone}">${escapeHtml(label)}</span>
      <span class="reward-category-value reward-category-value-${config.tone}">+${formatScore(item.amount)}${escapeHtml(metaText)}</span>
    </div>
  `;
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
  if (!koiPlayerSelect) return;
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

  rewardMinimumHint.textContent = `${selectedPlayer.display_name} 当前基础项 ${Number(selectedPlayer.reward_minimum ?? 20)}，当前额外赞助 ${Number(selectedPlayer.reward_extra_points ?? 0)}。`;
}

function renderRewardLogs() {
  rewardLogsList.innerHTML = "";
  const canScore = isCurrentRoleScorer();
  const rewardSummary = buildSeasonRewardSummary();
  const detailLogs = rewardLogs.filter((log) => !log.is_cancelled || log.cancelled_at);

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
          <p class="muted">报名费固定计入；积分卡、额外赞助和后续道具按分类汇总。</p>
        </div>
      </div>
      <div class="reward-summary-grid"></div>
    `;
    const summaryGrid = summarySection.querySelector(".reward-summary-grid");

    rewardSummary.forEach((player) => {
      const item = document.createElement("article");
      item.className = "reward-summary-card";
      item.innerHTML = `
        <div class="reward-summary-head">
          <strong>${escapeHtml(player.display_name)}</strong>
          <span class="reward-log-amount">总额 ${formatScore(player.total)}</span>
        </div>
        <div class="reward-category-list">
          ${player.categories.map((category) => buildRewardCategoryLineHtml(category)).join("")}
        </div>
      `;
      summaryGrid.appendChild(item);
    });

    rewardLogsList.appendChild(summarySection);
  }

  if (!detailLogs.length) {
    return;
  }

  const detailSection = document.createElement("section");
  detailSection.className = "reward-summary-section";
  detailSection.innerHTML = `
    <div class="section-head">
      <div>
        <h3>额外赞助明细</h3>
        <p class="muted">这里保留额外赞助与场外赞助的逐笔记录，方便后续核对或取消。</p>
      </div>
    </div>
    <div class="reward-detail-list"></div>
  `;
  const detailList = detailSection.querySelector(".reward-detail-list");

  detailLogs.forEach((log) => {
    const item = document.createElement("div");
    const playerName = log.players?.display_name || log.donor_name || "未知赞助人";
    const statusBadge = log.is_cancelled
      ? '<span class="reward-log-amount reward-log-cancelled">已取消</span>'
      : `<span class="reward-log-amount">+${Number(log.amount ?? 0)}</span>`;
    const actionHtml = log.is_cancelled
      ? ""
      : (canScore
        ? `<button class="button-danger cancel-reward-log-btn" type="button" data-donation-id="${log.id}" data-player-name="${escapeHtml(playerName)}">取消</button>`
        : "");

    item.className = `reward-log-item${log.player_id ? "" : " reward-log-outside"}`;
    item.innerHTML = `
      <div class="reward-log-main">
        <strong>${escapeHtml(playerName)}</strong>
        ${log.player_id ? '<span class="queue-slot">额外赞助</span>' : '<span class="queue-slot">场外赞助</span>'}
        ${statusBadge}
        <span class="muted">${escapeHtml(formatLocalTime(log.created_at))}</span>
      </div>
      <div class="queue-actions">
        ${log.cancelled_at ? `<span class="muted">取消于 ${escapeHtml(formatLocalTime(log.cancelled_at))}</span>` : ""}
        ${actionHtml}
      </div>
    `;
    detailList.appendChild(item);
  });

  rewardLogsList.appendChild(detailSection);
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
  const highestRewardIds = getHighestRewardPlayerIds(leaderboardPlayers);
  const hardcoreLoseIds = getHardcoreLoseTaggedPlayerIds(leaderboardPlayers);
  const canScore = isCurrentRoleScorer();

  const renderPlayerCard = (player) => {
    const item = document.createElement("div");
    item.className = `season-player-item${player.is_in_season ? " season-player-item-active" : ""}`;
    const isCurrentKoi = activeSeason?.koi_player_id === player.id;
    item.innerHTML = `
      <div class="season-player-main">
        <div class="season-player-name">
          ${buildDecoratedPlayerNameHtml(player.id, player.display_name, {
            players: leaderboardPlayers,
            highestRewardIds,
            hardcoreLoseIds,
          })}
        </div>
      </div>
      ${canScore ? `
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
          <button
            class="season-player-rank-btn season-player-koi-btn${isCurrentKoi ? " season-player-koi-btn-active" : ""}"
            type="button"
            data-role="season-koi"
            data-player-id="${player.id}"
            data-player-name="${escapeHtml(player.display_name)}"
            ${player.is_in_season ? "" : "disabled"}
            title="${isCurrentKoi ? "取消锦鲤" : "设为锦鲤"}"
            aria-pressed="${isCurrentKoi ? "true" : "false"}"
          >
            ✦
          </button>
        </div>
      ` : ""}
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
        <span class="season-rank-count" title="${title}人数">${groups[key].length} 人</span>
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
      <span class="season-rank-count" title="未参赛人数">${groups.idle.length} 人</span>
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
  matchDayInfo.textContent = "";
  matchDayInfo.hidden = true;
  startMatchDayBtn.textContent = "发起当日比赛";
  startMatchDayBtn.classList.remove("button-cancel-state");
  startMatchDayBtn.disabled = false;
  matchStartTimeInput.disabled = false;
  matchStartTimeDisplay.textContent = "";
  matchStartTimeDisplay.hidden = true;
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
  if (signupAllBtn) {
    signupAllBtn.disabled = !isCurrentRoleScorer() || !activeMatchDay || participants.length === 0;
  }

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
  closeMatchFormBtn.disabled = false;
  openMatchFormBtn.disabled = isMatchFormOpen;
  [...matchFormPanel.querySelectorAll('[data-role="winner-toggle"]')].forEach((button) => {
    button.disabled = !canUseForm;
  });
  setWinnerSelection("match", winnerSelect.value);
}

function renderBackfillForm() {
  refreshBackfillSelectOptions();
  renderDoublePanel("backfill");
  backfillSeasonSelect.innerHTML = buildSeasonOptions(allSeasons, backfillSeasonSelect.value);
  const hasEnoughPlayers = backfillPlayers.length >= TEAM_SIZE * 2;
  const hasSeason = Boolean(backfillSeasonSelect.value);
  backfillDateInput.max = getBackfillDateMaxValue();
  renderInlineTeamDoubleControls("backfill", !hasSeason || !hasEnoughPlayers);
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
  teamDoublePickerOpen.match = { A: false, B: false };
  singleDoublePickerOpen.match = {};
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
  teamDoublePickerOpen.backfill = { A: false, B: false };
  singleDoublePickerOpen.backfill = {};
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
            ? `<button class="button-danger queue-action-btn queue-unready-btn" data-roster-entry-id="${readyEntry.id}" data-player-name="${escapeHtml(playerName)}">取消到场</button>`
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
  const displayPlayers = getLinkedTodayPlayers();
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

function renderLeaderboard(data) {
  leaderboardBody.innerHTML = "";
  leaderboardPlayers = data || [];

  if (!data || data.length === 0) {
    seasonPlayerRewardTotal = 0;
    refreshSeasonRewardTotal();
    renderRewardPlayerOptions();
    updateRewardMinimumHint();
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="muted leaderboard-empty">暂无排行榜数据</td>';
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

  const highestRewardIds = getHighestRewardPlayerIds(data);
  const hardcoreLoseIds = getHardcoreLoseTaggedPlayerIds(data);
  const winStreakIds = getActiveWinStreakPlayerIds(recentMatchesData, 3);
  const mvpIds = getMvpPlayerIds();

  data.forEach((player, idx) => {
    const tr = document.createElement("tr");
    const rank = idx + 1;
    const isBottomTwo = data.length >= 2 && rank >= data.length - 1;
    const playerId = player.player_id || player.id || "";
    const gamesPlayed = Number(player.games_played ?? 0);
    const tags = [];
    const nameClassName = getPlayerNameStyleClass(playerId, {
      players: data,
      highestRewardIds,
      hardcoreLoseIds,
    });

    if (highestRewardIds.has(playerId)) {
      tags.push({ icon: "¤", label: "金主", tone: "gold" });
    }

    if (activeSeason?.koi_player_id && playerId === activeSeason.koi_player_id) {
      tags.push({ icon: "✦", label: "锦鲤", tone: "teal" });
    }

    if (hardcoreLoseIds.has(playerId)) {
      tags.push({ icon: "☄", label: "又菜又爱玩", tone: "slate" });
    }

    if (winStreakIds.has(playerId)) {
      tags.push({ icon: "▲", label: "连胜", tone: "ember" });
    }

    if (mvpIds.has(playerId)) {
      tags.push({ icon: "★", label: "MVP", tone: "royal" });
    }

    const tagsHtml = `
      <div class="leaderboard-player-tags${tags.length ? "" : " leaderboard-player-tags-empty"}">
        ${tags.map((tag) => `
        <span class="leaderboard-tag leaderboard-tag-${tag.tone}" title="${escapeHtml(tag.label)}" aria-label="${escapeHtml(tag.label)}">
          <span class="leaderboard-tag-icon">${escapeHtml(tag.icon)}</span>
          <span class="leaderboard-tag-label">${escapeHtml(tag.label)}</span>
        </span>
      `).join("")}
      </div>
    `;
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
      tr.classList.add(rank === data.length ? "leaderboard-row-bottom1" : "leaderboard-row-bottom2");
    }
    tr.innerHTML = `
      <td><span class="leaderboard-rank">${rank}</span></td>
      <td>
        <div class="leaderboard-player-cell">
          <strong class="leaderboard-player-name">${buildDecoratedPlayerNameHtml(playerId, player.display_name, {
            players: data,
            highestRewardIds,
            hardcoreLoseIds,
            rank,
            wrapperClassName: "player-name-stack",
          })}</strong>
          ${tagsHtml}
        </div>
      </td>
      <td><span class="leaderboard-score">${formatScore(player.score)}</span></td>
      <td><span class="leaderboard-stat${gamesPlayed > 5 ? " leaderboard-stat-active" : ""}">${gamesPlayed}</span></td>
      <td>
        <div class="leaderboard-rate" style="--rate-percent: ${winRateNumber}%; --rate-glow: ${Math.max(14, winRateNumber)}%;">
          <span class="leaderboard-rate-bar" aria-hidden="true"></span>
          <span class="leaderboard-rate-value">${winRateLabel}</span>
        </div>
      </td>
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
    appendAdminActionLog(`记录了一笔场外赞助 ${outsideName} +${extraAmount}。`);
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
  appendAdminActionLog(`为 ${selectedPlayer?.display_name || outsideName || "该选手"} 添加了赞助 +${extraAmount}。`);
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
  let doubleDownQuery = db
    .from("match_double_downs")
    .select("user_player_id, mode");

  if (activeSeason?.id) {
    doubleDownQuery = doubleDownQuery.eq("season_id", activeSeason.id);
  } else {
    doubleDownQuery = doubleDownQuery.is("season_id", null);
  }
  const [{ data, error }, doubleDownResult] = await Promise.all([
    query,
    doubleDownQuery,
  ]);

  const localExternalLogs = readExternalDonationLogs(activeSeason?.id || null);
  rewardCardUsageSummary = new Map();

  if (!doubleDownResult.error) {
    const usageMap = new Map();
    (doubleDownResult.data || []).forEach((row) => {
      const playerId = row.user_player_id;
      if (!playerId) return;
      const usage = usageMap.get(playerId) || { teamCount: 0, singleCount: 0 };
      if (row.mode === "team") {
        usage.teamCount += 1;
      } else if (row.mode === "single") {
        usage.singleCount += 1;
      }
      usageMap.set(playerId, usage);
    });

    rewardCardUsageSummary = new Map(
      [...usageMap.entries()].map(([playerId, usage]) => {
        const paidSingleCount = Math.max(usage.singleCount - 2, 0);
        return [playerId, {
          teamCount: usage.teamCount,
          teamAmount: usage.teamCount * 10,
          singleCount: paidSingleCount,
          singleAmount: paidSingleCount * 5,
        }];
      })
    );
  }

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
  if (!ensureScorerAccess("仅记分员或管理员可取消赞助记录。")) return;
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

function getSeasonKoiPlayerId(seasonId) {
  if (seasonId && activeSeason?.id === seasonId && activeSeason?.koi_player_id) {
    return activeSeason.koi_player_id;
  }

  return allSeasons.find((season) => season.id === seasonId)?.koi_player_id || null;
}

function getTeamLabel(team) {
  return team === "A" ? "天辉方" : team === "B" ? "夜魇方" : "未知方";
}

function getMatchEffectLogsByTeam(match, players, doubleDowns) {
  const playerMap = new Map(players.map((player) => [player.player_id, player]));
  const logsByTeam = { A: [], B: [] };
  const formatEffectText = (hasWinner, hasPositiveGain, hasExtraPenalty, hasFloorProtection, scope = "personal") => {
    const prefix = scope === "team" ? "团队" : "";
    if (!hasWinner) return "结果待补";
    if (hasPositiveGain) return `${prefix}积分 +100%`;
    if (hasExtraPenalty && hasFloorProtection) return `${prefix}积分 -100%，部分保底`;
    if (hasExtraPenalty) return `${prefix}积分 -100%`;
    if (hasFloorProtection) return prefix ? `${prefix}保底生效，仅正常扣分` : "保底生效，仅正常扣分";
    return "结果待补";
  };

  doubleDowns.forEach((item) => {
    const userName = stripPlayerNameMeta(playerMap.get(item.user_player_id)?.display_name || "未知选手");
    const targetPlayers = item.mode === "team"
      ? players.filter((player) => player.team === item.target_team)
      : players.filter((player) => player.player_id === item.target_player_id);
    const targetTeam = item.mode === "team"
      ? item.target_team
      : targetPlayers[0]?.team || null;
    const hasWinner = hasRecordedWinner(match.winner_team);
    const hasPositiveGain = targetPlayers.some((player) => Number(player.score_change ?? 0) > 1);
    const hasExtraPenalty = targetPlayers.some((player) => Number(player.score_change ?? 0) <= -2);
    const hasFloorProtection = targetPlayers.some((player) => Number(player.score_change ?? 0) === -1);
    const effectText = formatEffectText(
      hasWinner,
      hasPositiveGain,
      hasExtraPenalty,
      hasFloorProtection,
      item.mode === "team" ? "team" : "personal"
    );
    let tone = "gold";

    if (hasExtraPenalty && hasFloorProtection) {
      tone = "danger";
    } else if (hasExtraPenalty) {
      tone = "danger";
    }

    if (item.mode === "team") {
      if (targetTeam && logsByTeam[targetTeam]) {
        logsByTeam[targetTeam].push({ text: `${userName}团队双倍，${effectText}`, tone });
      }
      return;
    }

    const targetName = playerMap.get(item.target_player_id)?.display_name || "未知选手";
    if (targetTeam && logsByTeam[targetTeam]) {
      logsByTeam[targetTeam].push({
        text: item.user_player_id === item.target_player_id
          ? `${userName}个人双倍，自己${effectText}`
          : `${userName}个人双倍，${stripPlayerNameMeta(targetName)}${effectText}`,
        tone,
      });
    }
  });

  const koiPlayerId = getSeasonKoiPlayerId(match.season_id);
  if (koiPlayerId && hasRecordedWinner(match.winner_team)) {
    const koiPlayer = players.find((player) => player.player_id === koiPlayerId && player.team === match.winner_team);
    if (koiPlayer) {
      logsByTeam[match.winner_team].push({
        text: `${stripPlayerNameMeta(koiPlayer.display_name || "锦鲤")}锦鲤效果，团队积分 +25%`,
        tone: "gold",
      });
    }
  }

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

function buildRecentMatchDayGroups(matches, matchDays = [], attendanceNotes = []) {
  const groupMap = new Map();

  (matchDays || []).forEach((matchDay) => {
    const groupKey = getMatchDayGroupKey(matchDay);
    groupMap.set(groupKey, {
      group_key: groupKey,
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
    });
  });

  (matches || []).forEach((match) => {
    const groupKey = getMatchDayGroupKey(match.match_day_id, match.match_date || formatArchiveDate(match.created_at));
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        group_key: groupKey,
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
      });
    }

    groupMap.get(groupKey).matches.push(match);
  });

  (attendanceNotes || []).forEach((entry) => {
    const groupKey = getMatchDayGroupKey(entry.match_day_id, entry.match_date);
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        group_key: groupKey,
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
      });
    }

    groupMap.get(groupKey).attendance_notes.push(entry);
  });

  return [...groupMap.values()]
    .map((group) => {
      group.matches.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });
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

function getOrderedSingleDoubleCandidates(player, candidates, teamMap) {
  const selfCandidate = [];
  const opponentCandidates = [];
  const playerTeam = teamMap.get(player.id);

  candidates.forEach((candidate) => {
    const candidateTeam = teamMap.get(candidate.id);
    if (!candidateTeam || !playerTeam) return;
    if (candidate.id === player.id) {
      selfCandidate.push(candidate);
      return;
    }
    if (candidateTeam !== playerTeam) {
      opponentCandidates.push(candidate);
    }
  });

  return [...selfCandidate, ...opponentCandidates];
}

function renderRecentMatches(groups) {
  recentMatchesList.innerHTML = "";
  const highestRewardIds = getHighestRewardPlayerIds(leaderboardPlayers);
  const hardcoreLoseIds = getHardcoreLoseTaggedPlayerIds(leaderboardPlayers);
  const canScore = isCurrentRoleScorer();
  recentMatchDayGroupsData = groups || [];

  if (!recentMatchDayGroupsData || recentMatchDayGroupsData.length === 0) {
    recentMatchesEmpty.style.display = "block";
    renderTodayPlayers();
    return;
  }

  recentMatchesEmpty.style.display = "none";
  renderTodayPlayers();

  recentMatchDayGroupsData.forEach((group) => {
    const details = document.createElement("details");
    const matches = group.matches || [];
    const isActiveDay = Boolean(group.day_is_active);
    const participantEntries = group.participants || [];
    const matchDayPlayerCount = participantEntries.length;
    const playerSummaryHtml = buildMatchDayPlayerSummaryHtml(participantEntries, group.attendance_notes || []);
    details.dataset.matchDate = group.match_date;
    details.dataset.groupKey = group.group_key;
    details.className = `match-day-group${isActiveDay ? " match-day-group-active-day" : " match-day-group-archive-day"}`;
    details.open = isActiveDay || openRecentMatchGroups.has(group.group_key);
    details.dataset.expanded = details.open ? "true" : "false";
    details.addEventListener("toggle", () => {
      if (details.open) {
        openRecentMatchGroups.add(group.group_key);
      } else {
        openRecentMatchGroups.delete(group.group_key);
      }
      updateRecentMatchGroupSummary(details, isActiveDay);
    });

    details.innerHTML = `
      <summary>
        <div class="match-day-summary">
          <strong>${escapeHtml(group.match_date || "历史比赛")}</strong>
          <span class="queue-slot">${matches.length} 场</span>
          <span class="match-day-player-count">${matchDayPlayerCount} 人</span>
          ${playerSummaryHtml}
        </div>
        <span class="match-day-toggle">
          <span class="match-day-toggle-icon" aria-hidden="true"></span>
        </span>
      </summary>
      <div class="match-day-content">
        <div class="match-day-content-inner">
          ${buildMatchDayAttendancePanelHtml(group, canScore)}
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
            <span class="winner-badge">等待补录</span>
          </div>
        </div>
        <div class="recent-match-meta">
          <span class="muted">比赛日期：${escapeHtml(group.match_date || "未知日期")}</span>
        </div>
      `;
      content.appendChild(emptyCard);
    }

    matches.forEach((match, matchIndex) => {
      const players = parseRecentMatchPlayers(match.players);
      const teamAPlayers = players.filter((player) => player.team === "A");
      const teamBPlayers = players.filter((player) => player.team === "B");
      const winnerLabel = getWinnerLabel(match.winner_team);
      const resultToneClass = match.winner_team === "A"
        ? "recent-match-result-a"
        : (match.winner_team === "B" ? "recent-match-result-b" : "recent-match-result-pending");
      const matchDateLabel = match.match_date || formatArchiveDate(match.created_at) || "未知日期";
      const doubleDowns = parseRecentMatchPlayers(match.double_downs);
      const effectLogsByTeam = getMatchEffectLogsByTeam(match, players, doubleDowns);
      const noteLines = getMatchNoteLines(match);
      const noteLogHtml = noteLines.length
        ? `<div class="match-extra-logs">${noteLines.map((line) => `<p class="muted match-extra-log-line">${escapeHtml(line)}</p>`).join("")}</div>`
        : "";
      const buildEffectLogHtml = (team) => effectLogsByTeam[team]?.length
        ? `<div class="match-effect-logs">${effectLogsByTeam[team].map((item) => `<p class="match-effect-log-line match-effect-log-line-${item.tone}">${escapeHtml(item.text)}</p>`).join("")}</div>`
        : "";
      const renderPlayerList = (teamPlayers, teamKey) => teamPlayers.map((player) => `
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
            ${buildDecoratedPlayerNameHtml(player.player_id, player.display_name || "未知选手", {
              players: leaderboardPlayers,
              highestRewardIds,
              hardcoreLoseIds,
              koiPlayerId: getSeasonKoiPlayerId(match.season_id),
              rank: getLeaderboardRankByPlayerId(player.player_id, leaderboardPlayers),
              wrapperClassName: "player-name-stack recent-match-player-name",
            })}
            ${player.hero_name ? `<span class="match-picked-hero match-picked-hero-${teamKey}">${escapeHtml(getHeroDisplayName(player.hero_name))}</span>` : '<span class="muted">未选英雄</span>'}
          </button>
        </li>
      `).join("");
      const card = document.createElement("article");
      const canMoveUp = canScore && matchIndex > 0;
      const canMoveDown = canScore && matchIndex < matches.length - 1;

      card.className = "recent-match-card";
      card.innerHTML = `
        <span class="recent-match-round-badge">第 ${matchIndex + 1} 场</span>
        <div class="recent-match-head">
          <div class="recent-match-title">
            <strong class="${resultToneClass}">${winnerLabel}</strong>
            <span class="winner-badge">${getMatchStatusBadge(match.winner_team)}</span>
          </div>
          ${canScore ? `
            <div class="recent-match-actions">
              <button class="button-secondary match-order-btn" data-role="move-match" data-direction="up" data-match-id="${match.match_id}" ${canMoveUp ? "" : "disabled"} title="上移一场">↑</button>
              <button class="button-secondary match-order-btn" data-role="move-match" data-direction="down" data-match-id="${match.match_id}" ${canMoveDown ? "" : "disabled"} title="下移一场">↓</button>
              <button class="button-secondary edit-match-btn" data-match-id="${match.match_id}">修改记录</button>
              <button class="button-danger delete-match-btn" data-match-id="${match.match_id}">删除记录</button>
            </div>
          ` : ""}
        </div>
        <div class="recent-match-meta">
          <span class="muted">比赛日期：${escapeHtml(matchDateLabel)}</span>
          <span class="muted">登记时间：${escapeHtml(formatLocalTime(match.created_at))}</span>
        </div>
        <div class="recent-match-teams">
          <div class="recent-match-team${match.winner_team === "A" ? " recent-match-team-winner" : ""}">
            <h3>天辉方</h3>
            <ul>${renderPlayerList(teamAPlayers, "a")}</ul>
            ${buildEffectLogHtml("A")}
          </div>
          <div class="recent-match-team${match.winner_team === "B" ? " recent-match-team-winner" : ""}">
            <h3>夜魇方</h3>
            <ul>${renderPlayerList(teamBPlayers, "b")}</ul>
            ${buildEffectLogHtml("B")}
          </div>
        </div>
        ${noteLogHtml}
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

async function loadRoleMembers() {
  roleMembersSupportAutoReconnect = true;
  let { data, error } = await db
    .from("app_role_members")
    .select("id, role, player_id, allow_auto_reconnect, auto_reconnect_device_id, created_at")
    .order("created_at", { ascending: true });

  if (error && (String(error.message || "").includes("allow_auto_reconnect") || String(error.message || "").includes("auto_reconnect_device_id"))) {
    roleMembersSupportAutoReconnect = false;
    ({ data, error } = await db
      .from("app_role_members")
      .select("id, role, player_id, created_at")
      .order("created_at", { ascending: true }));
  }

  if (error) {
    console.error("加载角色成员失败：", error);
    roleMembers = [];
    renderRoleMembers();
    applyRolePermissions();
    return;
  }

  const nameMap = new Map(seasonPlayers.map((player) => [player.id, player.display_name]));
  roleMembers = (data || []).map((member) => ({
    ...member,
    allow_auto_reconnect: Boolean(member.allow_auto_reconnect),
    auto_reconnect_device_id: member.auto_reconnect_device_id || "",
    display_name: member.player_id ? (nameMap.get(member.player_id) || "未命名选手") : "",
  }));
  validateStoredAccessSession();
  renderRoleMembers();
  applyRolePermissions();
}

async function addScorerRoleByPlayer(playerId) {
  if (!ensureAdminAccess("仅管理员可新增记分员。")) return;
  if (!playerId) {
    setAdminPanelMessage("请先选择一位总表选手。", true);
    return;
  }

  const existing = getRoleMembersByRole("scorer").find((member) => member.player_id === playerId);
  if (existing) {
    setAdminPanelMessage("该选手已经是记分员。", true);
    return;
  }

  adminAddScorerBtn.disabled = true;
  setAdminPanelMessage("正在新增记分员...");

  const { error } = await db.from("app_role_members").insert([{ role: "scorer", player_id: playerId }]);

  adminAddScorerBtn.disabled = false;

  if (error) {
    setAdminPanelMessage(`新增记分员失败：${error.message}`, true);
    return;
  }

  adminAddScorerSelect.value = "";
  setAdminPanelMessage("记分员已添加。");
  appendAdminActionLog(`将 ${seasonPlayers.find((player) => player.id === playerId)?.display_name || "该选手"} 设为记分员。`);
  await loadRoleMembers();
}

async function removeScorerRole(memberId) {
  if (!ensureAdminAccess("仅管理员可移除记分员。")) return;
  if (!memberId) return;

  const member = getRoleAssignmentById(memberId);
  const confirmed = window.confirm(`确认移除 ${member?.display_name || "该记分员"} 的记分权限吗？`);
  if (!confirmed) return;

  setAdminPanelMessage("正在移除记分员...");
  const { error } = await db.from("app_role_members").delete().eq("id", memberId);

  if (error) {
    setAdminPanelMessage(`移除记分员失败：${error.message}`, true);
    return;
  }

  if (currentAccessSession.memberId === memberId) {
    clearStoredAccessSession();
  }
  if (readRememberedScorerPlayerId() === (member?.player_id || "")) {
    writeRememberedScorerPlayerId("");
  }

  setAdminPanelMessage("记分员已移除。");
  appendAdminActionLog(`移除了记分员 ${member?.display_name || "该选手"}。`);
  await loadRoleMembers();
}

async function toggleScorerAutoReconnect(memberId, shouldAllow) {
  if (!ensureAdminAccess("仅管理员可调整记分员自动重连。")) return;
  if (!memberId) return;
  if (!roleMembersSupportAutoReconnect) {
    setAdminPanelMessage("永久自动重连字段尚未同步到 Supabase，请先执行最新的 sql/access_roles.sql。", true);
    return;
  }

  const member = getRoleAssignmentById(memberId);
  if (!member || member.role !== "scorer") return;

  setAdminPanelMessage(shouldAllow ? "正在启用永久自动重连..." : "正在关闭永久自动重连...");

  const { error } = await db
    .from("app_role_members")
    .update({
      allow_auto_reconnect: shouldAllow,
      auto_reconnect_device_id: shouldAllow ? (member.auto_reconnect_device_id || "") : null,
    })
    .eq("id", memberId);

  if (error) {
    setAdminPanelMessage(`更新自动重连失败：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    return;
  }

  setAdminPanelMessage(shouldAllow ? "已启用永久自动重连。" : "已关闭永久自动重连。");
  appendAdminActionLog(`${shouldAllow ? "启用" : "关闭"}了记分员 ${member.display_name || "该选手"} 的永久自动重连。`);
  await loadRoleMembers();
}

async function bindScorerAutoReconnectDevice(member) {
  if (!member?.id || !member.allow_auto_reconnect) return;
  const localDeviceId = getOrCreateLocalDeviceId();
  if (member.auto_reconnect_device_id === localDeviceId) return;

  const { error } = await db
    .from("app_role_members")
    .update({ auto_reconnect_device_id: localDeviceId })
    .eq("id", member.id);

  if (error) {
    console.error("绑定记分员自动重连设备失败：", error);
    return;
  }

  member.auto_reconnect_device_id = localDeviceId;
}

async function bindAdminAutoReconnectDevice(member) {
  if (!member?.id) return;
  const localDeviceId = getOrCreateLocalDeviceId();
  if (member.allow_auto_reconnect && member.auto_reconnect_device_id === localDeviceId) return;

  const { error } = await db
    .from("app_role_members")
    .update({
      allow_auto_reconnect: true,
      auto_reconnect_device_id: localDeviceId,
    })
    .eq("id", member.id);

  if (error) {
    console.error("绑定管理员自动重连设备失败：", error);
    return;
  }

  member.allow_auto_reconnect = true;
  member.auto_reconnect_device_id = localDeviceId;
}

async function confirmAccessRole() {
  const password = normalizeAccessPassword(accessPasswordInput.value);
  const selectedPlayerId = accessScorerSelect.value;

  if (!password) {
    setAccessMessage("请输入口令。", true);
    return;
  }

  if (accessModalMode === "admin") {
    if (password !== normalizeAccessPassword(ADMIN_ACCESS_PASSWORD)) {
      setAccessMessage("口令错误。", true);
      return;
    }
    const adminMember = getPrimaryAdminMember();
    writeStoredAccessSession({ role: "admin", memberId: adminMember?.id || "", playerId: "" });
    await bindAdminAutoReconnectDevice(adminMember);
    setAccessMessage("管理员模式已启用。");
    renderRoleMembers();
    applyRolePermissions();
    setAccessModalOpen(false);
    return;
  }

  if (password === normalizeAccessPassword(SCORER_ACCESS_PASSWORD)) {
    if (!selectedPlayerId) {
      setAccessMessage("请选择对应的总表选手。", true);
      return;
    }

    let scorerMember = getRoleMembersByRole("scorer").find((member) => member.player_id === selectedPlayerId);

    if (!scorerMember) {
      setAccessMessage("正在登记记分员身份...");
      const { error } = await db.from("app_role_members").insert([{ role: "scorer", player_id: selectedPlayerId }]);

      if (error && !String(error.message || "").includes("duplicate key")) {
        setAccessMessage(`记分员身份登记失败：${error.message}`, true);
        return;
      }

      await loadRoleMembers();
      scorerMember = getRoleMembersByRole("scorer").find((member) => member.player_id === selectedPlayerId);
    }

    if (!scorerMember || scorerMember.role !== "scorer") {
      setAccessMessage("该选手暂时无法成为记分员。", true);
      return;
    }

    writeStoredAccessSession({
      role: "scorer",
      memberId: scorerMember.id,
      playerId: scorerMember.player_id || selectedPlayerId || "",
    });
    writeRememberedScorerPlayerId(scorerMember.player_id || selectedPlayerId || "");
    await bindScorerAutoReconnectDevice(scorerMember);
    setAccessMessage("记分员身份已启用。");
    renderRoleMembers();
    applyRolePermissions();
    setAccessModalOpen(false);
    return;
  }

  setAccessMessage("口令错误。", true);
}

function clearRememberedScorerAutoLogin({ silent = false } = {}) {
  writeRememberedScorerPlayerId("");
  setSkipNextScorerReconnect(false);
  if (!silent) {
    setAdminPanelMessage("已清空本机记分员自动登录状态。");
    appendAdminActionLog("清空了本机记分员自动登录状态。");
  }
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

function exitAccessRole() {
  const previousRole = currentAccessSession.role;
  if (previousRole === "scorer") {
    const confirmed = window.confirm("确认退出当前记分员身份吗？");
    if (!confirmed) return;
    setSkipNextScorerReconnect(true);
  }
  clearStoredAccessSession();
  renderRoleMembers();
  applyRolePermissions();
  setScorerPanelOpen(false);
  setAdminPanelOpen(false);
  setMessage(previousRole === "admin" ? "已退出管理员模式。" : "已退出记分员身份。");
}

async function loadSeasons() {
  const { data, error } = await db
    .from("seasons")
    .select("id, name, start_date, is_active, koi_player_id")
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
    .select("id, display_name, reward_floor_bonus, reward_double_bonus, reward_extra_points")
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
      reward_floor_bonus: Number(stats?.reward_floor_bonus ?? player.reward_floor_bonus ?? 0),
      reward_double_bonus: Number(stats?.reward_double_bonus ?? player.reward_double_bonus ?? 0),
      reward_points: stats?.reward_points ?? (20 + Number(player.reward_floor_bonus ?? 0) + Number(player.reward_double_bonus ?? 0) + Number(player.reward_extra_points ?? 0)),
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
  await Promise.all([
    loadActiveMatchDay(),
    loadSeasonPlayers(),
    loadRoleMembers(),
    loadSeasons(),
    loadTodayPlayers(),
  ]);
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
    .select("player_id, display_name, score, games_played, wins, losses, win_rate, reward_points, reward_minimum, reward_extra_points")
    .order("score", { ascending: false })
    .order("reward_points", { ascending: false })
    .order("display_name", { ascending: true });

  if (result.error) {
    result = await db
      .from("leaderboard")
      .select("id, display_name, score, games_played, wins, losses, win_rate, reward_points")
      .order("score", { ascending: false })
      .order("reward_points", { ascending: false })
      .order("display_name", { ascending: true });
  }

  if (result.error) {
    result = await db
      .from("players")
      .select("id, display_name, score, games_played, wins, losses, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points")
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
  await ensurePreviousMatchDayPlaceholderOnce();

  let dayQuery = db
    .from("match_days")
    .select("id, season_id, match_date, started_at, closed_at, is_active, note")
    .order("match_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(60);

  let query = db
    .from("match_day_recent_matches")
    .select("match_id, match_day_id, season_id, match_date, day_is_active, winner_team, note, created_at, players, double_downs")
    .order("created_at", { ascending: false })
    .limit(200);

  let attendanceQuery = db
    .from("match_day_attendance_notes")
    .select(`
      id,
      match_day_id,
      season_id,
      match_date,
      player_id,
      status,
      note,
      created_at,
      players (
        display_name
      )
    `)
    .order("created_at", { ascending: true })
    .limit(200);

  if (activeSeason?.id) {
    dayQuery = dayQuery.eq("season_id", activeSeason.id);
    query = query.eq("season_id", activeSeason.id);
    attendanceQuery = attendanceQuery.eq("season_id", activeSeason.id);
  }

  const [dayResult, matchResult, attendanceResult] = await Promise.all([
    dayQuery,
    query,
    attendanceQuery,
  ]);
  const dayData = dayResult.data;
  const dayError = dayResult.error;
  let data = matchResult.data;
  let error = matchResult.error;

  if (error && (error.message.includes("season_id") || error.message.includes("double_downs"))) {
    ({ data, error } = await db
      .from("recent_matches")
      .select("match_id, winner_team, note, created_at, players")
      .order("created_at", { ascending: false })
      .limit(100));
  }

  if (error || dayError) {
    console.error("加载最近比赛失败：", error || dayError);
    recentMatchesData = [];
    recentMatchDayGroupsData = [];
    renderRecentMatches([]);
    if (leaderboardPlayers?.length) {
      renderLeaderboard(leaderboardPlayers);
    }
    return;
  }

  recentMatchesData = data || [];
  const attendanceNotes = attendanceResult?.error
    ? []
    : (attendanceResult?.data || []).map((entry) => ({
      ...entry,
      display_name: entry.players?.display_name || "未知选手",
    }));
  const groupedData = buildRecentMatchDayGroups(recentMatchesData, dayData || [], attendanceNotes);
  renderRecentMatches(groupedData);
  if (leaderboardPlayers?.length) {
    renderLeaderboard(leaderboardPlayers);
  }
}

async function resetCurrentSeason() {
  if (!ensureAdminAccess("仅管理员可重置当前赛季。")) return;
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
  appendAdminActionLog(`重置了赛季 ${activeSeason.name}。`);
  await loadRewardLogs();
  requestImmediateRefresh({
    seasonContext: true,
  });
}

async function setSeasonPlayerRank(playerId, playerName, playerRank) {
  if (!ensureScorerAccess("仅记分员或管理员可调整赛季选手身份。")) return;
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

async function setSeasonKoi(playerIdOverride = null, playerNameOverride = "") {
  if (!ensureScorerAccess("仅记分员或管理员可设置锦鲤。")) return;
  if (!activeSeason?.id) {
    setMessage("当前没有可设置的赛季。", true);
    return;
  }

  const currentKoiPlayerId = activeSeason?.koi_player_id ?? null;
  const normalizePlayerId = (value) => {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  };
  const currentKoiPlayerIdValue = normalizePlayerId(currentKoiPlayerId);
  const playerId = playerIdOverride !== null
    ? normalizePlayerId(playerIdOverride)
    : normalizePlayerId(koiPlayerSelect?.value || null);
  const nextPlayerId = playerId && playerId === currentKoiPlayerIdValue ? null : playerId;
  const playerName = playerNameOverride
    || seasonPlayers.find((player) => normalizePlayerId(player.id) === nextPlayerId)?.display_name
    || seasonPlayers.find((player) => normalizePlayerId(player.id) === currentKoiPlayerIdValue)?.display_name
    || "本赛季锦鲤";
  const isCurrentKoi = !nextPlayerId;
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
    p_player_id: nextPlayerId,
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
  appendAdminActionLog(`测试清空了报名队列，共删除 ${data ?? 0} 条记录。`);
  requestImmediateRefresh({ queue: true });
}

async function clearTodayPlayersForTesting() {
  if (!ensureAdminAccess("仅管理员可测试清空当日选手。")) return;
  const confirmed = window.confirm("确认清空当前赛季的当日选手名单吗？");

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
  appendAdminActionLog("取消了当前比赛日。");
  requestImmediateRefresh({
    playerDriven: true,
    queue: true,
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

async function addMatchDayAttendanceNote(matchDayId, seasonId, matchDate, status, playerId, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可补记每日名单。")) return;
  if (!matchDayId || !playerId || !status) {
    setMessage("缺少比赛日或选手信息，无法补记。", true);
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const optimisticNoteId = addMatchDayAttendanceNoteLocally(matchDayId, seasonId, matchDate, playerId, status);
  setMessage(`正在补记${status === "standby" ? "替补" : "未到场"}名单...`);

  const payload = {
    match_day_id: matchDayId,
    season_id: seasonId || activeSeason?.id || null,
    match_date: matchDate || null,
    player_id: playerId,
    status,
  };

  const { error } = await db.from("match_day_attendance_notes").insert([payload]);

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    if (optimisticNoteId) {
      removeMatchDayAttendanceNoteLocally(optimisticNoteId);
    }
    setMessage(`补记名单失败：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    return;
  }

  setMessage(`已补记${status === "standby" ? "替补" : "未到场"}名单。`);
  requestImmediateRefresh({
    playerDriven: true,
    recentMatches: true,
  });
}

async function removeMatchDayAttendanceNote(noteId, playerName, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可移除每日补记名单。")) return;
  if (!noteId) return;
  const confirmed = window.confirm(`确认移除 ${playerName || "该选手"} 的补记状态吗？`);
  if (!confirmed) return;

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  const removedState = removeMatchDayAttendanceNoteLocally(noteId);
  setMessage(`正在移除 ${playerName || "该选手"} 的补记状态...`);

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
    renderRecentMatches(recentMatchDayGroupsData);
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

async function recordMatch() {
  if (!ensureScorerAccess("仅记分员或管理员可登记比赛。")) return;
  if (!activeMatchDay && !activeSeason?.id) {
    setMatchMessage("当前缺少可用赛季，暂时无法保存今日比赛。", true);
    return;
  }
  const teamAIds = getSelectedTeamIds("teamA");
  const teamBIds = getSelectedTeamIds("teamB");
  const winner = winnerSelect.value || null;
  const matchNoteValue = matchNoteInput.value.trim() || null;
  const currentMatchHeroAssignments = { ...matchHeroAssignments };
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
  setMatchMessage(activeMatchDay ? "正在记录比赛..." : "正在保存今日比赛...");

  let matchId = null;
  let error = null;

  if (activeMatchDay) {
    ({ data: matchId, error } = await db.rpc("record_match_result", {
      p_team_a_player_ids: teamAIds,
      p_team_b_player_ids: teamBIds,
      p_winner_team: winner,
      p_note: matchNoteValue,
      p_created_by: null,
      p_season_id: activeSeason?.id || null,
      p_double_downs: doubleDownPayload,
    }));
  } else {
    ({ data: matchId, error } = await db.rpc("record_match_result_backfill", {
      p_team_a_player_ids: teamAIds,
      p_team_b_player_ids: teamBIds,
      p_winner_team: winner,
      p_note: matchNoteValue,
      p_created_by: null,
      p_season_id: activeSeason?.id || null,
      p_match_date: getBeijingBusinessDateString(),
      p_double_downs: doubleDownPayload,
    }));
  }

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
  upsertRecentMatchLocally(buildOptimisticMatchRecord(
    matchId,
    activeSeason?.id || null,
    activeMatchDay?.id || null,
    activeMatchDay?.match_date || getBeijingBusinessDateString(),
    winner,
    matchNoteValue,
    teamAIds,
    teamBIds,
    currentMatchHeroAssignments,
    doubleDownPayload,
    new Date().toISOString()
  ));
  setMatchMessage(winner ? "比赛记录成功，积分榜已刷新。" : "比赛记录已保存，当前未计分，补填胜负后才会变动积分。");
  appendAdminActionLog("添加了一场比赛记录。");
  requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
}

async function recordBackfillMatch() {
  if (!ensureScorerAccess("仅记分员或管理员可补录比赛。")) return;
  const teamAIds = [...backfillTeamSelections.teamA];
  const teamBIds = [...backfillTeamSelections.teamB];
  const winner = backfillWinnerSelect.value || null;
  const isEditing = Boolean(editingMatchId);
  const backfillNoteValue = backfillMatchNoteInput.value.trim() || null;
  const currentBackfillHeroAssignments = { ...backfillHeroAssignments };
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
      p_note: backfillNoteValue,
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
      p_note: backfillNoteValue,
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
  if (!isEditing) {
    upsertRecentMatchLocally(buildOptimisticMatchRecord(
      matchId,
      backfillSeasonSelect.value,
      null,
      backfillDateInput.value,
      winner,
      backfillNoteValue,
      teamAIds,
      teamBIds,
      currentBackfillHeroAssignments,
      doubleDownPayload,
      new Date().toISOString()
    ));
  }
  setMessage(
    isEditing
      ? (winner ? "比赛修改成功，积分已按全部记录重算。" : "比赛修改成功，当前未计分，补填胜负后才会变动积分。")
      : (winner ? "历史比赛补录成功。" : "历史比赛已归档，当前未计分，补填胜负后才会变动积分。")
  );
  appendAdminActionLog(isEditing ? "修改了一场比赛记录。" : "补录了一场比赛记录。");
  requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
}

async function startEditingMatch(matchId) {
  if (!ensureScorerAccess("仅记分员或管理员可修改比赛记录。")) return;
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
  if (!ensureScorerAccess("仅记分员或管理员可删除比赛记录。")) return;
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
  appendAdminActionLog("删除了一场比赛记录。");
  requestImmediateRefresh({
    leaderboard: true,
    recentMatches: true,
  });
}

async function moveMatchWithinDay(matchId, direction, buttonEl) {
  if (!ensureScorerAccess("仅记分员或管理员可调整场次顺序。")) return;
  if (!matchId || !["up", "down"].includes(direction)) return;

  const rollbackState = moveRecentMatchLocally(matchId, direction);
  if (!rollbackState) return;

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMessage(`正在调整场次顺序...`);

  const { error } = await db.rpc("move_match_within_day", {
    p_match_id: matchId,
    p_direction: direction,
  });

  if (buttonEl) {
    buttonEl.disabled = false;
  }

  if (error) {
    restoreRecentMatchOrderLocally(rollbackState.groupKey, rollbackState.previousOrder);
    setMessage(`调整场次顺序失败：${error.message}。请先在 Supabase 执行最新 SQL。`, true);
    return;
  }

  setMessage("场次顺序已调整，积分已按新顺序重算。");
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
      { event: "*", schema: "public", table: "app_role_members" },
      () => {
        scheduleRefresh({
          playerDriven: true,
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
      { event: "*", schema: "public", table: "match_day_attendance_notes" },
      () => {
        scheduleRefresh({
          playerDriven: true,
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
          rewardLogs: true,
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
          rewardLogs: true,
          recentMatches: true,
        });
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_double_downs" },
      () => {
        scheduleRefresh({
          leaderboard: true,
          rewardLogs: true,
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
signupAllBtn.addEventListener("click", signupAllPlayers);
adminClearQueueBtn.addEventListener("click", clearSignupQueueForTesting);
adminClearTodayPlayersBtn.addEventListener("click", clearTodayPlayersForTesting);
adminResetSeasonBtn.addEventListener("click", resetCurrentSeason);
adminClearScorerRememberBtn.addEventListener("click", () => {
  if (!ensureAdminAccess("仅管理员可清空本机记分员自动登录。")) return;
  clearRememberedScorerAutoLogin();
});
adminAddScorerBtn.addEventListener("click", () => addScorerRoleByPlayer(adminAddScorerSelect.value));
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

openBackfillFormBtn.addEventListener("click", async () => {
  if (!backfillSeasonSelect.value && activeSeason?.id) {
    backfillSeasonSelect.value = activeSeason.id;
  }
  backfillDateInput.value = backfillDateInput.value || getPreviousBeijingBusinessDateString();
  await loadPlayersForSeason(backfillSeasonSelect.value);
  clearBackfillForm();
  setBackfillFormOpen(true);
  setMatchFormOpen(false);
  renderBackfillForm();
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
    teamDoublePickerOpen[formType][team] = !teamDoublePickerOpen[formType][team];
    renderInlineTeamDoubleControls(formType, !canUseMatchRecordingForm());
    return;
  }

  const teamDoubleClear = event.target.closest('[data-role="team-double-clear"]');
  if (teamDoubleClear) {
    const team = teamDoubleClear.dataset.team === "A" ? "A" : "B";
    matchDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"] = "";
    teamDoublePickerOpen.match[team] = true;
    renderInlineTeamDoubleControls("match", !canUseMatchRecordingForm());
    return;
  }

  const teamDoubleTarget = event.target.closest('[data-role="team-double-target"]');
  if (teamDoubleTarget) {
    const team = teamDoubleTarget.dataset.team === "A" ? "A" : "B";
    const playerId = teamDoubleTarget.dataset.playerId || "";
    const currentValue = matchDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"];
    matchDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"] = currentValue === playerId ? "" : playerId;
    teamDoublePickerOpen.match[team] = true;
    renderInlineTeamDoubleControls("match", !canUseMatchRecordingForm());
    return;
  }

  const playerDoubleToggle = event.target.closest('[data-role="player-double-toggle"]');
  if (playerDoubleToggle) {
    const playerId = playerDoubleToggle.dataset.playerId || "";
    singleDoublePickerOpen.match[playerId] = !singleDoublePickerOpen.match[playerId];
    refreshMatchSelectOptions();
    return;
  }

  const playerDoubleClear = event.target.closest('[data-role="player-double-clear"]');
  if (playerDoubleClear) {
    const userPlayerId = playerDoubleClear.dataset.userPlayerId || "";
    setSingleDoubleTarget("match", userPlayerId, "");
    singleDoublePickerOpen.match[userPlayerId] = true;
    refreshMatchSelectOptions();
    return;
  }

  const playerDoubleTarget = event.target.closest('[data-role="player-double-target"]');
  if (playerDoubleTarget) {
    const userPlayerId = playerDoubleTarget.dataset.userPlayerId || "";
    const targetPlayerId = playerDoubleTarget.dataset.targetPlayerId || "";
    const currentTargetId = getSingleDoubleTargetByUser("match", userPlayerId);
    setSingleDoubleTarget("match", userPlayerId, currentTargetId === targetPlayerId ? "" : targetPlayerId);
    singleDoublePickerOpen.match[userPlayerId] = Boolean(currentTargetId === targetPlayerId ? "" : targetPlayerId);
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

matchFormPanel.addEventListener("change", () => {});

backfillFormPanel.addEventListener("change", async (event) => {
  if (event.target === backfillSeasonSelect) {
    clearBackfillForm();
    await loadPlayersForSeason(backfillSeasonSelect.value);
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
    teamDoublePickerOpen[formType][team] = !teamDoublePickerOpen[formType][team];
    renderInlineTeamDoubleControls(formType, !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    return;
  }

  const teamDoubleClear = event.target.closest('[data-role="team-double-clear"]');
  if (teamDoubleClear) {
    const team = teamDoubleClear.dataset.team === "A" ? "A" : "B";
    backfillDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"] = "";
    teamDoublePickerOpen.backfill[team] = true;
    renderInlineTeamDoubleControls("backfill", !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    return;
  }

  const teamDoubleTarget = event.target.closest('[data-role="team-double-target"]');
  if (teamDoubleTarget) {
    const team = teamDoubleTarget.dataset.team === "A" ? "A" : "B";
    const playerId = teamDoubleTarget.dataset.playerId || "";
    const currentValue = backfillDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"];
    backfillDoubleState[team === "A" ? "teamAUserId" : "teamBUserId"] = currentValue === playerId ? "" : playerId;
    teamDoublePickerOpen.backfill[team] = true;
    renderInlineTeamDoubleControls("backfill", !backfillSeasonSelect.value || backfillPlayers.length < TEAM_SIZE * 2);
    return;
  }

  const playerDoubleToggle = event.target.closest('[data-role="player-double-toggle"]');
  if (playerDoubleToggle) {
    const playerId = playerDoubleToggle.dataset.playerId || "";
    singleDoublePickerOpen.backfill[playerId] = !singleDoublePickerOpen.backfill[playerId];
    refreshBackfillSelectOptions();
    return;
  }

  const playerDoubleClear = event.target.closest('[data-role="player-double-clear"]');
  if (playerDoubleClear) {
    const userPlayerId = playerDoubleClear.dataset.userPlayerId || "";
    setSingleDoubleTarget("backfill", userPlayerId, "");
    singleDoublePickerOpen.backfill[userPlayerId] = true;
    refreshBackfillSelectOptions();
    return;
  }

  const playerDoubleTarget = event.target.closest('[data-role="player-double-target"]');
  if (playerDoubleTarget) {
    const userPlayerId = playerDoubleTarget.dataset.userPlayerId || "";
    const targetPlayerId = playerDoubleTarget.dataset.targetPlayerId || "";
    const currentTargetId = getSingleDoubleTargetByUser("backfill", userPlayerId);
    setSingleDoubleTarget("backfill", userPlayerId, currentTargetId === targetPlayerId ? "" : targetPlayerId);
    singleDoublePickerOpen.backfill[userPlayerId] = Boolean(currentTargetId === targetPlayerId ? "" : targetPlayerId);
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
  const attendanceAddButton = event.target.closest(".match-day-attendance-add-btn");
  if (attendanceAddButton) {
    const panel = attendanceAddButton.closest(".match-day-attendance-panel");
    const playerSelect = panel?.querySelector('[data-role="attendance-player-select"]');
    await addMatchDayAttendanceNote(
      attendanceAddButton.dataset.matchDayId,
      attendanceAddButton.dataset.seasonId,
      attendanceAddButton.dataset.matchDate,
      attendanceAddButton.dataset.status,
      playerSelect?.value,
      attendanceAddButton
    );
    return;
  }

  const attendanceRemoveButton = event.target.closest(".match-day-attendance-remove-btn");
  if (attendanceRemoveButton) {
    await removeMatchDayAttendanceNote(
      attendanceRemoveButton.dataset.noteId,
      attendanceRemoveButton.dataset.playerName,
      attendanceRemoveButton
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

  const moveButton = event.target.closest('[data-role="move-match"]');
  if (moveButton) {
    await moveMatchWithinDay(
      moveButton.dataset.matchId,
      moveButton.dataset.direction,
      moveButton
    );
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
  if (!isCurrentRoleScorer()) return;
  const button = event.target.closest('[data-role="season-rank"]');
  if (button) {
    await setSeasonPlayerRank(button.dataset.playerId, button.dataset.playerName, button.dataset.rank);
    return;
  }

  const koiButton = event.target.closest('[data-role="season-koi"]');
  if (!koiButton) return;

  await setSeasonKoi(koiButton.dataset.playerId, koiButton.dataset.playerName);
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

if (setKoiBtn) {
  setKoiBtn.addEventListener("click", () => setSeasonKoi());
}

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

if (adminLogoTrigger) {
  adminLogoTrigger.addEventListener("dblclick", (event) => {
    if (isCurrentRoleAdmin() || currentAccessSession.role === "scorer") return;
    event.preventDefault();
    if (tryReconnectRememberedScorer()) {
      return;
    }
    renderAccessScorerOptions();
    setAccessModalOpen(true, "scorer");
  });
}

if (adminSecretTrigger) {
  adminSecretTrigger.addEventListener("dblclick", (event) => {
    if (isCurrentRoleAdmin()) return;
    event.preventDefault();
    if (tryReconnectRememberedAdmin()) {
      return;
    }
    setAccessModalOpen(true, "admin");
  });
}

if (accessModalBackdrop) {
  accessModalBackdrop.addEventListener("click", () => setAccessModalOpen(false));
}

closeAccessModalBtn.addEventListener("click", () => setAccessModalOpen(false));
confirmAccessBtn.addEventListener("click", confirmAccessRole);
if (accessScorerChips) {
  accessScorerChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".access-scorer-chip");
    if (!chip) return;
    const playerId = chip.dataset.playerId || "";
    accessScorerSelect.value = playerId;
    accessScorerChips.querySelectorAll(".access-scorer-chip").forEach((item) => {
      item.classList.toggle("access-scorer-chip-active", item === chip);
    });
  });
}
accessPasswordInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await confirmAccessRole();
});

scorerMembersList.addEventListener("click", async (event) => {
  const toggleButton = event.target.closest(".admin-toggle-scorer-reconnect-btn");
  if (toggleButton) {
    await toggleScorerAutoReconnect(
      toggleButton.dataset.roleMemberId,
      toggleButton.dataset.allowAutoReconnect !== "true"
    );
    return;
  }
  const button = event.target.closest(".admin-remove-scorer-btn");
  if (!button) return;
  await removeScorerRole(button.dataset.roleMemberId);
});

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
leaderboardCompactBtn.addEventListener("click", () => {
  setLeaderboardCompactMode(!isLeaderboardCompact);
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
    setLeaderboardCompactMode(readStoredLeaderboardCompactState());
    renderHeroOptions();
    matchStartTimeInput.value = formatTime24(readStoredMatchDayStartTime()?.startTime || "");
    backfillDateInput.value = getPreviousBeijingBusinessDateString();
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
