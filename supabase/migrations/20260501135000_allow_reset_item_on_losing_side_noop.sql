begin;

do $$
declare
  v_function_def text;
  v_original_guard text;
  v_replaced_guard text;
  v_original_tail text;
  v_replaced_tail text;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid, jsonb, uuid)'::regprocedure)
  into v_function_def;

  if v_function_def is null then
    raise exception 'Function private.apply_match_double_downs(uuid, jsonb, uuid) not found.';
  end if;

  if position('重置效果只可用于本场胜方的积分变动。' in v_function_def) = 0 then
    return;
  end if;

  v_original_guard := $guard$
    if v_applied_group.applied_special = '@' then
      if v_applied_group.base_points_delta <= 0 then
        raise exception '重置效果只可用于本场胜方的积分变动。'
          using errcode = '22023';
      end if;

      select coalesce(
$guard$;

  v_replaced_guard := $guard$
    if v_applied_group.applied_special = '@' then
      if v_applied_group.base_points_delta > 0 then
        select coalesce(
$guard$;

  v_original_tail := $tail$
      v_reason := case
        when v_applied_group.group_kind = 'stack' then format('%s · 胜场重置', v_reason)
        else format('%s · 胜场重置', v_reason)
      end;
    end if;
$tail$;

  v_replaced_tail := $tail$
      v_reason := case
        when v_applied_group.group_kind = 'stack' then format('%s · 胜场重置', v_reason)
        else format('%s · 胜场重置', v_reason)
      end;
      else
        v_applied_group.applied_points_delta := 0;
      end if;
    end if;
$tail$;

  v_function_def := replace(v_function_def, v_original_guard, v_replaced_guard);
  v_function_def := replace(v_function_def, v_original_tail, v_replaced_tail);

  if position('重置效果只可用于本场胜方的积分变动。' in v_function_def) > 0 then
    raise exception 'Failed to patch private.apply_match_double_downs; old reset-item guard still present.';
  end if;

  execute v_function_def;
end;
$$;

commit;
