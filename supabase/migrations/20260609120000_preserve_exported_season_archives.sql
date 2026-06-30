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
      and s.status = any (array['draft', 'active'])
  );
$$;

comment on function public.is_season_editable(uuid)
  is 'Returns true for draft and active seasons where season-scoped setup such as roster and item settings remains editable.';

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
      and s.status = any (array['draft', 'active', 'closed'])
  );
$$;

comment on function public.is_season_match_record_editable(uuid)
  is 'Returns true for seasons whose match records may still be corrected. Archived seasons are read-only after GitHub export.';

create or replace function public.can_submit_matches(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_match_record_editable(p_season_id)
    and (
      public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
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
    public.is_season_match_record_editable(p_season_id)
    and (
      public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
    );
$$;

drop policy if exists season_memberships_write_staff on public.season_memberships;
create policy season_memberships_write_staff
  on public.season_memberships
  for all
  to authenticated
  using (
    public.can_manage_season(season_id)
    and public.is_season_editable(season_id)
  )
  with check (
    public.can_manage_season(season_id)
    and public.is_season_editable(season_id)
  );

drop policy if exists season_item_catalog_settings_write_scorekeeper on public.season_item_catalog_settings;
create policy season_item_catalog_settings_write_scorekeeper
  on public.season_item_catalog_settings
  for all
  to authenticated
  using (
    public.is_scorekeeper()
    and public.is_season_editable(season_id)
  )
  with check (
    public.is_scorekeeper()
    and public.is_season_editable(season_id)
  );

create or replace function public.mark_exported_season_archived(
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
    raise exception 'Only admins may archive exported season %.', p_season_id
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
    raise exception 'Active season % cannot be marked archived after export.', p_season_id
      using errcode = 'P0001';
  end if;

  select count(*)
  into v_match_count
  from public.matches
  where season_id = p_season_id;

  update public.seasons
  set status = 'archived',
      updated_at = timezone('utc', now())
  where id = p_season_id;

  return jsonb_build_object(
    'season_id', p_season_id,
    'season_name', v_season.name,
    'previous_status', v_season.status,
    'season_status', 'archived',
    'match_count', v_match_count,
    'archived_by', v_actor,
    'archived', true
  );
end;
$$;

comment on function public.mark_exported_season_archived(uuid)
  is 'Marks a non-active season as archived after GitHub export while preserving database records for read-only web viewing.';

revoke all on function public.is_season_editable(uuid) from public;
revoke all on function public.is_season_match_record_editable(uuid) from public;
revoke all on function public.can_submit_matches(uuid) from public;
revoke all on function public.can_adjust_scores(uuid) from public;
revoke all on function public.mark_exported_season_archived(uuid) from public;

grant execute on function public.is_season_editable(uuid) to authenticated;
grant execute on function public.is_season_match_record_editable(uuid) to authenticated;
grant execute on function public.can_submit_matches(uuid) to authenticated;
grant execute on function public.can_adjust_scores(uuid) to authenticated;
grant execute on function public.mark_exported_season_archived(uuid) to authenticated;

commit;
