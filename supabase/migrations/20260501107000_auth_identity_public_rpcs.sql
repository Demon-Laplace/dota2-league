begin;

create or replace function public.resolve_auth_identity_for_login(p_username text)
returns table (
  auth_email text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    ai.auth_email,
    ai.is_active
  from private.auth_identities ai
  where ai.username = private.normalize_username(p_username)
  limit 1;
$$;

create or replace function public.admin_list_auth_identities()
returns table (
  id uuid,
  username text,
  role text,
  is_active boolean,
  created_at timestamptz,
  auth_email text,
  auth_email_normalized text,
  auth_user_id uuid
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  return query
  select
    ai.id,
    ai.username,
    ai.role,
    ai.is_active,
    ai.created_at,
    ai.auth_email,
    ai.auth_email_normalized,
    ai.auth_user_id
  from private.auth_identities ai
  order by ai.created_at desc;
end;
$$;

create or replace function public.admin_upsert_auth_identity(
  p_identity_id uuid default null,
  p_username text default null,
  p_auth_email text default null,
  p_role text default null,
  p_is_active boolean default true,
  p_auth_user_id uuid default null
)
returns table (
  id uuid,
  username text,
  role text,
  is_active boolean,
  created_at timestamptz,
  auth_email text,
  auth_email_normalized text,
  auth_user_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_identity_id uuid := p_identity_id;
  v_username text := private.normalize_username(p_username);
  v_auth_email text := private.normalize_email(p_auth_email);
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_existing private.auth_identities;
begin
  if not public.is_admin() then
    raise exception 'Forbidden.'
      using errcode = '42501';
  end if;

  if v_username is null or not private.is_valid_username(v_username) then
    raise exception '用户名只能包含 1-10 位中文。'
      using errcode = '22023';
  end if;

  if v_auth_email is null then
    raise exception '请输入有效邮箱。'
      using errcode = '22023';
  end if;

  if v_role not in ('admin', 'scorekeeper') then
    raise exception '角色只能是 admin 或 scorekeeper。'
      using errcode = '22023';
  end if;

  if v_identity_id is not null then
    select ai.*
    into v_existing
    from private.auth_identities ai
    where ai.id = v_identity_id;

    if not found then
      raise exception '账号映射不存在，请刷新后重试。'
        using errcode = 'P0002';
    end if;
  end if;

  select ai.*
  into v_existing
  from private.auth_identities ai
  where ai.auth_email_normalized = v_auth_email
  limit 1;

  if found then
    if v_identity_id is null then
      v_identity_id := v_existing.id;
    elsif v_existing.id <> v_identity_id then
      raise exception '该邮箱已经绑定到其他账号映射。'
        using errcode = '23505';
    end if;
  end if;

  select ai.*
  into v_existing
  from private.auth_identities ai
  where ai.username = v_username
  limit 1;

  if found and (v_identity_id is null or v_existing.id <> v_identity_id) then
    raise exception '该用户名已被其他账号占用。'
      using errcode = '23505';
  end if;

  if v_identity_id is null then
    insert into private.auth_identities (
      username,
      auth_email,
      role,
      is_active,
      auth_user_id
    )
    values (
      v_username,
      v_auth_email,
      v_role,
      coalesce(p_is_active, true),
      p_auth_user_id
    )
    returning *
    into v_existing;
  else
    update private.auth_identities ai
    set username = v_username,
        auth_email = v_auth_email,
        role = v_role,
        is_active = coalesce(p_is_active, true),
        auth_user_id = coalesce(p_auth_user_id, ai.auth_user_id)
    where ai.id = v_identity_id
    returning *
    into v_existing;
  end if;

  return query
  select
    v_existing.id,
    v_existing.username,
    v_existing.role,
    v_existing.is_active,
    v_existing.created_at,
    v_existing.auth_email,
    v_existing.auth_email_normalized,
    v_existing.auth_user_id;
end;
$$;

comment on function public.resolve_auth_identity_for_login(text) is 'Resolves managed auth email by username for the unauthenticated username-login edge function.';
comment on function public.admin_list_auth_identities() is 'Admin-only projection of managed auth identities without exposing the private schema over REST.';
comment on function public.admin_upsert_auth_identity(uuid, text, text, text, boolean, uuid) is 'Admin-only insert/update wrapper for managed auth identities without exposing the private schema over REST.';

revoke all on function public.resolve_auth_identity_for_login(text) from public;
grant execute on function public.resolve_auth_identity_for_login(text) to anon, authenticated;

revoke all on function public.admin_list_auth_identities() from public;
grant execute on function public.admin_list_auth_identities() to authenticated;

revoke all on function public.admin_upsert_auth_identity(uuid, text, text, text, boolean, uuid) from public;
grant execute on function public.admin_upsert_auth_identity(uuid, text, text, text, boolean, uuid) to authenticated;

commit;
