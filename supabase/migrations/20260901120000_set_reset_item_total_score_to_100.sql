begin;

create or replace function private.get_player_total_score_for_reset(
  p_season_id uuid,
  p_player_id uuid,
  p_excluded_match_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_matches_played integer := 0;
  v_ledger_score numeric := 0;
  v_manual_score numeric := 0;
  v_hero_reward_score numeric := 0;
  v_participation_score numeric := 0;
  v_participation_rule public.season_participation_point_rules%rowtype;
begin
  select
    private.season_initial_score(p_season_id) + coalesce(sum(sl.points_delta), 0)
  into v_ledger_score
  from public.score_ledger sl
  where sl.season_id = p_season_id
    and sl.player_id = p_player_id
    and (p_excluded_match_id is null or sl.match_id is distinct from p_excluded_match_id);

  select coalesce(sum(msa.points_delta), 0)
  into v_manual_score
  from public.manual_score_adjustments msa
  where msa.season_id = p_season_id
    and msa.player_id = p_player_id
    and msa.revoked_at is null;

  select coalesce(sum(hra.points_delta), 0)
  into v_hero_reward_score
  from public.hero_reward_adjustments hra
  where hra.season_id = p_season_id
    and hra.player_id = p_player_id
    and hra.revoked_at is null
    and (p_excluded_match_id is null or hra.match_id is distinct from p_excluded_match_id);

  select count(*)::integer
  into v_matches_played
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  where mp.season_id = p_season_id
    and mp.player_id = p_player_id
    and m.status = 'approved'
    and m.winner_side is not null
    and (p_excluded_match_id is null or m.id is distinct from p_excluded_match_id);

  select rule.*
  into v_participation_rule
  from public.season_participation_point_rules rule
  where rule.season_id = p_season_id
    and rule.matches_played <= v_matches_played
  order by rule.matches_played desc
  limit 1;

  if found then
    v_participation_score := v_participation_rule.participation_points
      + case
          when v_participation_rule.is_open_ended
          then greatest(v_matches_played - v_participation_rule.matches_played, 0)
            * coalesce(v_participation_rule.points_per_extra_match, 0)
          else 0
        end;
  end if;

  return round(
    coalesce(v_ledger_score, 0)
    + coalesce(v_manual_score, 0)
    + coalesce(v_hero_reward_score, 0)
    + coalesce(v_participation_score, 0),
    2
  );
end;
$$;

revoke all on function private.get_player_total_score_for_reset(uuid, uuid, uuid) from public;

comment on function private.get_player_total_score_for_reset(uuid, uuid, uuid) is
  'Returns the displayed total score used by the @ reset effect: ledger, participation, manual adjustments, and hero rewards.';

do $$
declare
  v_function_def text;
  v_original_block text;
  v_replaced_block text;
  v_original_order text;
  v_replaced_order text;
  v_original_metadata text;
  v_replaced_metadata text;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid, jsonb, uuid)'::regprocedure)
  into v_function_def;

  if v_function_def is null then
    raise exception 'Function private.apply_match_double_downs(uuid, jsonb, uuid) not found.';
  end if;

  v_original_block := $block$
    if v_applied_group.applied_special = '@' then
      if v_applied_group.base_points_delta > 0 then
        select coalesce(
          v_initial_score + sum(
            case
              when sl.entry_type = 'match_result'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta - v_participation_points
              when sl.entry_type = 'item_effect'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta
              else 0
            end
          ),
          v_initial_score
        )
        into v_pre_match_competitive_total
        from public.score_ledger sl
        where sl.season_id = v_match.season_id
          and sl.player_id = v_applied_group.target_player_id
          and sl.reversal_of_id is null
          and sl.match_id is distinct from p_match_id;

        if coalesce(v_pre_match_competitive_total, v_initial_score) >= v_initial_score then
          raise exception '仅当胜负积分低于赛季初始分时，才可使用重置效果道具。'
            using errcode = '22023';
        end if;

        select coalesce(
          v_initial_score + sum(
            case
              when sl.entry_type = 'match_result'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta - v_participation_points
              when sl.entry_type = 'item_effect'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta
              else 0
            end
          ),
          v_initial_score
        )
        into v_competitive_total
        from public.score_ledger sl
        where sl.season_id = v_match.season_id
          and sl.player_id = v_applied_group.target_player_id
          and sl.reversal_of_id is null;

        v_applied_group.applied_points_delta := v_initial_score - coalesce(v_competitive_total, v_initial_score);

        if v_applied_group.applied_points_delta = 0 then
          raise exception '当前胜负积分已回到赛季初始分，无需使用重置效果道具。'
            using errcode = '22023';
        end if;

        v_reason := format('%s · 胜场重置', v_reason);
      else
        v_applied_group.applied_points_delta := 0;
      end if;
    end if;
$block$;

  v_replaced_block := $block$
    if v_applied_group.applied_special = '@' then
      if v_applied_group.base_points_delta > 0 then
        v_pre_match_competitive_total := private.get_player_total_score_for_reset(
          v_match.season_id,
          v_applied_group.target_player_id,
          p_match_id
        );

        if coalesce(v_pre_match_competitive_total, 100) >= 100 then
          raise exception '仅当总积分低于 100 分时，才可使用重置效果道具。'
            using errcode = '22023';
        end if;

        v_competitive_total := private.get_player_total_score_for_reset(
          v_match.season_id,
          v_applied_group.target_player_id,
          null
        );
        v_applied_group.applied_points_delta := 100 - coalesce(v_competitive_total, 100);

        if v_applied_group.applied_points_delta = 0 then
          raise exception '当前总积分已为 100 分，无需使用重置效果道具。'
            using errcode = '22023';
        end if;

        v_reason := format('%s · 总分重置至 100', v_reason);
      else
        v_applied_group.applied_points_delta := 0;
      end if;
    end if;
$block$;

  if position(v_original_block in v_function_def) = 0 then
    raise exception 'Failed to patch private.apply_match_double_downs; expected @ reset block was not found.';
  end if;
  v_function_def := replace(v_function_def, v_original_block, v_replaced_block);

  v_original_order := $ordering$
    select *
    from pg_temp.match_item_applied_groups maig
    order by maig.target_player_id, maig.group_kind, maig.applied_group_id
$ordering$;
  v_replaced_order := $ordering$
    select *
    from pg_temp.match_item_applied_groups maig
    order by
      maig.target_player_id,
      case when maig.applied_special = '@' then 1 else 0 end,
      maig.group_kind,
      maig.applied_group_id
$ordering$;

  if position(v_original_order in v_function_def) = 0 then
    raise exception 'Failed to patch private.apply_match_double_downs; expected applied-group ordering was not found.';
  end if;
  v_function_def := replace(v_function_def, v_original_order, v_replaced_order);

  v_original_metadata := $metadata$
          'reset_to_initial_win_score', (v_applied_group.applied_special = '@' and v_applied_group.base_points_delta > 0),
$metadata$;
  v_replaced_metadata := $metadata$
          'reset_to_initial_win_score', (v_applied_group.applied_special = '@' and v_applied_group.base_points_delta > 0),
          'reset_total_score_to', case
            when v_applied_group.applied_special = '@' and v_applied_group.base_points_delta > 0 then 100
            else null
          end,
$metadata$;

  if position(v_original_metadata in v_function_def) = 0 then
    raise exception 'Failed to patch private.apply_match_double_downs; expected reset metadata was not found.';
  end if;
  v_function_def := replace(v_function_def, v_original_metadata, v_replaced_metadata);

  execute v_function_def;
end;
$$;

comment on function private.apply_match_double_downs(uuid, jsonb, uuid) is
  'Applies match item usages and score effects. The @ effect applies last for each target and changes the displayed total score to exactly 100 when the pre-match total is below 100.';

commit;
