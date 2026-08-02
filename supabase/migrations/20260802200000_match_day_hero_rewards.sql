begin;

alter table public.daily_bonus_hero_settings
  add column if not exists reward_points_date date;

update public.daily_bonus_hero_settings
set
  reward_points = array_fill(null::numeric, array[hero_count]),
  reward_points_date = null
where singleton;

create table public.hero_reward_adjustments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  points_delta numeric(10, 2) not null check (points_delta > 0),
  created_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.hero_reward_adjustments is
  'Auditable match-scoped hero reward score adjustments. The selected hero identity is intentionally not stored.';

create index hero_reward_adjustments_season_player_idx
  on public.hero_reward_adjustments (season_id, player_id);
create index hero_reward_adjustments_match_player_active_idx
  on public.hero_reward_adjustments (match_id, player_id, revoked_at, created_at desc);

create trigger hero_reward_adjustments_set_updated_at
  before update on public.hero_reward_adjustments
  for each row execute function public.tg_set_updated_at();
create trigger audit_hero_reward_adjustments
  after insert or update or delete on public.hero_reward_adjustments
  for each row execute function private.audit_row_change();

alter table public.hero_reward_adjustments enable row level security;

create policy hero_reward_adjustments_select_authenticated
  on public.hero_reward_adjustments
  for select
  to authenticated
  using (true);

create policy hero_reward_adjustments_select_anon_public
  on public.hero_reward_adjustments
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = hero_reward_adjustments.season_id
        and s.is_public
    )
  );

grant select on public.hero_reward_adjustments to anon, authenticated;

create or replace function public.get_daily_bonus_hero_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_seed bigint;
  v_reward_points numeric[];
begin
  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton;

  v_seed := case
    when v_settings.override_date = v_business_date
      then v_settings.override_seed
    else private.daily_bonus_seed_for_date(v_settings.base_seed, v_business_date)
  end;
  v_reward_points := case
    when v_settings.reward_points_date = v_business_date
      then v_settings.reward_points
    else array_fill(null::numeric, array[v_settings.hero_count])
  end;

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'heroCount', v_settings.hero_count,
    'rewardPoints', to_jsonb(v_reward_points),
    'rewardPointsDate', v_settings.reward_points_date,
    'businessDate', v_business_date,
    'seed', v_seed,
    'updatedAt', v_settings.updated_at
  );
end;
$$;

create or replace function public.set_daily_bonus_hero_settings(
  p_enabled boolean,
  p_hero_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_existing_count integer;
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may update daily bonus heroes.'
      using errcode = '42501';
  end if;

  if p_hero_count is null or p_hero_count < 1 or p_hero_count > 1000 then
    raise exception 'Hero count must be between 1 and 1000.'
      using errcode = '22023';
  end if;

  select hero_count
  into strict v_existing_count
  from public.daily_bonus_hero_settings
  where singleton
  for update;

  update public.daily_bonus_hero_settings
  set
    enabled = coalesce(p_enabled, false),
    hero_count = p_hero_count,
    reward_points = case
      when v_existing_count = p_hero_count
        then reward_points
      else array_fill(null::numeric, array[p_hero_count])
    end,
    reward_points_date = case
      when v_existing_count = p_hero_count
        then reward_points_date
      else null
    end,
    updated_by = v_actor
  where singleton;

  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.set_daily_bonus_hero_settings(
  p_enabled boolean,
  p_hero_count integer,
  p_reward_points numeric[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- Compatibility for cached clients: positional fixed rewards are intentionally ignored.
  return public.set_daily_bonus_hero_settings(p_enabled, p_hero_count);
end;
$$;

create or replace function public.set_daily_bonus_hero_reward_point(
  p_hero_index integer,
  p_points numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_points numeric[];
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may set daily hero reward points.'
      using errcode = '42501';
  end if;

  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton
  for update;

  if p_hero_index is null or p_hero_index < 1 or p_hero_index > v_settings.hero_count then
    raise exception 'Hero index is outside the current daily selection.'
      using errcode = '22023';
  end if;
  if p_points is null or p_points < 0 or p_points > 10000 then
    raise exception 'Hero reward points must be between 0 and 10000.'
      using errcode = '22023';
  end if;

  v_points := case
    when v_settings.reward_points_date = v_business_date
      then v_settings.reward_points
    else array_fill(null::numeric, array[v_settings.hero_count])
  end;
  v_points[p_hero_index] := case when p_points = 0 then null else round(p_points, 2) end;

  update public.daily_bonus_hero_settings
  set
    reward_points = v_points,
    reward_points_date = v_business_date,
    updated_by = v_actor
  where singleton;

  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.reroll_daily_bonus_heroes(
  p_seed bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_seed bigint := coalesce(p_seed, floor(random() * 4294967296)::bigint);
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may reroll daily bonus heroes.'
      using errcode = '42501';
  end if;

  if v_seed < 0 or v_seed > 4294967295 then
    raise exception 'Random seed must be between 0 and 4294967295.'
      using errcode = '22023';
  end if;

  update public.daily_bonus_hero_settings
  set
    override_date = private.daily_bonus_business_date(),
    override_seed = v_seed,
    reward_points = array_fill(null::numeric, array[hero_count]),
    reward_points_date = null,
    updated_by = v_actor
  where singleton;

  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.apply_hero_reward_score(
  p_season_id uuid,
  p_player_id uuid,
  p_match_id uuid,
  p_hero_index integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry_id uuid;
  v_match public.matches%rowtype;
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_points_delta numeric;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to adjust scores for this season.'
      using errcode = '42501';
  end if;

  select m.*
  into v_match
  from public.matches m
  where m.id = p_match_id
    and m.season_id = p_season_id
  for share;

  if not found then
    raise exception 'Match does not belong to the selected season.'
      using errcode = '22023';
  end if;
  if v_match.match_date <> v_business_date then
    raise exception 'Hero rewards may only be applied to the current Beijing match day.'
      using errcode = '22023';
  end if;
  if v_match.status not in ('submitted', 'approved') then
    raise exception 'Hero rewards require a recorded match.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.match_players mp
    where mp.match_id = p_match_id
      and mp.season_id = p_season_id
      and mp.player_id = p_player_id
  ) then
    raise exception 'Player is not part of this match.'
      using errcode = '22023';
  end if;

  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton;

  if not v_settings.enabled or v_settings.reward_points_date is distinct from v_business_date then
    raise exception 'Daily hero rewards are not configured for the current match day.'
      using errcode = '22023';
  end if;
  if p_hero_index is null or p_hero_index < 1 or p_hero_index > v_settings.hero_count then
    raise exception 'Hero index is outside the current daily selection.'
      using errcode = '22023';
  end if;
  v_points_delta := v_settings.reward_points[p_hero_index];
  if v_points_delta is null or v_points_delta <= 0 or v_points_delta > 10000 then
    raise exception 'The selected hero does not have a valid reward value.'
      using errcode = '22023';
  end if;

  insert into public.hero_reward_adjustments (
    season_id,
    match_id,
    player_id,
    points_delta,
    created_by,
    metadata
  )
  values (
    p_season_id,
    v_match.id,
    p_player_id,
    round(v_points_delta, 2),
    v_actor,
    jsonb_build_object(
      'adjusted_by', v_actor,
      'anchor_match_date', v_match.match_date,
      'anchor_match_id', v_match.id,
      'anchor_match_no', v_match.match_no
    )
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

create or replace function public.revoke_hero_reward_score(
  p_adjustment_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry public.hero_reward_adjustments%rowtype;
begin
  select adjustment.*
  into v_entry
  from public.hero_reward_adjustments adjustment
  where adjustment.id = p_adjustment_id
  for update;

  if not found then
    raise exception 'Hero reward adjustment not found.'
      using errcode = 'P0002';
  end if;
  if not public.can_adjust_scores(v_entry.season_id) then
    raise exception 'You do not have permission to revoke this hero reward.'
      using errcode = '42501';
  end if;
  if v_entry.revoked_at is not null then
    raise exception 'This hero reward has already been revoked.'
      using errcode = '22023';
  end if;

  update public.hero_reward_adjustments
  set
    revoked_at = timezone('utc', now()),
    revoked_by = v_actor,
    revoked_reason = nullif(trim(p_reason), '')
  where id = p_adjustment_id;

  return p_adjustment_id;
end;
$$;

comment on column public.daily_bonus_hero_settings.reward_points_date is
  'Business date for the current positional reward values. Stale values are not returned after the Beijing 02:00 boundary.';
comment on function public.set_daily_bonus_hero_settings(boolean, integer) is
  'Updates only the persistent daily hero feature toggle and count; changing the count clears the current match-day point values.';
comment on function public.set_daily_bonus_hero_reward_point(integer, numeric) is
  'Sets one current business-day hero reward value by its generated list position. Zero clears the value.';
comment on function public.apply_hero_reward_score(uuid, uuid, uuid, integer) is
  'Adds an auditable match-scoped hero reward without writing to manual score adjustments or storing the hero identity.';
comment on function public.revoke_hero_reward_score(uuid, text) is
  'Revokes a match-scoped hero reward adjustment.';

revoke all on function public.set_daily_bonus_hero_settings(boolean, integer) from public;
revoke all on function public.set_daily_bonus_hero_settings(boolean, integer, numeric[]) from public;
revoke all on function public.set_daily_bonus_hero_reward_point(integer, numeric) from public;
revoke all on function public.apply_hero_reward_score(uuid, uuid, uuid, integer) from public;
revoke all on function public.revoke_hero_reward_score(uuid, text) from public;

grant execute on function public.set_daily_bonus_hero_settings(boolean, integer) to authenticated;
grant execute on function public.set_daily_bonus_hero_settings(boolean, integer, numeric[]) to authenticated;
grant execute on function public.set_daily_bonus_hero_reward_point(integer, numeric) to authenticated;
grant execute on function public.apply_hero_reward_score(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.revoke_hero_reward_score(uuid, text) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hero_reward_adjustments'
  ) then
    alter publication supabase_realtime add table public.hero_reward_adjustments;
  end if;
end;
$$;

commit;
