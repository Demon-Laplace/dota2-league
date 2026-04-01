begin;

alter table public.players
add column if not exists reward_floor_bonus integer not null default 0;

alter table public.season_player_stats
add column if not exists reward_floor_bonus integer not null default 0;

alter table public.players
add column if not exists reward_extra_points integer not null default 0;

alter table public.season_player_stats
add column if not exists reward_extra_points integer not null default 0;

update public.players
set
  reward_extra_points = greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0),
  reward_points = (20 + coalesce(reward_floor_bonus, 0)) + greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0)
where true;

update public.season_player_stats
set
  reward_extra_points = greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0),
  reward_points = (20 + coalesce(reward_floor_bonus, 0)) + greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0)
where true;

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
    select 20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0)
    into v_reward_minimum
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select 20 + coalesce(p.reward_floor_bonus, 0)
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

create or replace function public.add_player_reward_extra(
  p_player_id uuid,
  p_extra_amount integer,
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
  v_total integer;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  if p_extra_amount is null or p_extra_amount < 0 then
    raise exception '额外赞助额必须是大于等于 0 的整数';
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
      20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0),
      coalesce(sps.reward_extra_points, p.reward_extra_points, 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select
      20 + coalesce(p.reward_floor_bonus, 0),
      coalesce(p.reward_extra_points, 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    where p.id = p_player_id;
  end if;

  v_current_extra := coalesce(v_current_extra, 0) + p_extra_amount;
  v_total := v_reward_minimum + v_current_extra;

  update public.players
  set
    reward_extra_points = v_current_extra,
    reward_points = v_total
  where id = p_player_id;

  if v_season_id is not null then
    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
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
      v_current_extra,
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

grant execute on function public.add_player_reward_extra(uuid, integer, uuid) to anon, authenticated;

commit;
