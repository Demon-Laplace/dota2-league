begin;

create or replace view public.v_leaderboard
with (security_invoker = true)
as
with eligible_members as (
  select
    sm.season_id,
    sm.player_id
  from public.season_memberships sm
  where sm.join_status in ('active', 'captain')
),
match_stats as (
  select
    mp.season_id,
    mp.player_id,
    count(*) filter (
      where m.status = 'approved'
        and m.winner_side is not null
    ) as matches_played,
    count(*) filter (
      where m.status = 'approved'
        and m.winner_side is not null
        and mp.result = 'win'
    ) as wins,
    count(*) filter (
      where m.status = 'approved'
        and m.winner_side is not null
        and mp.result = 'loss'
    ) as losses
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  group by mp.season_id, mp.player_id
),
ledger_totals as (
  select
    sl.season_id,
    sl.player_id,
    sum(sl.points_delta) as score_delta_total
  from public.score_ledger sl
  group by sl.season_id, sl.player_id
)
select
  em.season_id,
  em.player_id,
  p.display_name,
  private.season_initial_score(em.season_id)::numeric(10, 2) as initial_score,
  coalesce(ms.matches_played, 0) as matches_played,
  coalesce(ms.wins, 0) as wins,
  coalesce(ms.losses, 0) as losses,
  case
    when coalesce(ms.matches_played, 0) = 0 then 0::numeric(5, 2)
    else round((coalesce(ms.wins, 0)::numeric / ms.matches_played::numeric) * 100, 2)
  end as win_rate,
  (
    private.season_initial_score(em.season_id)
    + coalesce(lt.score_delta_total, 0)
  )::numeric(10, 2) as score_total,
  dense_rank() over (
    partition by em.season_id
    order by
      (
        private.season_initial_score(em.season_id)
        + coalesce(lt.score_delta_total, 0)
      ) desc,
      coalesce(ms.wins, 0) desc,
      coalesce(ms.matches_played, 0) desc,
      p.display_name asc
  ) as rank
from eligible_members em
join public.players p
  on p.id = em.player_id
left join match_stats ms
  on ms.season_id = em.season_id
 and ms.player_id = em.player_id
left join ledger_totals lt
  on lt.season_id = em.season_id
 and lt.player_id = em.player_id;

comment on view public.v_leaderboard is 'Season leaderboard aggregated from score_ledger and approved matches with recorded winners.';

grant select on public.v_leaderboard to anon, authenticated;

commit;
