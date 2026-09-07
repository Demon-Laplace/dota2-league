/// <reference path="../_shared/deno-globals.d.ts" />
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createUserScopedClient, requireUser, parseJson, requiredEnv } from '../_shared/client.ts';
import { calculateChampion, readRows, decodeSnapshot, encodeSnapshot, snapshotPath } from './champion.mjs';

// Only public champion data is written. Clients cannot choose a repository, path,
// branch or winner. GitHub SHA comparisons protect concurrent publications.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
  if (req.method !== 'POST') return jsonResponse({error:'Method not allowed'}, {status:405});
  const client = createUserScopedClient(req);
  if ('error' in client) return client.error;
  const user = await requireUser(client.supabase);
  if ('error' in user) return user.error;
  const body = await parseJson<{seasonId?:string; regenerate?:boolean}>(req);
  if ('error' in body) return body.error;
  const seasonId = String(body.data.seasonId || '');
  if (!/^[0-9a-f-]{36}$/i.test(seasonId)) return jsonResponse({error:'Invalid seasonId'}, {status:400});
  const permission = await client.supabase.rpc('can_adjust_scores', {p_season_id:seasonId});
  if (permission.error || !permission.data) return jsonResponse({error:'Forbidden'}, {status:403});
  if (body.data.regenerate) {
    const admin = await client.supabase.rpc('is_admin');
    if (admin.error || !admin.data) return jsonResponse({error:'Regeneration requires administrator'}, {status:403});
  }
  try {
    const url = requiredEnv('SUPABASE_URL'), key = requiredEnv('SUPABASE_ANON_KEY');
    const seasons = await readRows(url,key,'seasons',{id:`eq.${seasonId}`,select:'id,code,name,status'});
    const season = seasons[0];
    if (!season || !['closed','archived'].includes(season.status)) throw new Error('Season must be ended');
    const repository = requiredEnv('GITHUB_REPOSITORY');
    const endpoint = `https://api.github.com/repos/${repository}/contents/${snapshotPath}`;
    const headers = {Authorization:`Bearer ${requiredEnv('GITHUB_TOKEN')}`,Accept:'application/vnd.github+json','Content-Type':'application/json'};
    const results = [];
    let entry: {seasonCode:string; [key:string]:unknown} | null = null;
    for (const branch of ['main','design/modern-league-ui']) {
      let completed = false;
      for (let attempt=0; attempt<3; attempt++) {
        const response = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`,{headers});
        if (!response.ok) throw new Error(`Read snapshot ${branch}: HTTP ${response.status}`);
        const file = await response.json();
        const text = new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')), c=>c.charCodeAt(0)));
        const entries = decodeSnapshot(text);
        const existing = entries.find((row: {seasonCode:string})=>row.seasonCode===season.code);
        if (!body.data.regenerate && existing) {
          entry ||= existing;
          completed = true; results.push({branch,changed:false}); break;
        }
        entry ||= await calculateChampion(url,key,season);
        const updated = encodeSnapshot([...entries.filter((row: {seasonCode:string})=>row.seasonCode!==season.code),entry]);
        if (updated === text) { completed=true; results.push({branch,changed:false}); break; }
        const content = btoa(Array.from(new TextEncoder().encode(updated), byte=>String.fromCharCode(byte)).join(''));
        const write = await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({
          branch,sha:file.sha,content,message:`Season ${season.code} champion snapshot long term version - bug fixed v1.0`,
        })});
        if ([409,422].includes(write.status)) continue;
        if (!write.ok) throw new Error(`Publish snapshot ${branch}: HTTP ${write.status}`);
        completed=true; results.push({branch,changed:true}); break;
      }
      if (!completed) throw new Error(`Concurrent publication conflict: ${branch}; retry safely`);
    }
    return jsonResponse({results,champion:entry});
  } catch (error) {
    return jsonResponse({error:error instanceof Error ? error.message : 'Publication failed'}, {status:500});
  }
});
