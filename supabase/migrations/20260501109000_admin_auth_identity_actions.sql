begin;

create or replace function public.admin_clear_auth_identity_devices(
  p_identity_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  if p_identity_id is null then
    raise exception '缺少账号标识。'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from private.auth_identities ai
    where ai.id = p_identity_id
  ) then
    raise exception '账号不存在。'
      using errcode = 'P0002';
  end if;

  delete from private.auth_identity_devices d
  where d.auth_identity_id = p_identity_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.admin_delete_auth_identity(
  p_identity_id uuid
)
returns table (
  id uuid,
  username text,
  role text,
  auth_email text
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing private.auth_identities;
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  if p_identity_id is null then
    raise exception '缺少账号标识。'
      using errcode = '22023';
  end if;

  select ai.*
  into v_existing
  from private.auth_identities ai
  where ai.id = p_identity_id;

  if not found then
    raise exception '账号不存在。'
      using errcode = 'P0002';
  end if;

  if v_existing.auth_user_id = auth.uid() then
    raise exception '不能删除当前登录账号。'
      using errcode = '22023';
  end if;

  if v_existing.role = 'admin' then
    raise exception '管理员账号映射不能在此处删除。'
      using errcode = '22023';
  end if;

  delete from private.auth_identities ai
  where ai.id = p_identity_id;

  return query
  select
    v_existing.id,
    v_existing.username,
    v_existing.role,
    v_existing.auth_email;
end;
$$;

comment on function public.admin_clear_auth_identity_devices(uuid) is 'Admin-only helper that clears remembered login devices for one managed auth identity.';
comment on function public.admin_delete_auth_identity(uuid) is 'Admin-only helper that deletes one non-admin managed auth identity mapping.';

revoke all on function public.admin_clear_auth_identity_devices(uuid) from public;
grant execute on function public.admin_clear_auth_identity_devices(uuid) to authenticated;

revoke all on function public.admin_delete_auth_identity(uuid) from public;
grant execute on function public.admin_delete_auth_identity(uuid) to authenticated;

commit;
