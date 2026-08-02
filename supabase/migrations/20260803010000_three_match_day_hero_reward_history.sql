begin;

create table public.daily_bonus_hero_match_days (
  business_date date primary key,
  enabled boolean not null,
  seed bigint not null check (seed between 0 and 4294967295),
  hero_names text[] not null,
  reward_points numeric[] not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (cardinality(hero_names) between 1 and 1000),
  check (cardinality(hero_names) = cardinality(reward_points))
);

comment on table public.daily_bonus_hero_match_days is
  'Temporary daily bonus hero snapshots retained for the latest three distinct dates that contain recorded league matches.';

create trigger daily_bonus_hero_match_days_set_updated_at
  before update on public.daily_bonus_hero_match_days
  for each row execute function public.tg_set_updated_at();
create trigger audit_daily_bonus_hero_match_days
  after insert or update or delete on public.daily_bonus_hero_match_days
  for each row execute function private.audit_row_change();

alter table public.daily_bonus_hero_match_days enable row level security;

create or replace function private.is_retained_bonus_match_date(p_match_date date)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from (
      select distinct m.match_date
      from public.matches m
      where m.match_date is not null
        and m.status in ('submitted', 'approved')
      order by m.match_date desc
      limit 3
    ) retained
    where retained.match_date = p_match_date
  );
$$;

create or replace function private.prune_daily_bonus_hero_match_days()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_business_date date := private.daily_bonus_business_date();
begin
  delete from public.daily_bonus_hero_match_days snapshot
  where snapshot.business_date <> v_business_date
    and not private.is_retained_bonus_match_date(snapshot.business_date);
end;
$$;

create or replace function public.get_daily_bonus_hero_match_day(p_match_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_snapshot public.daily_bonus_hero_match_days%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_seed bigint;
  v_points numeric[];
begin
  perform private.prune_daily_bonus_hero_match_days();

  if p_match_date is null then
    return null;
  end if;
  if p_match_date <> v_business_date
    and not private.is_retained_bonus_match_date(p_match_date) then
    return null;
  end if;

  select snapshot.*
  into v_snapshot
  from public.daily_bonus_hero_match_days snapshot
  where snapshot.business_date = p_match_date;

  if found then
    return jsonb_build_object(
      'enabled', v_snapshot.enabled,
      'heroCount', cardinality(v_snapshot.hero_names),
      'heroNames', to_jsonb(v_snapshot.hero_names),
      'rewardPoints', to_jsonb(v_snapshot.reward_points),
      'rewardPointsDate', v_snapshot.business_date,
      'businessDate', v_snapshot.business_date,
      'currentBusinessDate', v_business_date,
      'seed', v_snapshot.seed,
      'retained', true,
      'provisional', false,
      'updatedAt', v_snapshot.updated_at
    );
  end if;

  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton;

  v_seed := case
    when v_settings.override_date = p_match_date
      then v_settings.override_seed
    else private.daily_bonus_seed_for_date(v_settings.base_seed, p_match_date)
  end;
  v_points := case
    when v_settings.reward_points_date = p_match_date
      then v_settings.reward_points
    else array_fill(null::numeric, array[v_settings.hero_count])
  end;

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'heroCount', v_settings.hero_count,
    'heroNames', '[]'::jsonb,
    'rewardPoints', to_jsonb(v_points),
    'rewardPointsDate', case when v_settings.reward_points_date = p_match_date then p_match_date else null end,
    'businessDate', p_match_date,
    'currentBusinessDate', v_business_date,
    'seed', v_seed,
    'retained', true,
    'provisional', true,
    'updatedAt', v_settings.updated_at
  );
end;
$$;

create or replace function public.sync_daily_bonus_hero_match_day(
  p_match_date date,
  p_seed bigint,
  p_hero_names text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_existing public.daily_bonus_hero_match_days%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_expected_seed bigint;
  v_points numeric[];
  v_name text;
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may synchronize daily hero snapshots.'
      using errcode = '42501';
  end if;

  perform private.prune_daily_bonus_hero_match_days();

  if p_match_date is null or (
    p_match_date <> v_business_date
    and not private.is_retained_bonus_match_date(p_match_date)
  ) then
    raise exception 'The selected date is outside the latest three match days.'
      using errcode = '22023';
  end if;
  if p_seed is null or p_seed < 0 or p_seed > 4294967295 then
    raise exception 'Daily hero seed is invalid.'
      using errcode = '22023';
  end if;
  if cardinality(p_hero_names) < 1 or cardinality(p_hero_names) > 1000 then
    raise exception 'Daily hero list is invalid.'
      using errcode = '22023';
  end if;
  if (
    select count(distinct hero_name)
    from unnest(p_hero_names) as names(hero_name)
  ) <> cardinality(p_hero_names) then
    raise exception 'Daily hero names must be unique.'
      using errcode = '22023';
  end if;
  foreach v_name in array p_hero_names
  loop
    if v_name is null or char_length(trim(v_name)) < 1 or char_length(trim(v_name)) > 100 or v_name <> trim(v_name) then
      raise exception 'Daily hero name is invalid.'
        using errcode = '22023';
    end if;
  end loop;

  select snapshot.*
  into v_existing
  from public.daily_bonus_hero_match_days snapshot
  where snapshot.business_date = p_match_date
  for update;

  if found then
    return public.get_daily_bonus_hero_match_day(p_match_date);
  end if;

  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton
  for share;

  v_expected_seed := case
    when v_settings.override_date = p_match_date
      then v_settings.override_seed
    else private.daily_bonus_seed_for_date(v_settings.base_seed, p_match_date)
  end;
  if p_seed <> v_expected_seed then
    raise exception 'Daily hero seed does not match the server configuration.'
      using errcode = '22023';
  end if;
  if p_match_date = v_business_date and cardinality(p_hero_names) <> v_settings.hero_count then
    raise exception 'Daily hero list size does not match the current configuration.'
      using errcode = '22023';
  end if;

  v_points := case
    when v_settings.reward_points_date = p_match_date
      and cardinality(v_settings.reward_points) = cardinality(p_hero_names)
      then v_settings.reward_points
    else array_fill(null::numeric, array[cardinality(p_hero_names)])
  end;

  insert into public.daily_bonus_hero_match_days (
    business_date,
    enabled,
    seed,
    hero_names,
    reward_points,
    updated_by
  )
  values (
    p_match_date,
    v_settings.enabled,
    p_seed,
    p_hero_names,
    v_points,
    v_actor
  );

  return public.get_daily_bonus_hero_match_day(p_match_date);
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
  v_business_date date := private.daily_bonus_business_date();
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
      when v_existing_count = p_hero_count then reward_points
      else array_fill(null::numeric, array[p_hero_count])
    end,
    reward_points_date = case
      when v_existing_count = p_hero_count then reward_points_date
      else null
    end,
    updated_by = v_actor
  where singleton;

  if v_existing_count = p_hero_count then
    update public.daily_bonus_hero_match_days
    set enabled = coalesce(p_enabled, false), updated_by = v_actor
    where business_date = v_business_date;
  else
    delete from public.daily_bonus_hero_match_days
    where business_date = v_business_date;
    update public.hero_reward_adjustments
    set
      points_delta = 0,
      metadata = metadata || jsonb_build_object(
        'reward_recalculated_at', timezone('utc', now()),
        'reward_recalculated_by', v_actor,
        'reward_recalculation_reason', 'daily_hero_count_changed'
      )
    where reward_date = v_business_date
      and revoked_at is null
      and points_delta is distinct from 0;
  end if;

  perform private.prune_daily_bonus_hero_match_days();
  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.set_daily_bonus_hero_reward_point(
  p_hero_index integer,
  p_points numeric,
  p_hero_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_snapshot public.daily_bonus_hero_match_days%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_points numeric[];
  v_hero_name text := trim(coalesce(p_hero_name, ''));
  v_points_delta numeric;
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
  select snapshot.*
  into v_snapshot
  from public.daily_bonus_hero_match_days snapshot
  where snapshot.business_date = v_business_date
  for update;

  if not found then
    raise exception 'Synchronize the current daily hero snapshot before setting points.'
      using errcode = '22023';
  end if;
  if p_hero_index is null or p_hero_index < 1 or p_hero_index > cardinality(v_snapshot.hero_names) then
    raise exception 'Hero index is outside the current daily selection.'
      using errcode = '22023';
  end if;
  if v_snapshot.hero_names[p_hero_index] <> v_hero_name then
    raise exception 'Hero name does not match the retained daily selection.'
      using errcode = '22023';
  end if;
  if p_points is null or p_points < 0 or p_points > 10000 then
    raise exception 'Hero reward points must be between 0 and 10000.'
      using errcode = '22023';
  end if;

  v_points := case
    when v_settings.reward_points_date = v_business_date then v_settings.reward_points
    else array_fill(null::numeric, array[v_settings.hero_count])
  end;
  v_points_delta := case when p_points = 0 then 0 else round(p_points, 2) end;
  v_points[p_hero_index] := case when v_points_delta = 0 then null else v_points_delta end;

  update public.daily_bonus_hero_settings
  set reward_points = v_points, reward_points_date = v_business_date, updated_by = v_actor
  where singleton;
  update public.daily_bonus_hero_match_days
  set reward_points = v_points, enabled = v_settings.enabled, updated_by = v_actor
  where business_date = v_business_date;

  update public.hero_reward_adjustments
  set
    points_delta = v_points_delta,
    metadata = metadata || jsonb_build_object(
      'reward_recalculated_at', timezone('utc', now()),
      'reward_recalculated_by', v_actor
    )
  where reward_date = v_business_date
    and hero_name = v_hero_name
    and revoked_at is null
    and points_delta is distinct from v_points_delta;

  perform private.prune_daily_bonus_hero_match_days();
  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.reroll_daily_bonus_heroes(p_seed bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_business_date date := private.daily_bonus_business_date();
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
    override_date = v_business_date,
    override_seed = v_seed,
    reward_points = array_fill(null::numeric, array[hero_count]),
    reward_points_date = null,
    updated_by = v_actor
  where singleton;
  delete from public.daily_bonus_hero_match_days where business_date = v_business_date;
  update public.hero_reward_adjustments
  set
    points_delta = 0,
    metadata = metadata || jsonb_build_object(
      'reward_recalculated_at', timezone('utc', now()),
      'reward_recalculated_by', v_actor,
      'reward_recalculation_reason', 'daily_heroes_rerolled'
    )
  where reward_date = v_business_date
    and revoked_at is null
    and points_delta is distinct from 0;

  perform private.prune_daily_bonus_hero_match_days();
  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.apply_hero_reward_score(
  p_season_id uuid,
  p_player_id uuid,
  p_match_id uuid,
  p_hero_index integer,
  p_hero_name text
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
  v_snapshot public.daily_bonus_hero_match_days%rowtype;
  v_hero_name text := trim(coalesce(p_hero_name, ''));
  v_points_delta numeric := 0;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to adjust scores for this season.'
      using errcode = '42501';
  end if;

  select m.*
  into v_match
  from public.matches m
  where m.id = p_match_id and m.season_id = p_season_id
  for share;

  if not found then
    raise exception 'Match does not belong to the selected season.'
      using errcode = '22023';
  end if;
  if not private.is_retained_bonus_match_date(v_match.match_date) then
    raise exception 'Hero rewards may only be selected for the latest three match days.'
      using errcode = '22023';
  end if;
  if v_match.status not in ('submitted', 'approved') then
    raise exception 'Hero rewards require a recorded match.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.match_players mp
    where mp.match_id = p_match_id
      and mp.season_id = p_season_id
      and mp.player_id = p_player_id
  ) then
    raise exception 'Player is not part of this match.'
      using errcode = '22023';
  end if;

  select snapshot.*
  into v_snapshot
  from public.daily_bonus_hero_match_days snapshot
  where snapshot.business_date = v_match.match_date
  for share;

  if not found then
    raise exception 'Daily hero snapshot is not available for this match day.'
      using errcode = '22023';
  end if;
  if not v_snapshot.enabled then
    raise exception 'Daily hero rewards were not enabled for this match day.'
      using errcode = '22023';
  end if;
  if p_hero_index is null or p_hero_index < 1 or p_hero_index > cardinality(v_snapshot.hero_names) then
    raise exception 'Hero index is outside the retained daily selection.'
      using errcode = '22023';
  end if;
  if v_snapshot.hero_names[p_hero_index] <> v_hero_name then
    raise exception 'Hero name does not match the retained daily selection.'
      using errcode = '22023';
  end if;

  v_points_delta := coalesce(v_snapshot.reward_points[p_hero_index], 0);
  insert into public.hero_reward_adjustments (
    season_id, match_id, player_id, hero_name, reward_date,
    points_delta, created_by, metadata
  )
  values (
    p_season_id, v_match.id, p_player_id, v_hero_name, v_match.match_date,
    round(v_points_delta, 2), v_actor,
    jsonb_build_object(
      'adjusted_by', v_actor,
      'anchor_match_date', v_match.match_date,
      'anchor_match_id', v_match.id,
      'anchor_match_no', v_match.match_no
    )
  )
  returning id into v_entry_id;

  perform private.prune_daily_bonus_hero_match_days();
  return v_entry_id;
exception
  when unique_violation then
    raise exception 'This hero has already been selected for the match.'
      using errcode = '23505';
end;
$$;

comment on function public.get_daily_bonus_hero_match_day(date) is
  'Returns a stable hero-name and score snapshot for the current business date or one of the latest three actual match dates.';
comment on function public.sync_daily_bonus_hero_match_day(date, bigint, text[]) is
  'Persists the generated hero names for an eligible match date while preserving an existing immutable snapshot.';
comment on function public.apply_hero_reward_score(uuid, uuid, uuid, integer, text) is
  'Records hero rewards for any of the latest three actual match days using the retained date-specific snapshot.';

revoke all on function private.is_retained_bonus_match_date(date) from public;
revoke all on function private.prune_daily_bonus_hero_match_days() from public;
revoke all on function public.get_daily_bonus_hero_match_day(date) from public;
revoke all on function public.sync_daily_bonus_hero_match_day(date, bigint, text[]) from public;

grant execute on function public.get_daily_bonus_hero_match_day(date) to anon, authenticated;
grant execute on function public.sync_daily_bonus_hero_match_day(date, bigint, text[]) to authenticated;

commit;
