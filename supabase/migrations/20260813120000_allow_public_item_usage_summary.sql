begin;

create or replace function public.get_item_catalog_usage_summary(
  p_season_id uuid
)
returns table (
  item_catalog_id uuid,
  player_id uuid,
  usage_count numeric,
  remaining_count numeric
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_is_public boolean;
begin
  if p_season_id is null then
    raise exception 'season_id is required.'
      using errcode = '22023';
  end if;

  select s.is_public
  into v_is_public
  from public.seasons s
  where s.id = p_season_id;

  if not found then
    raise exception 'Season not found.'
      using errcode = 'P0002';
  end if;

  if not v_is_public then
    perform private.require_authenticated();

    if not (
      public.is_scorekeeper()
      or public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['item_operator'])
    ) then
      raise exception 'You do not have permission to view item usage for this season.'
        using errcode = '42501';
    end if;
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
      coalesce(sics.initial_quantity, 0)::numeric as initial_quantity
    from public.item_catalog ic
    left join public.season_item_catalog_settings sics
      on sics.season_id = p_season_id
     and sics.item_catalog_id = ic.id
  ),
  usage_rows as (
    select
      ii.item_catalog_id,
      ii.player_id,
      case
        when coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
          and coalesce(iu.effect_payload ->> 'mode', '') = 'team'
          and coalesce(iu.effect_payload ->> 'payment_mode', 'solo') = 'split'
          then 1::numeric / nullif(
            count(*) over (
              partition by
                ii.season_id,
                iu.match_id,
                ii.item_catalog_id,
                coalesce(iu.effect_payload ->> 'target_team', ''),
                coalesce(iu.effect_payload ->> 'source_team', ''),
                coalesce(iu.effect_payload ->> 'payment_mode', 'solo')
            ),
            0
          )::numeric
        else 1::numeric
      end as usage_weight
    from private.item_instances ii
    left join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
      and iu.id is not null
  ),
  usage_counts as (
    select
      ur.item_catalog_id,
      ur.player_id,
      round(sum(ur.usage_weight), 2) as usage_count
    from usage_rows ur
    group by ur.item_catalog_id, ur.player_id
  ),
  acquired_counts as (
    select
      ii.item_catalog_id,
      ii.player_id,
      round(sum(
        case
          when coalesce(ii.metadata ->> 'acquisition_kind', '') in ('manual_purchase', 'admin_gift')
            and ii.status not in ('revoked', 'expired')
            then 1::numeric
          else 0::numeric
        end
      ), 2) as acquired_quantity
    from private.item_instances ii
    where ii.season_id = p_season_id
    group by ii.item_catalog_id, ii.player_id
  ),
  initial_revocation_counts as (
    select
      ii.item_catalog_id,
      ii.player_id,
      round(sum(
        case
          when coalesce(ii.metadata ->> 'acquisition_kind', '') = 'initial_grant'
            and ii.status = 'revoked'
            then 1::numeric
          else 0::numeric
        end
      ), 2) as revoked_initial_quantity
    from private.item_instances ii
    where ii.season_id = p_season_id
    group by ii.item_catalog_id, ii.player_id
  )
  select
    cwi.id as item_catalog_id,
    sp.player_id,
    coalesce(uc.usage_count, 0)::numeric as usage_count,
    round(
      greatest(
        cwi.initial_quantity - coalesce(irc.revoked_initial_quantity, 0),
        0
      )
      + coalesce(ac.acquired_quantity, 0)
      - coalesce(uc.usage_count, 0),
      2
    )::numeric as remaining_count
  from catalog_with_initial cwi
  cross join season_players sp
  left join usage_counts uc
    on uc.item_catalog_id = cwi.id
   and uc.player_id = sp.player_id
  left join acquired_counts ac
    on ac.item_catalog_id = cwi.id
   and ac.player_id = sp.player_id
  left join initial_revocation_counts irc
    on irc.item_catalog_id = cwi.id
   and irc.player_id = sp.player_id;
end;
$$;

revoke all on function public.get_item_catalog_usage_summary(uuid) from public;
grant execute on function public.get_item_catalog_usage_summary(uuid) to anon, authenticated;

commit;
