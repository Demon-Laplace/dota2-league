import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processPublication, publishStoredChampion } from '../supabase/functions/process-season-champion-publications/publication.mjs';
import { championFromSnapshot, encodeSnapshot, decodeSnapshot } from '../supabase/functions/publish-season-champion/champion.mjs';

const source = {
  season: { id: 'season', code: '2026-09', name: 'September', status: 'closed' },
  players: [{ player_id: 'winner', display_name: '瓜神', score_total: 410, wins: 2, losses: 1 }],
  rules: [], manual: [], heroes: [], ledger: [],
};
const winner = championFromSnapshot(source);
const job = { season_id: 'season', lease_id: 'lease', source_snapshot: source, champion: null };
function mockRepository() {
  const branches = new Map([['main', []], ['design/modern-league-ui', []]]);
  const writes = [];
  const request = async (path, options) => {
    if (path === '/pages') return { ok: true, json: async () => ({ html_url: 'https://example.invalid/league/' }) };
    if (!options) {
      const branch = new URL(`https://example.invalid${path}`).searchParams.get('ref');
      return { ok: true, json: async () => ({ sha: `sha-${writes.length}`, content: Buffer.from(encodeSnapshot(branches.get(branch))).toString('base64') }) };
    }
    const body = JSON.parse(options.body);
    writes.push(body.branch);
    branches.set(body.branch, decodeSnapshot(Buffer.from(body.content, 'base64').toString('utf8')));
    return { ok: true };
  };
  return { request, branches, writes };
}

test('winner is saved before external writes; success requires the deployed result', async () => {
  const repo = mockRepository();
  const calls = [];
  const rpc = async (name, args) => {
    calls.push(name);
    if (name === 'freeze_champion_publication_result') {
      assert.deepEqual(repo.writes, []);
      assert.deepEqual(args.p_champion, winner);
      return winner;
    }
    assert.deepEqual(repo.writes, ['main', 'design/modern-league-ui']);
  };
  await processPublication(job, rpc, repo.request, async () => [winner]);
  assert.deepEqual(calls, ['freeze_champion_publication_result', 'finish_champion_publication']);
});

test('retry after one-branch failure reuses saved champion and skips completed branch', async () => {
  const repo = mockRepository();
  let fail = true;
  const request = async (path, options) => {
    if (options && JSON.parse(options.body).branch === 'design/modern-league-ui' && fail) return { ok: false, status: 503 };
    return repo.request(path, options);
  };
  await assert.rejects(publishStoredChampion(winner, request), /503/);
  fail = false;
  const rpc = async (name, args) => name === 'freeze_champion_publication_result' ? args.p_champion : null;
  await processPublication({ ...job, champion: winner, source_snapshot: null }, rpc, request, async () => [winner]);
  assert.deepEqual(repo.writes, ['main', 'design/modern-league-ui']);
});

test('website deployment lag never marks a delivery published', async () => {
  const repo = mockRepository();
  const calls = [];
  await assert.rejects(processPublication(job, async name => { calls.push(name); return winner; }, repo.request, async () => []), /waiting for website deployment/);
  assert.deepEqual(calls, ['freeze_champion_publication_result']);
});

test('an existing different champion is rejected without overwriting history', async () => {
  const repo = mockRepository();
  repo.branches.set('main', [{ ...winner, score: 999 }]);
  await assert.rejects(publishStoredChampion(winner, repo.request), /conflicts/);
  assert.deepEqual(repo.writes, []);
});

test('concurrent changes are preserved when retrying a SHA conflict', async () => {
  const repo = mockRepository();
  const older = { seasonCode: '2026-08', championName: '将军' };
  let conflict = true;
  const request = async (path, options) => {
    if (options && conflict) {
      conflict = false;
      repo.branches.set('main', [older]);
      return { ok: false, status: 409 };
    }
    return repo.request(path, options);
  };
  await publishStoredChampion(winner, request);
  assert.deepEqual(repo.branches.get('main'), [winner, older]);
});
