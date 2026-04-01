begin;

drop view if exists public.current_season_leaderboard;
drop view if exists public.leaderboard;

alter table public.players
alter column score type numeric(10,2) using score::numeric(10,2);

alter table public.players
alter column score set default 10.00;

alter table public.season_player_stats
alter column score type numeric(10,2) using score::numeric(10,2);

alter table public.season_player_stats
alter column score set default 10.00;

alter table public.match_results
alter column score_change type numeric(10,2) using score_change::numeric(10,2);

alter table public.seasons
add column if not exists koi_player_id uuid references public.players(id);

create or replace function public.set_season_koi(
  p_player_id uuid,
  p_season_id uuid default null
)
returns uuid
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

  if p_player_id is not null and not exists (
    select 1
    from public.season_players
    where season_id = v_season_id
      and player_id = p_player_id
  ) then
    raise exception '该选手不在当前赛季名单中';
  end if;

  update public.seasons
  set koi_player_id = p_player_id
  where id = v_season_id;

  perform public.recalculate_all_scores();

  return p_player_id;
end;
$$;

grant execute on function public.set_season_koi(uuid, uuid) to anon, authenticated;

create or replace view public.leaderboard as
select
  p.id,
  p.display_name,
  p.score,
  p.reward_points,
  p.games_played,
  p.wins,
  p.losses,
  case
    when p.games_played = 0 then 0::numeric
    else round((p.wins::numeric / p.games_played::numeric) * 100, 2)
  end as win_rate
from public.players p;

create or replace view public.current_season_leaderboard as
select
  sps.id,
  sps.season_id,
  s.name as season_name,
  p.id as player_id,
  p.display_name,
  sps.score,
  sps.reward_points,
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

grant select on public.leaderboard to anon, authenticated;
grant select on public.current_season_leaderboard to anon, authenticated;

commit;
