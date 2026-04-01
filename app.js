const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const playerSelect = document.getElementById("playerSelect");
const signupBtn = document.getElementById("signupBtn");
const messageEl = document.getElementById("message");
const queueList = document.getElementById("queueList");
const queueEmpty = document.getElementById("queueEmpty");
const leaderboardBody = document.getElementById("leaderboardBody");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.className = isError ? "message error" : "message";
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

  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
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
      if (activeCount <= 10) {
        laneLabel = `正式队列 #${activeCount}`;
      } else {
        laneLabel = `替补区 #${activeCount - 10}`;
      }
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
    tr.innerHTML = '<td colspan="4" class="muted">暂无排行榜数据</td>';
    leaderboardBody.appendChild(tr);
    return;
  }

  data.forEach((player, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(player.display_name)}</td>
      <td>${player.score ?? 0}</td>
      <td>${player.reward_points ?? 0}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

async function loadPlayers() {
  playerSelect.disabled = true;
  signupBtn.disabled = true;

  const { data, error } = await db
    .from("players")
    .select("id, display_name")
    .order("display_name", { ascending: true });

  if (error) {
    playerSelect.innerHTML = '<option value="">加载失败</option>';
    setMessage(`加载玩家失败：${error.message}`, true);
    return;
  }

  playerSelect.innerHTML = '<option value="">请选择玩家</option>';

  (data || []).forEach((player) => {
    const opt = document.createElement("option");
    opt.value = player.id;
    opt.textContent = player.display_name;
    playerSelect.appendChild(opt);
  });

  const hasPlayers = (data || []).length > 0;
  playerSelect.disabled = !hasPlayers;
  signupBtn.disabled = !hasPlayers;
}

async function loadLeaderboard() {
  let result = await db
    .from("leaderboard")
    .select("id, display_name, score, reward_points")
    .order("score", { ascending: false })
    .order("reward_points", { ascending: false })
    .order("display_name", { ascending: true });

  if (result.error) {
    result = await db
      .from("players")
      .select("id, display_name, score, reward_points")
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

async function loadQueue() {
  const { data, error } = await db
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
    .order("created_at", { ascending: true });

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

  const { error } = await db
    .from("signup_queue")
    .insert([{ player_id: playerId, is_active: true, status: "active" }]);

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

async function init() {
  await loadPlayers();
  await loadQueue();
  await loadLeaderboard();
  subscribeQueueChanges();
}

init();
