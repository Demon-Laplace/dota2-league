create or replace function public.record_match_result(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_double_downs jsonb default '[]'::jsonb,
  p_match_date date default timezone('utc', now())::date
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
    jsonb_build_object('double_downs', coalesce(p_double_downs, '[]'::jsonb)),
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
