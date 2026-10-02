import assert from 'node:assert/strict';
export function migrationWithHistory(sql, version, name) {
  assert.match(version, /^\d{14}$/);
  assert.match(name, /^[a-z_]+$/);
  assert.match(sql, /commit;\s*$/i);
  const literal = "'" + sql.replaceAll("'", "''") + "'";
  // A callback preserves SQL dollar quotes and regex anchors literally.
  return sql.replace(/commit;\s*$/i, () =>
    "insert into supabase_migrations.schema_migrations(version,name,statements) values ('" + version + "','" + name + "',array[" + literal + "]);\ncommit;");
}
