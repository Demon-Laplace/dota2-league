begin;

alter table public.season_players
add column if not exists player_rank text;

update public.season_players
set player_rank = coalesce(player_rank, 'support')
where true;

alter table public.season_players
alter column player_rank set default 'support';

alter table public.season_players
alter column player_rank set not null;

alter table public.season_players
drop constraint if exists season_players_player_rank_check;

alter table public.season_players
add constraint season_players_player_rank_check
check (player_rank in ('core', 'support'));

create or replace function public.set_season_player_rank(
  p_player_id uuid,
  p_season_id uuid default null,
  p_player_rank text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
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

  if p_player_rank is not null and p_player_rank not in ('core', 'support') then
    raise exception '选手身份必须是 core 或 support';
  end if;

  if p_player_rank is null then
    if exists (
      select 1
      from public.match_results mr
      join public.matches m on m.id = mr.match_id
      where m.season_id = v_season_id
        and mr.player_id = p_player_id
    ) then
      raise exception '该选手已有本赛季比赛记录，不能取消参赛';
    end if;

    update public.seasons
    set koi_player_id = null
    where id = v_season_id
      and koi_player_id = p_player_id;

    delete from public.season_player_stats
    where season_id = v_season_id
      and player_id = p_player_id;

    delete from public.season_players
    where season_id = v_season_id
      and player_id = p_player_id;

    return null;
  end if;

  insert into public.season_players (season_id, player_id, player_rank)
  values (v_season_id, p_player_id, p_player_rank)
  on conflict (season_id, player_id) do update
  set player_rank = excluded.player_rank;

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
    (20 + coalesce(p.reward_floor_bonus, 0)) + coalesce(p.reward_extra_points, 0),
    coalesce(p.reward_floor_bonus, 0),
    coalesce(p.reward_extra_points, 0),
    0,
    0,
    0
  from public.players p
  where p.id = p_player_id
  on conflict (season_id, player_id) do nothing;

  return p_player_rank;
end;
$$;

grant execute on function public.set_season_player_rank(uuid, uuid, text) to anon, authenticated;

commit;
