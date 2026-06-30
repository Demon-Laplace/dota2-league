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
  v_rule_mode text := 'standard';
  v_is_exhibition boolean := false;
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

  begin
    v_is_exhibition := coalesce((v_match.metadata ->> 'is_exhibition')::boolean, false);
  exception
    when others then
      v_is_exhibition := false;
  end;

  if v_is_exhibition then
    v_rule_mode := 'exhibition';
  end if;

  if v_is_exhibition then
    v_win_points := coalesce((v_rule_config ->> 'exhibition_win_points')::numeric, (v_rule_config ->> 'win_points')::numeric, 3);
    v_loss_points := coalesce((v_rule_config ->> 'exhibition_loss_points')::numeric, (v_rule_config ->> 'loss_points')::numeric, 0);
    v_power_gap_step := greatest(coalesce((v_rule_config ->> 'exhibition_power_gap_step')::integer, (v_rule_config ->> 'power_gap_step')::integer, 0), 0);
    v_power_gap_delta := greatest(coalesce((v_rule_config ->> 'exhibition_power_gap_delta')::numeric, (v_rule_config ->> 'power_gap_delta')::numeric, 0), 0);
  else
    v_win_points := coalesce((v_rule_config ->> 'win_points')::numeric, 3);
    v_loss_points := coalesce((v_rule_config ->> 'loss_points')::numeric, 0);
    v_power_gap_step := greatest(coalesce((v_rule_config ->> 'power_gap_step')::integer, 0), 0);
    v_power_gap_delta := greatest(coalesce((v_rule_config ->> 'power_gap_delta')::numeric, 0), 0);
  end if;
  v_participation_points := coalesce((v_rule_config ->> 'participation_points')::numeric, 0);

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
          'Match #%s %s%s.',
          v_match.match_no,
          case when v_is_exhibition then 'exhibition ' else '' end,
          case when sp.side = v_match.winner_side then 'win' else 'loss' end
        )
      else
        format(
          'Match #%s %s%s. Power adjust %s (%s vs %s).',
          v_match.match_no,
          case when v_is_exhibition then 'exhibition ' else '' end,
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
      'power_gap_delta', v_power_gap_delta,
      'rule_mode', v_rule_mode,
      'is_exhibition', v_is_exhibition
    )
  from scored_players sp
  where (sp.participation_points + sp.result_points + sp.power_adjustment_points) <> 0;

  perform private.apply_pending_item_usages(p_match_id, p_actor);
end;
$$;

create or replace function public.record_match_result(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_double_downs jsonb default '[]'::jsonb,
  p_match_date date default timezone('utc', now())::date,
  p_is_exhibition boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match_id uuid;
  v_match_no integer;
  v_player_id uuid;
begin
  if not public.can_submit_matches(p_season_id) then
    raise exception 'You do not have permission to record matches for season %.', p_season_id
      using errcode = '42501';
  end if;

  if p_winner_side is not null and p_winner_side not in ('radiant', 'dire') then
    raise exception 'winner_side must be radiant, dire, or null.'
      using errcode = '22023';
  end if;

  if array_length(p_radiant_player_ids, 1) <> 5 or array_length(p_dire_player_ids, 1) <> 5 then
    raise exception 'Exactly 5 players are required on each side.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct submitted.player_id)
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as submitted(player_id)
  ) <> 10 then
    raise exception 'A recorded match must contain 10 distinct players.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as submitted(player_id)
    left join public.season_memberships sm
      on sm.season_id = p_season_id
     and sm.player_id = submitted.player_id
     and sm.join_status in ('active', 'captain')
    where sm.player_id is null
  ) then
    raise exception 'All recorded players must be active members of the selected season.'
      using errcode = '42501';
  end if;

  v_match_no := private.next_match_no(p_season_id);

  insert into public.matches (
    season_id,
    match_no,
    match_date,
    status,
    winner_side,
    notes,
    metadata,
    created_by,
    submitted_by,
    approved_by,
    submitted_at,
    approved_at
  )
  values (
    p_season_id,
    v_match_no,
    coalesce(p_match_date, timezone('utc', now())::date),
    'approved',
    p_winner_side,
    p_note,
    jsonb_build_object(
      'double_downs', coalesce(p_double_downs, '[]'::jsonb),
      'is_exhibition', coalesce(p_is_exhibition, false)
    ),
    v_actor,
    v_actor,
    v_actor,
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_match_id;

  foreach v_player_id in array p_radiant_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      v_match_id,
      p_season_id,
      v_player_id,
      'radiant',
      array_position(p_radiant_player_ids, v_player_id)
    );
  end loop;

  foreach v_player_id in array p_dire_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      v_match_id,
      p_season_id,
      v_player_id,
      'dire',
      array_position(p_dire_player_ids, v_player_id)
    );
  end loop;

  perform private.post_match_score_entries(v_match_id, v_actor);
  perform private.apply_match_double_downs(v_match_id, p_double_downs, v_actor);

  return v_match_id;
end;
$$;

create or replace function public.record_match_result_backfill(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default timezone('utc', now())::date,
  p_double_downs jsonb default '[]'::jsonb,
  p_is_exhibition boolean default false
)
returns uuid
language sql
security definer
set search_path = public, private
as $$
  select public.record_match_result(
    p_season_id,
    p_radiant_player_ids,
    p_dire_player_ids,
    p_winner_side,
    p_note,
    p_double_downs,
    p_match_date,
    p_is_exhibition
  );
$$;

create or replace function public.update_match_result(
  p_match_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default null,
  p_double_downs jsonb default '[]'::jsonb,
  p_is_exhibition boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
  v_player_id uuid;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_match.season_id) then
    raise exception 'You do not have permission to edit this match.'
      using errcode = '42501';
  end if;

  if p_winner_side is not null and p_winner_side not in ('radiant', 'dire') then
    raise exception 'winner_side must be radiant, dire, or null.'
      using errcode = '22023';
  end if;

  if array_length(p_radiant_player_ids, 1) <> 5 or array_length(p_dire_player_ids, 1) <> 5 then
    raise exception 'Exactly 5 players are required on each side.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct submitted.player_id)
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as submitted(player_id)
  ) <> 10 then
    raise exception 'A recorded match must contain 10 distinct players.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as submitted(player_id)
    left join public.season_memberships sm
      on sm.season_id = v_match.season_id
     and sm.player_id = submitted.player_id
     and sm.join_status in ('active', 'captain')
    where sm.player_id is null
  ) then
    raise exception 'All recorded players must be active members of the selected season.'
      using errcode = '42501';
  end if;

  delete from public.score_ledger
  where match_id = p_match_id;

  delete from public.match_players
  where match_id = p_match_id;

  update public.matches
  set match_date = coalesce(p_match_date, match_date),
      status = 'approved',
      winner_side = p_winner_side,
      notes = p_note,
      metadata = jsonb_build_object(
        'double_downs', coalesce(p_double_downs, '[]'::jsonb),
        'is_exhibition', coalesce(p_is_exhibition, false)
      ),
      submitted_by = v_actor,
      approved_by = v_actor,
      submitted_at = timezone('utc', now()),
      approved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_match_id;

  foreach v_player_id in array p_radiant_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      p_match_id,
      v_match.season_id,
      v_player_id,
      'radiant',
      array_position(p_radiant_player_ids, v_player_id)
    );
  end loop;

  foreach v_player_id in array p_dire_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      p_match_id,
      v_match.season_id,
      v_player_id,
      'dire',
      array_position(p_dire_player_ids, v_player_id)
    );
  end loop;

  perform private.post_match_score_entries(p_match_id, v_actor);
  perform private.apply_match_double_downs(p_match_id, p_double_downs, v_actor);

  return p_match_id;
end;
$$;

drop function if exists public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric);
create or replace function public.set_season_match_point_rules(
  p_season_id uuid,
  p_win_points numeric,
  p_loss_points numeric,
  p_power_gap_step integer default null,
  p_power_gap_delta numeric default null,
  p_participation_points numeric default null,
  p_rule_mode text default 'standard'
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_season public.seasons;
  v_existing_rule_config jsonb;
  v_next_power_gap_step integer;
  v_next_power_gap_delta numeric;
  v_next_participation_points numeric;
  v_rule_mode text := case when coalesce(p_rule_mode, 'standard') = 'exhibition' then 'exhibition' else 'standard' end;
  v_win_key text := case when coalesce(p_rule_mode, 'standard') = 'exhibition' then 'exhibition_win_points' else 'win_points' end;
  v_loss_key text := case when coalesce(p_rule_mode, 'standard') = 'exhibition' then 'exhibition_loss_points' else 'loss_points' end;
  v_step_key text := case when coalesce(p_rule_mode, 'standard') = 'exhibition' then 'exhibition_power_gap_step' else 'power_gap_step' end;
  v_delta_key text := case when coalesce(p_rule_mode, 'standard') = 'exhibition' then 'exhibition_power_gap_delta' else 'power_gap_delta' end;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to update season %.', p_season_id
      using errcode = '42501';
  end if;

  if p_power_gap_step is not null and p_power_gap_step < 0 then
    raise exception 'power_gap_step must be zero or greater.'
      using errcode = '22023';
  end if;

  if p_power_gap_delta is not null and p_power_gap_delta < 0 then
    raise exception 'power_gap_delta must be zero or greater.'
      using errcode = '22023';
  end if;

  select coalesce(rule_config, '{}'::jsonb)
  into v_existing_rule_config
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  v_next_power_gap_step := coalesce(
    p_power_gap_step,
    nullif(v_existing_rule_config ->> v_step_key, '')::integer,
    case when v_rule_mode = 'exhibition' then coalesce(nullif(v_existing_rule_config ->> 'power_gap_step', '')::integer, 0) else 0 end
  );
  v_next_power_gap_delta := coalesce(
    p_power_gap_delta,
    nullif(v_existing_rule_config ->> v_delta_key, '')::numeric,
    case when v_rule_mode = 'exhibition' then coalesce(nullif(v_existing_rule_config ->> 'power_gap_delta', '')::numeric, 0) else 0 end
  );
  v_next_participation_points := coalesce(
    p_participation_points,
    nullif(v_existing_rule_config ->> 'participation_points', '')::numeric,
    0
  );

  update public.seasons
  set rule_config = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(rule_config, '{}'::jsonb),
              array[v_win_key],
              to_jsonb(coalesce(p_win_points, case when v_rule_mode = 'exhibition' then coalesce(nullif(v_existing_rule_config ->> 'win_points', '')::numeric, 3) else 3 end)),
              true
            ),
            array[v_loss_key],
            to_jsonb(coalesce(p_loss_points, case when v_rule_mode = 'exhibition' then coalesce(nullif(v_existing_rule_config ->> 'loss_points', '')::numeric, 0) else 0 end)),
            true
          ),
          array[v_step_key],
          to_jsonb(v_next_power_gap_step),
          true
        ),
        array[v_delta_key],
        to_jsonb(v_next_power_gap_delta),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if v_rule_mode = 'standard' then
    update public.seasons
    set rule_config = jsonb_set(
          rule_config,
          '{participation_points}',
          to_jsonb(v_next_participation_points),
          true
        ),
        updated_at = timezone('utc', now())
    where id = p_season_id
    returning * into v_season;
  end if;

  return v_season;
end;
$$;

create or replace view public.v_match_detail
with (security_invoker = true)
as
select
  m.id as match_id,
  m.season_id,
  s.code as season_code,
  s.name as season_name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name as created_by_name,
  submitter.display_name as submitted_by_name,
  approver.display_name as approved_by_name,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', mp.player_id,
        'display_name', p.display_name,
        'side', mp.side,
        'slot_no', mp.slot_no,
        'is_captain', mp.is_captain,
        'result', mp.result,
        'rank_no_snapshot', mp.rank_no_snapshot,
        'power_value_snapshot', mp.power_value_snapshot
      )
      order by case when mp.side = 'radiant' then 0 else 1 end, mp.slot_no
    ) filter (where mp.id is not null),
    '[]'::jsonb
  ) as players
from public.matches m
join public.seasons s
  on s.id = m.season_id
left join public.profiles creator
  on creator.id = m.created_by
left join public.profiles submitter
  on submitter.id = m.submitted_by
left join public.profiles approver
  on approver.id = m.approved_by
left join public.match_players mp
  on mp.match_id = m.id
left join public.players p
  on p.id = mp.player_id
group by
  m.id,
  m.season_id,
  s.code,
  s.name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name,
  submitter.display_name,
  approver.display_name;

revoke all on function public.record_match_result(uuid, uuid[], uuid[], text, text, jsonb, date, boolean) from public;
grant execute on function public.record_match_result(uuid, uuid[], uuid[], text, text, jsonb, date, boolean) to authenticated;

revoke all on function public.record_match_result_backfill(uuid, uuid[], uuid[], text, text, date, jsonb, boolean) from public;
grant execute on function public.record_match_result_backfill(uuid, uuid[], uuid[], text, text, date, jsonb, boolean) to authenticated;

revoke all on function public.update_match_result(uuid, uuid[], uuid[], text, text, date, jsonb, boolean) from public;
grant execute on function public.update_match_result(uuid, uuid[], uuid[], text, text, date, jsonb, boolean) to authenticated;

revoke all on function public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric, text) from public;
grant execute on function public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric, text) to authenticated;

commit;
