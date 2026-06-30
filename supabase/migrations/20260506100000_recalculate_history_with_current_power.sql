begin;

create or replace function private.post_match_score_entries(
  p_match_id uuid,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match public.matches%rowtype;
  v_rule_config jsonb;
  v_win_points numeric(10, 2);
  v_loss_points numeric(10, 2);
  v_participation_points numeric(10, 2);
  v_power_gap_step integer;
  v_power_gap_delta numeric(10, 2);
begin
  select m.*
  into v_match
  from public.matches m
  where m.id = p_match_id;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  select s.rule_config
  into v_rule_config
  from public.seasons s
  where s.id = v_match.season_id;

  if exists (
    select 1
    from public.score_ledger sl
    where sl.match_id = p_match_id
      and sl.entry_type <> 'rollback'
  ) then
    raise exception 'Score ledger entries already exist for match %.', p_match_id
      using errcode = '23505';
  end if;

  v_win_points := coalesce((v_rule_config ->> 'win_points')::numeric, 3);
  v_loss_points := coalesce((v_rule_config ->> 'loss_points')::numeric, 0);
  v_participation_points := coalesce((v_rule_config ->> 'participation_points')::numeric, 0);
  v_power_gap_step := greatest(coalesce((v_rule_config ->> 'power_gap_step')::integer, 0), 0);
  v_power_gap_delta := greatest(coalesce((v_rule_config ->> 'power_gap_delta')::numeric, 0), 0);

  update public.match_players
  set result = case
    when v_match.winner_side is null then 'pending'
    when side = v_match.winner_side then 'win'
    else 'loss'
  end,
      updated_at = timezone('utc', now())
  where match_id = p_match_id;

  insert into public.score_ledger (
    season_id,
    player_id,
    match_id,
    entry_type,
    points_delta,
    reason,
    source_table,
    source_id,
    created_by,
    metadata
  )
  with player_snapshots as (
    select
      mp.season_id,
      mp.player_id,
      mp.match_id,
      mp.side,
      case
        when sm.player_id is not null then coalesce(
          private.resolve_season_rank_power_value(v_rule_config, sm.rank_no),
          0
        )
        else coalesce(
          mp.power_value_snapshot,
          private.resolve_season_rank_power_value(v_rule_config, mp.rank_no_snapshot),
          0
        )
      end as player_power_value
    from public.match_players mp
    left join public.season_memberships sm
      on sm.season_id = mp.season_id
     and sm.player_id = mp.player_id
    where mp.match_id = p_match_id
  ),
  team_totals as (
    select
      side,
      coalesce(sum(greatest(player_power_value, 0)), 0) as team_power_total
    from player_snapshots
    group by side
  ),
  scored_players as (
    select
      ps.season_id,
      ps.player_id,
      ps.match_id,
      ps.side,
      ps.player_power_value,
      coalesce(tt.team_power_total, 0) as team_power_total,
      coalesce(opp.team_power_total, 0) as opponent_power_total,
      v_participation_points as participation_points,
      case
        when v_match.winner_side is null then 0::numeric
        when ps.side = v_match.winner_side then v_win_points
        else v_loss_points
      end as result_points,
      case
        when v_match.winner_side is null then 0::numeric
        when v_power_gap_step <= 0 or v_power_gap_delta = 0 then 0::numeric
        when coalesce(tt.team_power_total, 0) = coalesce(opp.team_power_total, 0) then 0::numeric
        else
          floor(abs(coalesce(tt.team_power_total, 0) - coalesce(opp.team_power_total, 0))::numeric / v_power_gap_step::numeric)
          * v_power_gap_delta
          * case
              when coalesce(tt.team_power_total, 0) > coalesce(opp.team_power_total, 0) then -1
              else 1
            end
      end as power_adjustment_points
    from player_snapshots ps
    left join team_totals tt
      on tt.side = ps.side
    left join team_totals opp
      on opp.side = case when ps.side = 'radiant' then 'dire' else 'radiant' end
  )
  select
    sp.season_id,
    sp.player_id,
    sp.match_id,
    'match_result',
    sp.participation_points + sp.result_points + sp.power_adjustment_points,
    case
      when v_match.winner_side is null then format('Match #%s approved without winner.', v_match.match_no)
      when sp.power_adjustment_points = 0 then
        format(
          'Match #%s %s.',
          v_match.match_no,
          case when sp.side = v_match.winner_side then 'win' else 'loss' end
        )
      else
        format(
          'Match #%s %s. Power adjust %s (%s vs %s).',
          v_match.match_no,
          case when sp.side = v_match.winner_side then 'win' else 'loss' end,
          trim(to_char(sp.power_adjustment_points, 'FM999999990.##')),
          sp.team_power_total,
          sp.opponent_power_total
        )
    end,
    'public.matches',
    p_match_id,
    p_actor,
    jsonb_build_object(
      'winner_side', v_match.winner_side,
      'match_no', v_match.match_no,
      'participation_points', sp.participation_points,
      'result_points', sp.result_points,
      'power_adjustment_points', sp.power_adjustment_points,
      'player_power_value', sp.player_power_value,
      'team_power_total', sp.team_power_total,
      'opponent_power_total', sp.opponent_power_total,
      'power_gap', abs(sp.team_power_total - sp.opponent_power_total),
      'power_gap_step', v_power_gap_step,
      'power_gap_delta', v_power_gap_delta
    )
  from scored_players sp
  where (sp.participation_points + sp.result_points + sp.power_adjustment_points) <> 0;

  perform private.apply_pending_item_usages(p_match_id, p_actor);
end;
$$;

comment on function private.post_match_score_entries(uuid, uuid) is
  'Posts match-result score entries using the current season power assignments when recalculating a season.';

commit;
