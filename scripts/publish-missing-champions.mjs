// Database reads only. GitHub writes are limited to the public champion asset.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { calculateChampion, readRows, decodeSnapshot, encodeSnapshot, snapshotPath } from '../supabase/functions/publish-season-champion/champion.mjs';

export async function fillMissingChampions(entries, seasons, calculate) {
  const updated = entries.slice();
  for (const season of seasons) {
    if (!['closed', 'archived'].includes(season.status) || season.code <= '2026-04') continue;
    if (updated.some(entry => entry.seasonCode === season.code)) continue;
    updated.push(await calculate(season));
  }
  return updated;
}

export async function publishBranch(branch, seasons, calculate, request) {
  const endpoint = `/contents/${snapshotPath}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request(`${endpoint}?ref=${encodeURIComponent(branch)}`);
    if (!response.ok) throw new Error(`Read ${branch}: HTTP ${response.status}`);
    const file = await response.json();
    const original = Buffer.from(file.content, 'base64').toString('utf8');
    const entries = decodeSnapshot(original);
    const updated = await fillMissingChampions(entries, seasons, calculate);
    if (updated.length === entries.length) return false;
    const write = await request(endpoint, {
      method: 'PUT',
      body: JSON.stringify({
        branch, sha: file.sha,
        content: Buffer.from(encodeSnapshot(updated)).toString('base64'),
        message: 'Publish missing ended-season champions',
      }),
    });
    if ([409, 422].includes(write.status)) continue;
    if (!write.ok) throw new Error(`Publish ${branch}: HTTP ${write.status}`);
    return true;
  }
  throw new Error(`Concurrent publication conflict: ${branch}; retry next run`);
}

async function main() {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required');
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== 'Demon-Laplace/dota2-league') throw new Error('Unexpected repository');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const project = app.match(/const DEFAULT_PROJECT_ID = "([^"]+)"/)[1];
  const key = app.match(/"(sb_publishable_[^"]+)"/)[1];
  const url = `https://${project}.supabase.co`;
  const seasons = await readRows(url, key, 'seasons', {
    select: 'id,code,name,status', status: 'in.(closed,archived)', order: 'code',
  });
  const calculated = new Map();
  const calculate = season => {
    if (!calculated.has(season.id)) calculated.set(season.id, calculateChampion(url, key, season));
    return calculated.get(season.id);
  };
  const request = (path, options = {}) => fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(60000),
  });
  for (const branch of ['main', 'design/modern-league-ui']) {
    const changed = await publishBranch(branch, seasons, calculate, request);
    console.log(`${branch}: ${changed ? 'published missing champions' : 'already complete'}`);
  }
  // GITHUB_TOKEN commits do not trigger Pages builds automatically. Request one
  // explicitly, including on retries after a previous partial publication.
  const pages = await request('/pages');
  if (!pages.ok) throw new Error(`Read Pages configuration: HTTP ${pages.status}`);
  const config = await pages.json();
  if (config.build_type === 'legacy') {
    const latest = await request('/pages/builds/latest');
    const head = await request(`/commits/${encodeURIComponent(config.source.branch)}`);
    if (!head.ok) throw new Error(`Read Pages source: HTTP ${head.status}`);
    const commit = await head.json();
    if (latest.ok) {
      const previous = await latest.json();
      if (previous.commit === commit.sha && ['built', 'building', 'queued'].includes(previous.status)) return;
    } else if (latest.status !== 404) {
      throw new Error(`Read Pages build: HTTP ${latest.status}`);
    }
    const build = await request('/pages/builds', { method: 'POST' });
    if (!build.ok) throw new Error(`Request Pages build: HTTP ${build.status}`);
    console.log('Requested GitHub Pages build');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
