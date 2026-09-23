begin;

create or replace function public.save_item_catalog_atomic(
  p_season_id uuid,
  p_item_catalog_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_config jsonb,
  p_score_delta_multiplier numeric,
  p_score_delta_special text,
  p_initial_quantity integer,
  p_stack_rules jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item_id uuid;
  v_current_updated_at timestamptz;
  v_saved_updated_at timestamptz;
  v_rule jsonb;
  v_peer_id uuid;
  v_low_id uuid;
  v_high_id uuid;
  v_multiplier numeric;
  v_special text;
  v_settlement jsonb;
  v_condition jsonb;
  v_effect jsonb;
  v_effect_type text;
  v_effect_value numeric;
  v_score_below numeric;
begin
  perform private.require_authenticated();

  if p_season_id is null then
    raise exception 'season_id is required.' using errcode = '22023';
  end if;
  if not (
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['item_operator'])
  ) then
    raise exception 'You do not have permission to manage items for this season.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.seasons s
    where s.id = p_season_id and s.status in ('draft', 'active')
  ) then
    raise exception 'Items can only be changed for draft or active seasons.'
      using errcode = '55000';
  end if;
  if btrim(coalesce(p_name, '')) = '' or char_length(btrim(p_name)) > 32 then
    raise exception 'Item name must contain 1 to 32 characters.'
      using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_config), '') <> 'object' then
    raise exception 'config must be a JSON object.' using errcode = '22023';
  end if;
  if p_score_delta_multiplier is null
    or abs(p_score_delta_multiplier) > 999999.99
    or scale(p_score_delta_multiplier) > 2 then
    raise exception 'score multiplier must fit numeric(10,2).'
      using errcode = '22003';
  end if;
  if coalesce(p_score_delta_special, '') not in ('', '@') then
    raise exception 'Unsupported special score effect.' using errcode = '22023';
  end if;
  if p_initial_quantity is null or p_initial_quantity < 0 then
    raise exception 'initial_quantity must be a non-negative integer.'
      using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_stack_rules), '') <> 'array' then
    raise exception 'stack_rules must be a JSON array.' using errcode = '22023';
  end if;

  -- The v2 rule is stored ahead of activation, but still receives strict
  -- server validation so another client cannot persist executable free-form
  -- data. Absence remains valid for legacy callers and legacy catalog rows.
  if p_config ? 'item_settlement_v2' then
    v_settlement := p_config -> 'item_settlement_v2';
    if coalesce(jsonb_typeof(v_settlement), '') <> 'object'
      or (select count(*) from jsonb_object_keys(v_settlement)) <> 3
      or not (v_settlement ?& array['version', 'condition', 'effect'])
      or coalesce(v_settlement ->> 'version', '') <> '2' then
      raise exception 'Invalid item settlement v2 rule.' using errcode = '22023';
    end if;
    v_condition := v_settlement -> 'condition';
    v_effect := v_settlement -> 'effect';
    if coalesce(jsonb_typeof(v_condition), '') <> 'object'
      or (select count(*) from jsonb_object_keys(v_condition)) <> 3
      or not (v_condition ?& array['subject', 'outcome', 'scoreBelow'])
      or coalesce(v_condition ->> 'subject', '') not in ('actor', 'target')
      or coalesce(v_condition ->> 'outcome', '') not in ('win', 'loss', 'any') then
      raise exception 'Invalid item settlement v2 condition.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_condition -> 'scoreBelow') = 'null' then
      v_score_below := null;
    elsif jsonb_typeof(v_condition -> 'scoreBelow') = 'number' then
      v_score_below := (v_condition ->> 'scoreBelow')::numeric;
      if abs(v_score_below) > 1000000 or scale(v_score_below) > 2 then
        raise exception 'Invalid item settlement v2 threshold.' using errcode = '22003';
      end if;
    else
      raise exception 'Invalid item settlement v2 threshold.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_effect), '') <> 'object'
      or (select count(*) from jsonb_object_keys(v_effect)) <> 2
      or not (v_effect ?& array['type', 'value']) then
      raise exception 'Invalid item settlement v2 effect.' using errcode = '22023';
    end if;
    v_effect_type := coalesce(v_effect ->> 'type', '');
    if v_effect_type not in ('multiply_match', 'add_points', 'set_total', 'record_only') then
      raise exception 'Unsupported item settlement v2 effect.' using errcode = '22023';
    end if;
    if v_effect_type = 'record_only' then
      if jsonb_typeof(v_effect -> 'value') <> 'null' then
        raise exception 'Record-only effect cannot have a value.' using errcode = '22023';
      end if;
    elsif jsonb_typeof(v_effect -> 'value') = 'number' then
      v_effect_value := (v_effect ->> 'value')::numeric;
      if (v_effect_type = 'multiply_match' and (abs(v_effect_value) > 100 or scale(v_effect_value) > 4))
        or (v_effect_type in ('add_points', 'set_total') and (abs(v_effect_value) > 1000000 or scale(v_effect_value) > 2)) then
        raise exception 'Invalid item settlement v2 effect value.' using errcode = '22003';
      end if;
    else
      raise exception 'Invalid item settlement v2 effect value.' using errcode = '22023';
    end if;
  end if;

  if p_item_catalog_id is null then
    insert into public.item_catalog (
      name,
      visibility_default,
      effect_type,
      score_delta_multiplier,
      score_delta_special,
      config,
      is_active
    )
    values (
      btrim(p_name),
      'public',
      'informational',
      p_score_delta_multiplier,
      nullif(p_score_delta_special, ''),
      p_config,
      true
    )
    returning id, updated_at into v_item_id, v_saved_updated_at;
  else
    select ic.updated_at
    into v_current_updated_at
    from public.item_catalog ic
    where ic.id = p_item_catalog_id
    for update;

    if not found then
      raise exception 'Item does not exist.' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is null
      or v_current_updated_at is distinct from p_expected_updated_at then
      raise exception 'Item was changed by another operator. Reload before saving.'
        using errcode = '40001';
    end if;

    update public.item_catalog
    set name = btrim(p_name),
        config = p_config,
        effect_type = 'informational',
        score_delta_multiplier = p_score_delta_multiplier,
        score_delta_special = nullif(p_score_delta_special, '')
    where id = p_item_catalog_id
    returning id, updated_at into v_item_id, v_saved_updated_at;
  end if;

  insert into public.season_item_catalog_settings (
    season_id,
    item_catalog_id,
    initial_quantity
  )
  values (p_season_id, v_item_id, p_initial_quantity)
  on conflict (season_id, item_catalog_id)
  do update
    set initial_quantity = excluded.initial_quantity;

  delete from public.item_catalog_score_stacks
  where item_catalog_id_low = v_item_id
     or item_catalog_id_high = v_item_id;

  for v_rule in select value from jsonb_array_elements(p_stack_rules)
  loop
    if jsonb_typeof(v_rule) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_rule) key
        where key not in ('item_catalog_id', 'score_delta_multiplier', 'score_delta_special')
      )
      or not (v_rule ? 'item_catalog_id')
      or not (v_rule ? 'score_delta_multiplier') then
      raise exception 'Invalid stack rule shape.' using errcode = '22023';
    end if;

    begin
      v_peer_id := (v_rule ->> 'item_catalog_id')::uuid;
      v_multiplier := (v_rule ->> 'score_delta_multiplier')::numeric;
    exception when others then
      raise exception 'Invalid stack rule value.' using errcode = '22023';
    end;
    v_special := nullif(coalesce(v_rule ->> 'score_delta_special', ''), '');

    if v_peer_id = v_item_id then
      raise exception 'An item cannot stack with itself.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.item_catalog where id = v_peer_id) then
      raise exception 'Stack peer item does not exist.' using errcode = 'P0002';
    end if;
    if v_multiplier is null or abs(v_multiplier) > 999999.99 or scale(v_multiplier) > 2 then
      raise exception 'Stack multiplier must fit numeric(10,2).' using errcode = '22003';
    end if;
    if coalesce(v_special, '') not in ('', '@') then
      raise exception 'Unsupported stack special effect.' using errcode = '22023';
    end if;

    v_low_id := least(v_item_id, v_peer_id);
    v_high_id := greatest(v_item_id, v_peer_id);
    insert into public.item_catalog_score_stacks (
      item_catalog_id_low,
      item_catalog_id_high,
      score_delta_multiplier,
      score_delta_special
    )
    values (v_low_id, v_high_id, v_multiplier, v_special);
  end loop;

  return jsonb_build_object(
    'item_catalog_id', v_item_id,
    'updated_at', v_saved_updated_at
  );
end;
$$;

revoke all on function public.save_item_catalog_atomic(
  uuid, uuid, timestamptz, text, jsonb, numeric, text, integer, jsonb
) from public;
grant execute on function public.save_item_catalog_atomic(
  uuid, uuid, timestamptz, text, jsonb, numeric, text, integer, jsonb
) to authenticated;

comment on function public.save_item_catalog_atomic(
  uuid, uuid, timestamptz, text, jsonb, numeric, text, integer, jsonb
) is
  'Atomically saves the current item definition, one season setting and pair rules. Uses updated_at for stale-write rejection and does not write item edit history.';

commit;
