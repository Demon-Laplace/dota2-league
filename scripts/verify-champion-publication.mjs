// Manual operational verification. Never closes a season or modifies scores.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeSnapshot } from '../supabase/functions/publish-season-champion/champion.mjs';
import { sameChampion } from '../supabase/functions/process-season-champion-publications/publication.mjs';

const project = process.env.SUPABASE_PROJECT_ID;
assert.equal(project, 'klxkkwwszqtgeuozwtkw', 'Unexpected project');
const query = async sql => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Database verification: HTTP ${response.status}`);
  return response.json();
};
const [configuration] = await query(`select
  exists(select 1 from pg_trigger where tgname='enqueue_champion_on_season_close' and not tgisinternal) as trigger_installed,
  exists(select 1 from cron.job where jobname='retry-pending-champion-publications' and active) as retry_enabled,
  not has_function_privilege('anon','public.claim_champion_publications(text,uuid)','execute') as anon_denied,
  not has_function_privilege('authenticated','public.finish_champion_publication(uuid,uuid,text)','execute') as user_denied`);
assert.deepEqual(configuration, { trigger_installed: true, retry_enabled: true, anon_denied: true, user_denied: true });
const url = `https://${project}.supabase.co/functions/v1/process-season-champion-publications`;
const anonymous = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(anonymous.status, 403);
const wrong = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Champion-Worker-Token': '0'.repeat(64) }, body: '{}' });
assert.equal(wrong.status, 403);
console.log('PASS deployed close trigger, retry scheduler and worker authorization');
const deliveries = await query(`select source_snapshot->'season'->>'code' as season, status, attempts, last_error
  from private.season_champion_publications order by created_at desc limit 5`);
console.log('Recent delivery status:', JSON.stringify(deliveries));
const secretResponse = await fetch(`https://api.supabase.com/v1/projects/${project}/secrets`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30000),
});
if (secretResponse.ok) {
  const names = (await secretResponse.json()).map(secret => secret.name);
  console.log('GitHub publication configuration:', JSON.stringify({
    repositoryConfigured: names.includes('GITHUB_REPOSITORY'), tokenConfigured: names.includes('GITHUB_TOKEN'),
  }));
}

const code = process.env.VERIFY_EXISTING_SEASON || '';
if (code) {
  assert.match(code, /^\d{4}-(0[1-9]|1[0-2])$/);
  const [season] = await query(`select id,status from public.seasons where code='${code}'`);
  assert.ok(season && ['closed', 'archived'].includes(season.status), 'Verification requires an ended season');
  const entries = decodeSnapshot(await readFile(new URL('../assets/season-champions.js', import.meta.url), 'utf8'));
  const existing = entries.find(entry => entry.seasonCode === code);
  assert.ok(existing, 'Verification requires an already-published champion');
  // Verify the existing result before requesting an idempotent delivery task.
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const key = app.match(/"(sb_publishable_[^"]+)"/)[1];
  const { calculateChampion } = await import('../supabase/functions/publish-season-champion/champion.mjs');
  const predicted = await calculateChampion(`https://${project}.supabase.co`, key, { id: season.id, code, status: season.status });
  assert.ok(sameChampion(existing, predicted), 'Existing winner differs; stop without altering champion history');
  await query(`select private.capture_season_champion_publication('${season.id}');
    update private.season_champion_publications set next_attempt_at=now()
      where season_id='${season.id}' and status='pending';
    select private.dispatch_champion_publications('${season.id}');`);
  let published = false;
  for (let attempt = 0; attempt < 48; attempt++) {
    const [job] = await query(`select status,attempts,last_error,champion from private.season_champion_publications where season_id='${season.id}'`);
    if (job?.status === 'published') {
      assert.ok(sameChampion(job.champion, existing));
      console.log(`PASS ${code} durable task published; original winner and score retained`);
      published = true; break;
    }
    console.log(`Delivery ${code}: ${job?.status || 'missing'}, attempts=${job?.attempts || 0}${job?.last_error ? `, ${job.last_error}` : ''}`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  assert.ok(published, 'Publication not complete; inspect persistent task error');
}
