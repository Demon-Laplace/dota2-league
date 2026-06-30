begin;

comment on column public.item_catalog.config is 'Extensible item definition. Current front-end stores donation_amount, initial_quantity, and operator_roles for catalog management.';

create or replace function public.get_item_catalog_usage_summary(
  p_season_id uuid
)
returns table (
  item_catalog_id uuid,
  player_id uuid,
  usage_count integer,
  remaining_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.require_authenticated();

  if p_season_id is null then
    raise exception 'season_id is required.'
      using errcode = '22023';
  end if;

  if not (
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['item_operator'])
  ) then
    raise exception 'You do not have permission to view item usage for this season.'
      using errcode = '42501';
  end if;

  return query
  with season_players as (
    select sm.player_id
    from public.season_memberships sm
    where sm.season_id = p_season_id
      and sm.join_status in ('active', 'captain')
  ),
  catalog_with_initial as (
    select
      ic.id,
      case
        when jsonb_typeof(ic.config -> 'initial_quantity') = 'number'
          then greatest((ic.config ->> 'initial_quantity')::integer, 0)
        when jsonb_typeof(ic.config -> 'initial_quantity') = 'string'
          and (ic.config ->> 'initial_quantity') ~ '^-?\d+$'
          then greatest((ic.config ->> 'initial_quantity')::integer, 0)
        else 0
      end as initial_quantity
    from public.item_catalog ic
  ),
  usage_counts as (
    select
      ii.item_catalog_id,
      ii.player_id,
      count(iu.id)::integer as usage_count
    from private.item_instances ii
    left join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
    group by ii.item_catalog_id, ii.player_id
  )
  select
    cwi.id as item_catalog_id,
    sp.player_id,
    coalesce(uc.usage_count, 0) as usage_count,
    cwi.initial_quantity - coalesce(uc.usage_count, 0) as remaining_count
  from catalog_with_initial cwi
  cross join season_players sp
  left join usage_counts uc
    on uc.item_catalog_id = cwi.id
   and uc.player_id = sp.player_id;
end;
$$;

revoke all on function public.get_item_catalog_usage_summary(uuid) from public;
grant execute on function public.get_item_catalog_usage_summary(uuid) to authenticated;

commit;
