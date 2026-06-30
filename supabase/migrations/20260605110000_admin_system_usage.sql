begin;

create or replace function public.get_admin_system_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_database_bytes bigint := 0;
  v_storage_bytes bigint := 0;
  v_storage_object_count bigint := 0;
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  select pg_database_size(current_database())
  into v_database_bytes;

  select
    coalesce(sum(
      case
        when (o.metadata ->> 'size') ~ '^[0-9]+$'
          then (o.metadata ->> 'size')::bigint
        else 0
      end
    ), 0)::bigint,
    count(*)::bigint
  into v_storage_bytes, v_storage_object_count
  from storage.objects o;

  return jsonb_build_object(
    'databaseBytes', v_database_bytes,
    'databaseQuotaBytes', 500 * 1024 * 1024,
    'storageBytes', v_storage_bytes,
    'storageQuotaBytes', 1024 * 1024 * 1024,
    'storageObjectCount', v_storage_object_count
  );
end;
$$;

comment on function public.get_admin_system_usage() is 'Admin-only system usage snapshot for database size and Supabase Storage object size.';

revoke all on function public.get_admin_system_usage() from public;
grant execute on function public.get_admin_system_usage() to authenticated;

commit;
