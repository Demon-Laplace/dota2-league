begin;

create function private.log_actor_name(p_user_id uuid, p_fallback text default null)
returns text language sql stable security definer set search_path = public, private as $$
  select coalesce(
    (select nullif(btrim(ai.username), '') from private.auth_identities ai where ai.auth_user_id = p_user_id),
    (select nullif(btrim(p.display_name), '') from public.profiles p where p.id = p_user_id),
    nullif(btrim(p_fallback), ''), '未知身份');
$$;

create function private.log_text_without_actor(p_text text, p_user_id uuid, p_fallback text)
returns text language plpgsql stable security definer set search_path = public, private as $$
declare v_text text := btrim(coalesce(p_text, '')); v_name text;
begin
  for v_name in
    select name from (
      select private.log_actor_name(p_user_id, p_fallback) as name
      union select p.display_name from public.profiles p where p.id = p_user_id
      union select p_fallback
    ) names where nullif(btrim(name), '') is not null order by length(name) desc
  loop
    if left(v_text, length(v_name) + 1) = v_name || ' ' then
      return btrim(substr(v_text, length(v_name) + 1));
    end if;
  end loop;
  return v_text;
end;
$$;

-- Preserve the existing authorization and retention logic.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.get_season_action_logs(uuid)'::regprocedure) into v_def;
  if position('coalesce(nullif(ai.username, ''''), sal.actor_name)' in v_def) = 0 then
    raise exception 'Missing operation-log actor anchor';
  end if;
  v_def := replace(v_def, 'coalesce(nullif(ai.username, ''''), sal.actor_name)',
    'private.log_actor_name(sal.actor_user_id, sal.actor_name)');
  v_def := replace(v_def, 'sal.text,',
    'private.log_text_without_actor(sal.text, sal.actor_user_id, sal.actor_name),');
  execute v_def;
end;
$$;

create function public.get_item_inventory_activity_log_v2(p_season_id uuid, p_item_catalog_id uuid default null)
returns table (player_id uuid, player_name text, item_catalog_id uuid, item_name text,
  event_kind text, quantity numeric, occurred_at timestamptz, operator_name text,
  notes text, match_id uuid, sponsorship_amount numeric)
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.require_authenticated();
  if p_season_id is null then raise exception 'season_id is required.' using errcode = '22023'; end if;
  if not (public.is_scorekeeper() or public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['item_operator'])) then
    raise exception 'You do not have permission to view item inventory activity for this season.' using errcode = '42501';
  end if;
  return query
  with definitions as (
    select ic.id, coalesce(s.initial_quantity, 0)::numeric as initial_quantity,
      case when coalesce(ic.config ->> 'donation_amount', '') ~ '^\d+(\.\d+)?$'
        then (ic.config ->> 'donation_amount')::numeric else 0::numeric end as price
    from public.item_catalog ic
    left join public.season_item_catalog_settings s on s.item_catalog_id = ic.id and s.season_id = p_season_id
  ), inventory as (
    select ii.player_id, ii.item_catalog_id,
      count(*) filter (where ii.metadata ->> 'acquisition_kind' = 'manual_purchase' and ii.status not in ('revoked','expired'))::numeric as purchased,
      count(*) filter (where ii.metadata ->> 'acquisition_kind' = 'admin_gift' and ii.status not in ('revoked','expired'))::numeric as gifted,
      count(*) filter (where ii.metadata ->> 'acquisition_kind' = 'initial_grant' and ii.status = 'revoked')::numeric as revoked_initial
    from private.item_instances ii where ii.season_id = p_season_id group by ii.player_id, ii.item_catalog_id
  ), usages as (
    select iu.id, ii.player_id, ii.item_catalog_id, iu.match_id,
      coalesce(iu.resolved_at, iu.created_at) as occurred_at, iu.used_by,
      coalesce(nullif(iu.notes,''), nullif(iu.effect_payload ->> 'reason','')) as notes,
      coalesce(iu.effect_payload -> 'sponsorship_exempt' = 'true'::jsonb, false) as exempt,
      case when private.is_split_team_item_usage(iu.effect_payload) then
        1::numeric / nullif(count(*) over (partition by ii.season_id, iu.match_id, ii.item_catalog_id,
          coalesce(iu.effect_payload ->> 'target_team',''), coalesce(iu.effect_payload ->> 'source_team',''),
          coalesce(iu.effect_payload ->> 'payment_mode','solo'),
          coalesce(iu.effect_payload -> 'sponsorship_exempt' = 'true'::jsonb,false)),0)::numeric
        else 1::numeric end as weight
    from private.item_instances ii join private.item_usages iu on iu.item_instance_id = ii.id
      and iu.status not in ('cancelled','rejected')
    where ii.season_id = p_season_id
  ), usage_costs as (
    select u.*,
      round(sum(case when u.exempt then 0 else u.weight end) over (
        partition by u.player_id, u.item_catalog_id order by u.occurred_at, u.id rows unbounded preceding),2) as used_after,
      round(coalesce(sum(case when u.exempt then 0 else u.weight end) over (
        partition by u.player_id, u.item_catalog_id order by u.occurred_at, u.id rows between unbounded preceding and 1 preceding),0),2) as used_before,
      greatest(d.initial_quantity - coalesce(i.revoked_initial,0),0) + coalesce(i.gifted,0) + coalesce(i.purchased,0) as covered,
      d.price
    from usages u join definitions d on d.id = u.item_catalog_id
    left join inventory i on i.player_id = u.player_id and i.item_catalog_id = u.item_catalog_id
  ), activity as (
    select ii.player_id, p.display_name as player_name, ii.item_catalog_id, ic.name as item_name,
      case when ii.metadata ->> 'acquisition_kind' = 'manual_purchase' then 'purchase' else 'gift' end as event_kind,
      1::numeric as quantity, ii.created_at as occurred_at, private.log_actor_name(ii.granted_by) as operator_name,
      coalesce(nullif(ii.metadata ->> 'reason',''),ii.granted_reason) as notes, null::uuid as match_id,
      case when ii.metadata ->> 'acquisition_kind' = 'manual_purchase' and ii.status not in ('revoked','expired') then d.price else 0::numeric end as sponsorship_amount
    from private.item_instances ii join public.players p on p.id = ii.player_id
    join public.item_catalog ic on ic.id = ii.item_catalog_id join definitions d on d.id = ic.id
    where ii.season_id = p_season_id and ii.metadata ->> 'acquisition_kind' in ('manual_purchase','admin_gift')
    union all
    select ii.player_id,p.display_name,ii.item_catalog_id,ic.name,'revoke',1::numeric,
      coalesce(nullif(ii.metadata ->> 'revoked_at','')::timestamptz,ii.updated_at),
      private.log_actor_name(nullif(ii.metadata ->> 'revoked_by','')::uuid),
      coalesce(nullif(ii.metadata ->> 'revoked_reason',''),'管理员扣除道具'),null::uuid,0::numeric
    from private.item_instances ii join public.players p on p.id=ii.player_id join public.item_catalog ic on ic.id=ii.item_catalog_id
    where ii.season_id=p_season_id and ii.status='revoked' and ii.metadata ->> 'acquisition_kind' in ('manual_purchase','admin_gift','initial_grant')
    union all
    select u.player_id,p.display_name,u.item_catalog_id,ic.name,'usage',round(u.weight,2),u.occurred_at,
      private.log_actor_name(u.used_by),u.notes,u.match_id,
      round((greatest(u.used_after-u.covered,0)-greatest(u.used_before-u.covered,0))*u.price,2)
    from usage_costs u join public.players p on p.id=u.player_id join public.item_catalog ic on ic.id=u.item_catalog_id
  )
  select a.* from activity a where p_item_catalog_id is null or a.item_catalog_id=p_item_catalog_id
  order by a.occurred_at desc nulls last,a.player_name,a.item_name,a.event_kind;
end;
$$;

revoke all on function private.log_actor_name(uuid,text) from public;
revoke all on function private.log_text_without_actor(text,uuid,text) from public;
revoke all on function public.get_item_inventory_activity_log_v2(uuid,uuid) from public;
grant execute on function public.get_item_inventory_activity_log_v2(uuid,uuid) to authenticated;
comment on function public.get_item_inventory_activity_log_v2(uuid,uuid) is
  'Item activity with mapped operator names and gross sponsorship charges before season item-credit offsets. Free inventory and exempt usage cost zero; prepaid inventory is charged once on purchase.';
commit;
