begin;

comment on column public.item_catalog.config is 'Extensible item definition. Current front-end stores donation_amount, operator_roles, match_targets, and match_icon for catalog management and match registration.';

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
  v_payment_mode text;
  v_contributor_player_ids uuid[] := array[]::uuid[];
  v_owner_player_id uuid;
  v_item_instance_id uuid;
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

  perform private.cleanup_match_item_catalog_usages(p_match_id);

  delete from public.reward_donations
  where match_id = p_match_id
    and category = 'card';

  for v_item in
    select value
    from jsonb_array_elements(p_double_downs)
  loop
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

    if coalesce(jsonb_typeof(v_item -> 'contributor_player_ids'), '') = 'array' then
      select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_contributor_player_ids
      from jsonb_array_elements_text(v_item -> 'contributor_player_ids');
    end if;

    if v_item_catalog_id is not null then
      select ic.name
      into v_item_catalog_name
      from public.item_catalog ic
      where ic.id = v_item_catalog_id;

      if not found then
        raise exception 'Item catalog % not found.', v_item_catalog_id
          using errcode = 'P0002';
      end if;
    else
      v_item_catalog_name := null;
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

      v_reason := coalesce(
        nullif(v_item_catalog_name, ''),
        format('团队积分卡 · Match #%s · %s', v_match.match_no, v_target_team)
      );

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
      select
        v_match.season_id,
        mp.player_id,
        p_match_id,
        'item_effect',
        sl.points_delta,
        v_reason,
        'public.matches',
        p_match_id,
        p_actor,
        jsonb_build_object(
          'kind', 'team_card',
          'target_team', case when v_target_team = 'radiant' then 'A' else 'B' end,
          'source_team', case when v_source_team = 'radiant' then 'A' else 'B' end,
          'user_player_id', v_actor_player_id,
          'item_catalog_id', v_item_catalog_id
        )
      from public.match_players mp
      join public.score_ledger sl
        on sl.match_id = p_match_id
       and sl.player_id = mp.player_id
       and sl.entry_type = 'match_result'
      where mp.match_id = p_match_id
        and mp.side = v_target_team
        and sl.points_delta <> 0;
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

      v_reason := coalesce(
        nullif(v_item_catalog_name, ''),
        format('单人积分卡 · Match #%s', v_match.match_no)
      );

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
      select
        v_match.season_id,
        sl.player_id,
        p_match_id,
        'item_effect',
        sl.points_delta,
        v_reason,
        'public.matches',
        p_match_id,
        p_actor,
        jsonb_build_object(
          'kind', 'single_card',
          'user_player_id', v_actor_player_id,
          'target_player_id', v_target_player_id,
          'item_catalog_id', v_item_catalog_id
        )
      from public.score_ledger sl
      where sl.match_id = p_match_id
        and sl.player_id = v_target_player_id
        and sl.entry_type = 'match_result'
        and sl.points_delta <> 0;
    end if;

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
          'public',
          p_actor,
          format('%s · Match #%s', coalesce(v_item_catalog_name, '比赛道具'), v_match.match_no),
          jsonb_build_object(
            'source_kind', 'match_double_down',
            'match_id', p_match_id,
            'mode', v_mode
          )
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
          case when v_mode = 'single' then v_target_player_id else null end,
          coalesce(p_actor, auth.uid()),
          'applied',
          'public',
          0,
          jsonb_build_object(
            'source_kind', 'match_double_down',
            'mode', v_mode,
            'item_catalog_id', v_item_catalog_id,
            'target_team', case when v_target_team = 'radiant' then 'A' when v_target_team = 'dire' then 'B' else null end,
            'source_team', case when v_source_team = 'radiant' then 'A' when v_source_team = 'dire' then 'B' else null end,
            'payment_mode', v_payment_mode
          ),
          format('%s · Match #%s', coalesce(v_item_catalog_name, '比赛道具'), v_match.match_no)
        );
      end loop;
    elsif v_cost_amount > 0 then
      insert into public.reward_donations (
        donor_name,
        player_id,
        match_id,
        amount,
        category,
        note,
        is_outside,
        is_public,
        donated_at
      )
      values (
        coalesce(v_actor_display_name, '未知赞助人'),
        v_actor_player_id,
        p_match_id,
        v_cost_amount,
        'card',
        case
          when v_mode = 'team' then format('团队双倍卡 · Match #%s', v_match.match_no)
          else format('个人双倍卡 · Match #%s', v_match.match_no)
        end,
        false,
        true,
        timezone('utc', now())
      );
    end if;
  end loop;
end;
$$;

commit;
