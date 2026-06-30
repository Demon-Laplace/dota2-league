begin;

create or replace function public.reorder_matches_within_day(
  p_match_id uuid,
  p_target_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source public.matches%rowtype;
  v_target public.matches%rowtype;
  v_temp_match_no integer;
begin
  select *
  into v_source
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  select *
  into v_target
  from public.matches
  where id = p_target_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_target_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_source.season_id) then
    raise exception 'You do not have permission to reorder matches for season %.', v_source.season_id
      using errcode = '42501';
  end if;

  if v_source.season_id <> v_target.season_id then
    raise exception 'Matches must belong to the same season.'
      using errcode = '22023';
  end if;

  if v_source.match_date <> v_target.match_date then
    raise exception 'Matches must belong to the same match date.'
      using errcode = '22023';
  end if;

  if v_source.id = v_target.id or v_source.match_no = v_target.match_no then
    return jsonb_build_object(
      'source_match_id', v_source.id,
      'target_match_id', v_target.id,
      'source_match_no', v_source.match_no,
      'target_match_no', v_target.match_no
    );
  end if;

  select coalesce(max(m.match_no), 0) + 1
  into v_temp_match_no
  from public.matches m
  where m.season_id = v_source.season_id;

  update public.matches
  set match_no = v_temp_match_no,
      updated_at = timezone('utc', now())
  where id = v_source.id;

  update public.matches
  set match_no = v_source.match_no,
      updated_at = timezone('utc', now())
  where id = v_target.id;

  update public.matches
  set match_no = v_target.match_no,
      updated_at = timezone('utc', now())
  where id = v_source.id;

  return jsonb_build_object(
    'source_match_id', v_source.id,
    'target_match_id', v_target.id,
    'source_match_no', v_target.match_no,
    'target_match_no', v_source.match_no
  );
end;
$$;

revoke all on function public.reorder_matches_within_day(uuid, uuid) from public;
grant execute on function public.reorder_matches_within_day(uuid, uuid) to authenticated;

comment on function public.reorder_matches_within_day(uuid, uuid) is
  'Swaps match_no for two matches in the same season and match_date so recent-match drag sorting can persist.';

commit;
