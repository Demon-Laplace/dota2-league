const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";
const TEAM_SIZE = 5;

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const playerSelect = document.getElementById("playerSelect");
const signupBtn = document.getElementById("signupBtn");
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
const matchNoteInput = document.getElementById("matchNote");
const backfillSeasonSelect = document.getElementById("backfillSeasonSelect");
const backfillDateInput = document.getElementById("backfillDateInput");
const backfillMatchNoteInput = document.getElementById("backfillMatchNote");
const recordMatchBtn = document.getElementById("recordMatchBtn");
const recordBackfillBtn = document.getElementById("recordBackfillBtn");
const recentMatchesList = document.getElementById("recentMatchesList");
const recentMatchesEmpty = document.getElementById("recentMatchesEmpty");

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
let isMatchFormOpen = false;
let isBackfillFormOpen = false;
let isSeasonPanelOpen = false;
let isRewardPanelOpen = false;

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

function setRewardMessage(text, isError = false) {
  rewardMessageEl.textContent = text;
  rewardMessageEl.className = isError ? "message error" : "message";
}

function formatScore(value) {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return "0";
  return numericValue.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
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
  return Array.from(
    document.querySelectorAll("#teamAFields select, #teamBFields select")
  )
    .map((select) => select.value)
    .filter(Boolean);
}

function getSelectedBackfillPlayerIds() {
  return Array.from(
    document.querySelectorAll("#backfillTeamAFields select, #backfillTeamBFields select")
  )
    .map((select) => select.value)
    .filter(Boolean);
}

function getSelectablePlayersForField(currentValue) {
  const selected = new Set(getSelectedMatchPlayerIds());
  if (currentValue) {
    selected.delete(currentValue);
  }

  return todayPlayers
    .map((player) => ({
      id: player.player_id,
      display_name: player.display_name,
    }))
    .filter((player) => !selected.has(player.id) || player.id === currentValue);
}

function getSelectableBackfillPlayersForField(currentValue) {
  const selected = new Set(getSelectedBackfillPlayerIds());
  if (currentValue) {
    selected.delete(currentValue);
  }

  return backfillPlayers.filter((player) => !selected.has(player.id) || player.id === currentValue);
}

function refreshMatchSelectOptions() {
  document
    .querySelectorAll("#teamAFields select, #teamBFields select")
    .forEach((select) => {
      const currentValue = select.value;
      const selectablePlayers = getSelectablePlayersForField(currentValue);
      select.innerHTML = buildOptionsFromPlayers(selectablePlayers, currentValue);
    });
}

function refreshBackfillSelectOptions() {
  document
    .querySelectorAll("#backfillTeamAFields select, #backfillTeamBFields select")
    .forEach((select) => {
      const currentValue = select.value;
      const selectablePlayers = getSelectableBackfillPlayersForField(currentValue);
      select.innerHTML = buildOptionsFromPlayers(selectablePlayers, currentValue);
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

  seasonPlayers.forEach((player) => {
    const item = document.createElement("div");
    item.className = `season-player-item${player.is_in_season ? " season-player-item-active" : ""}`;
    const statusBadge = player.is_in_season
      ? '<span class="queue-slot">本赛季参赛</span>'
      : '<span class="muted">点击加入赛季</span>';
    item.innerHTML = `
      <button
        class="season-player-button${player.is_in_season ? " season-player-button-active" : ""}"
        type="button"
        data-player-id="${player.id}"
        data-player-name="${escapeHtml(player.display_name)}"
      >
        <strong>${escapeHtml(player.display_name)}</strong>
        ${statusBadge}
      </button>
    `;
    seasonPlayersList.appendChild(item);
  });

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
      matchStartTimeDisplay.textContent = `开始时间：${storedStartTime.startTime}`;
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
  const queuedPlayerIds = new Set(
    queueEntries
      .filter((row) => row.is_active === true || row.status === "cancelled")
      .map((row) => row.player_id)
  );
  const signablePlayers = seasonPlayers.filter((player) => player.is_in_season && !queuedPlayerIds.has(player.id));
  const hasPlayers = signablePlayers.length > 0 && Boolean(activeMatchDay);

  playerSelect.innerHTML = hasPlayers
    ? buildOptionsFromPlayers(signablePlayers)
    : `<option value="">${activeMatchDay ? "暂无可报名选手" : "请先发起当日比赛"}</option>`;
  playerSelect.disabled = !hasPlayers;
  signupBtn.disabled = !hasPlayers;

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
  renderMatchPlayerFields(teamAFields, "teamA");
  renderMatchPlayerFields(teamBFields, "teamB");
  refreshMatchSelectOptions();

  const hasEnoughPlayers = Boolean(activeMatchDay) && todayPlayers.length >= TEAM_SIZE * 2;
  winnerSelect.disabled = !hasEnoughPlayers;
  matchNoteInput.disabled = !hasEnoughPlayers;
  recordMatchBtn.disabled = !hasEnoughPlayers;
  closeMatchFormBtn.disabled = false;
  openMatchFormBtn.disabled = isMatchFormOpen || !hasEnoughPlayers;
}

function renderBackfillForm() {
  renderBackfillPlayerFields();
  refreshBackfillSelectOptions();
  backfillSeasonSelect.innerHTML = buildSeasonOptions(allSeasons, backfillSeasonSelect.value);
  const hasEnoughPlayers = backfillPlayers.length >= TEAM_SIZE * 2;
  const hasSeason = Boolean(backfillSeasonSelect.value);
  backfillWinnerSelect.disabled = !hasSeason || !hasEnoughPlayers;
  backfillDateInput.disabled = !hasSeason;
  backfillMatchNoteInput.disabled = !hasSeason || !hasEnoughPlayers;
  recordBackfillBtn.disabled = !hasSeason || !hasEnoughPlayers || !backfillDateInput.value;
}

function clearMatchForm() {
  document
    .querySelectorAll("#teamAFields select, #teamBFields select")
    .forEach((select) => {
      select.value = "";
    });
  winnerSelect.value = "";
  matchNoteInput.value = "";
  refreshMatchSelectOptions();
  setMatchMessage("");
}

function clearBackfillForm() {
  document
    .querySelectorAll("#backfillTeamAFields select, #backfillTeamBFields select")
    .forEach((select) => {
      select.value = "";
    });
  backfillWinnerSelect.value = "";
  backfillMatchNoteInput.value = "";
  refreshBackfillSelectOptions();
  setBackfillMessage("");
}

function renderQueue(data) {
  queueList.innerHTML = "";
  const allRows = data || [];
  const activeRows = allRows.filter((row) => row.is_active === true);
  confirmQueueBtn.disabled = activeRows.length < 10;

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
    const actionHtml = isCancelled
      ? `<button class="button-secondary queue-resignup-btn" data-entry-id="${row.id}" data-player-name="${escapeHtml(playerName)}">重新报名</button>`
      : `<button class="button-danger queue-cancel-btn" data-entry-id="${row.id}" data-player-name="${escapeHtml(playerName)}">取消报名</button>`;
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

  const { error } = await db.rpc("add_player_reward_extra", {
    p_player_id: playerId || null,
    p_extra_amount: extraAmount,
    p_season_id: activeSeason?.id || null,
    p_donor_name: outsideName || null,
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
  await loadLeaderboard();
  await loadSeasonPlayers();
  await loadRewardLogs();
  updateRewardMinimumHint();
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

  if (error) {
    console.error("加载赞助记录失败：", error);
    rewardLogs = [];
    externalRewardTotal = 0;
    refreshSeasonRewardTotal();
    renderRewardLogs();
    return;
  }

  rewardLogs = data || [];
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
  await loadLeaderboard();
  await loadSeasonPlayers();
  await loadRewardLogs();
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
  recentMatchesList.innerHTML = "";

  if (!data || data.length === 0) {
    recentMatchesEmpty.style.display = "block";
    return;
  }

  recentMatchesEmpty.style.display = "none";

  const groups = new Map();

  data.forEach((match) => {
    const key = match.match_date || "未分组";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(match);
  });

  groups.forEach((matches, matchDate) => {
    const details = document.createElement("details");
    const isActiveDay = matches.some((match) => match.day_is_active);
    details.className = "match-day-group";
    details.open = isActiveDay;

    details.innerHTML = `
      <summary>
        <div class="match-day-summary">
          <strong>${escapeHtml(matchDate)}</strong>
          <span class="queue-slot">${matches.length} 场</span>
          <span class="winner-badge">${isActiveDay ? "进行中" : "已归档"}</span>
        </div>
        <span class="muted">${isActiveDay ? "点击收起" : "点击展开"}</span>
      </summary>
      <div class="match-day-content"></div>
    `;

    const content = details.querySelector(".match-day-content");

    matches.forEach((match) => {
      const players = parseRecentMatchPlayers(match.players);
      const teamAPlayers = players.filter((player) => player.team === "A");
      const teamBPlayers = players.filter((player) => player.team === "B");
      const winnerLabel = match.winner_team === "A" ? "天辉方获胜" : "夜魇方获胜";
      const card = document.createElement("article");

      card.className = "recent-match-card";
      card.innerHTML = `
        <div class="recent-match-head">
          <div class="recent-match-title">
            <strong>${winnerLabel}</strong>
            <span class="winner-badge">比赛完成</span>
          </div>
          <div class="queue-actions">
            <span class="muted">${escapeHtml(formatLocalTime(match.created_at))}</span>
            <button class="button-danger delete-match-btn" data-match-id="${match.match_id}">删除记录</button>
          </div>
        </div>
        <div class="recent-match-teams">
          <div class="recent-match-team">
            <h3>天辉方</h3>
            <ul>${teamAPlayers.map((player) => `<li>${escapeHtml(player.display_name || "未知选手")}</li>`).join("")}</ul>
          </div>
          <div class="recent-match-team">
            <h3>夜魇方</h3>
            <ul>${teamBPlayers.map((player) => `<li>${escapeHtml(player.display_name || "未知选手")}</li>`).join("")}</ul>
          </div>
        </div>
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
      players (
        display_name
      )
    `)
    .eq("season_id", seasonId)
    .order("player_id", { ascending: true });

  if (error) {
    console.error("加载补登赛季选手失败：", error);
    backfillPlayers = [];
    renderBackfillForm();
    setBackfillMessage(`加载赛季选手失败：${error.message}`, true);
    return;
  }

  backfillPlayers = (data || []).map((row) => ({
    id: row.player_id,
    display_name: row.players?.display_name || "未知选手",
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
    playerSelect.innerHTML = '<option value="">加载失败</option>';
    renderSignupOptions();
    renderMatchForm();
    setMessage(`加载玩家失败：${playersResult.error.message}`, true);
    return;
  }

  let participantIds = new Set();
  let rewardStats = new Map();

  if (activeSeason?.id) {
    const participantsResult = await db
      .from("season_players")
      .select("player_id")
      .eq("season_id", activeSeason.id);

    if (!participantsResult.error) {
      participantIds = new Set((participantsResult.data || []).map((row) => row.player_id));
    }

    const statsResult = await db
      .from("season_player_stats")
      .select("player_id, reward_points, reward_floor_bonus, reward_extra_points")
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
      display_name: player.display_name,
      reward_points: stats?.reward_points ?? (20 + Number(player.reward_floor_bonus ?? 0) + Number(player.reward_extra_points ?? 0)),
      reward_minimum: 20 + Number(stats?.reward_floor_bonus ?? player.reward_floor_bonus ?? 0),
      reward_extra_points: stats?.reward_extra_points ?? player.reward_extra_points ?? 0,
    };
  });

  seasonPlayers.sort((a, b) => {
    if (a.is_in_season !== b.is_in_season) {
      return a.is_in_season ? -1 : 1;
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
      .select("id, display_name, score, games_played, reward_points, reward_floor_bonus, reward_extra_points")
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
    reward_minimum: player.reward_minimum ?? (20 + Number(player.reward_floor_bonus ?? 0)),
    reward_extra_points: player.reward_extra_points ?? 0,
  }));
  renderLeaderboard(leaderboardData);
}

async function loadRecentMatches() {
  let query = db
    .from("match_day_recent_matches")
    .select("match_id, match_day_id, match_date, day_is_active, winner_team, note, created_at, players")
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  let { data, error } = await query;

  if (error && error.message.includes("season_id")) {
    ({ data, error } = await db
      .from("recent_matches")
      .select("match_id, winner_team, note, created_at, players")
      .order("created_at", { ascending: false })
      .limit(100));
  }

  if (error) {
    console.error("加载最近比赛失败：", error);
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
  setMessage(`已重置 ${activeSeason.name}，并从总表同步了 ${data ?? 0} 名选手。`);
  await refreshPlayerDrivenViews();
  await loadQueue();
  await loadLeaderboard();
  await loadRecentMatches();
}

async function toggleSeasonPlayer(playerId, playerName) {
  if (!activeSeason?.id) {
    setMessage("当前没有可操作的赛季。", true);
    return;
  }

  const currentPlayer = seasonPlayers.find((player) => player.id === playerId);
  const isInSeason = Boolean(currentPlayer?.is_in_season);

  setMessage(isInSeason ? `正在取消 ${playerName} 的赛季参赛...` : `正在将 ${playerName} 加入当前赛季...`);

  const { data, error } = await db.rpc("toggle_season_player", {
    p_player_id: playerId,
    p_season_id: activeSeason.id,
  });

  if (error) {
    setMessage(`更新赛季参赛状态失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  setMessage(data ? `${playerName} 已加入当前赛季。` : `${playerName} 已取消当前赛季参赛。`);
  await refreshPlayerDrivenViews();
  await loadQueue();
  await loadLeaderboard();
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

  await loadActiveSeason();
  renderSeasonPlayersPanel();
  await loadLeaderboard();
  setMessage(
    isCurrentKoi
      ? "已取消赛季锦鲤，并按当前规则重算积分。"
      : `${playerName} 已设为赛季锦鲤，并按当前规则重算积分。`
  );
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

  const playerId = playerSelect.value;

  if (!playerId) {
    setMessage("请先选择玩家。", true);
    return;
  }

  signupBtn.disabled = true;
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

  signupBtn.disabled = false;

  if (error) {
    if (error.message.includes("signup_queue_one_active_per_player")) {
      setMessage("该玩家已经在报名队列中。", true);
      return;
    }

    setMessage(`报名失败：${error.message}`, true);
    return;
  }

  setMessage("报名成功。");
  await loadQueue();
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
  await loadQueue();
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
  await loadQueue();
}

async function confirmQueueToTodayPlayers() {
  confirmQueueBtn.disabled = true;
  setMessage("正在将报名队列加入当日名单...");

  const { data, error } = await db.rpc("confirm_queue_to_today_players", {
    p_season_id: activeSeason?.id || null,
  });

  if (error) {
    setMessage(`全部到齐失败：${error.message}`, true);
    await loadQueue();
    return;
  }

  setMessage(`已确认到齐，加入当日名单 ${data ?? 0} 人。`);
  await loadQueue();
  await refreshPlayerDrivenViews();
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
  await loadQueue();
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
  await refreshPlayerDrivenViews();
}

async function startMatchDay() {
  if (!matchStartTimeInput.value) {
    setMessage("请先填写开始时间。", true);
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
    startTime: matchStartTimeInput.value,
  });
  setMessage("当日比赛已发起，可以开始报名和记录比赛。");
  await refreshPlayerDrivenViews();
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
  await refreshPlayerDrivenViews();
  await loadQueue();
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
  await refreshPlayerDrivenViews();
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
  await refreshPlayerDrivenViews();
}

function getSelectedTeamIds(prefix) {
  return Array.from(document.querySelectorAll(`select[data-team="${prefix}"]`))
    .map((select) => select.value);
}

function validateMatchPlayers(teamAIds, teamBIds) {
  if (!winnerSelect.value) {
    return "请选择胜方。";
  }

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
    return "请选择补登日期。";
  }

  if (!backfillWinnerSelect.value) {
    return "请选择胜方。";
  }

  if (backfillPlayers.length < TEAM_SIZE * 2) {
    return "该赛季选手不足 10 人，无法补登比赛。";
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
  const winner = winnerSelect.value;
  const validationError = validateMatchPlayers(teamAIds, teamBIds);

  if (validationError) {
    setMatchMessage(validationError, true);
    return;
  }

  recordMatchBtn.disabled = true;
  setMatchMessage("正在记录比赛...");

  const { error } = await db.rpc("record_match_result", {
    p_team_a_player_ids: teamAIds,
    p_team_b_player_ids: teamBIds,
    p_winner_team: winner,
    p_note: matchNoteInput.value.trim() || null,
    p_created_by: null,
    p_season_id: activeSeason?.id || null,
  });

  recordMatchBtn.disabled = false;

  if (error) {
    setMatchMessage(
      `记录比赛失败：${error.message}。请先在 Supabase 执行对应 SQL。`,
      true
    );
    return;
  }

  clearMatchForm();
  setMatchFormOpen(false);
  renderMatchForm();
  setMatchMessage("比赛记录成功，积分榜已刷新。");
  await loadLeaderboard();
  await loadRecentMatches();
}

async function recordBackfillMatch() {
  const teamAIds = Array.from(document.querySelectorAll('select[data-team="backfillTeamA"]')).map((select) => select.value);
  const teamBIds = Array.from(document.querySelectorAll('select[data-team="backfillTeamB"]')).map((select) => select.value);
  const validationError = validateBackfillPlayers(teamAIds, teamBIds);

  if (validationError) {
    setBackfillMessage(validationError, true);
    return;
  }

  recordBackfillBtn.disabled = true;
  setBackfillMessage("正在补登比赛...");

  const { error } = await db.rpc("record_match_result_backfill", {
    p_team_a_player_ids: teamAIds,
    p_team_b_player_ids: teamBIds,
    p_winner_team: backfillWinnerSelect.value,
    p_note: backfillMatchNoteInput.value.trim() || null,
    p_created_by: null,
    p_season_id: backfillSeasonSelect.value,
    p_match_date: backfillDateInput.value,
  });

  recordBackfillBtn.disabled = false;

  if (error) {
    setBackfillMessage(`补登比赛失败：${error.message}。请先在 Supabase 执行对应 SQL。`, true);
    return;
  }

  clearBackfillForm();
  setBackfillFormOpen(false);
  renderBackfillForm();
  setMessage("历史比赛补登成功。");
  await loadLeaderboard();
  await loadRecentMatches();
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
  await loadLeaderboard();
  await loadRecentMatches();
}

function subscribeRealtime() {
  db.channel("app-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "signup_queue" },
      async () => {
        await loadQueue();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "match_days" },
      async () => {
        await refreshPlayerDrivenViews();
        await loadRecentMatches();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "daily_player_roster" },
      async () => {
        await refreshPlayerDrivenViews();
      }
    )
    .subscribe();
}

signupBtn.addEventListener("click", signup);
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

matchFormPanel.addEventListener("change", (event) => {
  if (event.target.matches("#teamAFields select, #teamBFields select")) {
    refreshMatchSelectOptions();
  }
});

backfillFormPanel.addEventListener("change", async (event) => {
  if (event.target === backfillSeasonSelect) {
    clearBackfillForm();
    await loadPlayersForSeason(backfillSeasonSelect.value);
    return;
  }

  if (event.target.matches("#backfillTeamAFields select, #backfillTeamBFields select")) {
    refreshBackfillSelectOptions();
  }
});

queueList.addEventListener("click", async (event) => {
  const cancelButton = event.target.closest(".queue-cancel-btn");
  if (cancelButton) {
    await cancelSignupByEntry(
      cancelButton.dataset.entryId,
      cancelButton.dataset.playerName,
      cancelButton
    );
    return;
  }

  const reSignupButton = event.target.closest(".queue-resignup-btn");
  if (reSignupButton) {
    await reSignupByEntry(
      reSignupButton.dataset.entryId,
      reSignupButton.dataset.playerName,
      reSignupButton
    );
  }
});

todayPlayersList.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove-today-player-btn");
  if (!button) return;

  await removeTodayPlayer(button.dataset.entryId, button);
});

recentMatchesList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-match-btn");
  if (!button) return;

  await deleteMatch(button.dataset.matchId, button);
});

seasonPlayersList.addEventListener("click", async (event) => {
  const button = event.target.closest(".season-player-button");
  if (!button) return;

  await toggleSeasonPlayer(button.dataset.playerId, button.dataset.playerName);
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

rewardLogsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".cancel-reward-log-btn");
  if (!button) return;

  await cancelRewardDonation(
    button.dataset.donationId,
    button.dataset.playerName,
    button
  );
});

async function init() {
  setMatchFormOpen(false);
  setBackfillFormOpen(false);
  setSeasonPanelOpen(false);
  setRewardPanelOpen(false);
  matchStartTimeInput.value = readStoredMatchDayStartTime()?.startTime || "";
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
}

init();
