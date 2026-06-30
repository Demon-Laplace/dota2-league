begin;

create or replace function public.rename_player_quick(
  p_player_id uuid,
  p_display_name text
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_player public.players;
begin
  perform private.require_authenticated();

  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may rename players.'
      using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player_id is required.'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'display_name is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.players p
    where p.id <> p_player_id
      and lower(btrim(p.display_name)) = lower(v_name)
      and p.is_active
  ) then
    raise exception 'A player named "%" already exists.', v_name
      using errcode = '23505';
  end if;

  update public.players
  set display_name = v_name,
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

comment on function public.rename_player_quick(uuid, text) is 'Renames a master-roster player entry. Accessible to admins and scorekeepers.';

drop policy if exists reward_donations_admin_insert on public.reward_donations;
create policy reward_donations_admin_insert
  on public.reward_donations
  for insert
  to authenticated
  with check (
    public.is_scorekeeper()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

drop policy if exists reward_donations_admin_update on public.reward_donations;
create policy reward_donations_admin_update
  on public.reward_donations
  for update
  to authenticated
  using (
    public.is_scorekeeper()
    and season_id is not null
    and public.is_season_editable(season_id)
  )
  with check (
    public.is_scorekeeper()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

drop policy if exists reward_donations_admin_delete on public.reward_donations;
create policy reward_donations_admin_delete
  on public.reward_donations
  for delete
  to authenticated
  using (
    public.is_scorekeeper()
    and season_id is not null
    and public.is_season_editable(season_id)
  );

commit;
