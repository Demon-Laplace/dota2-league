begin;

create extension if not exists pgcrypto;

alter table public.matches
alter column winner_team drop not null;

alter table public.match_results
add column if not exists hero_name text;

create or replace function public.record_match_result(
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text,
  p_note text default null,
  p_created_by uuid default null,
  p_season_id uuid default null
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
  v_koi_player_id uuid;
  v_has_winner boolean := false;
  v_team_a_has_koi boolean := false;
  v_team_b_has_koi boolean := false;
  v_score_delta_a numeric(10,2);
  v_score_delta_b numeric(10,2);
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

  if v_season_id is not null then
    select koi_player_id
    into v_koi_player_id
    from public.seasons
    where id = v_season_id;

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
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      greatest(20, 20 + coalesce(p.reward_floor_bonus, 0)),
      coalesce(p.reward_floor_bonus, 0),
      0,
      0,
      0
    from public.players p
    where p.id = any(p_team_a_player_ids || p_team_b_player_ids)
    on conflict (season_id, player_id) do nothing;

    v_team_a_has_koi := v_koi_player_id is not null and v_koi_player_id = any(p_team_a_player_ids);
    v_team_b_has_koi := v_koi_player_id is not null and v_koi_player_id = any(p_team_b_player_ids);
  end if;

  v_has_winner := p_winner_team in ('A', 'B');

  v_score_delta_a := case
    when p_winner_team = 'A' then case when v_team_a_has_koi then 1.25 else 1.00 end
    when p_winner_team = 'B' then -1.00
    else 0.00
  end;
  v_score_delta_b := case
    when p_winner_team = 'B' then case when v_team_b_has_koi then 1.25 else 1.00 end
    when p_winner_team = 'A' then -1.00
    else 0.00
  end;

  insert into public.matches (winner_team, created_by, note, season_id, match_day_id, match_date)
  values (nullif(trim(coalesce(p_winner_team, '')), ''), p_created_by, p_note, v_season_id, v_match_day_id, v_match_date)
  returning id into v_match_id;

  insert into public.match_results (
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change
  )
  select
    v_match_id,
    player_id,
    'A',
    case
      when p_winner_team = 'A' then true
      when p_winner_team = 'B' then false
      else null
    end,
    v_score_delta_a,
    0
  from unnest(p_team_a_player_ids) as t(player_id);

  insert into public.match_results (
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change
  )
  select
    v_match_id,
    player_id,
    'B',
    case
      when p_winner_team = 'B' then true
      when p_winner_team = 'A' then false
      else null
    end,
    v_score_delta_b,
    0
  from unnest(p_team_b_player_ids) as t(player_id);

  if v_has_winner then
    update public.players
    set
      score = score + case
        when id = any(p_team_a_player_ids) then v_score_delta_a
        when id = any(p_team_b_player_ids) then v_score_delta_b
        else 0
      end,
      games_played = games_played + case
        when id = any(p_team_a_player_ids || p_team_b_player_ids) then 1
        else 0
      end,
      wins = wins + case
        when p_winner_team = 'A' and id = any(p_team_a_player_ids) then 1
        when p_winner_team = 'B' and id = any(p_team_b_player_ids) then 1
        else 0
      end,
      losses = losses + case
        when p_winner_team = 'A' and id = any(p_team_b_player_ids) then 1
        when p_winner_team = 'B' and id = any(p_team_a_player_ids) then 1
        else 0
      end
    where id = any(p_team_a_player_ids || p_team_b_player_ids);
  end if;

  if v_has_winner and v_season_id is not null then
    update public.season_player_stats
    set
      score = score + case
        when player_id = any(p_team_a_player_ids) then v_score_delta_a
        when player_id = any(p_team_b_player_ids) then v_score_delta_b
        else 0
      end,
      games_played = games_played + 1,
      wins = wins + case
        when p_winner_team = 'A' and player_id = any(p_team_a_player_ids) then 1
        when p_winner_team = 'B' and player_id = any(p_team_b_player_ids) then 1
        else 0
      end,
      losses = losses + case
        when p_winner_team = 'A' and player_id = any(p_team_b_player_ids) then 1
        when p_winner_team = 'B' and player_id = any(p_team_a_player_ids) then 1
        else 0
      end
    where season_id = v_season_id
      and player_id = any(p_team_a_player_ids || p_team_b_player_ids);
  end if;

  return v_match_id;
end;
$$;

grant execute on function public.record_match_result(uuid[], uuid[], text, text, uuid, uuid)
to anon, authenticated;

create or replace function public.record_match_result_backfill(
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text,
  p_season_id uuid,
  p_match_date date,
  p_note text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_match_day_id uuid;
  v_koi_player_id uuid;
  v_has_winner boolean := false;
  v_team_a_has_koi boolean := false;
  v_team_b_has_koi boolean := false;
  v_score_delta_a numeric(10,2);
  v_score_delta_b numeric(10,2);
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

  select koi_player_id
  into v_koi_player_id
  from public.seasons
  where id = p_season_id;

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
    season_id,
    player_id,
    score,
    reward_points,
    reward_floor_bonus,
    games_played,
    wins,
    losses
  )
  select
    p_season_id,
    p.id,
    10.00,
    greatest(20, 20 + coalesce(p.reward_floor_bonus, 0)),
    coalesce(p.reward_floor_bonus, 0),
    0,
    0,
    0
  from public.players p
  where p.id = any(p_team_a_player_ids || p_team_b_player_ids)
  on conflict (season_id, player_id) do nothing;

  v_team_a_has_koi := v_koi_player_id is not null and v_koi_player_id = any(p_team_a_player_ids);
  v_team_b_has_koi := v_koi_player_id is not null and v_koi_player_id = any(p_team_b_player_ids);
  v_has_winner := p_winner_team in ('A', 'B');

  v_score_delta_a := case
    when p_winner_team = 'A' then case when v_team_a_has_koi then 1.25 else 1.00 end
    when p_winner_team = 'B' then -1.00
    else 0.00
  end;
  v_score_delta_b := case
    when p_winner_team = 'B' then case when v_team_b_has_koi then 1.25 else 1.00 end
    when p_winner_team = 'A' then -1.00
    else 0.00
  end;

  insert into public.matches (winner_team, created_by, note, season_id, match_day_id, match_date)
  values (nullif(trim(coalesce(p_winner_team, '')), ''), p_created_by, p_note, p_season_id, v_match_day_id, p_match_date)
  returning id into v_match_id;

  insert into public.match_results (
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change
  )
  select
    v_match_id,
    player_id,
    'A',
    case
      when p_winner_team = 'A' then true
      when p_winner_team = 'B' then false
      else null
    end,
    v_score_delta_a,
    0
  from unnest(p_team_a_player_ids) as t(player_id);

  insert into public.match_results (
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change
  )
  select
    v_match_id,
    player_id,
    'B',
    case
      when p_winner_team = 'B' then true
      when p_winner_team = 'A' then false
      else null
    end,
    v_score_delta_b,
    0
  from unnest(p_team_b_player_ids) as t(player_id);

  if v_has_winner then
    update public.players
    set
      score = score + case
        when id = any(p_team_a_player_ids) then v_score_delta_a
        when id = any(p_team_b_player_ids) then v_score_delta_b
        else 0
      end,
      games_played = games_played + case
        when id = any(p_team_a_player_ids || p_team_b_player_ids) then 1
        else 0
      end,
      wins = wins + case
        when p_winner_team = 'A' and id = any(p_team_a_player_ids) then 1
        when p_winner_team = 'B' and id = any(p_team_b_player_ids) then 1
        else 0
      end,
      losses = losses + case
        when p_winner_team = 'A' and id = any(p_team_b_player_ids) then 1
        when p_winner_team = 'B' and id = any(p_team_a_player_ids) then 1
        else 0
      end
    where id = any(p_team_a_player_ids || p_team_b_player_ids);

    update public.season_player_stats
    set
      score = score + case
        when player_id = any(p_team_a_player_ids) then v_score_delta_a
        when player_id = any(p_team_b_player_ids) then v_score_delta_b
        else 0
      end,
      games_played = games_played + 1,
      wins = wins + case
        when p_winner_team = 'A' and player_id = any(p_team_a_player_ids) then 1
        when p_winner_team = 'B' and player_id = any(p_team_b_player_ids) then 1
        else 0
      end,
      losses = losses + case
        when p_winner_team = 'A' and player_id = any(p_team_b_player_ids) then 1
        when p_winner_team = 'B' and player_id = any(p_team_a_player_ids) then 1
        else 0
      end
    where season_id = p_season_id
      and player_id = any(p_team_a_player_ids || p_team_b_player_ids);
  end if;

  return v_match_id;
end;
$$;

grant execute on function public.record_match_result_backfill(uuid[], uuid[], text, uuid, date, text, uuid)
to anon, authenticated;

create or replace function public.update_match_result(
  p_match_id uuid,
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_winner_team text default null,
  p_season_id uuid default null,
  p_match_date date default null,
  p_note text default null,
  p_created_by uuid default null,
  p_assignments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_match_id uuid;
  v_match_day_id uuid;
  v_koi_player_id uuid;
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

  select koi_player_id
  into v_koi_player_id
  from public.seasons
  where id = p_season_id;

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
    season_id,
    player_id,
    score,
    reward_points,
    reward_floor_bonus,
    games_played,
    wins,
    losses
  )
  select
    p_season_id,
    p.id,
    10.00,
    greatest(20, 20 + coalesce(p.reward_floor_bonus, 0)),
    coalesce(p.reward_floor_bonus, 0),
    0,
    0,
    0
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
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change,
    hero_name
  )
  select
    p_match_id,
    team_a.player_id,
    'A',
    case
      when p_winner_team = 'A' then true
      when p_winner_team = 'B' then false
      else null
    end,
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
    match_id,
    player_id,
    team,
    is_winner,
    score_change,
    reward_change,
    hero_name
  )
  select
    p_match_id,
    team_b.player_id,
    'B',
    case
      when p_winner_team = 'B' then true
      when p_winner_team = 'A' then false
      else null
    end,
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

  perform public.recalculate_all_scores();
end;
$$;

grant execute on function public.update_match_result(uuid, uuid[], uuid[], text, uuid, date, text, uuid, jsonb)
to anon, authenticated;

create or replace function public.update_match_result_hero(
  p_match_id uuid,
  p_player_id uuid,
  p_hero_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_results
  set hero_name = nullif(trim(coalesce(p_hero_name, '')), '')
  where match_id = p_match_id
    and player_id = p_player_id;

  if not found then
    raise exception '未找到对应的比赛选手记录';
  end if;
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
      nullif(trim(coalesce(value ->> 'hero_name', '')), '') as hero_name
    from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  )
  update public.match_results mr
  set hero_name = payload.hero_name
  from payload
  where mr.match_id = p_match_id
    and mr.player_id = payload.player_id;

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$$;

grant select on public.recent_matches to anon, authenticated;
grant execute on function public.update_match_result_hero(uuid, uuid, text) to anon, authenticated;
grant execute on function public.update_match_result_heroes(uuid, jsonb) to anon, authenticated;

commit;
