begin;

create or replace view public.v_player_teammate_stats
with (security_invoker = true)
as
with eligible_matches as (
  select
    m.id as match_id,
    m.season_id,
    s.code as season_code,
    s.name as season_name,
    date_trunc('month', m.match_date::timestamp)::date as month_start,
    m.winner_side
  from public.matches m
  join public.seasons s
    on s.id = m.season_id
  where m.status = 'approved'
    and m.winner_side is not null
)
select
  em.season_id,
  em.season_code,
  em.season_name,
  em.month_start,
  mp.player_id,
  p.display_name as player_name,
  mate.player_id as related_player_id,
  mate_player.display_name as related_player_name,
  count(*)::integer as games,
  count(*) filter (where mp.side = em.winner_side)::integer as wins,
  round(
    ((count(*) filter (where mp.side = em.winner_side))::numeric * 100)
    / nullif(count(*), 0),
    2
  ) as win_rate,
  round(
    (((count(*) filter (where mp.side = em.winner_side)) + 1)::numeric * 100)
    / (count(*) + 2),
    2
  ) as adjusted_win_rate
from eligible_matches em
join public.match_players mp
  on mp.match_id = em.match_id
join public.players p
  on p.id = mp.player_id
join public.match_players mate
  on mate.match_id = mp.match_id
 and mate.player_id <> mp.player_id
 and mate.side = mp.side
join public.players mate_player
  on mate_player.id = mate.player_id
group by
  em.season_id,
  em.season_code,
  em.season_name,
  em.month_start,
  mp.player_id,
  p.display_name,
  mate.player_id,
  mate_player.display_name;

comment on view public.v_player_teammate_stats is
  'Directional teammate win-rate aggregates by season and month, derived from approved matches with recorded winners.';

create or replace view public.v_player_opponent_stats
with (security_invoker = true)
as
with eligible_matches as (
  select
    m.id as match_id,
    m.season_id,
    s.code as season_code,
    s.name as season_name,
    date_trunc('month', m.match_date::timestamp)::date as month_start,
    m.winner_side
  from public.matches m
  join public.seasons s
    on s.id = m.season_id
  where m.status = 'approved'
    and m.winner_side is not null
)
select
  em.season_id,
  em.season_code,
  em.season_name,
  em.month_start,
  mp.player_id,
  p.display_name as player_name,
  opp.player_id as related_player_id,
  opp_player.display_name as related_player_name,
  count(*)::integer as games,
  count(*) filter (where mp.side = em.winner_side)::integer as wins,
  round(
    ((count(*) filter (where mp.side = em.winner_side))::numeric * 100)
    / nullif(count(*), 0),
    2
  ) as win_rate,
  round(
    (((count(*) filter (where mp.side = em.winner_side)) + 1)::numeric * 100)
    / (count(*) + 2),
    2
  ) as adjusted_win_rate
from eligible_matches em
join public.match_players mp
  on mp.match_id = em.match_id
join public.players p
  on p.id = mp.player_id
join public.match_players opp
  on opp.match_id = mp.match_id
 and opp.player_id <> mp.player_id
 and opp.side <> mp.side
join public.players opp_player
  on opp_player.id = opp.player_id
group by
  em.season_id,
  em.season_code,
  em.season_name,
  em.month_start,
  mp.player_id,
  p.display_name,
  opp.player_id,
  opp_player.display_name;

comment on view public.v_player_opponent_stats is
  'Directional opponent win-rate aggregates by season and month, derived from approved matches with recorded winners.';

grant select on public.v_player_teammate_stats to anon, authenticated;
grant select on public.v_player_opponent_stats to anon, authenticated;

commit;
