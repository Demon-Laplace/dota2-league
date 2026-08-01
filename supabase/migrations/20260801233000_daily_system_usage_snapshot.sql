begin;

create extension if not exists pg_cron with schema extensions;

create table if not exists private.system_usage_daily_snapshots (
  business_date date primary key,
  database_bytes bigint not null check (database_bytes >= 0),
  storage_bytes bigint not null check (storage_bytes >= 0),
  captured_at timestamptz not null default now()
);

revoke all on table private.system_usage_daily_snapshots from public;
revoke all on table private.system_usage_daily_snapshots from anon;
revoke all on table private.system_usage_daily_snapshots from authenticated;

create or replace function private.capture_system_usage_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, private
as $$
declare
  v_beijing_now timestamp without time zone := timezone('Asia/Shanghai', clock_timestamp());
  v_business_date date;
  v_database_bytes bigint := 0;
  v_storage_bytes bigint := 0;
  v_captured_at timestamptz := clock_timestamp();
begin
  v_business_date := v_beijing_now::date
    - case when extract(hour from v_beijing_now) < 2 then 1 else 0 end;

  select pg_database_size(current_database())
  into v_database_bytes;

  select
    coalesce(sum(
      case
        when (o.metadata ->> 'size') ~ '^[0-9]+$'
          then (o.metadata ->> 'size')::bigint
        else 0
      end
    ), 0)::bigint
  into v_storage_bytes
  from storage.objects o;

  insert into private.system_usage_daily_snapshots (
    business_date,
    database_bytes,
    storage_bytes,
    captured_at
  )
  values (
    v_business_date,
    v_database_bytes,
    v_storage_bytes,
    v_captured_at
  )
  on conflict (business_date) do update
  set
    database_bytes = excluded.database_bytes,
    storage_bytes = excluded.storage_bytes,
    captured_at = excluded.captured_at;

  delete from private.system_usage_daily_snapshots
  where business_date < v_business_date - 45;

  return jsonb_build_object(
    'businessDate', v_business_date,
    'databaseBytes', v_database_bytes,
    'storageBytes', v_storage_bytes,
    'capturedAt', v_captured_at
  );
end;
$$;

comment on function private.capture_system_usage_snapshot() is 'Captures database and Storage usage once per Beijing business day for the admin status panel.';

revoke all on function private.capture_system_usage_snapshot() from public;
revoke execute on function private.capture_system_usage_snapshot() from anon;
revoke execute on function private.capture_system_usage_snapshot() from authenticated;

select private.capture_system_usage_snapshot();

create or replace function public.get_admin_system_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_snapshot private.system_usage_daily_snapshots%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  select snapshot.*
  into v_snapshot
  from private.system_usage_daily_snapshots snapshot
  order by snapshot.business_date desc
  limit 1;

  return jsonb_build_object(
    'businessDate', v_snapshot.business_date,
    'databaseBytes', coalesce(v_snapshot.database_bytes, 0),
    'databaseQuotaBytes', 500::bigint * 1024 * 1024,
    'storageBytes', coalesce(v_snapshot.storage_bytes, 0),
    'storageQuotaBytes', 1024::bigint * 1024 * 1024,
    'capturedAt', v_snapshot.captured_at
  );
end;
$$;

comment on function public.get_admin_system_usage() is 'Admin-only daily usage snapshot captured at 02:00 Beijing time. Database quota excludes WAL and system disk estimates.';

revoke all on function public.get_admin_system_usage() from public;
revoke execute on function public.get_admin_system_usage() from anon;
grant execute on function public.get_admin_system_usage() to authenticated;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'capture-daily-system-usage'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'capture-daily-system-usage',
    '0 18 * * *',
    'select private.capture_system_usage_snapshot();'
  );
end;
$$;

commit;
