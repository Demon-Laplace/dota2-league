begin;

create or replace function private.is_split_team_item_usage(
  p_effect_payload jsonb
)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select coalesce(p_effect_payload ->> 'mode', '') = 'team'
    and coalesce(p_effect_payload ->> 'payment_mode', 'solo') = 'split';
$$;

comment on function private.is_split_team_item_usage(jsonb)
  is 'Returns true for team item usage rows paid by split contribution. Current match-created rows do not always include legacy source_kind metadata.';

do $$
declare
  v_function_identity text;
  v_function_def text;
  v_patched_def text;
begin
  foreach v_function_identity in array array[
    'public.get_item_catalog_usage_summary(uuid)',
    'private.sync_item_purchase_reward_donations(uuid)',
    'public.revoke_player_item_inventory(uuid,uuid,uuid,text)',
    'public.get_item_inventory_activity_log(uuid,uuid)'
  ]
  loop
    if to_regprocedure(v_function_identity) is null then
      continue;
    end if;

    select pg_get_functiondef(to_regprocedure(v_function_identity))
    into v_function_def;

    v_patched_def := regexp_replace(
      v_function_def,
      'coalesce\(iu\.effect_payload\s*->>\s*''source_kind'',\s*''''\)\s*=\s*''match_double_down''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''mode'',\s*''''\)\s*=\s*''team''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''payment_mode'',\s*''solo''\)\s*=\s*''split''',
      'private.is_split_team_item_usage(iu.effect_payload)',
      'g'
    );

    v_patched_def := regexp_replace(
      v_patched_def,
      'coalesce\(iu\.effect_payload\s*->>\s*''mode'',\s*''''\)\s*=\s*''team''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''payment_mode'',\s*''solo''\)\s*=\s*''split''',
      'private.is_split_team_item_usage(iu.effect_payload)',
      'g'
    );

    if v_patched_def <> v_function_def then
      execute v_patched_def;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_season_id uuid;
begin
  if to_regprocedure('private.sync_item_purchase_reward_donations(uuid)') is null then
    return;
  end if;

  for v_season_id in
    select distinct ii.season_id
    from private.item_instances ii
    where ii.season_id is not null
  loop
    perform private.sync_item_purchase_reward_donations(v_season_id);
  end loop;
end;
$$;

commit;
