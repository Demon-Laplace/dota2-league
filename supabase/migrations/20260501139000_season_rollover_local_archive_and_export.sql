begin;

create or replace function public.is_season_editable(p_season_id uuid)
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
      and s.status = 'active'
  );
$$;

comment on function public.is_season_editable(uuid)
  is 'Returns true only when the target season is still active and may accept mutable operations.';

create or replace function public.can_submit_matches(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_editable(p_season_id)
    and (
      public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
    );
$$;

create or replace function public.can_apply_items(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_editable(p_season_id)
    and (
      public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['item_operator'])
    );
$$;

create or replace function public.can_adjust_scores(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_editable(p_season_id)
    and (
      public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
    );
$$;

drop policy if exists reward_donations_admin_insert on public.reward_donations;
create policy reward_donations_admin_insert
  on public.reward_donations
  for insert
  to authenticated
  with check (
    public.is_admin()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

drop policy if exists reward_donations_admin_update on public.reward_donations;
create policy reward_donations_admin_update
  on public.reward_donations
  for update
  to authenticated
  using (
    public.is_admin()
    and season_id is not null
    and public.is_season_editable(season_id)
  )
  with check (
    public.is_admin()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

drop policy if exists reward_donations_admin_delete on public.reward_donations;
create policy reward_donations_admin_delete
  on public.reward_donations
  for delete
  to authenticated
  using (
    public.is_admin()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

create or replace function private.purge_season_records(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_season_id is null then
    return;
  end if;

  delete from public.seasons
  where id = p_season_id;
end;
$$;

comment on function private.purge_season_records(uuid)
  is 'Deletes a season row so all season-scoped records are removed through cascading foreign keys.';

create or replace function public.delete_exported_season(
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
  v_match_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins may export and delete season %.', p_season_id
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

  if v_season.status = 'active' then
    raise exception 'Active season % cannot be exported and deleted.', p_season_id
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_match_count
  from public.matches
  where season_id = p_season_id;

  perform private.purge_season_records(p_season_id);

  return jsonb_build_object(
    'season_id', p_season_id,
    'season_name', v_season.name,
    'season_status', v_season.status,
    'match_count', v_match_count,
    'deleted_by', v_actor,
    'deleted', true
  );
end;
$$;

comment on function public.delete_exported_season(uuid)
  is 'Deletes a non-active season and all of its season-scoped records after the archive has been exported elsewhere.';

revoke all on function public.is_season_editable(uuid) from public;
grant execute on function public.is_season_editable(uuid) to authenticated;

revoke all on function public.delete_exported_season(uuid) from public;
grant execute on function public.delete_exported_season(uuid) to authenticated;

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
  v_match_count integer := 0;
  v_retain_closed_season boolean := false;
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

  if v_role <> 'admin' and v_scorer_confirmation_count < 2 then
    return jsonb_build_object(
      'finalized', false,
      'scorer_confirmation_count', v_scorer_confirmation_count,
      'actor_role', v_role
    );
  end if;

  select count(*)
  into v_match_count
  from public.matches
  where season_id = p_season_id;

  v_retain_closed_season := v_match_count > 0;

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
    jsonb_set(
      coalesce(v_season.rule_config, '{}'::jsonb),
      '{rank_count}',
      to_jsonb(greatest(1, least(coalesce(nullif(v_season.rule_config ->> 'rank_count', '')::integer, 3), 12))),
      true
    )
  )
  on conflict (code) do update
    set status = 'active',
        is_public = true,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        rule_version = excluded.rule_version,
        rule_config = excluded.rule_config,
        updated_at = timezone('utc', now())
  returning id into v_next_season_id;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id <> v_next_season_id
    and status = 'active';

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
    set initial_quantity = excluded.initial_quantity;

  if v_retain_closed_season then
    update public.seasons
    set status = 'closed',
        updated_at = timezone('utc', now())
    where id = p_season_id;
  else
    perform private.purge_season_records(p_season_id);
  end if;

  return jsonb_build_object(
    'finalized', true,
    'scorer_confirmation_count', v_scorer_confirmation_count,
    'actor_role', v_role,
    'next_season_id', v_next_season_id,
    'next_season_name', v_next_name,
    'closed_season_id', p_season_id,
    'closed_season_code', v_season.code,
    'closed_season_name', v_season.name,
    'closed_season_match_count', v_match_count,
    'closed_season_retained_in_database', v_retain_closed_season
  );
end;
$$;

comment on function public.confirm_season_rollover(uuid)
  is 'Closes the active season, lets admins finalize immediately, skips retaining empty seasons, and opens the next season while keeping closed seasons read-only in Supabase until exported.';

grant execute on function public.confirm_season_rollover(uuid) to authenticated;

commit;
