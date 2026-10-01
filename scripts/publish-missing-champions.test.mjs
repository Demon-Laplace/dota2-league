import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingChampions, publishBranch } from './publish-missing-champions.mjs';
import { encodeSnapshot, decodeSnapshot } from '../supabase/functions/publish-season-champion/champion.mjs';

const season = { id: 'september', code: '2026-09', status: 'closed' };
const winner = { seasonCode: '2026-09', championName: '瓜神', score: 410 };
const fileResponse = (entries, sha = 'original') => ({
  ok: true, json: async () => ({ sha, content: Buffer.from(encodeSnapshot(entries)).toString('base64') }),
});

test('only missing ended seasons are calculated; existing snapshots remain immutable', async () => {
  const existing = [{ seasonCode: '2026-08', championName: 'original' }];
  const calls = [];
  const entries = await fillMissingChampions(existing, [
    { code: '2026-04', status: 'closed' }, { code: '2026-08', status: 'archived' },
    season, { code: '2026-10', status: 'active' },
  ], async s => { calls.push(s.code); return winner; });
  assert.deepEqual(calls, ['2026-09']);
  assert.deepEqual(entries, [...existing, winner]);
  assert.equal(existing.length, 1);
});

test('a failed source calculation prevents a partial branch write', async () => {
  let writes = 0;
  await assert.rejects(publishBranch('main', [season], async () => { throw new Error('source unavailable'); },
    async (_path, options) => { if (options) writes++; return fileResponse([]); }), /source unavailable/);
  assert.equal(writes, 0);
});

test('concurrent GitHub edit is re-read and retained on retry', async () => {
  const concurrent = { seasonCode: '2026-08', championName: 'concurrent' };
  let reads = 0, writes = 0;
  const changed = await publishBranch('main', [season], async () => winner, async (_path, options) => {
    if (!options) return fileResponse(reads++ ? [concurrent] : [], reads === 1 ? 'old' : 'new');
    const body = JSON.parse(options.body);
    if (++writes === 1) return { ok: false, status: 409 };
    assert.equal(body.sha, 'new');
    assert.deepEqual(decodeSnapshot(Buffer.from(body.content, 'base64').toString()), [winner, concurrent]);
    return { ok: true };
  });
  assert.equal(changed, true);
  assert.equal(writes, 2);
});

test('retry after completed publication performs no write or recalculation', async () => {
  assert.equal(await publishBranch('main', [season], async () => { throw new Error('must not recalculate'); },
    async (_path, options) => { assert.equal(options, undefined); return fileResponse([winner]); }), false);
});
