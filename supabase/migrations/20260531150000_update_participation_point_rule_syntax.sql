comment on column public.season_participation_point_rules.points_per_extra_match
  is 'For open-ended rules, extra points added per match after matches_played; 0 means the open-ended range uses a fixed total score.';

create or replace function public.set_season_participation_point_rules(
  p_season_id uuid,
  p_rules jsonb
)
returns table (
  id uuid,
  season_id uuid,
  matches_played integer,
  participation_points numeric,
  points_per_extra_match numeric,
  is_open_ended boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rule_count integer;
  v_open_count integer;
  v_min_open_matches integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins may update participation point rules.'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season id is required.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.seasons s where s.id = p_season_id) then
    raise exception 'Season % does not exist.', p_season_id
      using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Participation point rules must be a JSON array.'
      using errcode = '22023';
  end if;

  create temporary table participation_point_rule_input (
    matches_played integer not null,
    participation_points numeric(10, 2) not null,
    points_per_extra_match numeric(10, 2),
    is_open_ended boolean not null default false,
    is_progressive boolean not null default false
  ) on commit drop;

  insert into participation_point_rule_input (
    matches_played,
    participation_points,
    points_per_extra_match,
    is_open_ended,
    is_progressive
  )
  select
    nullif(rule ->> 'matchesPlayed', '')::integer,
    nullif(rule ->> 'participationPoints', '')::numeric,
    nullif(rule ->> 'pointsPerExtraMatch', '')::numeric,
    coalesce(nullif(rule ->> 'isOpenEnded', '')::boolean, false),
    coalesce(nullif(rule ->> 'isProgressive', '')::boolean, false)
  from jsonb_array_elements(p_rules) as rule;

  select count(*), count(*) filter (where is_open_ended)
  into v_rule_count, v_open_count
  from participation_point_rule_input;

  if v_rule_count = 0 then
    raise exception 'At least one participation point rule is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where matches_played < 0
       or participation_points < 0
       or (points_per_extra_match is not null and points_per_extra_match < 0)
  ) then
    raise exception 'Participation point rules cannot contain negative values.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    group by matches_played
    having count(*) > 1
  ) then
    raise exception 'Each match count can only have one participation point rule.'
      using errcode = '23505';
  end if;

  if v_open_count > 1 then
    raise exception 'Only one open-ended participation point rule is allowed.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where is_progressive
      and not is_open_ended
  ) then
    raise exception 'Only open-ended participation point rules can be progressive.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where is_open_ended
      and points_per_extra_match is null
  ) then
    raise exception 'Open-ended participation point rules require points_per_extra_match.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where not is_open_ended
      and points_per_extra_match is not null
  ) then
    raise exception 'Fixed participation point rules cannot set points_per_extra_match.'
      using errcode = '22023';
  end if;

  select min(matches_played)
  into v_min_open_matches
  from participation_point_rule_input
  where is_open_ended;

  if v_min_open_matches is not null
     and exists (
       select 1
       from participation_point_rule_input
       where not is_open_ended
         and matches_played >= v_min_open_matches
     ) then
    raise exception 'Fixed participation point rules cannot overlap an open-ended rule.'
      using errcode = '22023';
  end if;

  update participation_point_rule_input open_rule
  set participation_points = coalesce(
    (
      select fixed_rule.participation_points
      from participation_point_rule_input fixed_rule
      where not fixed_rule.is_open_ended
        and fixed_rule.matches_played < open_rule.matches_played
      order by fixed_rule.matches_played desc
      limit 1
    ),
    0
  ) + open_rule.points_per_extra_match
  where open_rule.is_open_ended
    and open_rule.is_progressive;

  delete from public.season_participation_point_rules
  where season_participation_point_rules.season_id = p_season_id;

  insert into public.season_participation_point_rules (
    season_id,
    matches_played,
    participation_points,
    points_per_extra_match,
    is_open_ended,
    updated_by
  )
  select
    p_season_id,
    r.matches_played,
    r.participation_points,
    r.points_per_extra_match,
    r.is_open_ended,
    auth.uid()
  from participation_point_rule_input r
  order by r.matches_played;

  return query
  select
    r.id,
    r.season_id,
    r.matches_played,
    r.participation_points,
    r.points_per_extra_match,
    r.is_open_ended,
    r.updated_at
  from public.season_participation_point_rules r
  where r.season_id = p_season_id
  order by r.matches_played;
end;
$$;

revoke all on function public.set_season_participation_point_rules(uuid, jsonb)
  from public;
grant execute on function public.set_season_participation_point_rules(uuid, jsonb)
  to authenticated;
