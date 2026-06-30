begin;

create or replace function public.revoke_player_item_inventory(
  p_season_id uuid,
  p_player_id uuid,
  p_item_catalog_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_item_instance private.item_instances%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_revoked_at timestamptz := timezone('utc', now());
begin
  if p_season_id is null or p_player_id is null or p_item_catalog_id is null then
    raise exception 'season_id, player_id, and item_catalog_id are required.'
      using errcode = '22023';
  end if;

  if not public.can_apply_items(p_season_id) then
    raise exception 'You do not have permission to operate items for this season.'
      using errcode = '42501';
  end if;

  select ii.*
  into v_item_instance
  from private.item_instances ii
  where ii.season_id = p_season_id
    and ii.player_id = p_player_id
    and ii.item_catalog_id = p_item_catalog_id
    and ii.status = 'active'
    and coalesce(ii.metadata ->> 'acquisition_kind', '') in ('manual_purchase', 'admin_gift')
  order by ii.created_at desc, ii.id desc
  limit 1
  for update of ii skip locked;

  if not found then
    raise exception 'No active manual item inventory found for player % and item % in season %.', p_player_id, p_item_catalog_id, p_season_id
      using errcode = 'P0002';
  end if;

  update private.item_instances ii
  set status = 'revoked',
      updated_at = v_revoked_at,
      metadata = jsonb_strip_nulls(
        coalesce(ii.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'revoked_by', v_actor,
          'revoked_at', v_revoked_at,
          'revoked_reason', coalesce(v_reason, '管理员扣除道具'),
          'revoked_action', 'manual_revoke'
        )
      )
  where ii.id = v_item_instance.id;

  return jsonb_build_object(
    'item_instance_id', v_item_instance.id,
    'season_id', p_season_id,
    'player_id', p_player_id,
    'item_catalog_id', p_item_catalog_id,
    'action', 'revoke'
  );
end;
$$;

comment on function public.revoke_player_item_inventory(uuid, uuid, uuid, text)
  is 'Revokes one active manually-added item instance for a player, intended for correcting accidental gifts or purchases.';

revoke all on function public.revoke_player_item_inventory(uuid, uuid, uuid, text) from public;
grant execute on function public.revoke_player_item_inventory(uuid, uuid, uuid, text) to authenticated;

create or replace function public.get_item_inventory_activity_log(
  p_season_id uuid,
  p_item_catalog_id uuid default null
)
returns table (
  player_id uuid,
  player_name text,
  item_catalog_id uuid,
  item_name text,
  event_kind text,
  quantity numeric,
  occurred_at timestamptz,
  operator_name text,
  notes text,
  match_id uuid
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
    raise exception 'You do not have permission to view item inventory activity for this season.'
      using errcode = '42501';
  end if;

  return query
  with acquisition_events as (
    select
      ii.player_id,
      p.display_name as player_name,
      ii.item_catalog_id,
      ic.name as item_name,
      case
        when coalesce(ii.metadata ->> 'acquisition_kind', '') = 'manual_purchase' then 'purchase'
        else 'gift'
      end as event_kind,
      1::numeric as quantity,
      ii.created_at as occurred_at,
      operator_profile.display_name as operator_name,
      coalesce(nullif(ii.metadata ->> 'reason', ''), ii.granted_reason) as notes,
      null::uuid as match_id
    from private.item_instances ii
    join public.players p
      on p.id = ii.player_id
    join public.item_catalog ic
      on ic.id = ii.item_catalog_id
    left join public.profiles operator_profile
      on operator_profile.id = ii.granted_by
    where ii.season_id = p_season_id
      and (p_item_catalog_id is null or ii.item_catalog_id = p_item_catalog_id)
      and coalesce(ii.metadata ->> 'acquisition_kind', '') in ('manual_purchase', 'admin_gift')
  ),
  revocation_events as (
    select
      ii.player_id,
      p.display_name as player_name,
      ii.item_catalog_id,
      ic.name as item_name,
      'revoke'::text as event_kind,
      1::numeric as quantity,
      coalesce(nullif(ii.metadata ->> 'revoked_at', '')::timestamptz, ii.updated_at) as occurred_at,
      revoked_profile.display_name as operator_name,
      coalesce(nullif(ii.metadata ->> 'revoked_reason', ''), '管理员扣除道具') as notes,
      null::uuid as match_id
    from private.item_instances ii
    join public.players p
      on p.id = ii.player_id
    join public.item_catalog ic
      on ic.id = ii.item_catalog_id
    left join public.profiles revoked_profile
      on revoked_profile.id = nullif(ii.metadata ->> 'revoked_by', '')::uuid
    where ii.season_id = p_season_id
      and (p_item_catalog_id is null or ii.item_catalog_id = p_item_catalog_id)
      and ii.status = 'revoked'
      and coalesce(ii.metadata ->> 'acquisition_kind', '') in ('manual_purchase', 'admin_gift')
  ),
  usage_events as (
    select
      ii.player_id,
      p.display_name as player_name,
      ii.item_catalog_id,
      ic.name as item_name,
      'usage'::text as event_kind,
      round(
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
        end,
        2
      )::numeric as quantity,
      coalesce(iu.resolved_at, iu.created_at) as occurred_at,
      used_profile.display_name as operator_name,
      coalesce(nullif(iu.notes, ''), nullif(iu.effect_payload ->> 'reason', '')) as notes,
      iu.match_id
    from private.item_instances ii
    join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    join public.players p
      on p.id = ii.player_id
    join public.item_catalog ic
      on ic.id = ii.item_catalog_id
    left join public.profiles used_profile
      on used_profile.id = iu.used_by
    where ii.season_id = p_season_id
      and (p_item_catalog_id is null or ii.item_catalog_id = p_item_catalog_id)
  )
  select *
  from (
    select * from acquisition_events
    union all
    select * from revocation_events
    union all
    select * from usage_events
  ) activity
  order by activity.occurred_at desc nulls last, activity.player_name asc, activity.item_name asc, activity.event_kind asc;
end;
$$;

comment on function public.get_item_inventory_activity_log(uuid, uuid)
  is 'Returns player item activity events for one season, including manual purchase, admin gift, revoke, and usage rows.';

revoke all on function public.get_item_inventory_activity_log(uuid, uuid) from public;
grant execute on function public.get_item_inventory_activity_log(uuid, uuid) to authenticated;

commit;
