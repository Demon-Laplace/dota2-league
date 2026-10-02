import { decodeSnapshot, encodeSnapshot, snapshotPath, championFromSnapshot } from '../publish-season-champion/champion.mjs';

export function sameChampion(a, b) {
  return !!a && !!b && ['seasonId', 'seasonCode', 'championName', 'playerId', 'score'].every(key => a[key] === b[key]);
}

export async function publishStoredChampion(entry, request) {
  const endpoint = `/contents/${snapshotPath}`;
  for (const branch of ['main', 'design/modern-league-ui']) {
    let done = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(`${endpoint}?ref=${encodeURIComponent(branch)}`);
      if (!response.ok) throw new Error(`Read champion snapshot ${branch}: HTTP ${response.status}`);
      const file = await response.json();
      const text = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
      const entries = decodeSnapshot(text);
      const existing = entries.find(row => row.seasonCode === entry.seasonCode);
      if (existing) {
        if (!sameChampion(existing, entry)) throw new Error(`Frozen champion conflicts with existing ${branch} snapshot`);
        done = true; break;
      }
      const updated = encodeSnapshot([...entries, entry]);
      const content = btoa(Array.from(new TextEncoder().encode(updated), byte => String.fromCharCode(byte)).join(''));
      const write = await request(endpoint, { method: 'PUT', body: JSON.stringify({
        branch, sha: file.sha, content, message: `Publish frozen ${entry.seasonCode} season champion`,
      }) });
      if ([409, 422].includes(write.status)) continue;
      if (!write.ok) throw new Error(`Publish champion ${branch}: HTTP ${write.status}`);
      done = true; break;
    }
    if (!done) throw new Error(`Concurrent champion publication conflict: ${branch}`);
  }
  return new URL(snapshotPath, 'https://demon-laplace.github.io/dota2-league/');
}

export async function processPublication(job, rpc, request, readLive) {
  // Save the deterministic result before the first external write. Retries use
  // this record, never recalculating mutable historical data.
  const champion = job.champion || championFromSnapshot(job.source_snapshot);
  const entry = await rpc('freeze_champion_publication_result', {
    p_season_id: job.season_id, p_lease_id: job.lease_id, p_champion: champion,
  });
  const site = await publishStoredChampion(entry, request);
  const rows = await readLive(site);
  if (!sameChampion(rows.find(row => row.seasonCode === entry.seasonCode), entry)) {
    throw new Error('Champion assets saved; waiting for website deployment');
  }
  await rpc('finish_champion_publication', { p_season_id: job.season_id, p_lease_id: job.lease_id });
}
