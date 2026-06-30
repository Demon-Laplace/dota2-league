update public.seasons
set rule_config = jsonb_set(
      jsonb_set(coalesce(rule_config, '{}'::jsonb), '{win_points}', to_jsonb(1), true),
      '{loss_points}',
      to_jsonb(-1),
      true
    ),
    updated_at = timezone('utc', now());

create or replace function public.set_season_rank_count(
  p_season_id uuid,
  p_rank_count integer
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rank_count integer := greatest(1, least(coalesce(p_rank_count, 0), 12));
  v_season public.seasons;
  v_rank_labels jsonb := '{}'::jsonb;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  if coalesce(p_rank_count, 0) < 1 or coalesce(p_rank_count, 0) > 12 then
    raise exception 'rank_count must be between 1 and 12.'
      using errcode = '22023';
  end if;

  select case
    when jsonb_typeof(rule_config -> 'rank_labels') = 'object' then rule_config -> 'rank_labels'
    else '{}'::jsonb
  end
  into v_rank_labels
  from public.seasons
  where id = p_season_id;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_rank_labels
  from jsonb_each(v_rank_labels)
  where key ~ '^\d+$'
    and key::integer between 1 and v_rank_count;

  update public.seasons
  set rule_config = jsonb_set(
        jsonb_set(
          coalesce(rule_config, '{}'::jsonb),
          '{rank_count}',
          to_jsonb(v_rank_count),
          true
        ),
        '{rank_labels}',
        v_rank_labels,
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  update public.season_memberships
  set rank_no = null,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and rank_no is not null
    and rank_no > v_rank_count;

  return v_season;
end;
$$;

create or replace function public.set_season_rank_label(
  p_season_id uuid,
  p_rank_no integer,
  p_label text default null
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rank_count integer;
  v_rank_labels jsonb := '{}'::jsonb;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  select greatest(
           1,
           least(12, coalesce(nullif(s.rule_config ->> 'rank_count', '')::integer, 2))
         ),
         case
           when jsonb_typeof(s.rule_config -> 'rank_labels') = 'object' then s.rule_config -> 'rank_labels'
           else '{}'::jsonb
         end
  into v_rank_count, v_rank_labels
  from public.seasons s
  where s.id = p_season_id
  for update;

  if v_rank_count is null then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if p_rank_no < 1 or p_rank_no > v_rank_count then
    raise exception 'rank_no must be between 1 and % for season %.', v_rank_count, p_season_id
      using errcode = '22023';
  end if;

  if v_label is null then
    v_rank_labels := v_rank_labels - p_rank_no::text;
  else
    v_rank_labels := jsonb_set(v_rank_labels, array[p_rank_no::text], to_jsonb(v_label), true);
  end if;

  update public.seasons
  set rule_config = jsonb_set(
        coalesce(rule_config, '{}'::jsonb),
        '{rank_labels}',
        v_rank_labels,
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  return v_season;
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

revoke all on function public.set_season_rank_label(uuid, integer, text) from public;
revoke all on function public.update_match_result(uuid, uuid[], uuid[], text, text, date, jsonb) from public;

grant execute on function public.set_season_rank_label(uuid, integer, text) to authenticated;
grant execute on function public.update_match_result(uuid, uuid[], uuid[], text, text, date, jsonb) to authenticated;
