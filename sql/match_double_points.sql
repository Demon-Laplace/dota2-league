begin;

alter table public.players
add column if not exists reward_double_bonus integer not null default 0;

alter table public.season_player_stats
add column if not exists reward_double_bonus integer not null default 0;

create table if not exists public.match_double_downs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  mode text not null check (mode in ('single', 'team')),
  user_player_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid references public.players(id) on delete cascade,
  target_team text check (target_team in ('A', 'B')),
  created_at timestamptz not null default now(),
  check (
    (mode = 'single' and target_player_id is not null and target_team is null)
    or (mode = 'team' and target_team is not null and target_player_id is null)
  )
);

create index if not exists idx_match_double_downs_match_id
on public.match_double_downs (match_id);

create index if not exists idx_match_double_downs_season_user
on public.match_double_downs (season_id, user_player_id);

create unique index if not exists idx_match_double_downs_unique_team
on public.match_double_downs (match_id, target_team)
where mode = 'team';

create unique index if not exists idx_match_double_downs_unique_single_target
on public.match_double_downs (match_id, target_player_id)
where mode = 'single';

drop view if exists public.current_season_leaderboard;

create view public.current_season_leaderboard as
select
  sps.id,
  sps.season_id,
  s.name as season_name,
  p.id as player_id,
  p.display_name,
  sps.score,
  sps.reward_points,
  sps.reward_floor_bonus,
  sps.reward_double_bonus,
  sps.reward_extra_points,
  (20 + coalesce(sps.reward_floor_bonus, 0) + coalesce(sps.reward_double_bonus, 0)) as reward_minimum,
  sps.games_played,
  sps.wins,
  sps.losses,
  case
    when sps.games_played = 0 then 0::numeric
    else round((sps.wins::numeric / sps.games_played::numeric) * 100, 2)
  end as win_rate
from public.season_player_stats sps
join public.seasons s on s.id = sps.season_id
join public.players p on p.id = sps.player_id
where s.is_active = true;

create or replace function public.sync_player_reward_totals(
  p_player_id uuid,
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_reward_minimum integer := 20;
  v_current_extra integer := 0;
  v_total integer := 20;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is not null then
    select
      20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0) + coalesce(sps.reward_double_bonus, p.reward_double_bonus, 0),
      coalesce((
        select sum(rd.amount)::integer
        from public.reward_donations rd
        where rd.season_id = v_season_id
          and rd.player_id = p_player_id
          and rd.is_cancelled = false
      ), 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select
      20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0),
      coalesce(p.reward_extra_points, 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    where p.id = p_player_id;
  end if;

  v_total := v_reward_minimum + coalesce(v_current_extra, 0);

  update public.players
  set
    reward_extra_points = coalesce(v_current_extra, 0),
    reward_points = v_total
  where id = p_player_id;

  if v_season_id is not null then
    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      reward_double_bonus,
      reward_extra_points,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      v_total,
      coalesce(p.reward_floor_bonus, 0),
      coalesce(p.reward_double_bonus, 0),
      coalesce(v_current_extra, 0),
      0,
      0,
      0
    from public.players p
    where p.id = p_player_id
    on conflict (season_id, player_id) do update
    set
      reward_extra_points = excluded.reward_extra_points,
      reward_points = excluded.reward_points;
  end if;

  return v_total;
end;
$$;

create or replace function public.update_player_reward_points(
  p_player_id uuid,
  p_reward_points integer,
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_reward_minimum integer := 20;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is not null then
    select 20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0) + coalesce(sps.reward_double_bonus, p.reward_double_bonus, 0)
    into v_reward_minimum
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select 20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)
    into v_reward_minimum
    from public.players p
    where p.id = p_player_id;
  end if;

  if p_reward_points is null or p_reward_points < v_reward_minimum then
    raise exception '赞助额不能低于该选手当前最低值 %', v_reward_minimum;
  end if;

  update public.players
  set reward_points = p_reward_points
  where id = p_player_id;

  if v_season_id is not null then
    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      reward_double_bonus,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      p_reward_points,
      coalesce(p.reward_floor_bonus, 0),
      coalesce(p.reward_double_bonus, 0),
      0,
      0,
      0
    from public.players p
    where p.id = p_player_id
    on conflict (season_id, player_id) do update
    set reward_points = excluded.reward_points;
  end if;

  return p_reward_points;
end;
$$;

create or replace function public.replace_match_double_downs(
  p_match_id uuid,
  p_season_id uuid default null,
  p_double_downs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_mode text;
  v_user_player_id uuid;
  v_target_player_id uuid;
  v_target_team text;
  v_user_team text;
  v_target_player_team text;
begin
  delete from public.match_double_downs
  where match_id = p_match_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_double_downs, '[]'::jsonb))
  loop
    v_mode := lower(coalesce(v_item->>'mode', ''));
    v_user_player_id := nullif(v_item->>'user_player_id', '')::uuid;
    v_target_player_id := nullif(v_item->>'target_player_id', '')::uuid;
    v_target_team := nullif(v_item->>'target_team', '');

    if v_mode not in ('single', 'team') then
      raise exception '双倍积分类型必须是 single 或 team';
    end if;

    select mr.team
    into v_user_team
    from public.match_results mr
    where mr.match_id = p_match_id
      and mr.player_id = v_user_player_id
    limit 1;

    if v_user_team is null then
      raise exception '双倍积分使用者必须是本场比赛选手';
    end if;

    if v_mode = 'single' then
      select mr.team
      into v_target_player_team
      from public.match_results mr
      where mr.match_id = p_match_id
        and mr.player_id = v_target_player_id
      limit 1;

      if v_target_player_team is null then
        raise exception '单人双倍的生效人必须是本场比赛选手';
      end if;

      if exists (
        select 1
        from public.match_double_downs mdd
        where mdd.match_id = p_match_id
          and mdd.mode = 'team'
          and mdd.target_team = v_target_player_team
      ) then
        raise exception '团队双倍与单人双倍不能同时作用于同一队伍';
      end if;

      if exists (
        select 1
        from public.match_double_downs mdd
        where mdd.match_id = p_match_id
          and mdd.mode = 'single'
          and mdd.target_player_id = v_target_player_id
      ) then
        raise exception '同一名选手一场比赛只能吃一次单人双倍';
      end if;

      insert into public.match_double_downs (
        match_id,
        season_id,
        mode,
        user_player_id,
        target_player_id
      )
      values (
        p_match_id,
        p_season_id,
        'single',
        v_user_player_id,
        v_target_player_id
      );
    else
      if v_target_team not in ('A', 'B') then
        raise exception '团队双倍的目标队伍必须是 A 或 B';
      end if;

      if v_user_team <> v_target_team then
        raise exception '团队双倍的使用者必须和生效队伍在同一边';
      end if;

      if exists (
        select 1
        from public.match_double_downs mdd
        where mdd.match_id = p_match_id
          and mdd.mode = 'single'
          and exists (
            select 1
            from public.match_results mr
            where mr.match_id = p_match_id
              and mr.player_id = mdd.target_player_id
              and mr.team = v_target_team
          )
      ) then
        raise exception '团队双倍与单人双倍不能同时作用于同一队伍';
      end if;

      insert into public.match_double_downs (
        match_id,
        season_id,
        mode,
        user_player_id,
        target_team
      )
      values (
        p_match_id,
        p_season_id,
        'team',
        v_user_player_id,
        v_target_team
      );
    end if;
  end loop;
end;
$$;

create or replace function public.record_match_result(
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text,
  p_note text default null,
  p_created_by uuid default null,
  p_season_id uuid default null,
  p_double_downs jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_season_id uuid;
  v_match_day_id uuid;
  v_match_date date;
begin
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

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  select id, match_date
  into v_match_day_id, v_match_date
  from public.match_days
  where season_id = v_season_id
    and is_active = true
  order by started_at desc
  limit 1;

  if v_match_day_id is null then
    raise exception '当前尚未发起当日比赛，无法记录比赛';
  end if;

  insert into public.season_players (season_id, player_id)
  select v_season_id, player_id
  from unnest(p_team_a_player_ids || p_team_b_player_ids) as t(player_id)
  on conflict (season_id, player_id) do nothing;

  insert into public.season_player_stats (
    season_id, player_id, score, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points, games_played, wins, losses
  )
  select
    v_season_id, p.id, 10.00,
    (20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)) + coalesce(p.reward_extra_points, 0),
    coalesce(p.reward_floor_bonus, 0),
    coalesce(p.reward_double_bonus, 0),
    coalesce(p.reward_extra_points, 0),
    0, 0, 0
  from public.players p
  where p.id = any(p_team_a_player_ids || p_team_b_player_ids)
  on conflict (season_id, player_id) do nothing;

  insert into public.matches (winner_team, created_by, note, season_id, match_day_id, match_date)
  values (nullif(trim(coalesce(p_winner_team, '')), ''), p_created_by, p_note, v_season_id, v_match_day_id, v_match_date)
  returning id into v_match_id;

  insert into public.match_results (match_id, player_id, team, is_winner, score_change, reward_change)
  select v_match_id, player_id, 'A', null, 0, 0
  from unnest(p_team_a_player_ids) as t(player_id);

  insert into public.match_results (match_id, player_id, team, is_winner, score_change, reward_change)
  select v_match_id, player_id, 'B', null, 0, 0
  from unnest(p_team_b_player_ids) as t(player_id);

  perform public.replace_match_double_downs(v_match_id, v_season_id, p_double_downs);
  perform public.recalculate_all_scores();

  return v_match_id;
end;
$$;

create or replace function public.record_match_result_backfill(
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text,
  p_season_id uuid,
  p_match_date date,
  p_note text default null,
  p_created_by uuid default null,
  p_double_downs jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_match_day_id uuid;
begin
  if p_season_id is null then
    raise exception '补登比赛必须选择赛季';
  end if;

  if p_match_date is null then
    raise exception '补登比赛必须选择日期';
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

  insert into public.matches (winner_team, created_by, note, season_id, match_day_id, match_date)
  values (nullif(trim(coalesce(p_winner_team, '')), ''), p_created_by, p_note, p_season_id, v_match_day_id, p_match_date)
  returning id into v_match_id;

  insert into public.match_results (match_id, player_id, team, is_winner, score_change, reward_change)
  select v_match_id, player_id, 'A', null, 0, 0
  from unnest(p_team_a_player_ids) as t(player_id);

  insert into public.match_results (match_id, player_id, team, is_winner, score_change, reward_change)
  select v_match_id, player_id, 'B', null, 0, 0
  from unnest(p_team_b_player_ids) as t(player_id);

  perform public.replace_match_double_downs(v_match_id, p_season_id, p_double_downs);
  perform public.recalculate_all_scores();

  return v_match_id;
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
    match_id, player_id, team, is_winner, score_change, reward_change, hero_name
  )
  select
    p_match_id,
    team_a.player_id,
    'A',
    null,
    0,
    0,
    assignment.hero_name
  from unnest(p_team_a_player_ids) as team_a(player_id)
  left join lateral (
    select nullif(trim(coalesce(item->>'hero_name', '')), '') as hero_name
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) as item
    where item->>'player_id' = team_a.player_id::text
    limit 1
  ) assignment on true;

  insert into public.match_results (
    match_id, player_id, team, is_winner, score_change, reward_change, hero_name
  )
  select
    p_match_id,
    team_b.player_id,
    'B',
    null,
    0,
    0,
    assignment.hero_name
  from unnest(p_team_b_player_ids) as team_b(player_id)
  left join lateral (
    select nullif(trim(coalesce(item->>'hero_name', '')), '') as hero_name
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) as item
    where item->>'player_id' = team_b.player_id::text
    limit 1
  ) assignment on true;

  perform public.replace_match_double_downs(p_match_id, p_season_id, p_double_downs);
  perform public.recalculate_all_scores();
end;
$$;

create or replace function public.recalculate_all_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_player record;
  v_koi_player_id uuid;
  v_day_lowest_score numeric(10,2);
  v_day_second_lowest_score numeric(10,2);
  v_base_delta numeric(10,2);
  v_final_delta numeric(10,2);
  v_is_winner boolean;
  v_has_winner boolean;
  v_has_team_double boolean;
  v_has_single_double boolean;
begin
  update public.players
  set
    score = 10.00,
    reward_double_bonus = 0,
    reward_points = (20 + coalesce(reward_floor_bonus, 0)) + coalesce(reward_extra_points, 0),
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  update public.season_player_stats
  set
    score = 10.00,
    reward_double_bonus = 0,
    reward_points = (20 + coalesce(reward_floor_bonus, 0)) + coalesce(reward_extra_points, 0),
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  insert into public.season_player_stats (
    season_id, player_id, score, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points, games_played, wins, losses
  )
  select distinct
    src.season_id,
    src.player_id,
    10.00,
    (20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)) + coalesce(p.reward_extra_points, 0),
    coalesce(p.reward_floor_bonus, 0),
    coalesce(p.reward_double_bonus, 0),
    coalesce(p.reward_extra_points, 0),
    0, 0, 0
  from (
    select m.season_id, mr.player_id
    from public.match_results mr
    join public.matches m on m.id = mr.match_id
    where m.season_id is not null
    union
    select mdd.season_id, mdd.user_player_id
    from public.match_double_downs mdd
    where mdd.season_id is not null
  ) src
  join public.players p on p.id = src.player_id
  on conflict (season_id, player_id) do nothing;

  update public.match_results
  set
    score_change = 0,
    reward_change = 0,
    is_winner = null
  where true;

  for v_match in
    select
      m.id,
      m.season_id,
      m.winner_team,
      coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) as match_date,
      m.created_at
    from public.matches m
    order by coalesce(m.match_date, public.get_beijing_match_date(m.created_at)), m.created_at, m.id
  loop
    v_has_winner := v_match.winner_team in ('A', 'B');

    select koi_player_id
    into v_koi_player_id
    from public.seasons
    where id = v_match.season_id;

    select min(score)
    into v_day_lowest_score
    from public.players;

    select min(score)
    into v_day_second_lowest_score
    from public.players
    where score > v_day_lowest_score;

    v_day_second_lowest_score := coalesce(v_day_second_lowest_score, v_day_lowest_score);

    for v_player in
      select
        mr.player_id,
        mr.team,
        p.score as current_score
      from public.match_results mr
      join public.players p on p.id = mr.player_id
      where mr.match_id = v_match.id
      order by mr.team, mr.player_id
    loop
      v_is_winner := case
        when not v_has_winner then null
        else v_player.team = v_match.winner_team
      end;

      if not v_has_winner then
        v_base_delta := 0.00;
      elsif v_is_winner then
        v_base_delta := case
          when v_koi_player_id is not null
            and exists (
              select 1
              from public.match_results mr_koi
              where mr_koi.match_id = v_match.id
                and mr_koi.player_id = v_koi_player_id
                and mr_koi.team = v_player.team
            )
          then 1.25
          else 1.00
        end;
      else
        v_base_delta := -1.00;
      end if;

      select exists (
        select 1
        from public.match_double_downs mdd
        where mdd.match_id = v_match.id
          and mdd.mode = 'team'
          and mdd.target_team = v_player.team
      )
      into v_has_team_double;

      select exists (
        select 1
        from public.match_double_downs mdd
        where mdd.match_id = v_match.id
          and mdd.mode = 'single'
          and mdd.target_player_id = v_player.player_id
      )
      into v_has_single_double;

      v_final_delta := v_base_delta;

      if v_has_winner and (v_has_team_double or v_has_single_double) then
        if v_base_delta > 0 then
          v_final_delta := v_base_delta * 2;
        elsif v_base_delta < 0 then
          if v_player.current_score <= v_day_second_lowest_score then
            v_final_delta := -1.00;
          else
            v_final_delta := -2.00;
          end if;
        end if;
      end if;

      update public.match_results
      set
        is_winner = v_is_winner,
        score_change = v_final_delta,
        reward_change = 0
      where match_id = v_match.id
        and player_id = v_player.player_id;

      if v_has_winner then
        update public.players
        set
          score = score + v_final_delta,
          games_played = games_played + 1,
          wins = wins + case when v_is_winner then 1 else 0 end,
          losses = losses + case when v_is_winner then 0 else 1 end
        where id = v_player.player_id;

        if v_match.season_id is not null then
          update public.season_player_stats
          set
            score = score + v_final_delta,
            games_played = games_played + 1,
            wins = wins + case when v_is_winner then 1 else 0 end,
            losses = losses + case when v_is_winner then 0 else 1 end
          where season_id = v_match.season_id
            and player_id = v_player.player_id;
        end if;
      end if;
    end loop;
  end loop;

  with season_usage as (
    select
      mdd.season_id,
      mdd.user_player_id as player_id,
      greatest(count(*) filter (where mdd.mode = 'single') - 2, 0) * 5
        + count(*) filter (where mdd.mode = 'team') * 10 as reward_double_bonus
    from public.match_double_downs mdd
    where mdd.season_id is not null
    group by mdd.season_id, mdd.user_player_id
  )
  update public.season_player_stats sps
  set
    reward_double_bonus = su.reward_double_bonus,
    reward_points = (20 + coalesce(sps.reward_floor_bonus, 0) + su.reward_double_bonus) + coalesce(sps.reward_extra_points, 0)
  from season_usage su
  where sps.season_id = su.season_id
    and sps.player_id = su.player_id;

  with player_usage as (
    select
      mdd.user_player_id as player_id,
      greatest(count(*) filter (where mdd.mode = 'single') - 2, 0) * 5
        + count(*) filter (where mdd.mode = 'team') * 10 as reward_double_bonus
    from public.match_double_downs mdd
    group by mdd.user_player_id
  )
  update public.players p
  set
    reward_double_bonus = pu.reward_double_bonus,
    reward_points = (20 + coalesce(p.reward_floor_bonus, 0) + pu.reward_double_bonus) + coalesce(p.reward_extra_points, 0)
  from player_usage pu
  where p.id = pu.player_id;

  update public.players
  set reward_points = (20 + coalesce(reward_floor_bonus, 0) + coalesce(reward_double_bonus, 0)) + coalesce(reward_extra_points, 0)
  where true;

  update public.season_player_stats
  set reward_points = (20 + coalesce(reward_floor_bonus, 0) + coalesce(reward_double_bonus, 0)) + coalesce(reward_extra_points, 0)
  where true;
end;
$$;

create or replace function public.delete_match_and_recalculate(
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.match_results
  where match_id = p_match_id;

  delete from public.matches
  where id = p_match_id;

  perform public.recalculate_all_scores();
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
grant execute on function public.sync_player_reward_totals(uuid, uuid) to anon, authenticated;
grant execute on function public.update_player_reward_points(uuid, integer, uuid) to anon, authenticated;
grant execute on function public.replace_match_double_downs(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.record_match_result(uuid[], uuid[], text, text, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.record_match_result_backfill(uuid[], uuid[], text, uuid, date, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.update_match_result(uuid, uuid[], uuid[], text, uuid, date, text, uuid, jsonb, jsonb) to anon, authenticated;
grant execute on function public.recalculate_all_scores() to anon, authenticated;
grant execute on function public.delete_match_and_recalculate(uuid) to anon, authenticated;

commit;
