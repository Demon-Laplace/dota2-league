begin;

alter table public.match_players
  add column if not exists rank_no_snapshot integer
    check (rank_no_snapshot is null or rank_no_snapshot between 1 and 12),
  add column if not exists power_value_snapshot integer
    check (power_value_snapshot is null or power_value_snapshot >= 0);

comment on column public.match_players.rank_no_snapshot is
  'Season rank bucket captured when the match roster was recorded. Keeps historical scoring stable when ranks later change.';

comment on column public.match_players.power_value_snapshot is
  'Resolved rank power value captured when the match roster was recorded. Used for match power-gap scoring recalculation.';

create or replace function private.resolve_season_rank_power_value(
  p_rule_config jsonb,
  p_rank_no integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_rule_config jsonb := coalesce(p_rule_config, '{}'::jsonb);
  v_rank_count integer := 2;
  v_custom_value integer;
begin
  if p_rank_no is null or p_rank_no < 1 then
    return null;
  end if;

  begin
    v_rank_count := greatest(1, least(coalesce(nullif(v_rule_config ->> 'rank_count', '')::integer, 2), 12));
  exception
    when others then
      v_rank_count := 2;
  end;

  begin
    v_custom_value := nullif(v_rule_config -> 'rank_power_values' ->> p_rank_no::text, '')::integer;
  exception
    when others then
      v_custom_value := null;
  end;

  if v_custom_value is not null then
    return greatest(v_custom_value, 0);
  end if;

  if p_rank_no > v_rank_count then
    return 0;
  end if;

  return greatest(v_rank_count - p_rank_no + 1, 0);
end;
$$;

update public.match_players mp
set rank_no_snapshot = coalesce(
      mp.rank_no_snapshot,
      (
        select sm.rank_no
        from public.season_memberships sm
        where sm.season_id = mp.season_id
          and sm.player_id = mp.player_id
      )
    ),
    power_value_snapshot = coalesce(
      mp.power_value_snapshot,
      private.resolve_season_rank_power_value(
        (
          select s.rule_config
          from public.seasons s
          where s.id = mp.season_id
        ),
        coalesce(
          mp.rank_no_snapshot,
          (
            select sm.rank_no
            from public.season_memberships sm
            where sm.season_id = mp.season_id
              and sm.player_id = mp.player_id
          )
        )
      )
    ),
    updated_at = timezone('utc', now())
where mp.rank_no_snapshot is null
   or mp.power_value_snapshot is null;

create or replace function private.recalculate_season_scores(
  p_season_id uuid,
  p_actor uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match record;
  v_deleted_entries integer := 0;
  v_recalculated_matches integer := 0;
begin
  delete from public.score_ledger sl
  where sl.season_id = p_season_id
    and (
      (
        sl.entry_type = 'match_result'
        and sl.match_id is not null
        and sl.source_table = 'public.matches'
      )
      or (
        sl.entry_type = 'item_effect'
        and sl.match_id is not null
        and sl.source_table = 'public.matches'
      )
      or (
        sl.entry_type = 'rollback'
        and sl.metadata ? 'rolled_back_match_id'
      )
    );

  get diagnostics v_deleted_entries = row_count;

  update public.match_players mp
  set result = 'pending',
      updated_at = timezone('utc', now())
  where mp.season_id = p_season_id;

  for v_match in
    select
      m.id,
      case
        when jsonb_typeof(m.metadata -> 'double_downs') = 'array' then m.metadata -> 'double_downs'
        else '[]'::jsonb
      end as double_downs
    from public.matches m
    where m.season_id = p_season_id
      and m.status = 'approved'
    order by m.match_date, m.match_no, m.created_at, m.id
  loop
    perform private.post_match_score_entries(v_match.id, p_actor);
    perform private.apply_match_double_downs(v_match.id, v_match.double_downs, p_actor);
    v_recalculated_matches := v_recalculated_matches + 1;
  end loop;

  return jsonb_build_object(
    'season_id', p_season_id,
    'matches_recalculated', v_recalculated_matches,
    'ledger_entries_deleted', v_deleted_entries
  );
end;
$$;

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
      coalesce(
        mp.power_value_snapshot,
        private.resolve_season_rank_power_value(v_rule_config, coalesce(mp.rank_no_snapshot, sm.rank_no)),
        0
      ) as player_power_value
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

create or replace function public.submit_match(
  p_season_id uuid,
  p_players jsonb,
  p_winner_side text default null,
  p_match_date date default timezone('utc', now())::date,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
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
  v_rule_config jsonb;
begin
  if not public.can_submit_matches(p_season_id) then
    raise exception 'You do not have permission to submit matches for season %.', p_season_id
      using errcode = '42501';
  end if;

  if p_winner_side is not null and p_winner_side not in ('radiant', 'dire') then
    raise exception 'winner_side must be radiant, dire, or null.'
      using errcode = '22023';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 10 then
    raise exception 'Exactly 10 players are required.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct x.player_id)
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
  ) <> 10 then
    raise exception 'A recorded match must contain 10 distinct players.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    where x.side not in ('radiant', 'dire')
       or x.slot_no not between 1 and 5
  ) then
    raise exception 'Each player must have side radiant/dire and slot_no between 1 and 5.'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from (
      select x.side, x.slot_no
      from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
      group by x.side, x.slot_no
      having count(*) > 1
    ) duplicated_slots
  ) > 0 then
    raise exception 'Each team slot may only be used once per match.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
    left join public.season_memberships sm
      on sm.season_id = p_season_id
     and sm.player_id = x.player_id
     and sm.join_status in ('active', 'captain')
    where sm.player_id is null
  ) then
    raise exception 'All submitted players must be active members of the target season.'
      using errcode = '42501';
  end if;

  select s.rule_config
  into v_rule_config
  from public.seasons s
  where s.id = p_season_id;

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
    submitted_at
  )
  values (
    p_season_id,
    v_match_no,
    coalesce(p_match_date, timezone('utc', now())::date),
    'submitted',
    p_winner_side,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb),
    v_actor,
    v_actor,
    timezone('utc', now())
  )
  returning id into v_match_id;

  insert into public.match_players (
    match_id,
    season_id,
    player_id,
    side,
    slot_no,
    is_captain,
    rank_no_snapshot,
    power_value_snapshot
  )
  select
    v_match_id,
    p_season_id,
    x.player_id,
    x.side,
    x.slot_no,
    coalesce(x.is_captain, false),
    sm.rank_no,
    private.resolve_season_rank_power_value(v_rule_config, sm.rank_no)
  from jsonb_to_recordset(p_players) as x(player_id uuid, side text, slot_no int, is_captain boolean)
  left join public.season_memberships sm
    on sm.season_id = p_season_id
   and sm.player_id = x.player_id;

  return v_match_id;
end;
$$;

create or replace function public.approve_match(
  p_match_id uuid,
  p_approved boolean default true,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
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

  if not public.can_review_matches(v_match.season_id) then
    raise exception 'You do not have permission to review this match.'
      using errcode = '42501';
  end if;

  if v_match.status not in ('submitted', 'rejected') then
    raise exception 'Only submitted or rejected matches can be reviewed. Current status: %.', v_match.status
      using errcode = 'P0001';
  end if;

  if p_approved then
    update public.matches
    set status = 'approved',
        approved_by = v_actor,
        approved_at = timezone('utc', now()),
        notes = coalesce(p_notes, notes),
        updated_at = timezone('utc', now())
    where id = p_match_id;

    perform private.recalculate_season_scores(v_match.season_id, v_actor);
  else
    update public.matches
    set status = 'rejected',
        approved_by = v_actor,
        approved_at = timezone('utc', now()),
        notes = coalesce(p_notes, notes),
        updated_at = timezone('utc', now())
    where id = p_match_id;

    update public.match_players
    set result = 'pending',
        updated_at = timezone('utc', now())
    where match_id = p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'status', case when p_approved then 'approved' else 'rejected' end
  );
end;
$$;

create or replace function public.update_match_result(
  p_match_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default null,
  p_double_downs jsonb default '[]'::jsonb
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
  v_rule_config jsonb;
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

  select s.rule_config
  into v_rule_config
  from public.seasons s
  where s.id = v_match.season_id;

  delete from public.score_ledger
  where match_id = p_match_id;

  delete from public.match_players
  where match_id = p_match_id;

  update public.matches
  set match_date = coalesce(p_match_date, match_date),
      status = 'approved',
      winner_side = p_winner_side,
      notes = p_note,
      metadata = jsonb_build_object('double_downs', coalesce(p_double_downs, '[]'::jsonb)),
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
      slot_no,
      rank_no_snapshot,
      power_value_snapshot
    )
    values (
      p_match_id,
      v_match.season_id,
      v_player_id,
      'radiant',
      array_position(p_radiant_player_ids, v_player_id),
      (
        select sm.rank_no
        from public.season_memberships sm
        where sm.season_id = v_match.season_id
          and sm.player_id = v_player_id
      ),
      (
        select private.resolve_season_rank_power_value(v_rule_config, sm.rank_no)
        from public.season_memberships sm
        where sm.season_id = v_match.season_id
          and sm.player_id = v_player_id
      )
    );
  end loop;

  foreach v_player_id in array p_dire_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no,
      rank_no_snapshot,
      power_value_snapshot
    )
    values (
      p_match_id,
      v_match.season_id,
      v_player_id,
      'dire',
      array_position(p_dire_player_ids, v_player_id),
      (
        select sm.rank_no
        from public.season_memberships sm
        where sm.season_id = v_match.season_id
          and sm.player_id = v_player_id
      ),
      (
        select private.resolve_season_rank_power_value(v_rule_config, sm.rank_no)
        from public.season_memberships sm
        where sm.season_id = v_match.season_id
          and sm.player_id = v_player_id
      )
    );
  end loop;

  perform private.recalculate_season_scores(v_match.season_id, v_actor);

  return p_match_id;
end;
$$;

create or replace function public.delete_match_and_recalculate(
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
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
    raise exception 'You do not have permission to delete this match.'
      using errcode = '42501';
  end if;

  perform private.cleanup_match_item_catalog_usages(p_match_id);

  delete from public.score_ledger
  where match_id = p_match_id;

  delete from public.matches
  where id = p_match_id;

  perform private.recalculate_season_scores(v_match.season_id, v_actor);
end;
$$;

drop function if exists public.set_season_match_point_rules(uuid, numeric, numeric);
create or replace function public.set_season_match_point_rules(
  p_season_id uuid,
  p_win_points numeric,
  p_loss_points numeric,
  p_power_gap_step integer default null,
  p_power_gap_delta numeric default null,
  p_participation_points numeric default null
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
    nullif(v_existing_rule_config ->> 'power_gap_step', '')::integer,
    0
  );
  v_next_power_gap_delta := coalesce(
    p_power_gap_delta,
    nullif(v_existing_rule_config ->> 'power_gap_delta', '')::numeric,
    0
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
              '{win_points}',
              to_jsonb(coalesce(p_win_points, 3)),
              true
            ),
            '{loss_points}',
            to_jsonb(coalesce(p_loss_points, 0)),
            true
          ),
          '{power_gap_step}',
          to_jsonb(v_next_power_gap_step),
          true
        ),
        '{power_gap_delta}',
        to_jsonb(v_next_power_gap_delta),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

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

  return v_season;
end;
$$;

create or replace function public.recalculate_season_scores(
  p_season_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
begin
  if not exists (
    select 1
    from public.seasons s
    where s.id = p_season_id
  ) then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to recalculate season %.', p_season_id
      using errcode = '42501';
  end if;

  return private.recalculate_season_scores(p_season_id, v_actor);
end;
$$;

create or replace function public.recalculate_all_scores()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season_id uuid;
  v_result jsonb;
  v_recalculated_matches integer := 0;
  v_recalculated_seasons integer := 0;
  v_deleted_entries integer := 0;
begin
  for v_season_id in
    select s.id
    from public.seasons s
    where public.can_adjust_scores(s.id)
    order by s.created_at, s.id
  loop
    v_recalculated_seasons := v_recalculated_seasons + 1;
    v_result := private.recalculate_season_scores(v_season_id, v_actor);
    v_recalculated_matches := v_recalculated_matches + coalesce((v_result ->> 'matches_recalculated')::integer, 0);
    v_deleted_entries := v_deleted_entries + coalesce((v_result ->> 'ledger_entries_deleted')::integer, 0);
  end loop;

  return jsonb_build_object(
    'seasons_recalculated', v_recalculated_seasons,
    'matches_recalculated', v_recalculated_matches,
    'ledger_entries_deleted', v_deleted_entries
  );
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

revoke all on function public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric) from public;
grant execute on function public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric) to authenticated;

revoke all on function public.recalculate_season_scores(uuid) from public;
grant execute on function public.recalculate_season_scores(uuid) to authenticated;

comment on function public.set_season_match_point_rules(uuid, numeric, numeric, integer, numeric, numeric) is
  'Updates season match scoring rules, including base win/loss deltas, optional participation points, and power-gap correction settings.';

comment on function public.recalculate_season_scores(uuid) is
  'Rebuilds one season''s match-result and match-linked item score ledger entries from the first approved match onward.';

commit;
