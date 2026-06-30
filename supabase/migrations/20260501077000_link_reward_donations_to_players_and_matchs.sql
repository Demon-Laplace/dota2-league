begin;

alter table public.reward_donations
  add column if not exists player_id uuid references public.players(id) on delete set null,
  add column if not exists match_id uuid references public.matches(id) on delete cascade;

update public.reward_donations rd
set player_id = p.id
from public.players p
where rd.player_id is null
  and coalesce(rd.is_outside, false) = false
  and p.display_name = rd.donor_name;

create index if not exists reward_donations_player_id_idx
  on public.reward_donations (player_id, created_at desc);

create index if not exists reward_donations_match_id_idx
  on public.reward_donations (match_id, created_at desc);

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
  v_target_player_id uuid;
  v_match public.matches%rowtype;
  v_reason text;
  v_cost_amount numeric(10, 2);
  v_actor_display_name text;
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

  delete from public.reward_donations
  where match_id = p_match_id
    and category = 'card';

  for v_item in
    select value
    from jsonb_array_elements(p_double_downs)
  loop
    v_mode := coalesce(v_item ->> 'mode', '');
    v_actor_player_id := nullif(v_item ->> 'user_player_id', '')::uuid;
    v_target_team := coalesce(v_item ->> 'target_team', '');
    v_target_player_id := nullif(v_item ->> 'target_player_id', '')::uuid;
    v_cost_amount := greatest(coalesce(nullif(v_item ->> 'cost_amount', '')::numeric, 0), 0);

    if v_mode not in ('team', 'single') then
      raise exception 'Unsupported match effect mode: %.', v_mode
        using errcode = '22023';
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

      if not exists (
        select 1
        from public.match_players mp
        where mp.match_id = p_match_id
          and mp.player_id = v_actor_player_id
          and mp.side = v_target_team
      ) then
        raise exception 'Team effect actor must belong to the affected team.'
          using errcode = '22023';
      end if;

      v_reason := format('团队积分卡 · Match #%s · %s', v_match.match_no, v_target_team);

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
          'target_team', v_target_team,
          'user_player_id', v_actor_player_id
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

      if exists (
        select 1
        from public.match_players actor_mp
        join public.match_players target_mp
          on target_mp.match_id = actor_mp.match_id
        where actor_mp.match_id = p_match_id
          and actor_mp.player_id = v_actor_player_id
          and target_mp.player_id = v_target_player_id
          and actor_mp.player_id <> target_mp.player_id
          and actor_mp.side = target_mp.side
      ) then
        raise exception 'Single effect may only target self or the opposing team.'
          using errcode = '22023';
      end if;

      v_reason := format('单人积分卡 · Match #%s', v_match.match_no);

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
          'target_player_id', v_target_player_id
        )
      from public.score_ledger sl
      where sl.match_id = p_match_id
        and sl.player_id = v_target_player_id
        and sl.entry_type = 'match_result'
        and sl.points_delta <> 0;
    end if;

    if v_cost_amount > 0 then
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
