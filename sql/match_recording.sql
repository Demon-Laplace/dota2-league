begin;

create extension if not exists pgcrypto;

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
  v_team_a_avg numeric;
  v_team_b_avg numeric;
  v_expected_a numeric;
  v_expected_b numeric;
  v_score_delta_a integer;
  v_score_delta_b integer;
  v_reward_a integer;
  v_reward_b integer;
begin
  if coalesce(array_length(p_team_a_player_ids, 1), 0) <> 5 then
    raise exception '天辉必须正好 5 名选手';
  end if;

  if coalesce(array_length(p_team_b_player_ids, 1), 0) <> 5 then
    raise exception '夜魇必须正好 5 名选手';
  end if;

  if p_winner_team not in ('A', 'B') then
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
    insert into public.season_players (season_id, player_id)
    select v_season_id, player_id
    from unnest(p_team_a_player_ids || p_team_b_player_ids) as t(player_id)
    on conflict (season_id, player_id) do nothing;

    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      p.score,
      p.reward_points,
      p.games_played,
      p.wins,
      p.losses
    from public.players p
    where p.id = any(p_team_a_player_ids || p_team_b_player_ids)
    on conflict (season_id, player_id) do nothing;

    select avg(score)::numeric
    into v_team_a_avg
    from public.season_player_stats
    where season_id = v_season_id
      and player_id = any(p_team_a_player_ids);

    select avg(score)::numeric
    into v_team_b_avg
    from public.season_player_stats
    where season_id = v_season_id
      and player_id = any(p_team_b_player_ids);
  else
    select avg(score)::numeric
    into v_team_a_avg
    from public.players
    where id = any(p_team_a_player_ids);

    select avg(score)::numeric
    into v_team_b_avg
    from public.players
    where id = any(p_team_b_player_ids);
  end if;

  v_expected_a := 1 / (1 + power(10, (v_team_b_avg - v_team_a_avg) / 400.0));
  v_expected_b := 1 / (1 + power(10, (v_team_a_avg - v_team_b_avg) / 400.0));

  v_score_delta_a := round(32 * ((case when p_winner_team = 'A' then 1 else 0 end) - v_expected_a));
  v_score_delta_b := round(32 * ((case when p_winner_team = 'B' then 1 else 0 end) - v_expected_b));

  if p_winner_team = 'A' and v_score_delta_a <= 0 then
    v_score_delta_a := 1;
  elsif p_winner_team = 'B' and v_score_delta_a >= 0 then
    v_score_delta_a := -1;
  end if;

  if p_winner_team = 'B' and v_score_delta_b <= 0 then
    v_score_delta_b := 1;
  elsif p_winner_team = 'A' and v_score_delta_b >= 0 then
    v_score_delta_b := -1;
  end if;

  v_reward_a := case when p_winner_team = 'A' then 1 else 0 end;
  v_reward_b := case when p_winner_team = 'B' then 1 else 0 end;

  insert into public.matches (winner_team, created_by, note, season_id)
  values (p_winner_team, p_created_by, p_note, v_season_id)
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
    p_winner_team = 'A',
    v_score_delta_a,
    v_reward_a
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
    p_winner_team = 'B',
    v_score_delta_b,
    v_reward_b
  from unnest(p_team_b_player_ids) as t(player_id);

  update public.players
  set
    score = score + case
      when id = any(p_team_a_player_ids) then v_score_delta_a
      when id = any(p_team_b_player_ids) then v_score_delta_b
      else 0
    end,
    reward_points = reward_points + case
      when id = any(p_team_a_player_ids) then v_reward_a
      when id = any(p_team_b_player_ids) then v_reward_b
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

  if v_season_id is not null then
    update public.season_player_stats
    set
      score = score + case
        when player_id = any(p_team_a_player_ids) then v_score_delta_a
        when player_id = any(p_team_b_player_ids) then v_score_delta_b
        else 0
      end,
      reward_points = reward_points + case
        when player_id = any(p_team_a_player_ids) then v_reward_a
        when player_id = any(p_team_b_player_ids) then v_reward_b
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

commit;
