// Read-only database export; no credentials or private data enter the artifact.
import {readFile,writeFile} from 'node:fs/promises';
import {calculateChampion,readRows,encodeSnapshot,decodeSnapshot,snapshotPath} from '../supabase/functions/publish-season-champion/champion.mjs';
const app = await readFile(new URL('../app.js',import.meta.url),'utf8');
const project = app.match(/const DEFAULT_PROJECT_ID = "([^"]+)"/)[1];
const key = app.match(/"(sb_publishable_[^"]+)"/)[1];
const url = `https://${project}.supabase.co`;
const seasons = await readRows(url,key,'seasons',{select:'id,code,name,status',status:'in.(closed,archived)',order:'code'});
let entries = [
  {seasonCode:'2026-03',seasonName:'2026-03',tiLabel:'TI1',championName:'苏神',playerId:'',score:null,source:'legacy'},
  {seasonCode:'2026-04',seasonName:'2026-04',tiLabel:'TI2',championName:'海参',playerId:'',score:null,source:'legacy'},
];
try { entries = decodeSnapshot(await readFile(new URL(`../${snapshotPath}`,import.meta.url),'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const regenerate = process.argv.find(arg=>arg.startsWith('--regenerate='))?.split('=')[1];
if (regenerate && !seasons.some(row=>row.code===regenerate && row.code>'2026-04')) throw new Error('Unknown ended season to regenerate');
for (const season of seasons.filter(row=>row.code>'2026-04')) {
  if (entries.some(entry=>entry.seasonCode===season.code) && season.code!==regenerate) continue;
  const champion = await calculateChampion(url,key,season);
  entries = [...entries.filter(entry=>entry.seasonCode!==season.code),champion];
}
await writeFile(new URL(`../${snapshotPath}`,import.meta.url),encodeSnapshot(entries));
console.log(JSON.stringify(entries,null,2));
