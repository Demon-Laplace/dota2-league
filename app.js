const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";
const TEAM_SIZE = 5;

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const playerSelect = document.getElementById("playerSelect");
const signupBtn = document.getElementById("signupBtn");
const messageEl = document.getElementById("message");
const openMatchFormBtn = document.getElementById("openMatchFormBtn");
const closeMatchFormBtn = document.getElementById("closeMatchFormBtn");
const matchFormPanel = document.getElementById("matchFormPanel");
const matchMessageEl = document.getElementById("matchMessage");
const seasonInfoEl = document.getElementById("seasonInfo");
const teamAFields = document.getElementById("teamAFields");
const teamBFields = document.getElementById("teamBFields");
const winnerSelect = document.getElementById("winnerSelect");
const matchNoteInput = document.getElementById("matchNote");
const recordMatchBtn = document.getElementById("recordMatchBtn");
const queueList = document.getElementById("queueList");
const queueEmpty = document.getElementById("queueEmpty");
const leaderboardBody = document.getElementById("leaderboardBody");
const recentMatchesList = document.getElementById("recentMatchesList");
const recentMatchesEmpty = document.getElementById("recentMatchesEmpty");

let availablePlayers = [];
let activeSeason = null;
let isMatchFormOpen = false;

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.className = isError ? "message error" : "message";
}

function setMatchMessage(text, isError = false) {
  matchMessageEl.textContent = text;
  matchMessageEl.className = isError ? "message error" : "message";
}

function setMatchFormOpen(isOpen) {
  isMatchFormOpen = isOpen;
  matchFormPanel.hidden = !isOpen;
  openMatchFormBtn.textContent = isOpen ? "正在录入比赛" : "添加一场比赛记录";
  openMatchFormBtn.disabled = isOpen || availablePlayers.length === 0;
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
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", { hour12: false });
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

function buildPlayerOptions(includePlaceholder = true) {
  const placeholder = includePlaceholder
    ? '<option value="">请选择选手</option>'
    : "";

  const options = availablePlayers
    .map(
      (player) =>
        `<option value="${player.id}">${escapeHtml(player.display_name)}</option>`
    )
    .join("");

  return placeholder + options;
}

function renderMatchPlayerFields(container, prefix) {
  container.innerHTML = "";

  for (let i = 0; i < TEAM_SIZE; i += 1) {
    const select = document.createElement("select");
    select.id = `${prefix}Player${i + 1}`;
    select.dataset.team = prefix;
    select.dataset.slot = String(i + 1);
    select.innerHTML = buildPlayerOptions(true);
    container.appendChild(select);
  }
}

function updateSeasonInfo() {
  if (activeSeason?.name) {
    seasonInfoEl.textContent = `当前赛季：${activeSeason.name}`;
    return;
  }

  seasonInfoEl.textContent = "当前未识别到赛季，将使用全局玩家名单。";
}

function renderSignupOptions() {
  const hasPlayers = availablePlayers.length > 0;
  playerSelect.innerHTML = hasPlayers
    ? buildPlayerOptions(true)
    : '<option value="">暂无可报名选手</option>';
  playerSelect.disabled = !hasPlayers;
  signupBtn.disabled = !hasPlayers;
}

function renderMatchForm() {
  renderMatchPlayerFields(teamAFields, "teamA");
  renderMatchPlayerFields(teamBFields, "teamB");

  const hasPlayers = availablePlayers.length > 0;
  winnerSelect.disabled = !hasPlayers;
  matchNoteInput.disabled = !hasPlayers;
  recordMatchBtn.disabled = !hasPlayers;
  closeMatchFormBtn.disabled = !hasPlayers;
  openMatchFormBtn.disabled = isMatchFormOpen || !hasPlayers;
}

function getSelectedTeamIds(prefix) {
  return Array.from(
    document.querySelectorAll(`select[data-team="${prefix}"]`)
  ).map((select) => select.value);
}

function clearMatchForm() {
  document
    .querySelectorAll('#teamAFields select, #teamBFields select')
    .forEach((select) => {
      select.value = "";
    });
  winnerSelect.value = "";
  matchNoteInput.value = "";
  setMatchMessage("");
}

function renderQueue(data) {
  queueList.innerHTML = "";

  if (!data || data.length === 0) {
    queueEmpty.style.display = "block";
    return;
  }

  queueEmpty.style.display = "none";

  const sortedData = sortQueueEntries(data);
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
      ? ""
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

function renderLeaderboard(data) {
  leaderboardBody.innerHTML = "";

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="muted">暂无排行榜数据</td>';
    leaderboardBody.appendChild(tr);
    return;
  }

  data.forEach((player, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(player.display_name)}</td>
      <td>${player.score ?? 0}</td>
      <td>${player.games_played ?? 0}</td>
      <td>${player.reward_points ?? 0}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

function parseRecentMatchPlayers(players) {
  if (!players) {
    return [];
  }

  if (Array.isArray(players)) {
    return players;
  }

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

  data.forEach((match) => {
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
          <ul>${teamAPlayers.map((player) => `<li>${escapeHtml(player.display_name || player.name || "未知选手")}</li>`).join("")}</ul>
        </div>
        <div class="recent-match-team">
          <h3>夜魇方</h3>
          <ul>${teamBPlayers.map((player) => `<li>${escapeHtml(player.display_name || player.name || "未知选手")}</li>`).join("")}</ul>
        </div>
      </div>
      ${match.note ? `<p class="muted">${escapeHtml(match.note)}</p>` : ""}
    `;
    recentMatchesList.appendChild(card);
  });
}

async function loadActiveSeason() {
  const { data, error } = await db
    .from("seasons")
    .select("id, name")
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

async function loadPlayers() {
  playerSelect.disabled = true;
  signupBtn.disabled = true;
  recordMatchBtn.disabled = true;

  let result = await db
    .from("current_season_players")
    .select("player_id, display_name")
    .order("display_name", { ascending: true });

  if (result.error) {
    result = await db
      .from("players")
      .select("id, display_name")
      .order("display_name", { ascending: true });
  }

  if (result.error) {
    availablePlayers = [];
    playerSelect.innerHTML = '<option value="">加载失败</option>';
    renderMatchForm();
    setMessage(`加载玩家失败：${result.error.message}`, true);
    return;
  }

  availablePlayers = (result.data || []).map((player) => ({
    id: player.player_id || player.id,
    display_name: player.display_name,
  }));

  renderSignupOptions();
  renderMatchForm();
}

async function loadLeaderboard() {
  let result = await db
    .from("current_season_leaderboard")
    .select("player_id, display_name, score, games_played, reward_points")
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
      .select("id, display_name, score, games_played, reward_points")
      .order("score", { ascending: false })
      .order("reward_points", { ascending: false })
      .order("display_name", { ascending: true });
  }

  if (result.error) {
    console.error("加载排行榜失败：", result.error);
    setMessage(`加载排行榜失败：${result.error.message}`, true);
    renderLeaderboard([]);
    return;
  }

  renderLeaderboard(result.data || []);
}

async function loadRecentMatches() {
  let query = db
    .from("recent_matches")
    .select("match_id, winner_team, note, created_at, players")
    .order("created_at", { ascending: false })
    .limit(10);

  if (activeSeason?.id) {
    query = query.eq("season_id", activeSeason.id);
  }

  let { data, error } = await query;

  if (error && error.message.includes("season_id")) {
    ({ data, error } = await db
      .from("recent_matches")
      .select("match_id, winner_team, note, created_at, players")
      .order("created_at", { ascending: false })
      .limit(10));
  }

  if (error) {
    console.error("加载最近比赛失败：", error);
    renderRecentMatches([]);
    return;
  }

  renderRecentMatches(data || []);
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

  renderQueue(data || []);
}

async function signup() {
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

  const { error } = await db
    .from("signup_queue")
    .insert([payload]);

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

function validateMatchPlayers(teamAIds, teamBIds) {
  if (!winnerSelect.value) {
    return "请选择胜方。";
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
      `记录比赛失败：${error.message}。请先在 Supabase 执行比赛记录 SQL。`,
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

async function deleteMatch(matchId, buttonEl) {
  if (!matchId) {
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
  }

  setMatchMessage("正在删除比赛记录并重算积分...");

  const { error } = await db.rpc("delete_match_and_recalculate", {
    p_match_id: matchId,
  });

  if (error) {
    if (buttonEl) {
      buttonEl.disabled = false;
    }
    setMatchMessage(`删除比赛失败：${error.message}`, true);
    return;
  }

  setMatchMessage("比赛记录已删除，积分已按全部比赛记录重算。");
  await loadLeaderboard();
  await loadRecentMatches();
}

function subscribeQueueChanges() {
  db.channel("queue-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "signup_queue",
      },
      async () => {
        await loadQueue();
      }
    )
    .subscribe();
}

signupBtn.addEventListener("click", signup);
recordMatchBtn.addEventListener("click", recordMatch);
openMatchFormBtn.addEventListener("click", () => {
  clearMatchForm();
  setMatchFormOpen(true);
  renderMatchForm();
});
closeMatchFormBtn.addEventListener("click", () => {
  clearMatchForm();
  setMatchFormOpen(false);
  renderMatchForm();
});

queueList.addEventListener("click", async (event) => {
  const button = event.target.closest(".queue-cancel-btn");

  if (!button) {
    return;
  }

  await cancelSignupByEntry(
    button.dataset.entryId,
    button.dataset.playerName,
    button
  );
});

recentMatchesList.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-match-btn");

  if (!button) {
    return;
  }

  await deleteMatch(button.dataset.matchId, button);
});

async function init() {
  setMatchFormOpen(false);
  renderMatchForm();
  updateSeasonInfo();
  await loadActiveSeason();
  await loadPlayers();
  await loadQueue();
  await loadLeaderboard();
  await loadRecentMatches();
  subscribeQueueChanges();
}

init();
