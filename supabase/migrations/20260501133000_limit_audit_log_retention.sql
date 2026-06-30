begin;

create index if not exists audit_logs_created_at_idx
  on private.audit_logs (created_at desc);

create or replace function private.prune_audit_logs(
  p_keep_interval interval default interval '3 days'
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deleted_count integer := 0;
begin
  delete from private.audit_logs
  where created_at < timezone('utc', now()) - p_keep_interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

comment on function private.prune_audit_logs(interval)
  is 'Deletes private.audit_logs rows older than the retention interval. Default retention is 3 days.';

select private.prune_audit_logs();

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_target_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  perform private.prune_audit_logs();

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
    v_target_id := nullif(v_old ->> 'id', '')::uuid;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
    v_target_id := coalesce(v_target_id, nullif(v_new ->> 'id', '')::uuid);
  end if;

  insert into private.audit_logs (
    actor_user_id,
    action,
    target_schema,
    target_table,
    target_id,
    old_data,
    new_data,
    context
  )
  values (
    v_actor,
    lower(tg_op),
    tg_table_schema,
    tg_table_name,
    v_target_id,
    v_old,
    v_new,
    jsonb_build_object('trigger_name', tg_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function private.audit_row_change()
  is 'Writes privileged row-change audit entries and trims audit retention to the most recent 3 days.';

commit;
