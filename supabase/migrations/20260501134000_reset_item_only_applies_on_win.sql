begin;

create or replace function private.apply_match_double_downs(
  p_match_id uuid,
  p_double_downs jsonb default '[]'::jsonb,
  p_actor uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_item jsonb;
  v_mode text;
  v_actor_player_id uuid;
  v_target_team text;
  v_source_team text;
  v_target_player_id uuid;
  v_match public.matches%rowtype;
  v_reason text;
  v_cost_amount numeric(10, 2);
  v_actor_display_name text;
  v_item_catalog_id uuid;
  v_item_catalog_name text;
  v_item_score_delta_multiplier numeric(10, 2);
  v_item_score_delta_special text;
  v_payment_mode text;
  v_contributor_player_ids uuid[] := array[]::uuid[];
  v_owner_player_id uuid;
  v_item_instance_id uuid;
  v_candidate_id uuid;
  v_target_player record;
  v_stack_pair record;
  v_single_effect record;
  v_applied_group record;
  v_group_items jsonb;
  v_group_item_names text[];
  v_initial_score numeric(10, 2);
  v_participation_points numeric(10, 2);
  v_pre_match_competitive_total numeric(10, 2);
  v_competitive_total numeric(10, 2);
begin
  if coalesce(jsonb_typeof(p_double_downs), '') <> 'array' then
    raise exception 'double_downs must be a JSON array.'
      using errcode = '22023';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  select
    coalesce(private.season_initial_score(v_match.season_id), 5),
    coalesce(nullif(s.rule_config ->> 'participation_points', '')::numeric, 0)
  into v_initial_score, v_participation_points
  from public.seasons s
  where s.id = v_match.season_id;

  perform private.cleanup_match_item_catalog_usages(p_match_id);

  delete from public.reward_donations
  where match_id = p_match_id
    and category = 'card';

  create temp table if not exists pg_temp.match_item_candidates (
    candidate_id uuid primary key,
    mode text not null,
    actor_player_id uuid not null,
    target_player_id uuid,
    target_team text,
    source_team text,
    item_catalog_id uuid,
    item_catalog_name text,
    payment_mode text not null,
    contributor_player_ids uuid[] not null default array[]::uuid[],
    cost_amount numeric(10, 2) not null default 0,
    score_delta_multiplier numeric(10, 2) not null default 0,
    score_delta_special text not null default ''
  ) on commit drop;

  create temp table if not exists pg_temp.match_item_target_effects (
    effect_id uuid primary key,
    candidate_id uuid not null,
    target_player_id uuid not null,
    base_points_delta numeric(10, 2) not null,
    mode text not null,
    actor_player_id uuid not null,
    target_team text,
    source_team text,
    item_catalog_id uuid,
    item_catalog_name text,
    score_delta_multiplier numeric(10, 2) not null,
    score_delta_special text not null default '',
    is_consumed boolean not null default false
  ) on commit drop;

  create temp table if not exists pg_temp.match_item_applied_groups (
    applied_group_id uuid primary key,
    target_player_id uuid not null,
    base_points_delta numeric(10, 2) not null,
    applied_points_delta numeric(10, 2) not null,
    applied_multiplier numeric(10, 2) not null,
    applied_special text not null default '',
    group_kind text not null,
    source_effect_ids uuid[] not null default array[]::uuid[]
  ) on commit drop;

  truncate pg_temp.match_item_candidates;
  truncate pg_temp.match_item_target_effects;
  truncate pg_temp.match_item_applied_groups;

  for v_item in
    select value
    from jsonb_array_elements(p_double_downs)
  loop
    v_candidate_id := gen_random_uuid();
    v_mode := coalesce(v_item ->> 'mode', '');
    v_actor_player_id := nullif(v_item ->> 'user_player_id', '')::uuid;
    v_target_player_id := nullif(v_item ->> 'target_player_id', '')::uuid;
    v_item_catalog_id := nullif(v_item ->> 'item_catalog_id', '')::uuid;
    v_payment_mode := case when coalesce(v_item ->> 'payment_mode', 'solo') = 'split' then 'split' else 'solo' end;
    v_cost_amount := greatest(coalesce(nullif(v_item ->> 'cost_amount', '')::numeric, 0), 0);
    v_target_team := case
      when coalesce(v_item ->> 'target_team', '') in ('A', 'radiant') then 'radiant'
      when coalesce(v_item ->> 'target_team', '') in ('B', 'dire') then 'dire'
      else ''
    end;
    v_source_team := case
      when coalesce(v_item ->> 'source_team', '') in ('A', 'radiant') then 'radiant'
      when coalesce(v_item ->> 'source_team', '') in ('B', 'dire') then 'dire'
      else ''
    end;
    v_contributor_player_ids := array[]::uuid[];
    v_item_score_delta_multiplier := 0;
    v_item_score_delta_special := '';

    if coalesce(jsonb_typeof(v_item -> 'contributor_player_ids'), '') = 'array' then
      select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_contributor_player_ids
      from jsonb_array_elements_text(v_item -> 'contributor_player_ids');
    end if;

    if v_item_catalog_id is not null then
      select
        ic.name,
        coalesce(ic.score_delta_multiplier, 0),
        coalesce(ic.score_delta_special, '')
      into v_item_catalog_name, v_item_score_delta_multiplier, v_item_score_delta_special
      from public.item_catalog ic
      where ic.id = v_item_catalog_id;

      if not found then
        raise exception 'Item catalog % not found.', v_item_catalog_id
          using errcode = 'P0002';
      end if;
    else
      v_item_catalog_name := null;
      v_item_score_delta_multiplier := 1;
      v_item_score_delta_special := '';
    end if;

    if v_mode not in ('team', 'single') then
      raise exception 'Unsupported match effect mode: %.', v_mode
        using errcode = '22023';
    end if;

    if v_mode = 'team' and v_source_team = '' then
      v_source_team := case
        when v_actor_player_id is not null then (
          select mp.side
          from public.match_players mp
          where mp.match_id = p_match_id
            and mp.player_id = v_actor_player_id
          limit 1
        )
        else ''
      end;
    end if;

    if v_actor_player_id is null and v_mode = 'team' and v_payment_mode = 'split' and coalesce(array_length(v_contributor_player_ids, 1), 0) > 0 then
      v_actor_player_id := v_contributor_player_ids[1];
    end if;

    if v_actor_player_id is null then
      raise exception 'Each match effect requires user_player_id.'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.match_players mp
      where mp.match_id = p_match_id
        and mp.player_id = v_actor_player_id
    ) then
      raise exception 'Effect actor % is not part of match %.', v_actor_player_id, p_match_id
        using errcode = '22023';
    end if;

    select p.display_name
    into v_actor_display_name
    from public.players p
    where p.id = v_actor_player_id;

    if v_mode = 'team' then
      if v_target_team not in ('radiant', 'dire') then
        raise exception 'Team effect target_team must be radiant or dire.'
          using errcode = '22023';
      end if;

      if v_source_team not in ('radiant', 'dire') then
        raise exception 'Team effect source_team must be radiant or dire.'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.match_players mp
        where mp.match_id = p_match_id
          and mp.player_id = v_actor_player_id
          and mp.side = v_source_team
      ) then
        raise exception 'Team effect actor must belong to the source team.'
          using errcode = '22023';
      end if;
    else
      if v_target_player_id is null then
        raise exception 'Single effect requires target_player_id.'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.match_players mp
        where mp.match_id = p_match_id
          and mp.player_id = v_target_player_id
      ) then
        raise exception 'Single effect target % is not part of match %.', v_target_player_id, p_match_id
          using errcode = '22023';
      end if;
    end if;

    insert into pg_temp.match_item_candidates (
      candidate_id,
      mode,
      actor_player_id,
      target_player_id,
      target_team,
      source_team,
      item_catalog_id,
      item_catalog_name,
      payment_mode,
      contributor_player_ids,
      cost_amount,
      score_delta_multiplier,
      score_delta_special
    )
    values (
      v_candidate_id,
      v_mode,
      v_actor_player_id,
      v_target_player_id,
      nullif(v_target_team, ''),
      nullif(v_source_team, ''),
      v_item_catalog_id,
      v_item_catalog_name,
      v_payment_mode,
      v_contributor_player_ids,
      v_cost_amount,
      v_item_score_delta_multiplier,
      v_item_score_delta_special
    );
  end loop;

  insert into pg_temp.match_item_target_effects (
    effect_id,
    candidate_id,
    target_player_id,
    base_points_delta,
    mode,
    actor_player_id,
    target_team,
    source_team,
    item_catalog_id,
    item_catalog_name,
    score_delta_multiplier,
    score_delta_special
  )
  select
    gen_random_uuid(),
    c.candidate_id,
    sl.player_id,
    sl.points_delta,
    c.mode,
    c.actor_player_id,
    c.target_team,
    c.source_team,
    c.item_catalog_id,
    c.item_catalog_name,
    c.score_delta_multiplier,
    c.score_delta_special
  from pg_temp.match_item_candidates c
  join public.match_players mp
    on mp.match_id = p_match_id
   and c.mode = 'team'
   and mp.side = c.target_team
  join public.score_ledger sl
    on sl.match_id = p_match_id
   and sl.player_id = mp.player_id
   and sl.entry_type = 'match_result'
  where sl.points_delta <> 0

  union all

  select
    gen_random_uuid(),
    c.candidate_id,
    sl.player_id,
    sl.points_delta,
    c.mode,
    c.actor_player_id,
    c.target_team,
    c.source_team,
    c.item_catalog_id,
    c.item_catalog_name,
    c.score_delta_multiplier,
    c.score_delta_special
  from pg_temp.match_item_candidates c
  join public.score_ledger sl
    on sl.match_id = p_match_id
   and sl.player_id = c.target_player_id
   and sl.entry_type = 'match_result'
  where c.mode = 'single'
    and sl.points_delta <> 0;

  for v_target_player in
    select distinct tie.target_player_id
    from pg_temp.match_item_target_effects tie
    order by tie.target_player_id
  loop
    loop
      select
        tie_a.effect_id as effect_id_low,
        tie_b.effect_id as effect_id_high,
        tie_a.base_points_delta,
        stacks.score_delta_multiplier,
        coalesce(stacks.score_delta_special, '') as score_delta_special
      into v_stack_pair
      from pg_temp.match_item_target_effects tie_a
      join pg_temp.match_item_target_effects tie_b
        on tie_b.target_player_id = tie_a.target_player_id
       and tie_b.effect_id > tie_a.effect_id
       and not tie_b.is_consumed
      join public.item_catalog_score_stacks stacks
        on stacks.item_catalog_id_low = case
          when tie_a.item_catalog_id < tie_b.item_catalog_id then tie_a.item_catalog_id
          else tie_b.item_catalog_id
        end
       and stacks.item_catalog_id_high = case
          when tie_a.item_catalog_id < tie_b.item_catalog_id then tie_b.item_catalog_id
          else tie_a.item_catalog_id
        end
      where tie_a.target_player_id = v_target_player.target_player_id
        and not tie_a.is_consumed
        and tie_a.item_catalog_id is not null
        and tie_b.item_catalog_id is not null
      order by
        case when coalesce(stacks.score_delta_special, '') = '@' then 1 else 0 end desc,
        abs(stacks.score_delta_multiplier) desc,
        least(tie_a.item_catalog_id::text, tie_b.item_catalog_id::text),
        greatest(tie_a.item_catalog_id::text, tie_b.item_catalog_id::text),
        tie_a.effect_id,
        tie_b.effect_id
      limit 1;

      exit when not found;

      update pg_temp.match_item_target_effects
      set is_consumed = true
      where effect_id in (v_stack_pair.effect_id_low, v_stack_pair.effect_id_high);

      insert into pg_temp.match_item_applied_groups (
        applied_group_id,
        target_player_id,
        base_points_delta,
        applied_points_delta,
        applied_multiplier,
        applied_special,
        group_kind,
        source_effect_ids
      )
      values (
        gen_random_uuid(),
        v_target_player.target_player_id,
        v_stack_pair.base_points_delta,
        case
          when v_stack_pair.score_delta_special = '@' then 0
          when v_stack_pair.score_delta_multiplier = 0 then 0
          else v_stack_pair.base_points_delta * (v_stack_pair.score_delta_multiplier - 1)
        end,
        v_stack_pair.score_delta_multiplier,
        v_stack_pair.score_delta_special,
        'stack',
        array[v_stack_pair.effect_id_low, v_stack_pair.effect_id_high]
      );
    end loop;

    for v_single_effect in
      select *
      from pg_temp.match_item_target_effects tie
      where tie.target_player_id = v_target_player.target_player_id
        and not tie.is_consumed
    loop
      update pg_temp.match_item_target_effects
      set is_consumed = true
      where effect_id = v_single_effect.effect_id;

      insert into pg_temp.match_item_applied_groups (
        applied_group_id,
        target_player_id,
        base_points_delta,
        applied_points_delta,
        applied_multiplier,
        applied_special,
        group_kind,
        source_effect_ids
      )
      values (
        gen_random_uuid(),
        v_single_effect.target_player_id,
        v_single_effect.base_points_delta,
        case
          when v_single_effect.score_delta_special = '@' then 0
          when v_single_effect.score_delta_multiplier = 0 then 0
          else v_single_effect.base_points_delta * (v_single_effect.score_delta_multiplier - 1)
        end,
        v_single_effect.score_delta_multiplier,
        v_single_effect.score_delta_special,
        'single',
        array[v_single_effect.effect_id]
      );
    end loop;
  end loop;

  for v_applied_group in
    select *
    from pg_temp.match_item_applied_groups maig
    order by maig.target_player_id, maig.group_kind, maig.applied_group_id
  loop
    select
      coalesce(array_agg(coalesce(tie.item_catalog_name, '') order by tie.effect_id), array[]::text[]),
      coalesce(jsonb_agg(jsonb_build_object(
        'candidate_id', tie.candidate_id,
        'mode', tie.mode,
        'actor_player_id', tie.actor_player_id,
        'item_catalog_id', tie.item_catalog_id,
        'item_catalog_name', tie.item_catalog_name,
        'target_team', case when tie.target_team = 'radiant' then 'A' when tie.target_team = 'dire' then 'B' else null end,
        'source_team', case when tie.source_team = 'radiant' then 'A' when tie.source_team = 'dire' then 'B' else null end,
        'score_delta_multiplier', tie.score_delta_multiplier,
        'score_delta_special', nullif(tie.score_delta_special, '')
      ) order by tie.effect_id), '[]'::jsonb)
    into v_group_item_names, v_group_items
    from pg_temp.match_item_target_effects tie
    where tie.effect_id = any(v_applied_group.source_effect_ids);

    if v_applied_group.group_kind = 'stack' then
      v_reason := case
        when coalesce(array_length(v_group_item_names, 1), 0) >= 2
          and nullif(v_group_item_names[1], '') is not null
          and nullif(v_group_item_names[2], '') is not null
        then format('%s + %s', v_group_item_names[1], v_group_item_names[2])
        else format('叠加积分卡 · Match #%s', v_match.match_no)
      end;
    else
      v_reason := coalesce(
        nullif(v_group_item_names[1], ''),
        format('积分卡效果 · Match #%s', v_match.match_no)
      );
    end if;

    if v_applied_group.applied_special = '@' then
      if v_applied_group.base_points_delta > 0 then
        select coalesce(
          v_initial_score + sum(
            case
              when sl.entry_type = 'match_result'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta - v_participation_points
              when sl.entry_type = 'item_effect'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta
              else 0
            end
          ),
          v_initial_score
        )
        into v_pre_match_competitive_total
        from public.score_ledger sl
        where sl.season_id = v_match.season_id
          and sl.player_id = v_applied_group.target_player_id
          and sl.reversal_of_id is null
          and sl.match_id is distinct from p_match_id;

        if coalesce(v_pre_match_competitive_total, v_initial_score) >= v_initial_score then
          raise exception '仅当胜负积分低于赛季初始分时，才可使用重置效果道具。'
            using errcode = '22023';
        end if;

        select coalesce(
          v_initial_score + sum(
            case
              when sl.entry_type = 'match_result'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta - v_participation_points
              when sl.entry_type = 'item_effect'
                and sl.match_id is not null
                and sl.source_table = 'public.matches'
              then sl.points_delta
              else 0
            end
          ),
          v_initial_score
        )
        into v_competitive_total
        from public.score_ledger sl
        where sl.season_id = v_match.season_id
          and sl.player_id = v_applied_group.target_player_id
          and sl.reversal_of_id is null;

        v_applied_group.applied_points_delta := v_initial_score - coalesce(v_competitive_total, v_initial_score);

        if v_applied_group.applied_points_delta = 0 then
          raise exception '当前胜负积分已回到赛季初始分，无需使用重置效果道具。'
            using errcode = '22023';
        end if;

        v_reason := format('%s · 胜场重置', v_reason);
      else
        v_applied_group.applied_points_delta := 0;
      end if;
    end if;

    if v_applied_group.applied_points_delta <> 0 then
      insert into public.score_ledger (
        season_id,
        player_id,
        match_id,
        entry_type,
        points_delta,
        reason,
        source_table,
        source_id,
        created_by,
        metadata
      )
      values (
        v_match.season_id,
        v_applied_group.target_player_id,
        p_match_id,
        'item_effect',
        v_applied_group.applied_points_delta,
        v_reason,
        'public.matches',
        p_match_id,
        p_actor,
        jsonb_build_object(
          'kind', case when v_applied_group.group_kind = 'stack' then 'stacked_card' else 'item_card' end,
          'target_player_id', v_applied_group.target_player_id,
          'applied_multiplier', v_applied_group.applied_multiplier,
          'applied_special', nullif(v_applied_group.applied_special, ''),
          'base_points_delta', v_applied_group.base_points_delta,
          'reset_to_initial_win_score', (v_applied_group.applied_special = '@' and v_applied_group.base_points_delta > 0),
          'source_items', v_group_items
        )
      );
    end if;
  end loop;

  for v_item in
    select to_jsonb(c.*) as value
    from pg_temp.match_item_candidates c
    order by c.candidate_id
  loop
    v_mode := coalesce(v_item ->> 'mode', '');
    v_actor_player_id := nullif(v_item ->> 'actor_player_id', '')::uuid;
    v_target_player_id := nullif(v_item ->> 'target_player_id', '')::uuid;
    v_item_catalog_id := nullif(v_item ->> 'item_catalog_id', '')::uuid;
    v_item_catalog_name := nullif(v_item ->> 'item_catalog_name', '');
    v_payment_mode := case when coalesce(v_item ->> 'payment_mode', 'solo') = 'split' then 'split' else 'solo' end;
    v_cost_amount := greatest(coalesce(nullif(v_item ->> 'cost_amount', '')::numeric, 0), 0);
    v_target_team := case
      when coalesce(v_item ->> 'target_team', '') in ('radiant') then 'radiant'
      when coalesce(v_item ->> 'target_team', '') in ('dire') then 'dire'
      else ''
    end;
    v_source_team := case
      when coalesce(v_item ->> 'source_team', '') in ('radiant') then 'radiant'
      when coalesce(v_item ->> 'source_team', '') in ('dire') then 'dire'
      else ''
    end;
    v_item_score_delta_multiplier := coalesce(nullif(v_item ->> 'score_delta_multiplier', '')::numeric, 0);
    v_item_score_delta_special := coalesce(v_item ->> 'score_delta_special', '');
    v_contributor_player_ids := coalesce(array(
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_item -> 'contributor_player_ids', '[]'::jsonb))
    ), array[]::uuid[]);
    v_actor_display_name := null;

    select p.display_name
    into v_actor_display_name
    from public.players p
    where p.id = v_actor_player_id;

    if v_item_catalog_id is not null then
      if v_mode = 'single' then
        v_contributor_player_ids := array[v_actor_player_id];
      elsif v_payment_mode <> 'split' then
        v_contributor_player_ids := array[v_actor_player_id];
      elsif coalesce(array_length(v_contributor_player_ids, 1), 0) = 0 then
        select coalesce(array_agg(mp.player_id order by mp.slot_no), array[]::uuid[])
        into v_contributor_player_ids
        from public.match_players mp
        where mp.match_id = p_match_id
          and mp.side = v_source_team;
      end if;

      foreach v_owner_player_id in array v_contributor_player_ids
      loop
        continue when v_owner_player_id is null;

        if not exists (
          select 1
          from public.match_players mp
          where mp.match_id = p_match_id
            and mp.player_id = v_owner_player_id
        ) then
          raise exception 'Item owner % is not part of match %.', v_owner_player_id, p_match_id
            using errcode = '22023';
        end if;

        if v_mode = 'team' and not exists (
          select 1
          from public.match_players mp
          where mp.match_id = p_match_id
            and mp.player_id = v_owner_player_id
            and mp.side = v_source_team
        ) then
          raise exception 'Team item owner % must belong to the source team.', v_owner_player_id
            using errcode = '22023';
        end if;

        insert into private.item_instances (
          season_id,
          player_id,
          item_catalog_id,
          status,
          visibility_mode,
          granted_by,
          granted_reason,
          metadata
        )
        values (
          v_match.season_id,
          v_owner_player_id,
          v_item_catalog_id,
          'consumed',
          public.resolve_item_visibility(v_item_catalog_id, 'used'),
          p_actor,
          format('Match #%s 道具使用：%s', v_match.match_no, coalesce(v_item_catalog_name, '未命名道具')),
          jsonb_strip_nulls(jsonb_build_object(
            'match_id', p_match_id,
            'mode', v_mode,
            'actor_player_id', v_actor_player_id,
            'target_player_id', v_target_player_id,
            'target_team', nullif(v_target_team, ''),
            'source_team', nullif(v_source_team, ''),
            'payment_mode', v_payment_mode,
            'cost_amount', v_cost_amount,
            'score_delta_multiplier', v_item_score_delta_multiplier,
            'score_delta_special', nullif(v_item_score_delta_special, ''),
            'source_candidate_id', nullif(v_item ->> 'candidate_id', '')
          ))
        )
        returning id into v_item_instance_id;

        insert into private.item_usages (
          item_instance_id,
          season_id,
          match_id,
          target_player_id,
          used_by,
          status,
          visibility_mode,
          effect_points_delta,
          effect_payload,
          notes
        )
        values (
          v_item_instance_id,
          v_match.season_id,
          p_match_id,
          v_target_player_id,
          p_actor,
          'applied',
          public.resolve_item_visibility(v_item_catalog_id, 'used'),
          0,
          jsonb_strip_nulls(jsonb_build_object(
            'mode', v_mode,
            'actor_player_id', v_actor_player_id,
            'target_player_id', v_target_player_id,
            'target_team', nullif(v_target_team, ''),
            'source_team', nullif(v_source_team, ''),
            'payment_mode', v_payment_mode,
            'cost_amount', v_cost_amount,
            'score_delta_multiplier', v_item_score_delta_multiplier,
            'score_delta_special', nullif(v_item_score_delta_special, ''),
            'applied_via_match', true
          )),
          case
            when v_cost_amount > 0 then format('%s 使用 %s，消耗 %s 元。', coalesce(v_actor_display_name, '该选手'), coalesce(v_item_catalog_name, '道具'), trim(to_char(v_cost_amount, 'FM999999990.00')))
            else format('%s 使用 %s。', coalesce(v_actor_display_name, '该选手'), coalesce(v_item_catalog_name, '道具'))
          end
        );
      end loop;
    end if;
  end loop;
end;
$$;

comment on function private.apply_match_double_downs(uuid, jsonb, uuid)
  is 'Applies match item usages, including score multipliers and win-only reset effects. Reset effects become no-ops when the targeted side does not win.';

commit;
