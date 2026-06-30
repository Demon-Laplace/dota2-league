begin;

update public.item_catalog
set score_delta_multiplier = 1
where coalesce(config ->> 'match_resolution_mode', '') = 'record_only'
  and coalesce(score_delta_special, '') = ''
  and score_delta_multiplier = 0;

do $$
declare
  v_function_def text;
  v_original_item_lookup text;
  v_replaced_item_lookup text;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid, jsonb, uuid)'::regprocedure)
  into v_function_def;

  if v_function_def is null then
    raise exception 'Function private.apply_match_double_downs(uuid, jsonb, uuid) not found.';
  end if;

  v_original_item_lookup := $lookup$
      select
        ic.name,
        coalesce(ic.score_delta_multiplier, 0),
        coalesce(ic.score_delta_special, '')
      into v_item_catalog_name, v_item_score_delta_multiplier, v_item_score_delta_special
      from public.item_catalog ic
      where ic.id = v_item_catalog_id;
$lookup$;

  v_replaced_item_lookup := $lookup$
      select
        ic.name,
        case
          when coalesce(ic.config ->> 'match_resolution_mode', '') = 'record_only' then 1
          else coalesce(ic.score_delta_multiplier, 0)
        end,
        case
          when coalesce(ic.config ->> 'match_resolution_mode', '') = 'record_only' then ''
          else coalesce(ic.score_delta_special, '')
        end
      into v_item_catalog_name, v_item_score_delta_multiplier, v_item_score_delta_special
      from public.item_catalog ic
      where ic.id = v_item_catalog_id;
$lookup$;

  if position(v_replaced_item_lookup in v_function_def) = 0 then
    if position(v_original_item_lookup in v_function_def) = 0 then
      raise exception 'Failed to patch record-only item lookup in private.apply_match_double_downs.';
    end if;
    v_function_def := replace(v_function_def, v_original_item_lookup, v_replaced_item_lookup);
  end if;

  execute v_function_def;
end;
$$;

comment on function private.apply_match_double_downs(uuid, jsonb, uuid)
  is 'Applies match item usages, including score multipliers and win-only reset effects. Multiplier 0 fully cancels the affected player''s base match-result delta; items marked record_only are always treated as neutral 1x effects during score settlement.';

do $$
declare
  v_season_id uuid;
  v_actor uuid;
begin
  for v_season_id in
    select s.id
    from public.seasons s
    order by s.created_at, s.id
  loop
    select coalesce(
      (
        select m.approved_by
        from public.matches m
        where m.season_id = v_season_id
          and m.approved_by is not null
        order by m.approved_at desc nulls last, m.created_at desc, m.id desc
        limit 1
      ),
      (
        select m.submitted_by
        from public.matches m
        where m.season_id = v_season_id
          and m.submitted_by is not null
        order by m.submitted_at desc nulls last, m.created_at desc, m.id desc
        limit 1
      ),
      (
        select m.created_by
        from public.matches m
        where m.season_id = v_season_id
          and m.created_by is not null
        order by m.created_at desc, m.id desc
        limit 1
      ),
      (
        select p.id
        from public.profiles p
        order by p.created_at, p.id
        limit 1
      )
    )
    into v_actor;

    perform private.recalculate_season_scores(v_season_id, v_actor);
  end loop;
end;
$$;

commit;
