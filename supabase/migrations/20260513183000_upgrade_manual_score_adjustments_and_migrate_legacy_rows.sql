create table if not exists public.manual_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  points_delta numeric(10, 2) not null check (points_delta <> 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.manual_score_adjustments is 'Manual score additions or deductions stored separately from score_ledger so they can be composed on the frontend like participation points.';

create index if not exists manual_score_adjustments_season_player_idx
  on public.manual_score_adjustments (season_id, player_id);
create index if not exists manual_score_adjustments_active_idx
  on public.manual_score_adjustments (season_id, revoked_at, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'manual_score_adjustments_set_updated_at'
      and tgrelid = 'public.manual_score_adjustments'::regclass
  ) then
    create trigger manual_score_adjustments_set_updated_at
      before update on public.manual_score_adjustments
      for each row execute function public.tg_set_updated_at();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'audit_manual_score_adjustments'
      and tgrelid = 'public.manual_score_adjustments'::regclass
  ) then
    create trigger audit_manual_score_adjustments
      after insert or update or delete on public.manual_score_adjustments
      for each row execute function private.audit_row_change();
  end if;
end;
$$;

alter table public.manual_score_adjustments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manual_score_adjustments'
      and policyname = 'manual_score_adjustments_select_authenticated'
  ) then
    create policy manual_score_adjustments_select_authenticated
      on public.manual_score_adjustments
      for select
      to authenticated
      using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'manual_score_adjustments'
      and policyname = 'manual_score_adjustments_select_anon_public'
  ) then
    create policy manual_score_adjustments_select_anon_public
      on public.manual_score_adjustments
      for select
      to anon
      using (
        exists (
          select 1
          from public.seasons s
          where s.id = manual_score_adjustments.season_id
            and s.is_public
        )
      );
  end if;
end;
$$;

grant select on public.manual_score_adjustments to anon, authenticated;

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

comment on function public.manual_adjust_score(uuid, uuid, numeric, text) is
  'Creates a manual score adjustment record for a player in a season and anchors it after the current business day''s recorded matches.';

revoke all on function public.manual_adjust_score(uuid, uuid, numeric, text) from public;
revoke all on function public.revoke_manual_score_adjustment(uuid, text) from public;
grant execute on function public.manual_adjust_score(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.revoke_manual_score_adjustment(uuid, text) to authenticated;

with legacy_manual_adjustments as (
  select
    sl.id,
    sl.season_id,
    sl.player_id,
    sl.points_delta,
    sl.reason,
    sl.created_by,
    coalesce(sl.metadata, '{}'::jsonb) as metadata,
    sl.created_at,
    rollback_row.created_by as revoked_by,
    rollback_row.created_at as revoked_at,
    nullif(trim(rollback_row.reason), '') as revoked_reason,
    derived.anchor_match_date,
    anchor_match.id as anchor_match_id,
    anchor_match.match_no as anchor_match_no
  from public.score_ledger sl
  left join lateral (
    select
      child.created_by,
      child.created_at,
      child.reason
    from public.score_ledger child
    where child.reversal_of_id = sl.id
    order by child.created_at desc, child.id desc
    limit 1
  ) rollback_row on true
  left join lateral (
    select (timezone('Asia/Shanghai', sl.created_at) - interval '2 hour')::date as anchor_match_date
  ) derived on true
  left join lateral (
    select
      m.id,
      m.match_no
    from public.matches m
    where m.season_id = sl.season_id
      and m.match_date = derived.anchor_match_date
    order by m.match_no desc, m.created_at desc
    limit 1
  ) anchor_match on true
  where sl.entry_type = 'manual_adjustment'
),
inserted as (
  insert into public.manual_score_adjustments (
    id,
    season_id,
    player_id,
    points_delta,
    reason,
    created_by,
    revoked_by,
    revoked_at,
    revoked_reason,
    metadata,
    created_at,
    updated_at
  )
  select
    legacy.id,
    legacy.season_id,
    legacy.player_id,
    legacy.points_delta,
    legacy.reason,
    legacy.created_by,
    legacy.revoked_by,
    legacy.revoked_at,
    legacy.revoked_reason,
    legacy.metadata
      || jsonb_strip_nulls(jsonb_build_object(
        'adjusted_by', case when legacy.metadata ? 'adjusted_by' then null else legacy.created_by end,
        'anchor_match_date', case when legacy.metadata ? 'anchor_match_date' then null else legacy.anchor_match_date end,
        'anchor_match_id', case when legacy.metadata ? 'anchor_match_id' then null else legacy.anchor_match_id end,
        'anchor_match_no', case when legacy.metadata ? 'anchor_match_no' then null else legacy.anchor_match_no end
      )),
    legacy.created_at,
    coalesce(legacy.revoked_at, legacy.created_at, timezone('utc', now()))
  from legacy_manual_adjustments legacy
  on conflict (id) do nothing
  returning id
),
legacy_rows_to_delete as (
  select sl.id
  from public.score_ledger sl
  where sl.entry_type = 'manual_adjustment'
  union
  select child.id
  from public.score_ledger child
  join public.score_ledger parent
    on parent.id = child.reversal_of_id
  where parent.entry_type = 'manual_adjustment'
)
delete from public.score_ledger sl
where sl.id in (select id from legacy_rows_to_delete);
