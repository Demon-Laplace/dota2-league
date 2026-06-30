begin;

create or replace function public.manual_adjust_score(
  p_season_id uuid,
  p_player_id uuid,
  p_points_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry_id uuid;
  v_anchor_match_date date := (timezone('Asia/Shanghai', now()) - interval '2 hour')::date;
  v_anchor_match_id uuid;
  v_anchor_match_no integer;
begin
  if p_points_delta is null or p_points_delta = 0 then
    raise exception 'points_delta must be non-zero.'
      using errcode = '22023';
  end if;

  if coalesce(nullif(trim(p_reason), ''), '') = '' then
    raise exception 'A reason is required for manual score adjustments.'
      using errcode = '22023';
  end if;

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to adjust scores for this season.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.season_memberships sm
    where sm.season_id = p_season_id
      and sm.player_id = p_player_id
      and sm.join_status in ('active', 'captain')
  ) then
    raise exception 'Player % is not an active member of season %.', p_player_id, p_season_id
      using errcode = '42501';
  end if;

  select
    m.id,
    m.match_no
  into
    v_anchor_match_id,
    v_anchor_match_no
  from public.matches m
  where m.season_id = p_season_id
    and m.match_date = v_anchor_match_date
  order by m.match_no desc, m.created_at desc
  limit 1;

  insert into public.manual_score_adjustments (
    season_id,
    player_id,
    points_delta,
    reason,
    created_by,
    metadata
  )
  values (
    p_season_id,
    p_player_id,
    p_points_delta,
    p_reason,
    v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'adjusted_by', v_actor,
      'anchor_match_date', v_anchor_match_date,
      'anchor_match_id', v_anchor_match_id,
      'anchor_match_no', v_anchor_match_no
    ))
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

comment on function public.manual_adjust_score(uuid, uuid, numeric, text) is
  'Creates a manual score adjustment record anchored to the current Beijing business-day tail, after the latest recorded match for that date when one exists.';

revoke all on function public.manual_adjust_score(uuid, uuid, numeric, text) from public;
grant execute on function public.manual_adjust_score(uuid, uuid, numeric, text) to authenticated;

create or replace function public.revoke_manual_score_adjustment(
  p_adjustment_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry public.manual_score_adjustments%rowtype;
begin
  select *
  into v_entry
  from public.manual_score_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception 'Manual score adjustment % not found.', p_adjustment_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_entry.season_id) then
    raise exception 'You do not have permission to revoke this manual score adjustment.'
      using errcode = '42501';
  end if;

  if v_entry.revoked_at is not null then
    raise exception 'This manual score adjustment has already been revoked.'
      using errcode = '22023';
  end if;

  update public.manual_score_adjustments
  set revoked_at = timezone('utc', now()),
      revoked_by = v_actor,
      revoked_reason = nullif(trim(p_reason), '')
  where id = p_adjustment_id;

  return p_adjustment_id;
end;
$$;

revoke all on function public.revoke_manual_score_adjustment(uuid, text) from public;
grant execute on function public.revoke_manual_score_adjustment(uuid, text) to authenticated;

commit;
