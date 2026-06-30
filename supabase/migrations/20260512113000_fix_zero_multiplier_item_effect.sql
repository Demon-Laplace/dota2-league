begin;

do $$
declare
  v_function_def text;
  v_original_stack text;
  v_replaced_stack text;
  v_original_single text;
  v_replaced_single text;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid, jsonb, uuid)'::regprocedure)
  into v_function_def;

  if v_function_def is null then
    raise exception 'Function private.apply_match_double_downs(uuid, jsonb, uuid) not found.';
  end if;

  v_original_stack := $stack$
        case
          when v_stack_pair.score_delta_special = '@' then 0
          when v_stack_pair.score_delta_multiplier = 0 then 0
          else v_stack_pair.base_points_delta * (v_stack_pair.score_delta_multiplier - 1)
        end,
$stack$;

  v_replaced_stack := $stack$
        case
          when v_stack_pair.score_delta_special = '@' then 0
          when v_stack_pair.score_delta_multiplier = 0 then v_stack_pair.base_points_delta * -1
          else v_stack_pair.base_points_delta * (v_stack_pair.score_delta_multiplier - 1)
        end,
$stack$;

  v_original_single := $single$
        case
          when v_single_effect.score_delta_special = '@' then 0
          when v_single_effect.score_delta_multiplier = 0 then 0
          else v_single_effect.base_points_delta * (v_single_effect.score_delta_multiplier - 1)
        end,
$single$;

  v_replaced_single := $single$
        case
          when v_single_effect.score_delta_special = '@' then 0
          when v_single_effect.score_delta_multiplier = 0 then v_single_effect.base_points_delta * -1
          else v_single_effect.base_points_delta * (v_single_effect.score_delta_multiplier - 1)
        end,
$single$;

  if position(v_replaced_stack in v_function_def) = 0 then
    if position(v_original_stack in v_function_def) = 0 then
      raise exception 'Failed to patch stack zero-multiplier branch in private.apply_match_double_downs.';
    end if;
    v_function_def := replace(v_function_def, v_original_stack, v_replaced_stack);
  end if;

  if position(v_replaced_single in v_function_def) = 0 then
    if position(v_original_single in v_function_def) = 0 then
      raise exception 'Failed to patch single zero-multiplier branch in private.apply_match_double_downs.';
    end if;
    v_function_def := replace(v_function_def, v_original_single, v_replaced_single);
  end if;

  execute v_function_def;
end;
$$;

comment on function private.apply_match_double_downs(uuid, jsonb, uuid)
  is 'Applies match item usages, including score multipliers and win-only reset effects. Multiplier 0 fully cancels the affected player''s base match-result delta; reset effects become no-ops when the targeted side does not win.';

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
