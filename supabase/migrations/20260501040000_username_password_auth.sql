begin;

create or replace function private.normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p_username, ''))), '');
$$;

create or replace function private.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select coalesce(private.normalize_username(p_username) ~ '^[a-z0-9_]{3,32}$', false);
$$;

create or replace function private.username_to_auth_email(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v_username text := private.normalize_username(p_username);
begin
  if not private.is_valid_username(v_username) then
    raise exception 'Invalid username format. Use 3-32 lowercase letters, numbers, or underscores.'
      using errcode = '22023';
  end if;

  return format('user_%s@internal.local', v_username);
end;
$$;

create or replace function private.username_seed_from_email(p_email text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(
        both '_'
        from regexp_replace(
          split_part(private.normalize_email(p_email), '@', 1),
          '[^a-z0-9_]+',
          '_',
          'g'
        )
      ),
      ''
    ),
    'user'
  );
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'private'
      and table_name = 'user_whitelist'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'private'
      and table_name = 'auth_identities'
  ) then
    alter table private.user_whitelist rename to auth_identities;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'auth_identities'
      and column_name = 'email'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'auth_identities'
      and column_name = 'auth_email'
  ) then
    alter table private.auth_identities rename column email to auth_email;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'auth_identities'
      and column_name = 'email_normalized'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'auth_identities'
      and column_name = 'auth_email_normalized'
  ) then
    alter table private.auth_identities rename column email_normalized to auth_email_normalized;
  end if;
end
$$;

alter table private.auth_identities
  add column if not exists username text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

update private.auth_identities
set role = 'scorekeeper'
where role = 'scorer';

alter table private.auth_identities
  drop constraint if exists user_whitelist_role_check,
  drop constraint if exists auth_identities_role_check,
  drop constraint if exists user_whitelist_email_normalized_not_null,
  drop constraint if exists auth_identities_auth_email_normalized_not_null,
  drop constraint if exists auth_identities_username_check;

do $$
declare
  v_row record;
  v_base text;
  v_candidate text;
  v_suffix integer;
begin
  for v_row in
    select id, auth_email_normalized
    from private.auth_identities
    where username is null
       or username <> private.normalize_username(username)
       or not private.is_valid_username(username)
    order by created_at, id
  loop
    v_base := private.username_seed_from_email(v_row.auth_email_normalized);
    if length(v_base) < 3 then
      v_base := rpad(v_base, 3, 'x');
    end if;

    v_base := left(v_base, 24);
    v_candidate := v_base;
    v_suffix := 0;

    while exists (
      select 1
      from private.auth_identities ai
      where ai.username = v_candidate
        and ai.id <> v_row.id
    ) loop
      v_suffix := v_suffix + 1;
      v_candidate := left(v_base, greatest(1, 32 - length(v_suffix::text) - 1)) || '_' || v_suffix::text;
    end loop;

    update private.auth_identities
    set username = v_candidate
    where id = v_row.id;
  end loop;
end
$$;

alter table private.auth_identities
  add constraint auth_identities_role_check
    check (role in ('admin', 'scorekeeper')),
  add constraint auth_identities_auth_email_normalized_not_null
    check (auth_email_normalized is not null),
  add constraint auth_identities_username_check
    check (
      username is not null
      and username = private.normalize_username(username)
      and private.is_valid_username(username)
    );

update private.auth_identities ai
set auth_user_id = au.id,
    updated_at = timezone('utc', now())
from auth.users au
where ai.auth_user_id is null
  and lower(coalesce(au.email, '')) = ai.auth_email_normalized;

drop index if exists private.user_whitelist_email_normalized_uidx;
drop index if exists private.user_whitelist_role_active_idx;
drop index if exists private.auth_identities_auth_email_normalized_uidx;
drop index if exists private.auth_identities_role_active_idx;
drop index if exists private.auth_identities_username_uidx;
drop index if exists private.auth_identities_auth_user_id_uidx;

create unique index auth_identities_auth_email_normalized_uidx
  on private.auth_identities (auth_email_normalized);

create unique index auth_identities_username_uidx
  on private.auth_identities (username);

create unique index auth_identities_auth_user_id_uidx
  on private.auth_identities (auth_user_id)
  where auth_user_id is not null;

create index auth_identities_role_active_idx
  on private.auth_identities (role, is_active);

comment on table private.auth_identities is 'Admin-managed account directory. Usernames map to Supabase Auth emails and backend roles.';
comment on column private.auth_identities.username is 'Unique username used by the front-end login form.';
comment on column private.auth_identities.auth_email is 'Underlying Supabase Auth identifier. New managed accounts should use internal.local addresses.';
comment on column private.auth_identities.auth_user_id is 'Linked auth.users.id once the account exists in Supabase Auth.';

create or replace function private.current_auth_email()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select private.normalize_email(auth.jwt() ->> 'email');
$$;

create or replace function private.current_auth_identity()
returns private.auth_identities
language sql
stable
security definer
set search_path = public, private
as $$
  select ai.*
  from private.auth_identities ai
  where ai.is_active
    and (
      ai.auth_user_id = auth.uid()
      or ai.auth_email_normalized = private.current_auth_email()
    )
  order by case when ai.auth_user_id = auth.uid() then 0 else 1 end, ai.created_at
  limit 1;
$$;

create or replace function private.has_auth_identity_role(
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.auth_identities ai
    where ai.id = (private.current_auth_identity()).id
      and ai.role = any (coalesce(p_roles, array[]::text[]))
  );
$$;

create or replace function public.bind_auth_identity()
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := private.require_authenticated();
  v_email text := private.current_auth_email();
  v_rows integer := 0;
begin
  if v_email is null then
    return false;
  end if;

  update private.auth_identities
  set auth_user_id = v_uid,
      updated_at = timezone('utc', now())
  where auth_user_id is null
    and auth_email_normalized = v_email;

  get diagnostics v_rows = row_count;

  return v_rows > 0
    or exists (
      select 1
      from private.auth_identities ai
      where ai.auth_user_id = v_uid
        and ai.is_active
    );
end;
$$;

create or replace function public.get_current_role()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select (private.current_auth_identity()).role;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.has_auth_identity_role(array['admin']);
$$;

create or replace function public.is_scorekeeper()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.has_auth_identity_role(array['admin', 'scorekeeper']);
$$;

create or replace function public.is_scorer()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select public.is_scorekeeper();
$$;

drop view if exists public.v_current_access_role;

create view public.v_current_access_role
as
select
  (private.current_auth_identity()).username as username,
  private.current_auth_email() as auth_email_normalized,
  public.get_current_role() as role,
  public.is_admin() as is_admin,
  public.is_scorekeeper() as is_scorekeeper,
  public.is_scorer() as is_scorer;

comment on view public.v_current_access_role is 'Current authenticated access role derived from private.auth_identities.';

create or replace function public.can_manage_season(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_admin()
    or private.has_any_global_role(array['super_admin', 'score_admin'])
    or private.has_season_role(p_season_id, array['season_admin']);
$$;

create or replace function public.can_submit_matches(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['score_keeper']);
$$;

create or replace function public.can_review_matches(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['reviewer', 'score_keeper']);
$$;

create or replace function public.can_apply_items(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_admin()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['item_operator']);
$$;

create or replace function public.can_adjust_scores(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['score_keeper']);
$$;

drop trigger if exists user_whitelist_set_updated_at on private.auth_identities;
drop trigger if exists audit_user_whitelist on private.auth_identities;
drop trigger if exists auth_identities_set_updated_at on private.auth_identities;
drop trigger if exists audit_auth_identities on private.auth_identities;

create trigger auth_identities_set_updated_at
  before update on private.auth_identities
  for each row execute function public.tg_set_updated_at();

create trigger audit_auth_identities
  after insert or update or delete on private.auth_identities
  for each row execute function private.audit_row_change();

alter table private.auth_identities enable row level security;

drop policy if exists user_whitelist_admin_select on private.auth_identities;
drop policy if exists user_whitelist_admin_insert on private.auth_identities;
drop policy if exists user_whitelist_admin_update on private.auth_identities;
drop policy if exists user_whitelist_admin_delete on private.auth_identities;
drop policy if exists auth_identities_admin_select on private.auth_identities;
drop policy if exists auth_identities_admin_insert on private.auth_identities;
drop policy if exists auth_identities_admin_update on private.auth_identities;
drop policy if exists auth_identities_admin_delete on private.auth_identities;

create policy auth_identities_admin_select
  on private.auth_identities
  for select
  to authenticated
  using (public.is_admin());

create policy auth_identities_admin_insert
  on private.auth_identities
  for insert
  to authenticated
  with check (public.is_admin());

create policy auth_identities_admin_update
  on private.auth_identities
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy auth_identities_admin_delete
  on private.auth_identities
  for delete
  to authenticated
  using (public.is_admin());

grant usage on schema private to authenticated;
grant select, insert, update, delete on private.auth_identities to authenticated;
grant select on public.v_current_access_role to authenticated;

revoke all on function public.bind_auth_identity() from public;
revoke all on function public.get_current_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_scorekeeper() from public;
revoke all on function public.is_scorer() from public;

grant execute on function public.bind_auth_identity() to authenticated;
grant execute on function public.get_current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_scorekeeper() to authenticated;
grant execute on function public.is_scorer() to authenticated;

commit;
