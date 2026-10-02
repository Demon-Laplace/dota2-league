// Apply this one reviewed migration without repairing or replaying unrelated
// production migrations belonging to other worktrees.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { migrationWithHistory } from './champion-migration-sql.mjs';
const project = process.env.SUPABASE_PROJECT_ID;
assert.equal(project, 'klxkkwwszqtgeuozwtkw', 'Unexpected production project');
const version = '20261002120000';
const name = 'durable_season_champion_publication';
const sql = await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
const query = async statement => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: statement }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Champion migration: HTTP ${response.status}; ${error.message || error.error || 'query failed'}`);
  }
  return response.json();
};
const existing = await query(`select version from supabase_migrations.schema_migrations where version='${version}'`);
if (existing.length) {
  console.log('Champion migration is already recorded; nothing replayed');
} else {
  // DDL and its history record commit together. Every unrelated history entry
  // remains untouched. A failed DDL statement leaves neither change behind.
  const applied = migrationWithHistory(sql, version, name);
  await query(applied);
  console.log('Applied only the durable champion migration and recorded its version');
}
