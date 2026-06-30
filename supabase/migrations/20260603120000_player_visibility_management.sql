begin;

create or replace function public.deactivate_player_quick(
  p_player_id uuid
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player public.players;
begin
  perform private.require_authenticated();

  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may hide players.'
      using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player_id is required.'
      using errcode = '22023';
  end if;

  update public.players
  set is_active = false,
      updated_at = timezone('utc', now())
  where id = p_player_id
  returning * into v_player;

  if v_player.id is null then
    raise exception 'Player % not found.', p_player_id
      using errcode = 'P0002';
  end if;

  return v_player;
end;
$$;

comment on function public.deactivate_player_quick(uuid)
  is 'Soft-hides a master-roster player by setting players.is_active=false. Accessible to admins and scorekeepers.';

create or replace function public.admin_list_inactive_players()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.require_authenticated();

  if not public.is_admin() then
    raise exception 'Only admins may list hidden players.'
      using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.display_name,
      p.avatar_url,
      p.is_active,
      p.created_at,
      p.updated_at
    from public.players p
    where not p.is_active
    order by p.display_name asc, p.created_at asc;
end;
$$;

comment on function public.admin_list_inactive_players()
  is 'Lists soft-hidden master-roster players for admin recovery or permanent deletion.';

create or replace function public.admin_restore_player_quick(
  p_player_id uuid
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_existing public.players;
  v_player public.players;
begin
  perform private.require_authenticated();

  if not public.is_admin() then
    raise exception 'Only admins may restore hidden players.'
      using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player_id is required.'
      using errcode = '22023';
  end if;

  select *
  into v_existing
  from public.players
  where id = p_player_id;

  if v_existing.id is null then
    raise exception 'Player % not found.', p_player_id
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.players p
    where p.id <> p_player_id
      and p.is_active
      and lower(btrim(p.display_name)) = lower(btrim(v_existing.display_name))
  ) then
    raise exception 'An active player named "%" already exists.', v_existing.display_name
      using errcode = '23505';
  end if;

  update public.players
  set is_active = true,
      updated_at = timezone('utc', now())
  where id = p_player_id
  returning * into v_player;

  return v_player;
end;
$$;

comment on function public.admin_restore_player_quick(uuid)
  is 'Restores a soft-hidden master-roster player. Accessible to admins only.';

create or replace function public.admin_delete_player_permanently(
  p_player_id uuid
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player public.players;
  v_has_protected_references boolean;
begin
  perform private.require_authenticated();

  if not public.is_admin() then
    raise exception 'Only admins may permanently delete players.'
      using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player_id is required.'
      using errcode = '22023';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id;

  if v_player.id is null then
    raise exception 'Player % not found.', p_player_id
      using errcode = 'P0002';
  end if;

  if v_player.is_active then
    raise exception 'Only hidden players may be permanently deleted.'
      using errcode = '22023';
  end if;

  select exists (
    select 1 from public.match_players mp where mp.player_id = p_player_id
    union all
    select 1 from public.score_ledger sl where sl.player_id = p_player_id
    union all
    select 1 from public.manual_score_adjustments msa where msa.player_id = p_player_id
    union all
    select 1 from public.match_day_attendance_notes mdan where mdan.player_id = p_player_id
  )
  into v_has_protected_references;

  if v_has_protected_references then
    raise exception 'Player "%" has match, score, or attendance history and cannot be permanently deleted safely.', v_player.display_name
      using errcode = '23503';
  end if;

  delete from public.players
  where id = p_player_id
  returning * into v_player;

  return v_player;
end;
$$;

comment on function public.admin_delete_player_permanently(uuid)
  is 'Permanently deletes a hidden master-roster player only when protected history references do not exist. Accessible to admins only.';

revoke all on function public.deactivate_player_quick(uuid) from public;
revoke all on function public.admin_list_inactive_players() from public;
revoke all on function public.admin_restore_player_quick(uuid) from public;
revoke all on function public.admin_delete_player_permanently(uuid) from public;

grant execute on function public.deactivate_player_quick(uuid) to authenticated;
grant execute on function public.admin_list_inactive_players() to authenticated;
grant execute on function public.admin_restore_player_quick(uuid) to authenticated;
grant execute on function public.admin_delete_player_permanently(uuid) to authenticated;

commit;
