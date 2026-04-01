import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const leaderboardDiv = document.getElementById("leaderboard");
const playersDiv = document.getElementById("players");
const queueDiv = document.getElementById("queue");

async function loadLeaderboard() {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*");

  if (error) {
    leaderboardDiv.textContent = "加载失败: " + error.message;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>名字</th>
          <th>积分</th>
          <th>奖励点</th>
          <th>场次</th>
          <th>胜</th>
          <th>负</th>
          <th>胜率</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const row of data) {
    html += `
      <tr>
        <td>${row.display_name}</td>
        <td>${row.score}</td>
        <td>${row.reward_points}</td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.win_rate}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  leaderboardDiv.innerHTML = html;
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name")
    .order("created_at", { ascending: true });

  if (error) {
    playersDiv.textContent = "加载失败: " + error.message;
    return;
  }

  playersDiv.innerHTML = "";

  for (const player of data) {
    const row = document.createElement("div");
    row.className = "player-row";

    const name = document.createElement("span");
    name.textContent = player.display_name;

    const btn = document.createElement("button");
    btn.textContent = "报名";
    btn.onclick = async () => {
      const { error: joinError } = await supabase.rpc("join_queue", {
        p_player_id: player.id,
        p_note: null
      });

      if (joinError) {
        alert("报名失败: " + joinError.message);
      } else {
        alert("报名成功: " + player.display_name);
        loadQueue();
      }
    };

    row.appendChild(name);
    row.appendChild(btn);
    playersDiv.appendChild(row);
  }
}

async function loadQueue() {
  const { data, error } = await supabase
    .from("current_queue")
    .select("*");

  if (error) {
    queueDiv.textContent = "加载失败: " + error.message;
    return;
  }

  queueDiv.innerHTML = "";

  for (const item of data) {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.textContent = `${item.display_name} - ${new Date(item.created_at).toLocaleString()}`;
    queueDiv.appendChild(row);
  }
}

document.getElementById("loadLeaderboard").onclick = loadLeaderboard;
document.getElementById("loadPlayers").onclick = loadPlayers;
document.getElementById("loadQueue").onclick = loadQueue;

loadLeaderboard();
loadPlayers();
loadQueue();