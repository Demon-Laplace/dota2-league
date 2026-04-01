begin;

create or replace function public.reset_current_season(
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_synced_count integer := 0;
begin
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

  delete from public.signup_queue
  where season_id = v_season_id;

  delete from public.daily_player_roster
  where season_id = v_season_id;

  delete from public.match_results
  where match_id in (
    select id
    from public.matches
    where season_id = v_season_id
  );

  delete from public.matches
  where season_id = v_season_id;

  delete from public.match_days
  where season_id = v_season_id;

  delete from public.season_player_stats
  where season_id = v_season_id;

  delete from public.season_players
  where season_id = v_season_id;

  insert into public.season_players (season_id, player_id)
  select v_season_id, p.id
  from public.players p
  on conflict (season_id, player_id) do nothing;

  get diagnostics v_synced_count = row_count;

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
    10,
    20,
    0,
    0,
    0
  from public.players p
  on conflict (season_id, player_id) do nothing;

  perform public.recalculate_all_scores();

  return v_synced_count;
end;
$$;

grant execute on function public.reset_current_season(uuid) to anon, authenticated;

commit;
