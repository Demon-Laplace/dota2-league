begin;

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
  v_active_season_id uuid;
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

  select s.id
  into v_active_season_id
  from public.seasons s
  where s.status = 'active'
  order by s.start_at desc nulls last, s.created_at desc
  limit 1;

  if v_active_season_id is not null then
    insert into public.season_memberships as sm (
      season_id,
      player_id,
      join_status,
      rank_no
    )
    values (
      v_active_season_id,
      p_player_id,
      'active',
      null
    )
    on conflict (season_id, player_id) do update
    set join_status = case
          when sm.join_status = 'captain' then 'captain'
          else 'active'
        end,
        updated_at = timezone('utc', now())
    where sm.join_status not in ('withdrawn', 'banned');
  end if;

  return v_player;
end;
$$;

comment on function public.admin_restore_player_quick(uuid)
  is 'Restores a soft-hidden master-roster player and reactivates an editable membership in the current active season. Withdrawn or banned memberships remain unchanged. Accessible to admins only.';

revoke all on function public.admin_restore_player_quick(uuid) from public;
grant execute on function public.admin_restore_player_quick(uuid) to authenticated;

-- Repair the already-restored player that exposed this incomplete recovery path.
-- Keep the existing rank value and touch no other inactive roster members.
update public.season_memberships sm
set join_status = 'active',
    updated_at = timezone('utc', now())
from public.seasons s,
     public.players p
where sm.season_id = s.id
  and sm.player_id = p.id
  and sm.player_id = 'c55a13fe-7036-4f39-9785-4de86a4955ff'::uuid
  and s.status = 'active'
  and p.is_active
  and sm.join_status = 'inactive';

commit;
