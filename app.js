import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://snqzcnaymukposcbosyq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Ap-srffzI3MkOjmYAH0lag_kiP_1Ifm";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const playerSelect = document.getElementById('playerSelect');
const signupBtn = document.getElementById('signupBtn');
const messageEl = document.getElementById('message');
const queueList = document.getElementById('queueList');
const queueEmpty = document.getElementById('queueEmpty');
const leaderboardBody = document.getElementById('leaderboardBody');

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.className = isError ? 'message error' : 'message';
}

async function loadPlayers() {
  const { data, error } = await db
    .from('players')
    .select('id, name, score, reward_points')
    .order('name', { ascending: true });

  if (error) {
    setMessage(`加载玩家失败：${error.message}`, true);
    return;
  }

  playerSelect.innerHTML = '<option value="">请选择玩家</option>';
  data.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    playerSelect.appendChild(opt);
  });
}

async function loadLeaderboard() {
  const { data, error } = await db
    .from('players')
    .select('id, name, score, reward_points')
    .order('score', { ascending: false })
    .order('reward_points', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  leaderboardBody.innerHTML = '';
  data.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.score}</td>
      <td>${p.reward_points}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

async function loadQueue() {
  const { data, error } = await db
    .from('signup_queue')
    .select(`
      id,
      created_at,
      player_id,
      players (
        name
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    setMessage(`加载队列失败：${error.message}`, true);
    return;
  }

  queueList.innerHTML = '';

  if (!data || data.length === 0) {
    queueEmpty.style.display = 'block';
    return;
  }

  queueEmpty.style.display = 'none';

  data.forEach((row) => {
    const li = document.createElement('li');
    const playerName = row.players?.name || '未知玩家';
    const time = new Date(row.created_at).toLocaleString();
    li.textContent = `${playerName}  ·  ${time}`;
    queueList.appendChild(li);
  });
}

async function signup() {
  const playerId = playerSelect.value;
  if (!playerId) {
    setMessage('请先选择玩家。', true);
    return;
  }

  signupBtn.disabled = true;
  setMessage('正在报名...');

  const { error } = await db
    .from('signup_queue')
    .insert([{ player_id: playerId, is_active: true }]);

  signupBtn.disabled = false;

  if (error) {
    if (error.message.includes('signup_queue_one_active_per_player')) {
      setMessage('该玩家已经在报名队列中。', true);
      return;
    }
    setMessage(`报名失败：${error.message}`, true);
    return;
  }

  setMessage('报名成功。');
  await loadQueue();
}

function subscribeQueueChanges() {
  db.channel('queue-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'signup_queue',
      },
      async () => {
        await loadQueue();
      }
    )
    .subscribe();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

signupBtn.addEventListener('click', signup);

async function init() {
  await loadPlayers();
  await loadQueue();
  await loadLeaderboard();
  subscribeQueueChanges();
}

init();