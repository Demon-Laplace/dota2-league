/// <reference path="../_shared/deno-globals.d.ts" />
import { jsonResponse } from '../_shared/cors.ts';
import { createServiceRoleClient, requiredEnv } from '../_shared/client.ts';
import { decodeSnapshot } from '../publish-season-champion/champion.mjs';
import { processPublication } from './publication.mjs';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  const token = req.headers.get('X-Champion-Worker-Token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return jsonResponse({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await req.json();
    const seasonId = body.seasonId || null;
    if (seasonId !== null && !/^[a-f0-9-]{36}$/i.test(seasonId)) return jsonResponse({ error: 'Invalid seasonId' }, { status: 400 });
    const db = createServiceRoleClient();
    const { data: jobs, error } = await db.rpc('claim_champion_publications', {
      p_worker_token: token, p_season_id: seasonId,
    });
    if (error) return jsonResponse({ error: error.code === '42501' ? 'Forbidden' : 'Unable to claim publication' }, { status: error.code === '42501' ? 403 : 500 });
    if (!jobs?.length) return jsonResponse({ processed: 0 });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await db.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const request = (path: string, options: RequestInit = {}) => {
      const repository = requiredEnv('GITHUB_REPOSITORY');
      if (repository !== 'Demon-Laplace/dota2-league') throw new Error('Unexpected champion repository');
      return fetch(`https://api.github.com/repos/${repository}${path}`, {
      ...options, headers: {
        Authorization: `Bearer ${requiredEnv('GITHUB_TOKEN')}`,
        Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
      }, signal: AbortSignal.timeout(15000),
      });
    };
    const readLive = async (url: URL) => {
      url.searchParams.set('champion-check', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Read deployed champion: HTTP ${response.status}`);
      return decodeSnapshot(await response.text());
    };
    const results = [];
    for (const job of jobs) {
      try {
        await processPublication(job, rpc, request, readLive);
        results.push({ seasonId: job.season_id, status: 'published' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Publication failed';
        await rpc('finish_champion_publication', { p_season_id: job.season_id, p_lease_id: job.lease_id, p_error: message });
        results.push({ seasonId: job.season_id, status: 'pending', error: message });
      }
    }
    return jsonResponse({ results });
  } catch (error) {
    // Claimed but interrupted work is recovered after its lease expires.
    return jsonResponse({ error: error instanceof Error ? error.message : 'Publication worker failed' }, { status: 500 });
  }
});
