// Shared by the authenticated publisher and the initial, read-only export.
export const snapshotPrefix = 'window.__DOTA2_CHAMPIONS__ = ';
export const snapshotPath = 'assets/season-champions.js';
export function encodeSnapshot(entries) {
  return snapshotPrefix + JSON.stringify(entries.slice().sort((a, b) => b.seasonCode.localeCompare(a.seasonCode)), null, 2) + ';\n';
}
export function decodeSnapshot(text) {
  if (!text.startsWith(snapshotPrefix)) throw new Error('Invalid champion snapshot');
  const entries = JSON.parse(text.slice(snapshotPrefix.length).trim().replace(/;$/, ''));
  if (!Array.isArray(entries)) throw new Error('Invalid champion entries');
  return entries;
}
export async function readRows(url, key, table, query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({...query, limit: '1000', offset: String(offset)});
    const response = await fetch(`${url}/rest/v1/${table}?${params}`, {headers: {apikey: key}});
    if (!response.ok) throw new Error(`Champion source ${table}: HTTP ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error(`Invalid rows: ${table}`);
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}
export function rankRows(players, rules, manual, heroes, ledger) {
  const sum = rows => rows.reduce((map, row) => map.set(row.player_id, (map.get(row.player_id) || 0) + Number(row.points_delta)), new Map());
  const types = new Map(ledger.map(row => [row.id, row.entry_type]));
  const bonus = sum(ledger.filter(row => row.entry_type === 'item_effect' || (row.entry_type === 'rollback' && types.get(row.reversal_of_id) === 'item_effect')));
  const adjustments = sum(manual), rewards = sum(heroes);
  const orderedRules = rules.slice().sort((a,b) => a.matches_played - b.matches_played || Number(a.is_open_ended) - Number(b.is_open_ended));
  const ranked = players.map(player => {
    const games = Math.max(0, Math.trunc(Number(player.wins) || 0)) + Math.max(0, Math.trunc(Number(player.losses) || 0)) || Math.max(0, Math.trunc(Number(player.matches_played) || 0));
    let participation = 0;
    for (const rule of orderedRules) {
      if (games < Number(rule.matches_played)) break;
      participation = Number(rule.participation_points);
      if (rule.is_open_ended) {
        participation += (games - Number(rule.matches_played)) * Number(rule.points_per_extra_match);
        break;
      }
    }
    const item = bonus.get(player.player_id) || 0;
    const manualScore = adjustments.get(player.player_id) || 0;
    const score = Number(player.score_total) + participation + manualScore + (rewards.get(player.player_id) || 0);
    const components = [score, Number(player.score_total) - item, item, participation, manualScore, games ? Number((Number(player.wins) / games * 100).toFixed(2)) : 0];
    if (components.some(value => !Number.isFinite(value))) throw new Error('Non-finite champion score');
    return {...player, score, components};
  });
  return ranked.sort((a,b) => {
    for (let index=0; index<a.components.length; index++) {
      const diff = b.components[index] - a.components[index];
      if (Math.abs(diff) > (index === 5 ? 0.0001 : 0)) return diff;
    }
    return a.display_name.localeCompare(b.display_name, 'zh-CN');
  });
}
export async function calculateChampion(url, key, season) {
  if (!['closed','archived'].includes(season.status)) throw new Error('Season must be ended');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(season.code)) throw new Error('Invalid season code');
  const common = {season_id: `eq.${season.id}`};
  const [players, rules, manual, heroes, ledger] = await Promise.all([
    readRows(url,key,'v_leaderboard',{...common,select:'player_id,display_name,score_total,wins,losses,matches_played',order:'player_id'}),
    readRows(url,key,'season_participation_point_rules',{...common,select:'matches_played,participation_points,points_per_extra_match,is_open_ended',order:'matches_played'}),
    readRows(url,key,'manual_score_adjustments',{...common,select:'player_id,points_delta',revoked_at:'is.null',order:'id'}),
    readRows(url,key,'hero_reward_adjustments',{...common,select:'player_id,points_delta',revoked_at:'is.null',order:'id'}),
    readRows(url,key,'score_ledger',{...common,select:'id,player_id,entry_type,points_delta,reversal_of_id',order:'id'}),
  ]);
  const winner = rankRows(players,rules,manual,heroes,ledger)[0];
  if (!winner) throw new Error(`No leaderboard rows for ${season.code}`);
  return {seasonId:season.id,seasonCode:season.code,seasonName:season.name || season.code,
    tiLabel:`TI${(Number(season.code.slice(0,4))-2026)*12+Number(season.code.slice(5))-2}`,
    championName:String(winner.display_name).replace(/\s*（[^）]*）/g,'').replace(/\s*\([^)]*\)/g,'').trim(),
    playerId:winner.player_id,score:winner.score,source:'settlement-snapshot'};
}
