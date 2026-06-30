begin;

update public.item_catalog
set effect_type = 'informational',
    config = config - 'score_multiplier'
where effect_type is distinct from 'informational'
   or config ? 'score_multiplier';

comment on table public.item_catalog is 'Public catalog of season items and sponsorship metadata.';
comment on column public.item_catalog.config is 'Extensible item definition. Current front-end stores donation_amount and operator_roles for catalog management.';

create or replace function private.apply_item_usage_now(
  p_usage_id uuid,
  p_actor uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_usage private.item_usages%rowtype;
begin
  select *
  into v_usage
  from private.item_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception 'Item usage % not found.', p_usage_id
      using errcode = 'P0002';
  end if;

  if v_usage.status = 'applied' then
    return null;
  end if;

  if v_usage.status not in ('draft', 'pending') then
    raise exception 'Item usage % is not applyable in status %.', p_usage_id, v_usage.status
      using errcode = 'P0001';
  end if;

  update private.item_usages
  set status = 'applied',
      resolved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_usage.id;

  update private.item_instances
  set status = 'consumed',
      updated_at = timezone('utc', now())
  where id = v_usage.item_instance_id
    and status in ('active', 'reserved');

  return null;
end;
$$;

create or replace function private.apply_pending_item_usages(
  p_match_id uuid,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_usage_id uuid;
begin
  for v_usage_id in
    select iu.id
    from private.item_usages iu
    where iu.match_id = p_match_id
      and iu.status in ('draft', 'pending')
  loop
    perform private.apply_item_usage_now(v_usage_id, p_actor);
  end loop;
end;
$$;

drop function if exists public.apply_item_effect(uuid, uuid, uuid, numeric, text, text, jsonb);

alter table private.item_usages
  drop column if exists effect_points_delta;

alter table public.item_catalog
  alter column effect_type set default 'informational';

alter table public.item_catalog
  drop column if exists default_points_delta;

create or replace function public.apply_item_effect(
  p_item_instance_id uuid,
  p_match_id uuid default null,
  p_target_user_id uuid default null,
  p_notes text default null,
  p_visibility_mode text default null,
  p_effect_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_item_instance private.item_instances%rowtype;
  v_usage_id uuid;
  v_usage_status text;
  v_match_status text;
begin
  select *
  into v_item_instance
  from private.item_instances
  where id = p_item_instance_id
  for update;

  if not found then
    raise exception 'Item instance % not found.', p_item_instance_id
      using errcode = 'P0002';
  end if;

  if not public.can_apply_items(v_item_instance.season_id) then
    raise exception 'You do not have permission to operate items for this season.'
      using errcode = '42501';
  end if;

  if v_item_instance.status not in ('active', 'reserved') then
    raise exception 'Item instance % is not available in status %.', p_item_instance_id, v_item_instance.status
      using errcode = 'P0001';
  end if;

  if p_match_id is not null then
    select status
    into v_match_status
    from public.matches
    where id = p_match_id
      and season_id = v_item_instance.season_id;

    if not found then
      raise exception 'Target match % does not belong to the same season as the item.', p_match_id
        using errcode = 'P0002';
    end if;
  end if;

  insert into private.item_usages (
    item_instance_id,
    season_id,
    match_id,
    target_player_id,
    used_by,
    status,
    visibility_mode,
    effect_payload,
    notes
  )
  values (
    p_item_instance_id,
    v_item_instance.season_id,
    p_match_id,
    p_target_user_id,
    v_actor,
    case
      when p_match_id is not null
       and coalesce(p_visibility_mode, v_item_instance.visibility_mode) = 'hidden_until_match_approved'
       and v_match_status is distinct from 'approved'
      then 'pending'
      else 'draft'
    end,
    coalesce(p_visibility_mode, v_item_instance.visibility_mode),
    coalesce(p_effect_payload, '{}'::jsonb),
    p_notes
  )
  returning id, status into v_usage_id, v_usage_status;

  if v_usage_status = 'draft' then
    perform private.apply_item_usage_now(v_usage_id, v_actor);
    v_usage_status := 'applied';
  else
    update private.item_instances
    set status = 'reserved',
        updated_at = timezone('utc', now())
    where id = p_item_instance_id
      and status = 'active';
  end if;

  return jsonb_build_object(
    'item_usage_id', v_usage_id,
    'status', v_usage_status
  );
end;
$$;

revoke all on function public.apply_item_effect(uuid, uuid, uuid, text, text, jsonb) from public;
grant execute on function public.apply_item_effect(uuid, uuid, uuid, text, text, jsonb) to authenticated;

commit;
