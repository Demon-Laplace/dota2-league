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
ledger_rows as (
  select
    sl.season_id,
    sl.player_id,
    sl.points_delta,
    case
      when sl.entry_type = 'rollback' and parent.entry_type is not null then parent.entry_type
      else sl.entry_type
    end as effective_entry_type
  from public.score_ledger sl
  left join public.score_ledger parent
    on parent.id = sl.reversal_of_id
),
ledger_totals as (
  select
    lr.season_id,
    lr.player_id,
    sum(lr.points_delta) as score_delta_total,
    sum(lr.points_delta) filter (
      where lr.effective_entry_type = 'item_effect'
    ) as bonus_delta_total
  from ledger_rows lr
  group by lr.season_id, lr.player_id
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
    - coalesce(lt.bonus_delta_total, 0)
  )::numeric(10, 2) as win_loss_score,
  coalesce(lt.bonus_delta_total, 0)::numeric(10, 2) as bonus_score,
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

comment on view public.v_leaderboard is 'Season leaderboard aggregated from score_ledger and approved matches with item_effect split into bonus_score.';

grant select on public.v_leaderboard to anon, authenticated;

do $$
declare
  v_function_identity text;
  v_function_def text;
  v_patched_def text;
begin
  foreach v_function_identity in array array[
    'public.get_item_catalog_usage_summary(uuid)',
    'private.sync_item_purchase_reward_donations(uuid)',
    'public.revoke_player_item_inventory(uuid,uuid,uuid,text)',
    'public.get_item_inventory_activity_log(uuid,uuid)'
  ]
  loop
    if to_regprocedure(v_function_identity) is null then
      continue;
    end if;

    select pg_get_functiondef(to_regprocedure(v_function_identity))
    into v_function_def;

    v_patched_def := regexp_replace(
      v_function_def,
      'when\s+coalesce\(iu\.effect_payload\s*->>\s*''source_kind'',\s*''''\)\s*=\s*''match_double_down''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''mode'',\s*''''\)\s*=\s*''team''',
      'when coalesce(iu.effect_payload ->> ''mode'', '''') = ''team''',
      'g'
    );

    if v_patched_def <> v_function_def then
      execute v_patched_def;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_season_id uuid;
begin
  if to_regprocedure('private.sync_item_purchase_reward_donations(uuid)') is null then
    return;
  end if;

  for v_season_id in
    select distinct ii.season_id
    from private.item_instances ii
    where ii.season_id is not null
  loop
    perform private.sync_item_purchase_reward_donations(v_season_id);
  end loop;
end;
$$;

commit;
