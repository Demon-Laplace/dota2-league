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

  delete from private.item_instances
  where season_id = p_season_id;

  delete from private.item_usages
  where season_id = p_season_id;

  delete from public.matches
  where season_id = p_season_id;

  delete from public.season_end_confirmations
  where season_id = p_season_id;

  update public.season_memberships
  set join_status = 'inactive',
      rank_no = null,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and join_status in ('inactive', 'active', 'captain');

  return v_inserted_count;
end;
$$;

comment on function public.reset_current_season(uuid)
  is 'Resets season-scoped scores, matches, confirmations, and item inventory while preserving the item catalog.';

commit;
