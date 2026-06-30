begin;

create or replace function private.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create table if not exists private.user_whitelist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(btrim(email)) > 3),
  email_normalized text generated always as (private.normalize_email(email)) stored,
  role text not null check (role in ('admin', 'scorer')),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_whitelist_email_normalized_not_null check (email_normalized is not null)
);

comment on table private.user_whitelist is 'Operational allow-list for authenticated admin / scorer access. Real email rows are inserted manually in Supabase, never seeded from the repo.';
comment on column private.user_whitelist.email is 'Original email as entered by operators.';
comment on column private.user_whitelist.email_normalized is 'Lowercased / trimmed email used for lookups and uniqueness.';

create unique index if not exists user_whitelist_email_normalized_uidx
  on private.user_whitelist (email_normalized);

create index if not exists user_whitelist_role_active_idx
  on private.user_whitelist (role, is_active);

create or replace function private.current_auth_email()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select private.normalize_email(auth.jwt() ->> 'email');
$$;

create or replace function private.has_whitelist_role(
  p_roles text[],
  p_email text default private.current_auth_email()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.user_whitelist uw
    where uw.email_normalized = private.normalize_email(p_email)
      and uw.is_active
      and uw.role = any (coalesce(p_roles, array[]::text[]))
  );
$$;

create or replace function public.get_current_role()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select uw.role
  from private.user_whitelist uw
  where uw.email_normalized = private.current_auth_email()
    and uw.is_active
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.has_whitelist_role(array['admin']);
$$;

create or replace function public.is_scorer()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.has_whitelist_role(array['admin', 'scorer']);
$$;

create or replace view public.v_current_access_role
as
select
  private.current_auth_email() as email_normalized,
  public.get_current_role() as role,
  public.is_admin() as is_admin,
  public.is_scorer() as is_scorer;

comment on view public.v_current_access_role is 'Authenticated caller access profile derived from Supabase Auth email plus private.user_whitelist.';

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
    public.is_scorer()
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
    public.is_scorer()
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
    public.is_scorer()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['score_keeper']);
$$;

create trigger user_whitelist_set_updated_at
  before update on private.user_whitelist
  for each row execute function public.tg_set_updated_at();

create trigger audit_user_whitelist
  after insert or update or delete on private.user_whitelist
  for each row execute function private.audit_row_change();

alter table private.user_whitelist enable row level security;

create policy user_whitelist_admin_select
  on private.user_whitelist
  for select
  to authenticated
  using (public.is_admin());

create policy user_whitelist_admin_insert
  on private.user_whitelist
  for insert
  to authenticated
  with check (public.is_admin());

create policy user_whitelist_admin_update
  on private.user_whitelist
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy user_whitelist_admin_delete
  on private.user_whitelist
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists seasons_write_admin on public.seasons;

create policy seasons_write_admin
  on public.seasons
  for all
  to authenticated
  using (
    public.is_admin()
    or private.has_any_global_role(array['super_admin', 'score_admin'])
  )
  with check (
    public.is_admin()
    or private.has_any_global_role(array['super_admin', 'score_admin'])
  );

grant usage on schema private to authenticated;
grant select, insert, update, delete on private.user_whitelist to authenticated;
grant select on public.v_current_access_role to authenticated;

revoke all on function public.get_current_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_scorer() from public;

grant execute on function public.get_current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_scorer() to authenticated;

commit;
