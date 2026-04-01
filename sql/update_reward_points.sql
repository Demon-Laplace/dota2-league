begin;

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
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  if p_reward_points is null or p_reward_points < 0 then
    raise exception '赞助额必须是大于等于 0 的整数';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
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
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      p_reward_points,
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

grant execute on function public.update_player_reward_points(uuid, integer, uuid) to anon, authenticated;

commit;
