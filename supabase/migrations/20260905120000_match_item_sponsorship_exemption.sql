begin;

-- Keep effects and the real player identity; only waive this usage's cost.
-- Patch the current function so earlier scoring fixes remain intact.
do $migration$
declare
  v_def text;
  v_pair record;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid,jsonb,uuid)'::regprocedure) into v_def;
  for v_pair in select * from (values
    ('  v_item jsonb;', E'  v_item jsonb;\n  v_sponsorship_exempt boolean;'),
    ('    cost_amount numeric(10, 2) not null default 0,', E'    cost_amount numeric(10, 2) not null default 0,\n    sponsorship_exempt boolean not null default false,'),
    ('    v_mode := coalesce(v_item ->> ''mode'', '''');', E'    v_sponsorship_exempt := coalesce(v_item -> ''sponsorship_exempt'' = ''true''::jsonb, false);\n    v_mode := coalesce(v_item ->> ''mode'', '''');'),
    ('    v_cost_amount := greatest(coalesce(nullif(v_item ->> ''cost_amount'', '''')::numeric, 0), 0);',
     E'    v_cost_amount := case when v_sponsorship_exempt then 0 else greatest(coalesce(nullif(v_item ->> ''cost_amount'', '''')::numeric, 0), 0) end;\n    if v_sponsorship_exempt then v_payment_mode := ''solo''; end if;'),
    (E'      cost_amount,\n      score_delta_multiplier,', E'      cost_amount,\n      sponsorship_exempt,\n      score_delta_multiplier,'),
    (E'      v_cost_amount,\n      v_item_score_delta_multiplier,', E'      v_cost_amount,\n      v_sponsorship_exempt,\n      v_item_score_delta_multiplier,'),
    ('''cost_amount'', v_cost_amount,', E'''cost_amount'', v_cost_amount,\n            ''sponsorship_exempt'', v_sponsorship_exempt,'),
    ('            when v_cost_amount > 0 then format(', E'            when v_sponsorship_exempt then format(''%s 使用 %s · 赠送。'', coalesce(v_actor_display_name, ''该选手''), coalesce(v_item_catalog_name, ''道具''))\n            when v_cost_amount > 0 then format(')
  ) as patches(before_text, after_text)
  loop
    if position(v_pair.before_text in v_def) = 0 then
      raise exception 'Missing exemption patch anchor: %', v_pair.before_text;
    end if;
    v_def := replace(v_def, v_pair.before_text, v_pair.after_text);
  end loop;
  execute v_def;
end;
$migration$;

-- Exempt usage remains visible in the usage total, but consumes no inventory.
do $migration$
declare
  v_def text;
  v_old text;
begin
  select pg_get_functiondef('public.get_item_catalog_usage_summary(uuid)'::regprocedure) into v_def;
  v_old := '      end as usage_weight';
  if position(v_old in v_def) = 0 then raise exception 'Missing summary usage anchor'; end if;
  v_def := replace(v_def, v_old,
    E'      end as usage_weight,\n      coalesce(iu.effect_payload -> ''sponsorship_exempt'' = ''true''::jsonb, false) as sponsorship_exempt');
  v_old := 'round(sum(ur.usage_weight), 2) as usage_count';
  if position(v_old in v_def) = 0 then raise exception 'Missing summary count anchor'; end if;
  v_def := replace(v_def, v_old,
    E'round(sum(ur.usage_weight), 2) as usage_count,\n      round(sum(case when ur.sponsorship_exempt then 0 else ur.usage_weight end), 2) as charged_usage_count');
  v_old := '- coalesce(uc.usage_count, 0)';
  if position(v_old in v_def) = 0 then raise exception 'Missing remaining inventory anchor'; end if;
  v_def := replace(v_def, v_old, '- coalesce(uc.charged_usage_count, 0)');
  -- The later public-summary migration restored a legacy split predicate.
  v_def := regexp_replace(v_def,
    'coalesce\(iu\.effect_payload\s*->>\s*''source_kind'',\s*''''\)\s*=\s*''match_double_down''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''mode'',\s*''''\)\s*=\s*''team''\s+and\s+coalesce\(iu\.effect_payload\s*->>\s*''payment_mode'',\s*''solo''\)\s*=\s*''split''',
    'private.is_split_team_item_usage(iu.effect_payload)', 'g');
  execute v_def;
end;
$migration$;

-- Filter before the window aggregate: free usages cannot dilute paid shares.
do $migration$
declare
  v_identity text;
  v_def text;
  v_old text := 'and iu.status not in (''cancelled'', ''rejected'')';
begin
  foreach v_identity in array array[
    'private.sync_item_purchase_reward_donations(uuid)',
    'public.revoke_player_item_inventory(uuid,uuid,uuid,text)'
  ] loop
    select pg_get_functiondef(v_identity::regprocedure) into v_def;
    if position(v_old in v_def) = 0 then raise exception 'Missing usage filter in %', v_identity; end if;
    v_def := replace(v_def, v_old, v_old || E'\n     and not coalesce(iu.effect_payload -> ''sponsorship_exempt'' = ''true''::jsonb, false)');
    execute v_def;
  end loop;
end;
$migration$;

commit;
