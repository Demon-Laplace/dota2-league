import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingChampions, publishBranch, accountingMonth, targetSeasonCode, monthlyPublicationComplete, recordCompletedMonth } from './publish-missing-champions.mjs';
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

test('accounting month uses Beijing midnight and target season rolls across years', () => {
  assert.equal(accountingMonth(new Date('2026-09-30T15:59:59Z')), '2026-09');
  assert.equal(accountingMonth(new Date('2026-09-30T16:00:00Z')), '2026-10');
  assert.equal(targetSeasonCode('2026-10'), '2026-09');
  assert.equal(targetSeasonCode('2027-01'), '2026-12');
  assert.throws(() => targetSeasonCode('2026-13'), /Invalid/);
});

test('month only completes when ended-season champion agrees on both branches and live site', () => {
  assert.equal(monthlyPublicationComplete('2026-09', [season], [[winner], [winner], [winner]]), true);
  assert.equal(monthlyPublicationComplete('2026-09', [season], [[winner], [], [winner]]), false);
  assert.equal(monthlyPublicationComplete('2026-09', [season], [[winner], [winner], []]), false);
  assert.equal(monthlyPublicationComplete('2026-09', [season], [[winner], [winner], [{ ...winner, score: 409 }]]), false);
  assert.equal(monthlyPublicationComplete('2026-09', [{ ...season, status: 'active' }], [[winner], [winner], [winner]]), false);
  assert.equal(monthlyPublicationComplete('2026-10', [season], [[winner], [winner], [winner]]), false);
});

test('completion marker is durable and scoped to the accounting month', async () => {
  let written;
  await recordCompletedMonth('2026-10', async (_path, options) => {
    if (!options) return { ok: false, status: 404 };
    const body = JSON.parse(options.body);
    assert.equal(body.branch, 'main');
    assert.equal(body.sha, undefined);
    written = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    return { ok: true };
  });
  assert.deepEqual(written, { completedAccountingMonth: '2026-10', seasonCode: '2026-09' });
  assert.notEqual(written.completedAccountingMonth, '2026-11');
});

test('marker retry preserves concurrent state and does not overwrite completed newer months', async () => {
  let reads = 0, writes = 0;
  await recordCompletedMonth('2026-10', async (_path, options) => {
    if (!options) {
      reads++;
      return { ok: true, json: async () => ({ sha: `sha-${reads}`, content: Buffer.from(JSON.stringify(
        reads === 1 ? { completedAccountingMonth: '2026-09' } : { completedAccountingMonth: '2026-11' },
      )).toString('base64') }) };
    }
    writes++;
    return { ok: false, status: 409 };
  });
  assert.equal(reads, 2);
  assert.equal(writes, 1);
});
