// Manual secret provisioning. Secret values must never be logged or committed.
import assert from 'node:assert/strict';
const project = process.env.SUPABASE_PROJECT_ID;
assert.equal(project, 'klxkkwwszqtgeuozwtkw', 'Unexpected project');
const token = process.env.CHAMPION_PUBLICATION_BOOTSTRAP_TOKEN;
assert.ok(token, 'A user-approved publisher token is required');
const repository = 'Demon-Laplace/dota2-league';
const access = await fetch(`https://api.github.com/repos/${repository}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  signal: AbortSignal.timeout(30000),
});
assert.equal(access.status, 200, 'Publisher token cannot access the league repository');
assert.equal((await access.json()).permissions?.push, true, 'Publisher token cannot write the league repository');
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/secrets`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { name: 'GITHUB_REPOSITORY', value: repository },
    { name: 'GITHUB_TOKEN', value: token },
  ]), signal: AbortSignal.timeout(30000),
});
assert.ok(response.ok, `Publisher configuration failed: HTTP ${response.status}`);
console.log('GitHub publisher repository and user-approved token configured; no secret values logged');
