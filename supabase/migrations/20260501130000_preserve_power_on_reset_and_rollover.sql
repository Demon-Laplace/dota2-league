begin;

create or replace function public.reset_current_season(
  p_season_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted_count integer := 0;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to reset season %.', p_season_id
      using errcode = '42501';
  end if;

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status
  )
  select
    p_season_id,
    p.id,
    'inactive'
  from public.players p
  where p.is_active
    and not exists (
      select 1
      from public.season_memberships sm
      where sm.season_id = p_season_id
        and sm.player_id = p.id
    );

  get diagnostics v_inserted_count = row_count;

  delete from public.score_ledger
  where season_id = p_season_id;

  delete from private.item_usages
  where season_id = p_season_id;

  delete from private.item_instances
  where season_id = p_season_id;

  delete from public.matches
  where season_id = p_season_id;

  delete from public.season_end_confirmations
  where season_id = p_season_id;

  update public.season_memberships
  set updated_at = timezone('utc', now())
  where season_id = p_season_id
    and join_status in ('inactive', 'active', 'captain');

  return v_inserted_count;
end;
$$;

comment on function public.reset_current_season(uuid)
  is 'Resets season-scoped scores, matches, confirmations, and player item inventory while preserving roster memberships, rank assignments, and the item catalog.';

create or replace function public.confirm_season_rollover(
  p_season_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season public.seasons%rowtype;
  v_role text;
  v_scorer_confirmation_count integer := 0;
  v_cutoff timestamptz;
  v_next_start timestamptz;
  v_next_end timestamptz;
  v_next_code text;
  v_next_name text;
  v_next_season_id uuid;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to close season %.', p_season_id
      using errcode = '42501';
  end if;

  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if v_season.status <> 'active' then
    raise exception 'Only active seasons may be closed.'
      using errcode = 'P0001';
  end if;

  v_cutoff := timezone(
    'utc',
    (
      date_trunc('day', timezone('Asia/Shanghai', coalesce(v_season.end_at, timezone('utc', now()))))
      + interval '1 day'
      + interval '6 hours'
    ) at time zone 'Asia/Shanghai'
  );

  if timezone('utc', now()) < v_cutoff then
    raise exception 'Season rollover is not yet open.'
      using errcode = 'P0001';
  end if;

  v_role := case
    when public.is_admin() then 'admin'
    else 'scorekeeper'
  end;

  insert into public.season_end_confirmations (
    season_id,
    user_id,
    role
  )
  values (
    p_season_id,
    v_actor,
    v_role
  )
  on conflict (season_id, user_id) do update
    set role = excluded.role;

  select count(*)
  into v_scorer_confirmation_count
  from public.season_end_confirmations sec
  where sec.season_id = p_season_id
    and sec.role = 'scorekeeper';

  if v_scorer_confirmation_count < 2 then
    return jsonb_build_object(
      'finalized', false,
      'scorer_confirmation_count', v_scorer_confirmation_count,
      'actor_role', v_role
    );
  end if;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id = p_season_id;

  v_next_start := date_trunc('month', timezone('Asia/Shanghai', coalesce(v_season.end_at, timezone('utc', now()))) + interval '1 month');
  v_next_end := (v_next_start + interval '1 month' - interval '1 second');
  v_next_code := to_char(v_next_start, 'YYYY-MM');
  v_next_name := format('%s 年 %s 月赛季', to_char(v_next_start, 'YYYY'), to_char(v_next_start, 'FMMM'));

  insert into public.seasons (
    code,
    name,
    status,
    is_public,
    start_at,
    end_at,
    rule_version,
    rule_config
  )
  values (
    v_next_code,
    v_next_name,
    'active',
    true,
    timezone('utc', v_next_start),
    timezone('utc', v_next_end),
    to_char(v_next_start, 'YYYY.MM'),
    coalesce(v_season.rule_config, '{}'::jsonb)
  )
  on conflict (code) do update
    set status = 'active',
        is_public = true,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        rule_version = excluded.rule_version,
        rule_config = excluded.rule_config,
        updated_at = timezone('utc', now())
  returning id, code, name
  into v_next_season_id, v_next_code, v_next_name;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id <> v_next_season_id
    and status = 'active';

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status,
    rank_no,
    joined_at
  )
  select
    v_next_season_id,
    sm.player_id,
    sm.join_status,
    sm.rank_no,
    sm.joined_at
  from public.season_memberships sm
  where sm.season_id = p_season_id
  on conflict (season_id, player_id) do update
    set join_status = excluded.join_status,
        rank_no = excluded.rank_no,
        joined_at = excluded.joined_at,
        updated_at = timezone('utc', now());

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status
  )
  select
    v_next_season_id,
    p.id,
    'inactive'
  from public.players p
  where p.is_active
    and not exists (
      select 1
      from public.season_memberships sm
      where sm.season_id = v_next_season_id
        and sm.player_id = p.id
    );

  insert into public.season_item_catalog_settings (
    season_id,
    item_catalog_id,
    initial_quantity
  )
  select
    v_next_season_id,
    sics.item_catalog_id,
    sics.initial_quantity
  from public.season_item_catalog_settings sics
  where sics.season_id = p_season_id
  on conflict (season_id, item_catalog_id) do update
    set initial_quantity = excluded.initial_quantity,
        updated_at = timezone('utc', now());

  return jsonb_build_object(
    'finalized', true,
    'scorer_confirmation_count', v_scorer_confirmation_count,
    'actor_role', v_role,
    'closed_season_id', v_season.id,
    'closed_season_code', v_season.code,
    'closed_season_name', v_season.name,
    'next_season_id', v_next_season_id,
    'next_season_name', v_next_name,
    'archive_required', true
  );
end;
$$;

comment on function public.confirm_season_rollover(uuid)
  is 'Closes the active season after 2 scorekeeper confirmations, opens the next season with copied memberships/rank assignments/item settings, and signals that the closed season should be archived externally.';

commit;
