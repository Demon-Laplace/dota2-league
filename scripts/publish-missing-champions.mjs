// Database reads only. GitHub writes are limited to champion assets and a main-branch completion marker.
import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { calculateChampion, readRows, decodeSnapshot, encodeSnapshot, snapshotPath } from '../supabase/functions/publish-season-champion/champion.mjs';

export function accountingMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}

export function targetSeasonCode(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid accounting month');
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function monthlyPublicationComplete(seasonCode, seasons, snapshots) {
  if (!seasons.some(s => s.code === seasonCode && ['closed', 'archived'].includes(s.status))) return false;
  if (snapshots.length !== 3) return false; // two branches plus the deployed Pages asset
  const entries = snapshots.map(rows => rows.find(row => row.seasonCode === seasonCode));
  if (entries.some(row => !row)) return false;
  return entries.every(row => ['seasonCode', 'playerId', 'championName', 'score'].every(key => row[key] === entries[0][key]));
}

export async function recordCompletedMonth(month, request) {
  const endpoint = '/contents/.github/state/champion-publication.json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request(`${endpoint}?ref=main`);
    if (!response.ok && response.status !== 404) throw new Error(`Read completion marker: HTTP ${response.status}`);
    const file = response.ok ? await response.json() : null;
    const state = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : {};
    if (state.completedAccountingMonth >= month) return;
    const content = JSON.stringify({ ...state, completedAccountingMonth: month, seasonCode: targetSeasonCode(month) }, null, 2) + '\n';
    const write = await request(endpoint, {
      method: 'PUT', body: JSON.stringify({
        branch: 'main', ...(file ? { sha: file.sha } : {}),
        content: Buffer.from(content).toString('base64'),
        message: `Record ${month} champion publication complete`,
      }),
    });
    if ([409, 422].includes(write.status)) continue;
    if (!write.ok) throw new Error(`Save completion marker: HTTP ${write.status}`);
    return;
  }
  throw new Error('Concurrent completion marker conflict; retry next day');
}

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
  const month = process.env.CHAMPION_ACCOUNTING_MONTH || accountingMonth();
  const target = targetSeasonCode(month);
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
    let alreadyBuilt = false;
    const latest = await request('/pages/builds/latest');
    const head = await request(`/commits/${encodeURIComponent(config.source.branch)}`);
    if (!head.ok) throw new Error(`Read Pages source: HTTP ${head.status}`);
    const commit = await head.json();
    if (latest.ok) {
      const previous = await latest.json();
      alreadyBuilt = previous.commit === commit.sha && ['built', 'building', 'queued'].includes(previous.status);
    } else if (latest.status !== 404) {
      throw new Error(`Read Pages build: HTTP ${latest.status}`);
    }
    if (!alreadyBuilt) {
      const build = await request('/pages/builds', { method: 'POST' });
      if (!build.ok) throw new Error(`Request Pages build: HTTP ${build.status}`);
      console.log('Requested GitHub Pages build');
    }
  }
  let complete = false;
  if (seasons.some(s => s.code === target)) {
    const snapshots = [];
    for (const branch of ['main', 'design/modern-league-ui']) {
      const response = await request(`/contents/${snapshotPath}?ref=${encodeURIComponent(branch)}`);
      if (!response.ok) throw new Error(`Verify ${branch}: HTTP ${response.status}`);
      const file = await response.json();
      snapshots.push(decodeSnapshot(Buffer.from(file.content, 'base64').toString('utf8')));
    }
    const site = new URL(snapshotPath, `${config.html_url.replace(/\/$/, '')}/`);
    site.searchParams.set('champion-check', String(Date.now()));
    const live = await fetch(site, { signal: AbortSignal.timeout(60000), cache: 'no-store' });
    if (!live.ok) throw new Error(`Verify deployed champions: HTTP ${live.status}`);
    snapshots.push(decodeSnapshot(await live.text()));
    complete = monthlyPublicationComplete(target, seasons, snapshots);
  }
  console.log(`${month}: ${complete ? 'monthly champion publication complete; skip remaining daily checks' : 'publication not yet complete; check again next day'}`);
  if (complete) await recordCompletedMonth(month, request);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `month_complete=${complete}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
