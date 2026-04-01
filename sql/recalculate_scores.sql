begin;

create or replace function public.recalculate_all_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) 先把总榜重置到基础值
  update public.players
  set
    score = 10,
    reward_points = 20,
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  -- 2) 赛季榜也重置到赛季基础值
  update public.season_player_stats
  set
    score = 10,
    reward_points = 20,
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  -- 3) 确保所有参与过比赛的选手在对应赛季里都有统计行
  insert into public.season_player_stats (
    season_id,
    player_id,
    score,
    reward_points,
    games_played,
    wins,
    losses
  )
  select distinct
    m.season_id,
    mr.player_id,
    10,
    20,
    0,
    0,
    0
  from public.match_results mr
  join public.matches m on m.id = mr.match_id
  where m.season_id is not null
  on conflict (season_id, player_id) do nothing;

  -- 4) 先把总榜按比赛记录累计回去
  with player_totals as (
    select
      mr.player_id,
      count(*)::integer as games_played,
      count(*) filter (where mr.is_winner)::integer as wins,
      count(*) filter (where not mr.is_winner)::integer as losses
    from public.match_results mr
    group by mr.player_id
  )
  update public.players p
  set
    score = 10 + pt.wins - pt.losses,
    reward_points = 20,
    games_played = pt.games_played,
    wins = pt.wins,
    losses = pt.losses
  from player_totals pt
  where p.id = pt.player_id;

  -- 5) 再把赛季榜按对应赛季的比赛记录累计回去
  with season_totals as (
    select
      m.season_id,
      mr.player_id,
      count(*)::integer as games_played,
      count(*) filter (where mr.is_winner)::integer as wins,
      count(*) filter (where not mr.is_winner)::integer as losses
    from public.match_results mr
    join public.matches m on m.id = mr.match_id
    where m.season_id is not null
    group by m.season_id, mr.player_id
  )
  update public.season_player_stats sps
  set
    score = 10 + st.wins - st.losses,
    reward_points = 20,
    games_played = st.games_played,
    wins = st.wins,
    losses = st.losses
  from season_totals st
  where sps.season_id = st.season_id
    and sps.player_id = st.player_id;
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

grant execute on function public.recalculate_all_scores() to anon, authenticated;
grant execute on function public.delete_match_and_recalculate(uuid) to anon, authenticated;

commit;
