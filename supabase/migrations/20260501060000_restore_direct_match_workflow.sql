begin;

do $compat$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'season_memberships'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'season_memberships'
      and column_name = 'player_id'
  ) then
    execute 'alter table public.season_memberships rename column user_id to player_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_players'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_players'
      and column_name = 'player_id'
  ) then
    execute 'alter table public.match_players rename column user_id to player_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'score_ledger'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'score_ledger'
      and column_name = 'player_id'
  ) then
    execute 'alter table public.score_ledger rename column user_id to player_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_player_roster'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_player_roster'
      and column_name = 'player_id'
  ) then
    execute 'alter table public.daily_player_roster rename column user_id to player_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'signup_queue'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'signup_queue'
      and column_name = 'player_id'
  ) then
    execute 'alter table public.signup_queue rename column user_id to player_id';
  end if;
end
$compat$;

update public.seasons
set rule_config = jsonb_set(
  coalesce(rule_config, '{}'::jsonb),
  '{initial_score}',
  to_jsonb(
    case
      when coalesce(nullif(rule_config ->> 'initial_score', ''), '') ~ '^-?\d+(\.\d+)?$'
        then (rule_config ->> 'initial_score')::numeric
      else 5
    end
  ),
  true
)
where coalesce(rule_config ->> 'initial_score', '') = ''
   or coalesce(nullif(rule_config ->> 'initial_score', ''), '') !~ '^-?\d+(\.\d+)?$';

create table if not exists public.season_end_confirmations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'scorekeeper')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (season_id, user_id)
);

comment on table public.season_end_confirmations is 'Season close confirmations from admins and scorekeepers.';

create index if not exists season_end_confirmations_season_role_idx
  on public.season_end_confirmations (season_id, role, created_at asc);

alter table public.season_end_confirmations enable row level security;

drop policy if exists season_end_confirmations_select_staff on public.season_end_confirmations;
create policy season_end_confirmations_select_staff
  on public.season_end_confirmations
  for select
  to authenticated
  using (public.can_adjust_scores(season_id));

drop policy if exists season_end_confirmations_insert_staff on public.season_end_confirmations;
create policy season_end_confirmations_insert_staff
  on public.season_end_confirmations
  for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_adjust_scores(season_id));

grant select, insert on public.season_end_confirmations to authenticated;

create or replace function private.season_initial_score(
  p_season_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    nullif(s.rule_config ->> 'initial_score', '')::numeric,
    5
  )
  from public.seasons s
  where s.id = p_season_id
$$;

create or replace function public.set_season_initial_score(
  p_season_id uuid,
  p_initial_score numeric
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to update season %.', p_season_id
      using errcode = '42501';
  end if;

  update public.seasons
  set rule_config = jsonb_set(
        coalesce(rule_config, '{}'::jsonb),
        '{initial_score}',
        to_jsonb(coalesce(p_initial_score, 5)),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  return v_season;
end;
$$;

create or replace function public.activate_season(
  p_season_id uuid
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to activate season %.', p_season_id
      using errcode = '42501';
  end if;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id <> p_season_id
    and status = 'active';

  update public.seasons
  set status = 'active',
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  return v_season;
end;
$$;

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

  for v_item in
    select value
    from jsonb_array_elements(p_double_downs)
  loop
    v_mode := coalesce(v_item ->> 'mode', '');
    v_actor_player_id := nullif(v_item ->> 'user_player_id', '')::uuid;
    v_target_team := coalesce(v_item ->> 'target_team', '');
    v_target_player_id := nullif(v_item ->> 'target_player_id', '')::uuid;

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
  end loop;
end;
$$;

create or replace function public.record_match_result(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_double_downs jsonb default '[]'::jsonb,
  p_match_date date default timezone('utc', now())::date
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match_id uuid;
  v_match_no integer;
  v_player_id uuid;
begin
  if not public.can_submit_matches(p_season_id) then
    raise exception 'You do not have permission to record matches for season %.', p_season_id
      using errcode = '42501';
  end if;

  if p_winner_side is not null and p_winner_side not in ('radiant', 'dire') then
    raise exception 'winner_side must be radiant, dire, or null.'
      using errcode = '22023';
  end if;

  if array_length(p_radiant_player_ids, 1) <> 5 or array_length(p_dire_player_ids, 1) <> 5 then
    raise exception 'Exactly 5 players are required on each side.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct player_id)
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as player_id
  ) <> 10 then
    raise exception 'A recorded match must contain 10 distinct players.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_radiant_player_ids, array[]::uuid[]) || coalesce(p_dire_player_ids, array[]::uuid[])) as player_id
    left join public.season_memberships sm
      on sm.season_id = p_season_id
     and sm.player_id = player_id
     and sm.join_status in ('active', 'captain')
    where sm.player_id is null
  ) then
    raise exception 'All recorded players must be active members of the selected season.'
      using errcode = '42501';
  end if;

  v_match_no := private.next_match_no(p_season_id);

  insert into public.matches (
    season_id,
    match_no,
    match_date,
    status,
    winner_side,
    notes,
    metadata,
    created_by,
    submitted_by,
    approved_by,
    submitted_at,
    approved_at
  )
  values (
    p_season_id,
    v_match_no,
    coalesce(p_match_date, timezone('utc', now())::date),
    'approved',
    p_winner_side,
    p_note,
    jsonb_build_object('double_downs', coalesce(p_double_downs, '[]'::jsonb)),
    v_actor,
    v_actor,
    v_actor,
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_match_id;

  foreach v_player_id in array p_radiant_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      v_match_id,
      p_season_id,
      v_player_id,
      'radiant',
      array_position(p_radiant_player_ids, v_player_id)
    );
  end loop;

  foreach v_player_id in array p_dire_player_ids
  loop
    insert into public.match_players (
      match_id,
      season_id,
      player_id,
      side,
      slot_no
    )
    values (
      v_match_id,
      p_season_id,
      v_player_id,
      'dire',
      array_position(p_dire_player_ids, v_player_id)
    );
  end loop;

  perform private.post_match_score_entries(v_match_id, v_actor);
  perform private.apply_match_double_downs(v_match_id, p_double_downs, v_actor);

  return v_match_id;
end;
$$;

create or replace function public.record_match_result_backfill(
  p_season_id uuid,
  p_radiant_player_ids uuid[],
  p_dire_player_ids uuid[],
  p_winner_side text default null,
  p_note text default null,
  p_match_date date default timezone('utc', now())::date,
  p_double_downs jsonb default '[]'::jsonb
)
returns uuid
language sql
security definer
set search_path = public, private
as $$
  select public.record_match_result(
    p_season_id,
    p_radiant_player_ids,
    p_dire_player_ids,
    p_winner_side,
    p_note,
    p_double_downs,
    p_match_date
  );
$$;

create or replace function public.delete_match_and_recalculate(
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_match.season_id) then
    raise exception 'You do not have permission to delete this match.'
      using errcode = '42501';
  end if;

  delete from public.score_ledger
  where match_id = p_match_id;

  delete from public.matches
  where id = p_match_id;
end;
$$;

create or replace function public.reset_current_season(
  p_season_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted_count integer := 0;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to reset season %.', p_season_id
      using errcode = '42501';
  end if;

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status
  )
  select
    p_season_id,
    p.id,
    'inactive'
  from public.players p
  where p.is_active
    and not exists (
      select 1
      from public.season_memberships sm
      where sm.season_id = p_season_id
        and sm.player_id = p.id
    );

  get diagnostics v_inserted_count = row_count;

  delete from public.score_ledger
  where season_id = p_season_id;

  delete from private.item_usages
  where season_id = p_season_id;

  delete from public.matches
  where season_id = p_season_id;

  delete from public.season_end_confirmations
  where season_id = p_season_id;

  update public.season_memberships
  set join_status = 'inactive',
      rank_no = null,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and join_status in ('inactive', 'active', 'captain');

  return v_inserted_count;
end;
$$;

create or replace function public.confirm_season_rollover(
  p_season_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season public.seasons%rowtype;
  v_role text;
  v_scorer_confirmation_count integer := 0;
  v_cutoff timestamptz;
  v_next_start timestamptz;
  v_next_end timestamptz;
  v_next_code text;
  v_next_name text;
  v_next_season_id uuid;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to close season %.', p_season_id
      using errcode = '42501';
  end if;

  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if v_season.status <> 'active' then
    raise exception 'Only active seasons may be closed.'
      using errcode = 'P0001';
  end if;

  v_cutoff := timezone(
    'utc',
    (
      date_trunc('day', timezone('Asia/Shanghai', coalesce(v_season.end_at, timezone('utc', now()))))
      + interval '1 day'
      + interval '6 hours'
    ) at time zone 'Asia/Shanghai'
  );

  if timezone('utc', now()) < v_cutoff then
    raise exception 'Season rollover is not yet open.'
      using errcode = 'P0001';
  end if;

  v_role := case
    when public.is_admin() then 'admin'
    else 'scorekeeper'
  end;

  insert into public.season_end_confirmations (
    season_id,
    user_id,
    role
  )
  values (
    p_season_id,
    v_actor,
    v_role
  )
  on conflict (season_id, user_id) do update
    set role = excluded.role;

  select count(*)
  into v_scorer_confirmation_count
  from public.season_end_confirmations sec
  where sec.season_id = p_season_id
    and sec.role = 'scorekeeper';

  if v_scorer_confirmation_count < 2 then
    return jsonb_build_object(
      'finalized', false,
      'scorer_confirmation_count', v_scorer_confirmation_count,
      'actor_role', v_role
    );
  end if;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id = p_season_id;

  v_next_start := date_trunc('month', timezone('Asia/Shanghai', coalesce(v_season.end_at, timezone('utc', now()))) + interval '1 month');
  v_next_end := (v_next_start + interval '1 month' - interval '1 second');
  v_next_code := to_char(v_next_start, 'YYYY-MM');
  v_next_name := format('%s 年 %s 月赛季', to_char(v_next_start, 'YYYY'), to_char(v_next_start, 'FMMM'));

  insert into public.seasons (
    code,
    name,
    status,
    is_public,
    start_at,
    end_at,
    rule_version,
    rule_config
  )
  values (
    v_next_code,
    v_next_name,
    'active',
    true,
    timezone('utc', v_next_start),
    timezone('utc', v_next_end),
    to_char(v_next_start, 'YYYY.MM'),
    jsonb_set(
      coalesce(v_season.rule_config, '{}'::jsonb),
      '{rank_count}',
      to_jsonb(greatest(1, least(coalesce(nullif(v_season.rule_config ->> 'rank_count', '')::integer, 3), 12))),
      true
    )
  )
  on conflict (code) do update
    set status = 'active',
        is_public = true,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        rule_version = excluded.rule_version,
        rule_config = excluded.rule_config,
        updated_at = timezone('utc', now())
  returning id into v_next_season_id;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id <> v_next_season_id
    and status = 'active';

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status
  )
  select
    v_next_season_id,
    p.id,
    'inactive'
  from public.players p
  where p.is_active
    and not exists (
      select 1
      from public.season_memberships sm
      where sm.season_id = v_next_season_id
        and sm.player_id = p.id
    );

  return jsonb_build_object(
    'finalized', true,
    'scorer_confirmation_count', v_scorer_confirmation_count,
    'actor_role', v_role,
    'next_season_id', v_next_season_id,
    'next_season_name', v_next_name
  );
end;
$$;

drop view if exists public.v_leaderboard;

do $leaderboard$
declare
  v_membership_col text;
  v_match_player_col text;
  v_ledger_col text;
begin
  select case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'season_memberships'
        and column_name = 'player_id'
    ) then 'player_id'
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'season_memberships'
        and column_name = 'user_id'
    ) then 'user_id'
    else null
  end into v_membership_col;

  select case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_players'
        and column_name = 'player_id'
    ) then 'player_id'
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_players'
        and column_name = 'user_id'
    ) then 'user_id'
    else null
  end into v_match_player_col;

  select case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'score_ledger'
        and column_name = 'player_id'
    ) then 'player_id'
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'score_ledger'
        and column_name = 'user_id'
    ) then 'user_id'
    else null
  end into v_ledger_col;

  if v_membership_col is null or v_match_player_col is null or v_ledger_col is null then
    raise exception 'Unable to determine leaderboard identity columns for season_memberships/match_players/score_ledger.'
      using errcode = '42703';
  end if;

  execute format($sql$
    create view public.v_leaderboard
    with (security_invoker = true)
    as
    with eligible_members as (
      select
        sm.season_id,
        sm.%1$I as user_id
      from public.season_memberships sm
      where sm.join_status in ('active', 'captain')
    ),
    match_stats as (
      select
        mp.season_id,
        mp.%2$I as user_id,
        count(*) filter (where m.status = 'approved') as matches_played,
        count(*) filter (where m.status = 'approved' and mp.result = 'win') as wins,
        count(*) filter (where m.status = 'approved' and mp.result = 'loss') as losses
      from public.match_players mp
      join public.matches m
        on m.id = mp.match_id
      group by mp.season_id, mp.%2$I
    ),
    ledger_totals as (
      select
        sl.season_id,
        sl.%3$I as user_id,
        sum(sl.points_delta) as score_delta_total
      from public.score_ledger sl
      group by sl.season_id, sl.%3$I
    )
    select
      em.season_id,
      em.user_id,
      p.display_name,
      private.season_initial_score(em.season_id)::numeric(10, 2) as initial_score,
      coalesce(ms.matches_played, 0) as matches_played,
      coalesce(ms.wins, 0) as wins,
      coalesce(ms.losses, 0) as losses,
      case
        when coalesce(ms.matches_played, 0) = 0 then 0::numeric(5, 2)
        else round((coalesce(ms.wins, 0)::numeric / ms.matches_played::numeric) * 100, 2)
      end as win_rate,
      (
        private.season_initial_score(em.season_id)
        + coalesce(lt.score_delta_total, 0)
      )::numeric(10, 2) as score_total,
      dense_rank() over (
        partition by em.season_id
        order by (
          private.season_initial_score(em.season_id)
          + coalesce(lt.score_delta_total, 0)
        ) desc,
                 coalesce(ms.wins, 0) desc,
                 coalesce(ms.matches_played, 0) desc,
                 p.display_name asc
      ) as rank
    from eligible_members em
    join public.players p
      on p.id = em.user_id
    left join match_stats ms
      on ms.season_id = em.season_id
     and ms.user_id = em.user_id
    left join ledger_totals lt
      on lt.season_id = em.season_id
     and lt.user_id = em.user_id
  $sql$, v_membership_col, v_match_player_col, v_ledger_col);
end
$leaderboard$;

grant execute on function public.set_season_initial_score(uuid, numeric) to authenticated;
grant execute on function public.activate_season(uuid) to authenticated;
grant execute on function public.record_match_result(uuid, uuid[], uuid[], text, text, jsonb, date) to authenticated;
grant execute on function public.record_match_result_backfill(uuid, uuid[], uuid[], text, text, date, jsonb) to authenticated;
grant execute on function public.delete_match_and_recalculate(uuid) to authenticated;
grant execute on function public.reset_current_season(uuid) to authenticated;
grant execute on function public.confirm_season_rollover(uuid) to authenticated;

commit;
