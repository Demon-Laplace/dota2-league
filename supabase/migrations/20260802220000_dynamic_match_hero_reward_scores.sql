begin;

alter table public.hero_reward_adjustments
  add column if not exists hero_name text,
  add column if not exists reward_date date;

alter table public.hero_reward_adjustments
  drop constraint if exists hero_reward_adjustments_points_delta_check;

alter table public.hero_reward_adjustments
  add constraint hero_reward_adjustments_points_delta_check
    check (points_delta >= 0),
  add constraint hero_reward_adjustments_hero_name_check
    check (
      hero_name is null
      or (
        char_length(trim(hero_name)) between 1 and 100
        and hero_name = trim(hero_name)
      )
    );

create unique index hero_reward_adjustments_match_hero_active_uidx
  on public.hero_reward_adjustments (match_id, hero_name)
  where revoked_at is null and hero_name is not null;

comment on table public.hero_reward_adjustments is
  'Auditable match-scoped hero selections whose score follows that hero current reward value for the selected business date.';
comment on column public.hero_reward_adjustments.hero_name is
  'Stable hero key selected for the match. Null is retained only for legacy adjustments created before hero identity was persisted.';
comment on column public.hero_reward_adjustments.reward_date is
  'Beijing 02:00 business date whose daily hero reward configuration controls this selection score.';

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

  if v_existing_count <> p_hero_count then
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

  if p_hero_index is null or p_hero_index < 1 or p_hero_index > v_settings.hero_count then
    raise exception 'Hero index is outside the current daily selection.'
      using errcode = '22023';
  end if;
  if char_length(v_hero_name) < 1 or char_length(v_hero_name) > 100 then
    raise exception 'Hero name is invalid.'
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
  v_points_delta := case when p_points = 0 then 0 else round(p_points, 2) end;
  v_points[p_hero_index] := case when v_points_delta = 0 then null else v_points_delta end;

  update public.daily_bonus_hero_settings
  set
    reward_points = v_points,
    reward_points_date = v_business_date,
    updated_by = v_actor
  where singleton;

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
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_business_date date := private.daily_bonus_business_date();
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
  where m.id = p_match_id
    and m.season_id = p_season_id
  for share;

  if not found then
    raise exception 'Match does not belong to the selected season.'
      using errcode = '22023';
  end if;
  if v_match.match_date <> v_business_date then
    raise exception 'Hero rewards may only be selected for the current Beijing match day.'
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

  if not v_settings.enabled then
    raise exception 'Daily hero rewards are not enabled.'
      using errcode = '22023';
  end if;
  if p_hero_index is null or p_hero_index < 1 or p_hero_index > v_settings.hero_count then
    raise exception 'Hero index is outside the current daily selection.'
      using errcode = '22023';
  end if;
  if char_length(v_hero_name) < 1 or char_length(v_hero_name) > 100 then
    raise exception 'Hero name is invalid.'
      using errcode = '22023';
  end if;

  if v_settings.reward_points_date = v_business_date then
    v_points_delta := coalesce(v_settings.reward_points[p_hero_index], 0);
  end if;
  if v_points_delta < 0 or v_points_delta > 10000 then
    raise exception 'The selected hero has an invalid reward value.'
      using errcode = '22023';
  end if;

  insert into public.hero_reward_adjustments (
    season_id,
    match_id,
    player_id,
    hero_name,
    reward_date,
    points_delta,
    created_by,
    metadata
  )
  values (
    p_season_id,
    v_match.id,
    p_player_id,
    v_hero_name,
    v_business_date,
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
exception
  when unique_violation then
    raise exception 'This hero has already been selected for the match.'
      using errcode = '23505';
end;
$$;

comment on function public.set_daily_bonus_hero_reward_point(integer, numeric, text) is
  'Sets one current business-day hero reward and recalculates every active selection for that hero and business date.';
comment on function public.apply_hero_reward_score(uuid, uuid, uuid, integer, text) is
  'Records a unique match-scoped hero selection. Unset rewards are stored as zero and follow later changes to that hero current business-day value.';
comment on function public.set_daily_bonus_hero_settings(boolean, integer) is
  'Updates the persistent feature toggle and hero count; count changes clear current values and recalculate current-day selections to zero.';
comment on function public.reroll_daily_bonus_heroes(bigint) is
  'Replaces the current business-day hero seed, clears point values, and recalculates current-day selections to zero.';

revoke all on function public.set_daily_bonus_hero_reward_point(integer, numeric, text) from public;
revoke all on function public.apply_hero_reward_score(uuid, uuid, uuid, integer, text) from public;

grant execute on function public.set_daily_bonus_hero_reward_point(integer, numeric, text) to authenticated;
grant execute on function public.apply_hero_reward_score(uuid, uuid, uuid, integer, text) to authenticated;

commit;
