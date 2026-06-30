begin;

create extension if not exists pgcrypto;

create schema if not exists private;
comment on schema private is 'Sensitive operational objects for the season backend.';

do $cleanup$
declare
  fn record;
  legacy_table text;
  legacy_view text;
begin
  foreach legacy_view in array array[
    'current_season_leaderboard',
    'match_day_recent_matches',
    'v_leaderboard',
    'v_match_detail',
    'v_my_admin_scope'
  ]
  loop
    execute format('drop view if exists public.%I cascade', legacy_view);
  end loop;

  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'add_player_reward_extra',
        'apply_manual_score_adjustment',
        'cancel_active_match_day',
        'cancel_reward_donation',
        'clear_signup_queue_for_testing',
        'clear_today_players_for_testing',
        'close_active_match_day_and_reset',
        'confirm_queue_to_today_players',
        'confirm_season_rollover',
        'delete_match_and_recalculate',
        'ensure_previous_match_day_placeholder',
        'finalize_active_match_day',
        'get_beijing_match_date',
        'get_season_rollover_cutoff',
        'record_match_result',
        'record_match_result_backfill',
        'recalculate_all_scores',
        'replace_match_double_downs',
        'reorder_matches_within_day',
        'reset_current_season',
        'revoke_manual_score_adjustment',
        'set_season_koi',
        'set_season_player_rank',
        'should_apply_match_day_absence_adjustment',
        'start_match_day',
        'sync_player_reward_totals',
        'toggle_season_player',
        'update_match_result',
        'update_match_result_hero',
        'update_match_result_heroes',
        'update_player_reward_points'
      ])
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  end loop;

  foreach legacy_table in array array[
    'season_action_logs',
    'manual_score_adjustments',
    'match_day_attendance_notes',
    'match_double_downs',
    'daily_player_roster',
    'season_end_confirmations',
    'match_days',
    'reward_donations',
    'season_player_stats',
    'season_players',
    'app_role_members',
    'match_results',
    'signup_queue',
    'players',
    'profiles',
    'score_ledger',
    'match_players',
    'matches',
    'season_memberships',
    'item_catalog',
    'seasons'
  ]
  loop
    execute format('drop table if exists public.%I cascade', legacy_table);
  end loop;

  foreach legacy_table in array array[
    'audit_logs',
    'item_usages',
    'item_instances',
    'season_staff',
    'user_global_roles'
  ]
  loop
    execute format('drop table if exists private.%I cascade', legacy_table);
  end loop;
end;
$cleanup$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.profiles is 'Operator identity records backed by Supabase Auth.';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.players is 'Master player roster. Season participants are selected from this table.';

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed', 'archived')),
  is_public boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  rule_version text not null,
  rule_config jsonb not null default jsonb_build_object(
    'win_points', 3,
    'loss_points', 0,
    'participation_points', 0
  )
    check (jsonb_typeof(rule_config) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.seasons is 'Season definitions for the new competitive calendar.';

create table public.season_memberships (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  join_status text not null default 'inactive'
    check (join_status in ('invited', 'inactive', 'active', 'captain', 'withdrawn', 'banned')),
  joined_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, player_id)
);
comment on table public.season_memberships is 'Per-season roster membership selected from the master player table. inactive means not participating in the current season.';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_no integer not null,
  match_date date not null default (timezone('utc', now())::date),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'void')),
  winner_side text
    check (winner_side in ('radiant', 'dire')),
  notes text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, match_no)
);
comment on table public.matches is 'Match headers. Approval state drives whether score ledger entries are authoritative.';

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  side text not null
    check (side in ('radiant', 'dire')),
  slot_no smallint not null
    check (slot_no between 1 and 5),
  is_captain boolean not null default false,
  result text not null default 'pending'
    check (result in ('win', 'loss', 'draw', 'pending')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, player_id),
  unique (match_id, side, slot_no)
);
comment on table public.match_players is 'Resolved ten-player roster for each match.';

create table public.score_ledger (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  match_id uuid references public.matches(id) on delete set null,
  entry_type text not null
    check (entry_type in (
      'match_result',
      'attendance_bonus',
      'item_effect',
      'manual_adjustment',
      'penalty',
      'rollback'
    )),
  points_delta numeric(10, 2) not null check (points_delta <> 0),
  reason text not null,
  source_table text,
  source_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  reversal_of_id uuid references public.score_ledger(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);
comment on table public.score_ledger is 'Authoritative score source. Leaderboards are derived from this ledger.';

create table public.manual_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  points_delta numeric(10, 2) not null check (points_delta <> 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.manual_score_adjustments is 'Manual score additions or deductions stored separately from score_ledger so they can be composed on the frontend like participation points.';

create table public.item_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  visibility_default text not null default 'public'
    check (visibility_default in ('public', 'staff_only', 'hidden_until_used', 'hidden_until_match_approved')),
  effect_type text not null default 'score_delta'
    check (effect_type in ('score_delta', 'informational')),
  default_points_delta numeric(10, 2) not null default 0,
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table public.item_catalog is 'Public catalog of season items and their default behaviour.';

create table private.user_global_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in ('super_admin', 'score_admin', 'referee_viewer')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, role)
);
comment on table private.user_global_roles is 'Global operational roles. Authorization is table-driven, never shared-password-driven.';

create table private.season_staff (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in ('season_admin', 'score_keeper', 'item_operator', 'reviewer')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (season_id, user_id, role)
);
comment on table private.season_staff is 'Season-scoped staff assignments.';

create table private.item_instances (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  item_catalog_id uuid not null references public.item_catalog(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'reserved', 'consumed', 'expired', 'revoked')),
  visibility_mode text not null default 'public'
    check (visibility_mode in ('public', 'staff_only', 'hidden_until_used', 'hidden_until_match_approved')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_reason text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table private.item_instances is 'Season item ownership. Hidden items live here, not in public tables.';

create table private.item_usages (
  id uuid primary key default gen_random_uuid(),
  item_instance_id uuid not null references private.item_instances(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  target_player_id uuid references public.players(id) on delete set null,
  used_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'applied', 'cancelled', 'rejected')),
  visibility_mode text not null default 'public'
    check (visibility_mode in ('public', 'staff_only', 'hidden_until_used', 'hidden_until_match_approved')),
  effect_points_delta numeric(10, 2) not null default 0,
  effect_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(effect_payload) = 'object'),
  notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
comment on table private.item_usages is 'Item resolution records with hidden-before-approval support.';

create table private.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_schema text not null,
  target_table text not null,
  target_id uuid,
  old_data jsonb,
  new_data jsonb,
  context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);
comment on table private.audit_logs is 'Append-only audit trail for privileged database changes.';

create index profiles_is_active_idx on public.profiles (is_active);
create index players_is_active_idx on public.players (is_active);
create index seasons_status_idx on public.seasons (status);
create index season_memberships_season_player_idx on public.season_memberships (season_id, player_id);
create index season_memberships_player_idx on public.season_memberships (player_id);
create index matches_season_status_idx on public.matches (season_id, status);
create index matches_season_date_idx on public.matches (season_id, match_date desc, match_no desc);
create index matches_status_approved_at_idx on public.matches (status, approved_at desc);
create index match_players_match_idx on public.match_players (match_id);
create index match_players_season_player_idx on public.match_players (season_id, player_id);
create index score_ledger_season_player_idx on public.score_ledger (season_id, player_id);
create index score_ledger_match_idx on public.score_ledger (match_id);
create index score_ledger_source_idx on public.score_ledger (source_table, source_id);
create index score_ledger_reversal_of_idx on public.score_ledger (reversal_of_id);
create index manual_score_adjustments_season_player_idx on public.manual_score_adjustments (season_id, player_id);
create index manual_score_adjustments_active_idx on public.manual_score_adjustments (season_id, revoked_at, created_at desc);
create index item_catalog_code_idx on public.item_catalog (code);
create index item_instances_season_player_idx on private.item_instances (season_id, player_id);
create index item_instances_status_idx on private.item_instances (status);
create index item_usages_season_match_idx on private.item_usages (season_id, match_id);
create index item_usages_status_visibility_idx on private.item_usages (status, visibility_mode);
create index user_global_roles_user_role_idx on private.user_global_roles (user_id, role);
create index season_staff_season_user_role_idx on private.season_staff (season_id, user_id, role);
create index audit_logs_target_idx on private.audit_logs (target_schema, target_table, target_id);
create index audit_logs_actor_idx on private.audit_logs (actor_user_id, created_at desc);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function private.require_authenticated()
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required.'
      using errcode = '28000';
  end if;

  return v_uid;
end;
$$;

create or replace function private.has_any_global_role(
  p_roles text[],
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.user_global_roles ugr
    where ugr.user_id = p_user_id
      and ugr.role = any (coalesce(p_roles, array[]::text[]))
  );
$$;

create or replace function private.has_season_role(
  p_season_id uuid,
  p_roles text[],
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.season_staff ss
    where ss.season_id = p_season_id
      and ss.user_id = p_user_id
      and ss.role = any (coalesce(p_roles, array[]::text[]))
  );
$$;

create or replace function public.can_manage_season(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.has_any_global_role(array['super_admin', 'score_admin'])
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
    public.can_manage_season(p_season_id)
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
    public.can_manage_season(p_season_id)
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
    public.can_manage_season(p_season_id)
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
    public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['score_keeper']);
$$;

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := private.require_authenticated();
  v_profile public.profiles;
  v_display_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    '未命名用户'
  );
  v_avatar_url text := nullif(auth.jwt() -> 'user_metadata' ->> 'avatar_url', '');
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (v_uid, v_display_name, v_avatar_url)
  on conflict (id) do update
    set display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = timezone('utc', now())
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '未命名用户'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

create or replace function private.next_match_no(p_season_id uuid)
returns integer
language sql
security definer
set search_path = public, private
as $$
  select coalesce(max(match_no), 0) + 1
  from public.matches
  where season_id = p_season_id;
$$;

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

create or replace function private.apply_item_usage_now(
  p_usage_id uuid,
  p_actor uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_usage private.item_usages%rowtype;
  v_ledger_id uuid;
begin
  select *
  into v_usage
  from private.item_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception 'Item usage % not found.', p_usage_id
      using errcode = 'P0002';
  end if;

  if v_usage.status = 'applied' then
    return null;
  end if;

  if v_usage.status not in ('draft', 'pending') then
    raise exception 'Item usage % is not applyable in status %.', p_usage_id, v_usage.status
      using errcode = 'P0001';
  end if;

  if v_usage.target_player_id is not null and v_usage.effect_points_delta <> 0 then
    insert into public.score_ledger (
      season_id,
      player_id,
      match_id,
      entry_type,
      points_delta,
      reason,
      source_table,
      source_id,
      created_by,
      metadata
    )
    values (
      v_usage.season_id,
      v_usage.target_player_id,
      v_usage.match_id,
      'item_effect',
      v_usage.effect_points_delta,
      coalesce(v_usage.notes, 'Applied hidden or staff-only item effect.'),
      'private.item_usages',
      v_usage.id,
      p_actor,
      jsonb_build_object(
        'visibility_mode', v_usage.visibility_mode,
        'item_usage_id', v_usage.id
      )
    )
    returning id into v_ledger_id;
  end if;

  update private.item_usages
  set status = 'applied',
      resolved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_usage.id;

  update private.item_instances
  set status = 'consumed',
      updated_at = timezone('utc', now())
  where id = v_usage.item_instance_id
    and status in ('active', 'reserved');

  return v_ledger_id;
end;
$$;

create or replace function private.apply_pending_item_usages(
  p_match_id uuid,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_usage_id uuid;
begin
  for v_usage_id in
    select iu.id
    from private.item_usages iu
    where iu.match_id = p_match_id
      and iu.status in ('draft', 'pending')
  loop
    perform private.apply_item_usage_now(v_usage_id, p_actor);
  end loop;
end;
$$;

create or replace function private.post_match_score_entries(
  p_match_id uuid,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match public.matches%rowtype;
  v_rule_config jsonb;
  v_win_points numeric(10, 2);
  v_loss_points numeric(10, 2);
  v_participation_points numeric(10, 2);
begin
  select m.*
  into v_match
  from public.matches m
  where m.id = p_match_id;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  select s.rule_config
  into v_rule_config
  from public.seasons s
  where s.id = v_match.season_id;

  if exists (
    select 1
    from public.score_ledger sl
    where sl.match_id = p_match_id
      and sl.entry_type <> 'rollback'
  ) then
    raise exception 'Score ledger entries already exist for match %.', p_match_id
      using errcode = '23505';
  end if;

  v_win_points := coalesce((v_rule_config ->> 'win_points')::numeric, 3);
  v_loss_points := coalesce((v_rule_config ->> 'loss_points')::numeric, 0);
  v_participation_points := coalesce((v_rule_config ->> 'participation_points')::numeric, 0);

  update public.match_players
  set result = case
    when v_match.winner_side is null then 'pending'
    when side = v_match.winner_side then 'win'
    else 'loss'
  end,
      updated_at = timezone('utc', now())
  where match_id = p_match_id;

  insert into public.score_ledger (
    season_id,
    player_id,
    match_id,
    entry_type,
    points_delta,
    reason,
    source_table,
    source_id,
    created_by,
    metadata
  )
  select
    mp.season_id,
    mp.player_id,
    mp.match_id,
    'match_result',
    v_participation_points + case
      when v_match.winner_side is null then 0
      when mp.side = v_match.winner_side then v_win_points
      else v_loss_points
    end,
    case
      when v_match.winner_side is null then format('Match #%s approved without winner.', v_match.match_no)
      when mp.side = v_match.winner_side then format('Match #%s win.', v_match.match_no)
      else format('Match #%s loss.', v_match.match_no)
    end,
    'public.matches',
    p_match_id,
    p_actor,
    jsonb_build_object(
      'winner_side', v_match.winner_side,
      'match_no', v_match.match_no
    )
  from public.match_players mp
  where mp.match_id = p_match_id
    and (
      v_participation_points
      + case
          when v_match.winner_side is null then 0
          when mp.side = v_match.winner_side then v_win_points
          else v_loss_points
        end
    ) <> 0;

  perform private.apply_pending_item_usages(p_match_id, p_actor);
end;
$$;

create or replace function public.submit_match(
  p_season_id uuid,
  p_players jsonb,
  p_winner_side text default null,
  p_match_date date default timezone('utc', now())::date,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match_id uuid;
  v_match_no integer;
  v_season_status text;
begin
  if not public.can_submit_matches(p_season_id) then
    raise exception 'You do not have permission to submit matches for season %.', p_season_id
      using errcode = '42501';
  end if;

  select status
  into v_season_status
  from public.seasons
  where id = p_season_id;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if v_season_status in ('closed', 'archived') then
    raise exception 'Season % is not open for match submissions.', p_season_id
      using errcode = 'P0001';
  end if;

  if p_winner_side is not null and p_winner_side not in ('radiant', 'dire') then
    raise exception 'winner_side must be radiant, dire, or null.'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_players), '') <> 'array' or jsonb_array_length(p_players) <> 10 then
    raise exception 'Exactly 10 players are required when submitting a match.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    where x.player_id is null
      or x.side not in ('radiant', 'dire')
      or x.slot_no is null
      or x.slot_no not between 1 and 5
  ) then
    raise exception 'Invalid player payload. Expected player_id, side, and slot_no for each slot.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct x.player_id)
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
  ) <> 10 then
    raise exception 'Match payload contains duplicate players.'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    where x.side = 'radiant'
  ) <> 5 then
    raise exception 'Radiant side must contain exactly 5 players.'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    where x.side = 'dire'
  ) <> 5 then
    raise exception 'Dire side must contain exactly 5 players.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    left join public.season_memberships sm
      on sm.season_id = p_season_id
     and sm.player_id = x.player_id
     and sm.join_status in ('active', 'captain')
    where sm.player_id is null
  ) then
    raise exception 'All submitted players must be active members of the target season.'
      using errcode = '42501';
  end if;

  v_match_no := private.next_match_no(p_season_id);

  insert into public.matches (
    season_id,
    match_no,
    match_date,
    status,
    winner_side,
    notes,
    metadata,
    created_by,
    submitted_by,
    submitted_at
  )
  values (
    p_season_id,
    v_match_no,
    coalesce(p_match_date, timezone('utc', now())::date),
    'submitted',
    p_winner_side,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb),
    v_actor,
    v_actor,
    timezone('utc', now())
  )
  returning id into v_match_id;

  insert into public.match_players (
    match_id,
    season_id,
    player_id,
    side,
    slot_no,
    is_captain
  )
  select
    v_match_id,
    p_season_id,
    x.player_id,
    x.side,
    x.slot_no,
    coalesce(x.is_captain, false)
  from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean);

  return v_match_id;
end;
$$;

create or replace function public.approve_match(
  p_match_id uuid,
  p_approved boolean default true,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_review_matches(v_match.season_id) then
    raise exception 'You do not have permission to review this match.'
      using errcode = '42501';
  end if;

  if v_match.status not in ('submitted', 'rejected') then
    raise exception 'Only submitted or rejected matches can be reviewed. Current status: %.', v_match.status
      using errcode = 'P0001';
  end if;

  if p_approved then
    update public.matches
    set status = 'approved',
        approved_by = v_actor,
        approved_at = timezone('utc', now()),
        notes = coalesce(p_notes, notes),
        updated_at = timezone('utc', now())
    where id = p_match_id;

    perform private.post_match_score_entries(p_match_id, v_actor);
  else
    update public.matches
    set status = 'rejected',
        approved_by = v_actor,
        approved_at = timezone('utc', now()),
        notes = coalesce(p_notes, notes),
        updated_at = timezone('utc', now())
    where id = p_match_id;

    update public.match_players
    set result = 'pending',
        updated_at = timezone('utc', now())
    where match_id = p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'status', case when p_approved then 'approved' else 'rejected' end
  );
end;
$$;

create or replace function public.apply_item_effect(
  p_item_instance_id uuid,
  p_match_id uuid default null,
  p_target_user_id uuid default null,
  p_effect_points_delta numeric default 0,
  p_notes text default null,
  p_visibility_mode text default null,
  p_effect_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_item_instance private.item_instances%rowtype;
  v_usage_id uuid;
  v_usage_status text;
  v_match_status text;
begin
  select *
  into v_item_instance
  from private.item_instances
  where id = p_item_instance_id
  for update;

  if not found then
    raise exception 'Item instance % not found.', p_item_instance_id
      using errcode = 'P0002';
  end if;

  if not public.can_apply_items(v_item_instance.season_id) then
    raise exception 'You do not have permission to operate items for this season.'
      using errcode = '42501';
  end if;

  if v_item_instance.status not in ('active', 'reserved') then
    raise exception 'Item instance % is not available in status %.', p_item_instance_id, v_item_instance.status
      using errcode = 'P0001';
  end if;

  if p_match_id is not null then
    select status
    into v_match_status
    from public.matches
    where id = p_match_id
      and season_id = v_item_instance.season_id;

    if not found then
      raise exception 'Target match % does not belong to the same season as the item.', p_match_id
        using errcode = 'P0002';
    end if;
  end if;

  if p_target_user_id is null and p_effect_points_delta <> 0 then
    raise exception 'A target_player_id is required when points_delta is non-zero.'
      using errcode = '22023';
  end if;

  insert into private.item_usages (
    item_instance_id,
    season_id,
    match_id,
    target_player_id,
    used_by,
    status,
    visibility_mode,
    effect_points_delta,
    effect_payload,
    notes
  )
  values (
    p_item_instance_id,
    v_item_instance.season_id,
    p_match_id,
    p_target_user_id,
    v_actor,
    case
      when p_match_id is not null
       and coalesce(p_visibility_mode, v_item_instance.visibility_mode) = 'hidden_until_match_approved'
       and v_match_status is distinct from 'approved'
      then 'pending'
      else 'draft'
    end,
    coalesce(p_visibility_mode, v_item_instance.visibility_mode),
    coalesce(p_effect_points_delta, 0),
    coalesce(p_effect_payload, '{}'::jsonb),
    p_notes
  )
  returning id, status into v_usage_id, v_usage_status;

  if v_usage_status = 'draft' then
    perform private.apply_item_usage_now(v_usage_id, v_actor);
    v_usage_status := 'applied';
  else
    update private.item_instances
    set status = 'reserved',
        updated_at = timezone('utc', now())
    where id = p_item_instance_id
      and status = 'active';
  end if;

  return jsonb_build_object(
    'item_usage_id', v_usage_id,
    'status', v_usage_status
  );
end;
$$;

create or replace function public.manual_adjust_score(
  p_season_id uuid,
  p_player_id uuid,
  p_points_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry_id uuid;
  v_anchor_match_date date := (timezone('Asia/Shanghai', now()) - interval '2 hour')::date;
  v_anchor_match_id uuid;
  v_anchor_match_no integer;
begin
  if p_points_delta is null or p_points_delta = 0 then
    raise exception 'points_delta must be non-zero.'
      using errcode = '22023';
  end if;

  if coalesce(nullif(trim(p_reason), ''), '') = '' then
    raise exception 'A reason is required for manual score adjustments.'
      using errcode = '22023';
  end if;

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to adjust scores for this season.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.season_memberships sm
    where sm.season_id = p_season_id
      and sm.player_id = p_player_id
      and sm.join_status in ('active', 'captain')
  ) then
    raise exception 'Player % is not an active member of season %.', p_player_id, p_season_id
      using errcode = '42501';
  end if;

  select
    m.id,
    m.match_no
  into
    v_anchor_match_id,
    v_anchor_match_no
  from public.matches m
  where m.season_id = p_season_id
    and m.match_date = v_anchor_match_date
  order by m.match_no desc, m.created_at desc
  limit 1;

  insert into public.manual_score_adjustments (
    season_id,
    player_id,
    points_delta,
    reason,
    created_by,
    metadata
  )
  values (
    p_season_id,
    p_player_id,
    p_points_delta,
    p_reason,
    v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'adjusted_by', v_actor,
      'anchor_match_date', v_anchor_match_date,
      'anchor_match_id', v_anchor_match_id,
      'anchor_match_no', v_anchor_match_no
    ))
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.revoke_manual_score_adjustment(
  p_adjustment_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry public.manual_score_adjustments%rowtype;
begin
  select *
  into v_entry
  from public.manual_score_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception 'Manual score adjustment % not found.', p_adjustment_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_entry.season_id) then
    raise exception 'You do not have permission to revoke this manual score adjustment.'
      using errcode = '42501';
  end if;

  if v_entry.revoked_at is not null then
    raise exception 'This manual score adjustment has already been revoked.'
      using errcode = '22023';
  end if;

  update public.manual_score_adjustments
  set revoked_at = timezone('utc', now()),
      revoked_by = v_actor,
      revoked_reason = nullif(trim(p_reason), '')
  where id = p_adjustment_id;

  return p_adjustment_id;
end;
$$;

create or replace function public.rollback_match_effects(
  p_match_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
  v_reversed_count integer := 0;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_match.season_id) then
    raise exception 'You do not have permission to rollback this match.'
      using errcode = '42501';
  end if;

  insert into public.score_ledger (
    season_id,
    player_id,
    match_id,
    entry_type,
    points_delta,
    reason,
    source_table,
    source_id,
    created_by,
    reversal_of_id,
    metadata
  )
  select
    sl.season_id,
    sl.player_id,
    sl.match_id,
    'rollback',
    sl.points_delta * -1,
    coalesce(
      nullif(p_reason, ''),
      format('Rollback for match #%s ledger entry %s.', v_match.match_no, sl.id)
    ),
    'public.score_ledger',
    sl.id,
    v_actor,
    sl.id,
    jsonb_build_object('rolled_back_match_id', p_match_id)
  from public.score_ledger sl
  where sl.match_id = p_match_id
    and sl.entry_type <> 'rollback'
    and sl.reversal_of_id is null
    and not exists (
      select 1
      from public.score_ledger child
      where child.reversal_of_id = sl.id
    );

  get diagnostics v_reversed_count = row_count;

  update public.matches
  set status = 'void',
      updated_at = timezone('utc', now())
  where id = p_match_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'status', 'void',
    'reversed_entries', v_reversed_count
  );
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.tg_set_updated_at();
create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.tg_set_updated_at();
create trigger season_memberships_set_updated_at
  before update on public.season_memberships
  for each row execute function public.tg_set_updated_at();
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.tg_set_updated_at();
create trigger match_players_set_updated_at
  before update on public.match_players
  for each row execute function public.tg_set_updated_at();
create trigger manual_score_adjustments_set_updated_at
  before update on public.manual_score_adjustments
  for each row execute function public.tg_set_updated_at();
create trigger item_catalog_set_updated_at
  before update on public.item_catalog
  for each row execute function public.tg_set_updated_at();
create trigger item_instances_set_updated_at
  before update on private.item_instances
  for each row execute function public.tg_set_updated_at();
create trigger item_usages_set_updated_at
  before update on private.item_usages
  for each row execute function public.tg_set_updated_at();

create trigger audit_seasons
  after insert or update or delete on public.seasons
  for each row execute function private.audit_row_change();
create trigger audit_players
  after insert or update or delete on public.players
  for each row execute function private.audit_row_change();
create trigger audit_season_memberships
  after insert or update or delete on public.season_memberships
  for each row execute function private.audit_row_change();
create trigger audit_matches
  after insert or update or delete on public.matches
  for each row execute function private.audit_row_change();
create trigger audit_score_ledger
  after insert or update or delete on public.score_ledger
  for each row execute function private.audit_row_change();
create trigger audit_manual_score_adjustments
  after insert or update or delete on public.manual_score_adjustments
  for each row execute function private.audit_row_change();
create trigger audit_user_global_roles
  after insert or update or delete on private.user_global_roles
  for each row execute function private.audit_row_change();
create trigger audit_season_staff
  after insert or update or delete on private.season_staff
  for each row execute function private.audit_row_change();
create trigger audit_item_instances
  after insert or update or delete on private.item_instances
  for each row execute function private.audit_row_change();
create trigger audit_item_usages
  after insert or update or delete on private.item_usages
  for each row execute function private.audit_row_change();

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.season_memberships enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.score_ledger enable row level security;
alter table public.manual_score_adjustments enable row level security;
alter table public.item_catalog enable row level security;

alter table private.user_global_roles enable row level security;
alter table private.season_staff enable row level security;
alter table private.item_instances enable row level security;
alter table private.item_usages enable row level security;
alter table private.audit_logs enable row level security;

create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

create policy players_select_authenticated
  on public.players
  for select
  to authenticated
  using (is_active);

create policy players_select_anon_active
  on public.players
  for select
  to anon
  using (is_active);

create policy profiles_select_anon_active
  on public.profiles
  for select
  to anon
  using (is_active);

create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy seasons_select_authenticated
  on public.seasons
  for select
  to authenticated
  using (is_public or public.can_manage_season(id));

create policy seasons_select_anon_public
  on public.seasons
  for select
  to anon
  using (is_public);

create policy seasons_write_admin
  on public.seasons
  for all
  to authenticated
  using (private.has_any_global_role(array['super_admin', 'score_admin']))
  with check (private.has_any_global_role(array['super_admin', 'score_admin']));

create policy season_memberships_select_authenticated
  on public.season_memberships
  for select
  to authenticated
  using (true);

create policy season_memberships_select_anon_public
  on public.season_memberships
  for select
  to anon
  using (join_status in ('inactive', 'active', 'captain'));

create policy season_memberships_write_staff
  on public.season_memberships
  for all
  to authenticated
  using (public.can_manage_season(season_id))
  with check (public.can_manage_season(season_id));

create policy matches_select_visible
  on public.matches
  for select
  to authenticated
  using (status <> 'draft' or public.can_manage_season(season_id));

create policy matches_select_visible_anon
  on public.matches
  for select
  to anon
  using (
    status <> 'draft'
    and exists (
      select 1
      from public.seasons s
      where s.id = matches.season_id
        and s.is_public
    )
  );

create policy match_players_select_visible
  on public.match_players
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches m
      where m.id = match_players.match_id
        and (m.status <> 'draft' or public.can_manage_season(m.season_id))
    )
  );

create policy match_players_select_visible_anon
  on public.match_players
  for select
  to anon
  using (
    exists (
      select 1
      from public.matches m
      join public.seasons s
        on s.id = m.season_id
      where m.id = match_players.match_id
        and m.status <> 'draft'
        and s.is_public
    )
  );

create policy score_ledger_select_authenticated
  on public.score_ledger
  for select
  to authenticated
  using (true);

create policy score_ledger_select_anon_public
  on public.score_ledger
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = score_ledger.season_id
        and s.is_public
    )
  );

create policy manual_score_adjustments_select_authenticated
  on public.manual_score_adjustments
  for select
  to authenticated
  using (true);

create policy manual_score_adjustments_select_anon_public
  on public.manual_score_adjustments
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = manual_score_adjustments.season_id
        and s.is_public
    )
  );

create policy item_catalog_select_authenticated
  on public.item_catalog
  for select
  to authenticated
  using (true);

create policy item_catalog_select_anon
  on public.item_catalog
  for select
  to anon
  using (is_active);

create or replace view public.v_leaderboard
with (security_invoker = true)
as
with eligible_members as (
  select
    sm.season_id,
    sm.player_id
  from public.season_memberships sm
  where sm.join_status in ('active', 'captain')
),
match_stats as (
  select
    mp.season_id,
    mp.player_id,
    count(*) filter (where m.status = 'approved') as matches_played,
    count(*) filter (where m.status = 'approved' and mp.result = 'win') as wins,
    count(*) filter (where m.status = 'approved' and mp.result = 'loss') as losses
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  group by mp.season_id, mp.player_id
),
ledger_totals as (
  select
    sl.season_id,
    sl.player_id,
    sum(sl.points_delta) as score_total
  from public.score_ledger sl
  group by sl.season_id, sl.player_id
)
select
  em.season_id,
  em.player_id,
  p.display_name,
  coalesce(ms.matches_played, 0) as matches_played,
  coalesce(ms.wins, 0) as wins,
  coalesce(ms.losses, 0) as losses,
  case
    when coalesce(ms.matches_played, 0) = 0 then 0::numeric(5, 2)
    else round((coalesce(ms.wins, 0)::numeric / ms.matches_played::numeric) * 100, 2)
  end as win_rate,
  coalesce(lt.score_total, 0)::numeric(10, 2) as score_total,
  dense_rank() over (
    partition by em.season_id
    order by coalesce(lt.score_total, 0) desc,
             coalesce(ms.wins, 0) desc,
             coalesce(ms.matches_played, 0) desc,
             p.display_name asc
  ) as rank
from eligible_members em
join public.players p
  on p.id = em.player_id
left join match_stats ms
  on ms.season_id = em.season_id
 and ms.player_id = em.player_id
left join ledger_totals lt
  on lt.season_id = em.season_id
 and lt.player_id = em.player_id;
comment on view public.v_leaderboard is 'Season leaderboard aggregated from score_ledger and approved matches.';

create or replace view public.v_match_detail
with (security_invoker = true)
as
select
  m.id as match_id,
  m.season_id,
  s.code as season_code,
  s.name as season_name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name as created_by_name,
  submitter.display_name as submitted_by_name,
  approver.display_name as approved_by_name,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', mp.player_id,
        'display_name', p.display_name,
        'side', mp.side,
        'slot_no', mp.slot_no,
        'is_captain', mp.is_captain,
        'result', mp.result
      )
      order by case when mp.side = 'radiant' then 0 else 1 end, mp.slot_no
    ) filter (where mp.id is not null),
    '[]'::jsonb
  ) as players
from public.matches m
join public.seasons s
  on s.id = m.season_id
left join public.profiles creator
  on creator.id = m.created_by
left join public.profiles submitter
  on submitter.id = m.submitted_by
left join public.profiles approver
  on approver.id = m.approved_by
left join public.match_players mp
  on mp.match_id = m.id
left join public.players p
  on p.id = mp.player_id
group by
  m.id,
  m.season_id,
  s.code,
  s.name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name,
  submitter.display_name,
  approver.display_name;
comment on view public.v_match_detail is 'Front-end match detail projection with roster JSON.';

create or replace view public.v_my_admin_scope
as
select
  'global'::text as scope_type,
  null::uuid as season_id,
  null::text as season_code,
  ugr.role as role
from private.user_global_roles ugr
where ugr.user_id = auth.uid()
union all
select
  'season'::text as scope_type,
  ss.season_id,
  s.code as season_code,
  ss.role as role
from private.season_staff ss
join public.seasons s
  on s.id = ss.season_id
where ss.user_id = auth.uid();
comment on view public.v_my_admin_scope is 'Current user role scope projection for the front-end.';

revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.players to anon, authenticated;
grant select on public.seasons to anon, authenticated;
grant insert, update, delete on public.seasons to authenticated;
grant select on public.season_memberships to anon, authenticated;
grant insert, update, delete on public.season_memberships to authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.match_players to anon, authenticated;
grant select on public.score_ledger to anon, authenticated;
grant select on public.manual_score_adjustments to anon, authenticated;
grant select on public.item_catalog to anon, authenticated;
grant select on public.v_leaderboard to anon, authenticated;
grant select on public.v_match_detail to anon, authenticated;
grant select on public.v_my_admin_scope to authenticated;

revoke all on function public.ensure_my_profile() from public;
revoke all on function public.can_manage_season(uuid) from public;
revoke all on function public.can_submit_matches(uuid) from public;
revoke all on function public.can_review_matches(uuid) from public;
revoke all on function public.can_apply_items(uuid) from public;
revoke all on function public.can_adjust_scores(uuid) from public;
revoke all on function public.submit_match(uuid, jsonb, text, date, text, jsonb) from public;
revoke all on function public.approve_match(uuid, boolean, text) from public;
revoke all on function public.apply_item_effect(uuid, uuid, uuid, numeric, text, text, jsonb) from public;
revoke all on function public.manual_adjust_score(uuid, uuid, numeric, text) from public;
revoke all on function public.revoke_manual_score_adjustment(uuid, text) from public;
revoke all on function public.rollback_match_effects(uuid, text) from public;

grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.can_manage_season(uuid) to authenticated;
grant execute on function public.can_submit_matches(uuid) to authenticated;
grant execute on function public.can_review_matches(uuid) to authenticated;
grant execute on function public.can_apply_items(uuid) to authenticated;
grant execute on function public.can_adjust_scores(uuid) to authenticated;
grant execute on function public.submit_match(uuid, jsonb, text, date, text, jsonb) to authenticated;
grant execute on function public.approve_match(uuid, boolean, text) to authenticated;
grant execute on function public.apply_item_effect(uuid, uuid, uuid, numeric, text, text, jsonb) to authenticated;
grant execute on function public.manual_adjust_score(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.revoke_manual_score_adjustment(uuid, text) to authenticated;
grant execute on function public.rollback_match_effects(uuid, text) to authenticated;

insert into public.seasons (
  code,
  name,
  status,
  is_public,
  start_at,
  end_at,
  rule_version,
  rule_config
)
select
  to_char(timezone('Asia/Shanghai', now()), 'YYYY-MM'),
  format(
    '%s 年 %s 月赛季',
    to_char(timezone('Asia/Shanghai', now()), 'YYYY'),
    to_char(timezone('Asia/Shanghai', now()), 'FMMM')
  ),
  'draft',
  true,
  date_trunc('month', timezone('Asia/Shanghai', now()))::timestamptz,
  (date_trunc('month', timezone('Asia/Shanghai', now())) + interval '1 month' - interval '1 second')::timestamptz,
  to_char(timezone('Asia/Shanghai', now()), 'YYYY.MM'),
  jsonb_build_object(
    'win_points', 3,
    'loss_points', 0,
    'participation_points', 0
  )
where not exists (
  select 1
  from public.seasons s
  where s.code = to_char(timezone('Asia/Shanghai', now()), 'YYYY-MM')
);

commit;
