begin;

create table if not exists public.historical_match_repairs (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.seasons(id) on delete restrict,
  match_id uuid,
  action text not null check (action in ('add', 'update', 'delete')),
  reason text not null check (btrim(reason) <> ''),
  actor_user_id uuid references public.profiles(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.historical_match_repairs
  is 'Long-lived audit trail for exceptional admin-only repairs to closed-season match records.';

create index if not exists historical_match_repairs_season_created_idx
  on public.historical_match_repairs (season_id, created_at desc);

alter table public.historical_match_repairs enable row level security;

drop policy if exists historical_match_repairs_admin_select on public.historical_match_repairs;
create policy historical_match_repairs_admin_select
  on public.historical_match_repairs
  for select
  to authenticated
  using (public.is_admin());

grant select on public.historical_match_repairs to authenticated;

create or replace function private.historical_match_repair_snapshot(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select jsonb_build_object(
    'match', to_jsonb(m),
    'players', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.side, mp.slot_no)
      from public.match_players mp
      where mp.match_id = m.id
    ), '[]'::jsonb),
    'score_ledger', coalesce((
      select jsonb_agg(to_jsonb(sl) order by sl.created_at, sl.id)
      from public.score_ledger sl
      where sl.match_id = m.id
    ), '[]'::jsonb),
    'official_assets', coalesce((
      select jsonb_agg(to_jsonb(oma) order by oma.created_at, oma.id)
      from public.official_match_assets oma
      where oma.match_id = m.id
    ), '[]'::jsonb),
    'official_snapshots', coalesce((
      select jsonb_agg(to_jsonb(oms) order by oms.created_at, oms.id)
      from public.official_match_snapshots oms
      where oms.match_id = m.id
    ), '[]'::jsonb)
  )
  from public.matches m
  where m.id = p_match_id;
$$;

do $$
declare
  v_season_id constant uuid := 'db1ad7fa-ab00-4f20-8f25-aacd93a885e2';
  v_match_id constant uuid := '87efc8e7-86b2-4a73-b8f0-096cf84d7567';
  v_match public.matches%rowtype;
  v_before jsonb;
begin
  select *
  into v_match
  from public.matches
  where id = v_match_id
  for update;

  if not found then
    raise exception 'Historical repair target match % was not found.', v_match_id;
  end if;

  if v_match.season_id <> v_season_id
    or v_match.match_no <> 51
    or v_match.match_date <> date '2026-06-30'
    or v_match.created_at < timestamptz '2026-07-07 00:00:00+00'
  then
    raise exception 'Historical repair target match % no longer matches the verified TI4 late-entry fingerprint.', v_match_id;
  end if;

  if exists (
    select 1
    from public.manual_score_adjustments msa
    where msa.metadata ->> 'anchor_match_id' = v_match_id::text
  ) then
    raise exception 'Historical repair target match % is referenced by a manual score adjustment.', v_match_id;
  end if;

  v_before := private.historical_match_repair_snapshot(v_match_id);
  perform private.cleanup_match_item_catalog_usages(v_match_id);

  delete from public.reward_donations where match_id = v_match_id;
  delete from public.score_ledger where match_id = v_match_id;
  delete from public.matches where id = v_match_id;

  insert into public.historical_match_repairs (
    season_id, match_id, action, reason, actor_user_id, before_data
  ) values (
    v_season_id,
    v_match_id,
    'delete',
    'Removed verified Action-created match #51 that was inserted after TI4 had ended.',
    null,
    v_before
  );
end;
$$;

create or replace function public.is_season_match_record_editable(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.seasons s
    where s.id = p_season_id
      and (
        s.status = any (array['draft', 'active'])
        or (
          s.status = 'closed'
          and public.is_admin()
          and current_setting('app.historical_repair_season_id', true) = p_season_id::text
        )
      )
  );
$$;

comment on function public.is_season_match_record_editable(uuid)
  is 'Allows normal writes only for draft/active seasons. Closed-season writes require an admin-only repair RPC transaction.';

create or replace function private.require_closed_season_history_repair(
  p_season_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.require_authenticated();

  if not public.is_admin() then
    raise exception 'Only admins may repair closed-season match history.'
      using errcode = '42501';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A repair reason is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.seasons s
    where s.id = p_season_id and s.status = 'closed'
  ) then
    raise exception 'Historical repairs are limited to closed seasons.'
      using errcode = '22023';
  end if;

  perform set_config('app.historical_repair_season_id', p_season_id::text, true);
end;
$$;

create or replace function public.admin_record_historical_match_repair(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default timezone('utc', now())::date,
  p_double_downs jsonb default '[]'::jsonb,
  p_is_exhibition boolean default false,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match_id uuid;
begin
  perform private.require_closed_season_history_repair(p_season_id, p_reason);

  v_match_id := public.record_match_result_backfill(
    p_season_id,
    p_radiant_player_ids,
    p_dire_player_ids,
    p_winner_side,
    p_note,
    p_match_date,
    p_double_downs,
    p_is_exhibition
  );

  insert into public.historical_match_repairs (
    season_id, match_id, action, reason, actor_user_id, after_data
  ) values (
    p_season_id,
    v_match_id,
    'add',
    btrim(p_reason),
    v_actor,
    private.historical_match_repair_snapshot(v_match_id)
  );

  return v_match_id;
end;
$$;

create or replace function public.admin_update_historical_match_repair(
  p_match_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default null,
  p_double_downs jsonb default '[]'::jsonb,
  p_is_exhibition boolean default false,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season_id uuid;
  v_before jsonb;
begin
  select m.season_id into v_season_id
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id using errcode = 'P0002';
  end if;

  perform private.require_closed_season_history_repair(v_season_id, p_reason);
  v_before := private.historical_match_repair_snapshot(p_match_id);

  perform public.update_match_result(
    p_match_id,
    p_radiant_player_ids,
    p_dire_player_ids,
    p_winner_side,
    p_note,
    p_match_date,
    p_double_downs,
    p_is_exhibition
  );

  insert into public.historical_match_repairs (
    season_id, match_id, action, reason, actor_user_id, before_data, after_data
  ) values (
    v_season_id,
    p_match_id,
    'update',
    btrim(p_reason),
    v_actor,
    v_before,
    private.historical_match_repair_snapshot(p_match_id)
  );

  return p_match_id;
end;
$$;

create or replace function public.admin_delete_historical_match_repair(
  p_match_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season_id uuid;
  v_before jsonb;
begin
  select m.season_id into v_season_id
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id using errcode = 'P0002';
  end if;

  perform private.require_closed_season_history_repair(v_season_id, p_reason);

  if exists (
    select 1
    from public.manual_score_adjustments msa
    where msa.metadata ->> 'anchor_match_id' = p_match_id::text
      and msa.revoked_at is null
  ) then
    raise exception 'This match anchors an active manual score adjustment. Revoke that adjustment first.'
      using errcode = '23503';
  end if;

  v_before := private.historical_match_repair_snapshot(p_match_id);
  perform private.cleanup_match_item_catalog_usages(p_match_id);
  delete from public.reward_donations where match_id = p_match_id;
  delete from public.score_ledger where match_id = p_match_id;
  delete from public.matches where id = p_match_id;

  insert into public.historical_match_repairs (
    season_id, match_id, action, reason, actor_user_id, before_data
  ) values (
    v_season_id,
    p_match_id,
    'delete',
    btrim(p_reason),
    v_actor,
    v_before
  );
end;
$$;

revoke all on function public.is_season_match_record_editable(uuid) from public;
revoke all on function public.admin_record_historical_match_repair(uuid, uuid[], uuid[], text, text, date, jsonb, boolean, text) from public;
revoke all on function public.admin_update_historical_match_repair(uuid, uuid[], uuid[], text, text, date, jsonb, boolean, text) from public;
revoke all on function public.admin_delete_historical_match_repair(uuid, text) from public;

grant execute on function public.is_season_match_record_editable(uuid) to authenticated;
grant execute on function public.admin_record_historical_match_repair(uuid, uuid[], uuid[], text, text, date, jsonb, boolean, text) to authenticated;
grant execute on function public.admin_update_historical_match_repair(uuid, uuid[], uuid[], text, text, date, jsonb, boolean, text) to authenticated;
grant execute on function public.admin_delete_historical_match_repair(uuid, text) to authenticated;

commit;
