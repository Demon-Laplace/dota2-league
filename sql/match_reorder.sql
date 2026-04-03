create or replace function public.move_match_within_day(
  p_match_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_date date;
  v_season_id uuid;
  v_match_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_temp_id uuid;
  v_base_created_at timestamptz;
begin
  if p_match_id is null then
    raise exception '必须指定要调整顺序的比赛记录';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception '调整方向必须是 up 或 down';
  end if;

  select
    season_id,
    coalesce(match_date, public.get_beijing_match_date(created_at))
  into
    v_season_id,
    v_match_date
  from public.matches
  where id = p_match_id;

  if v_match_date is null then
    raise exception '未找到要调整顺序的比赛记录';
  end if;

  select
    array_agg(id order by created_at, id),
    min(created_at)
  into
    v_match_ids,
    v_base_created_at
  from public.matches
  where season_id is not distinct from v_season_id
    and coalesce(match_date, public.get_beijing_match_date(created_at)) = v_match_date;

  if coalesce(array_length(v_match_ids, 1), 0) <= 1 then
    return;
  end if;

  v_current_index := array_position(v_match_ids, p_match_id);

  if v_current_index is null then
    raise exception '未找到要调整顺序的比赛记录';
  end if;

  v_target_index := case
    when p_direction = 'up' then v_current_index - 1
    else v_current_index + 1
  end;

  if v_target_index < 1 or v_target_index > array_length(v_match_ids, 1) then
    return;
  end if;

  v_temp_id := v_match_ids[v_current_index];
  v_match_ids[v_current_index] := v_match_ids[v_target_index];
  v_match_ids[v_target_index] := v_temp_id;

  with reordered as (
    select
      match_id,
      ordinality
    from unnest(v_match_ids) with ordinality as t(match_id, ordinality)
  )
  update public.matches m
  set created_at = v_base_created_at + ((reordered.ordinality - 1) * interval '1 second')
  from reordered
  where m.id = reordered.match_id;

  perform public.recalculate_all_scores();
end;
$$;

grant execute on function public.move_match_within_day(uuid, text) to anon, authenticated;
