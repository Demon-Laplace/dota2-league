begin;

create or replace function public.set_season_player_rank(
  p_season_id uuid,
  p_player_id uuid,
  p_rank_no integer default null
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_rank_count integer;
  v_membership public.season_memberships;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  select greatest(
           1,
           least(12, coalesce(nullif(s.rule_config ->> 'rank_count', '')::integer, 3))
         )
  into v_rank_count
  from public.seasons s
  where s.id = p_season_id;

  if v_rank_count is null then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if p_rank_no is not null and (p_rank_no < 1 or p_rank_no > v_rank_count) then
    raise exception 'rank_no must be between 1 and % for season %.', v_rank_count, p_season_id
      using errcode = '22023';
  end if;

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status,
    rank_no
  )
  values (
    p_season_id,
    p_player_id,
    case
      when p_rank_no is null then 'inactive'
      else 'active'
    end,
    p_rank_no
  )
  on conflict (season_id, player_id) do nothing;

  update public.season_memberships
  set rank_no = p_rank_no,
      join_status = case
        when p_rank_no is null then 'inactive'
        when season_memberships.join_status = 'captain' then 'captain'
        else 'active'
      end,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and player_id = p_player_id
    and join_status in ('inactive', 'active', 'captain')
  returning * into v_membership;

  if not found then
    raise exception 'Editable season membership for season % and player % not found.', p_season_id, p_player_id
      using errcode = 'P0002';
  end if;

  return v_membership;
end;
$$;

comment on function public.set_season_player_rank(uuid, uuid, integer)
  is 'Assigns or clears a player rank bucket within a season. Missing editable memberships are created automatically for scorekeeping flows.';

commit;
