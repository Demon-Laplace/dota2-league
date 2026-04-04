begin;

alter table public.matches
alter column winner_team drop not null;

alter table public.match_results
add column if not exists kills integer,
add column if not exists deaths integer,
add column if not exists assists integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_results_kills_nonnegative'
  ) then
    alter table public.match_results
    add constraint match_results_kills_nonnegative
    check (kills is null or kills >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_results_deaths_nonnegative'
  ) then
    alter table public.match_results
    add constraint match_results_deaths_nonnegative
    check (deaths is null or deaths >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_results_assists_nonnegative'
  ) then
    alter table public.match_results
    add constraint match_results_assists_nonnegative
    check (assists is null or assists >= 0);
  end if;
end;
$$;

create or replace function public.update_match_result(
  p_match_id uuid,
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text default null,
  p_season_id uuid default null,
  p_match_date date default null,
  p_note text default null,
  p_created_by uuid default null,
  p_assignments jsonb default '[]'::jsonb,
  p_double_downs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_match_id uuid;
  v_match_day_id uuid;
begin
  if p_match_id is null then
    raise exception '必须指定要修改的比赛记录';
  end if;

  if p_season_id is null then
    raise exception '修改比赛必须选择赛季';
  end if;

  if p_match_date is null then
    raise exception '修改比赛必须选择比赛日期';
  end if;

  if coalesce(array_length(p_team_a_player_ids, 1), 0) <> 5 then
    raise exception '天辉必须正好 5 名选手';
  end if;

  if coalesce(array_length(p_team_b_player_ids, 1), 0) <> 5 then
    raise exception '夜魇必须正好 5 名选手';
  end if;

  if nullif(trim(coalesce(p_winner_team, '')), '') is not null
    and p_winner_team not in ('A', 'B') then
    raise exception '胜方必须是 A 或 B';
  end if;

  if exists (
    select 1
    from unnest(p_team_a_player_ids || p_team_b_player_ids) as all_players(player_id)
    group by player_id
    having count(*) > 1
  ) then
    raise exception '同一名选手不能在同一场比赛中重复出现';
  end if;

  select id
  into v_existing_match_id
  from public.matches
  where id = p_match_id;

  if v_existing_match_id is null then
    raise exception '未找到要修改的比赛记录';
  end if;

  insert into public.match_days (season_id, match_date, note, is_active, started_at)
  values (p_season_id, p_match_date, '历史补登', false, now())
  on conflict (season_id, match_date)
  do update set note = coalesce(public.match_days.note, excluded.note)
  returning id into v_match_day_id;

  insert into public.season_players (season_id, player_id)
  select p_season_id, player_id
  from unnest(p_team_a_player_ids || p_team_b_player_ids) as t(player_id)
  on conflict (season_id, player_id) do nothing;

  insert into public.season_player_stats (
    season_id, player_id, score, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points, games_played, wins, losses
  )
  select
    p_season_id, p.id, 10.00,
    (20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)) + coalesce(p.reward_extra_points, 0),
    coalesce(p.reward_floor_bonus, 0),
    coalesce(p.reward_double_bonus, 0),
    coalesce(p.reward_extra_points, 0),
    0, 0, 0
  from public.players p
  where p.id = any(p_team_a_player_ids || p_team_b_player_ids)
  on conflict (season_id, player_id) do nothing;

  update public.matches
  set
    winner_team = nullif(trim(coalesce(p_winner_team, '')), ''),
    created_by = coalesce(p_created_by, created_by),
    note = p_note,
    season_id = p_season_id,
    match_day_id = v_match_day_id,
    match_date = p_match_date
  where id = p_match_id;

  delete from public.match_results
  where match_id = p_match_id;

  insert into public.match_results (
    match_id, player_id, team, is_winner, score_change, reward_change, hero_name, kills, deaths, assists
  )
  select
    p_match_id,
    team_a.player_id,
    'A',
    null,
    0,
    0,
    assignment.hero_name,
    assignment.kills,
    assignment.deaths,
    assignment.assists
  from unnest(p_team_a_player_ids) as team_a(player_id)
  left join lateral (
    select
      nullif(trim(coalesce(item->>'hero_name', '')), '') as hero_name,
      nullif(trim(coalesce(item->>'kills', '')), '')::integer as kills,
      nullif(trim(coalesce(item->>'deaths', '')), '')::integer as deaths,
      nullif(trim(coalesce(item->>'assists', '')), '')::integer as assists
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) as item
    where item->>'player_id' = team_a.player_id::text
    limit 1
  ) assignment on true;

  insert into public.match_results (
    match_id, player_id, team, is_winner, score_change, reward_change, hero_name, kills, deaths, assists
  )
  select
    p_match_id,
    team_b.player_id,
    'B',
    null,
    0,
    0,
    assignment.hero_name,
    assignment.kills,
    assignment.deaths,
    assignment.assists
  from unnest(p_team_b_player_ids) as team_b(player_id)
  left join lateral (
    select
      nullif(trim(coalesce(item->>'hero_name', '')), '') as hero_name,
      nullif(trim(coalesce(item->>'kills', '')), '')::integer as kills,
      nullif(trim(coalesce(item->>'deaths', '')), '')::integer as deaths,
      nullif(trim(coalesce(item->>'assists', '')), '')::integer as assists
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) as item
    where item->>'player_id' = team_b.player_id::text
    limit 1
  ) assignment on true;

  perform public.replace_match_double_downs(p_match_id, p_season_id, p_double_downs);
  perform public.recalculate_all_scores();
end;
$$;

create or replace function public.update_match_result_heroes(
  p_match_id uuid,
  p_assignments jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  with payload as (
    select
      (value ->> 'player_id')::uuid as player_id,
      nullif(trim(coalesce(value ->> 'hero_name', '')), '') as hero_name,
      nullif(trim(coalesce(value ->> 'kills', '')), '')::integer as kills,
      nullif(trim(coalesce(value ->> 'deaths', '')), '')::integer as deaths,
      nullif(trim(coalesce(value ->> 'assists', '')), '')::integer as assists
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  )
  update public.match_results mr
  set
    hero_name = payload.hero_name,
    kills = payload.kills,
    deaths = payload.deaths,
    assists = payload.assists
  from payload
  where mr.match_id = p_match_id
    and mr.player_id = payload.player_id;

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$$;

drop view if exists public.match_day_recent_matches;

create view public.match_day_recent_matches as
select
  m.id as match_id,
  m.match_day_id,
  m.season_id,
  coalesce(m.match_date, md.match_date, public.get_beijing_match_date(m.created_at)) as match_date,
  coalesce(md.is_active, false) as day_is_active,
  m.winner_team,
  m.note,
  m.created_at,
  json_agg(
    json_build_object(
      'player_id', mr.player_id,
      'team', mr.team,
      'is_winner', mr.is_winner,
      'display_name', p.display_name,
      'hero_name', mr.hero_name,
      'kills', mr.kills,
      'deaths', mr.deaths,
      'assists', mr.assists,
      'score_change', mr.score_change
    )
    order by mr.team, p.display_name
  ) as players,
  coalesce((
    select json_agg(
      json_build_object(
        'mode', mdd.mode,
        'user_player_id', mdd.user_player_id,
        'target_player_id', mdd.target_player_id,
        'target_team', mdd.target_team
      )
      order by mdd.mode, mdd.created_at, mdd.id
    )
    from public.match_double_downs mdd
    where mdd.match_id = m.id
  ), '[]'::json) as double_downs
from public.matches m
join public.match_results mr on mr.match_id = m.id
join public.players p on p.id = mr.player_id
left join public.match_days md on md.id = m.match_day_id
group by
  m.id,
  m.match_day_id,
  m.season_id,
  m.match_date,
  md.match_date,
  md.is_active,
  m.winner_team,
  m.note,
  m.created_at;

grant select on public.match_day_recent_matches to anon, authenticated;
grant execute on function public.update_match_result(uuid, uuid[], uuid[], text, uuid, date, text, uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.update_match_result_heroes(uuid, jsonb) to anon, authenticated;

commit;
