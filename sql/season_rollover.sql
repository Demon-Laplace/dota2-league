begin;

create extension if not exists pgcrypto;

create table if not exists public.season_end_confirmations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  role_member_id uuid not null references public.app_role_members(id) on delete cascade,
  role text not null check (role in ('admin', 'scorer')),
  player_id uuid references public.players(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  unique (season_id, role_member_id)
);

create index if not exists idx_season_end_confirmations_season_id
on public.season_end_confirmations (season_id, confirmed_at desc);

create index if not exists idx_season_end_confirmations_role_member_id
on public.season_end_confirmations (role_member_id);

alter table public.season_end_confirmations enable row level security;

drop policy if exists season_end_confirmations_select_all on public.season_end_confirmations;
create policy season_end_confirmations_select_all
on public.season_end_confirmations
for select
to anon, authenticated
using (true);

drop policy if exists season_end_confirmations_insert_all on public.season_end_confirmations;
create policy season_end_confirmations_insert_all
on public.season_end_confirmations
for insert
to anon, authenticated
with check (true);

drop policy if exists season_end_confirmations_update_all on public.season_end_confirmations;
create policy season_end_confirmations_update_all
on public.season_end_confirmations
for update
to anon, authenticated
using (true)
with check (true);

create or replace function public.get_season_rollover_cutoff(
  p_season_id uuid,
  p_now timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_reference_date date;
begin
  if p_season_id is null then
    raise exception '缺少赛季 id';
  end if;

  select start_date, end_date
  into v_start_date, v_end_date
  from public.seasons
  where id = p_season_id;

  if v_start_date is null and v_end_date is null then
    v_reference_date := public.get_beijing_match_date(p_now);
  else
    v_reference_date := coalesce(v_end_date, v_start_date);
  end if;

  v_reference_date := (
    date_trunc('month', v_reference_date::timestamp)
    + interval '1 month'
    - interval '1 day'
  )::date;

  return ((v_reference_date::text || ' 06:00:00')::timestamp at time zone 'Asia/Shanghai');
end;
$$;

create or replace function public.confirm_season_rollover(
  p_season_id uuid,
  p_role_member_id uuid
)
returns table (
  season_id uuid,
  scorer_confirmation_count integer,
  required_scorer_confirmations integer,
  actor_role text,
  actor_confirmation_recorded boolean,
  finalized boolean,
  next_season_id uuid,
  next_season_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_season public.seasons%rowtype;
  v_role_member public.app_role_members%rowtype;
  v_cutoff_ts timestamptz;
  v_scorer_confirmation_count integer := 0;
  v_required_scorers integer := 2;
  v_finalized boolean := false;
  v_next_season_id uuid := null;
  v_next_season_name text := null;
  v_next_start_date date;
  v_next_end_date date;
  v_existing_next_has_data boolean := false;
begin
  if p_season_id is null then
    raise exception '缺少赛季 id';
  end if;

  if p_role_member_id is null then
    raise exception '缺少角色成员 id';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('season-rollover:' || p_season_id::text, 0));

  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '未找到指定赛季';
  end if;

  if v_season.is_active is distinct from true then
    raise exception '当前赛季已不是活跃赛季，请刷新后重试';
  end if;

  select *
  into v_role_member
  from public.app_role_members
  where id = p_role_member_id;

  if not found then
    raise exception '未找到当前身份对应的角色记录';
  end if;

  if v_role_member.role not in ('admin', 'scorer') then
    raise exception '当前身份不支持登记赛季完结确认';
  end if;

  v_cutoff_ts := public.get_season_rollover_cutoff(p_season_id, v_now);

  if v_now < v_cutoff_ts then
    raise exception '当前未到赛季完结开放时间';
  end if;

  insert into public.season_end_confirmations (
    season_id,
    role_member_id,
    role,
    player_id,
    confirmed_at
  )
  values (
    p_season_id,
    p_role_member_id,
    v_role_member.role,
    v_role_member.player_id,
    v_now
  )
  on conflict (season_id, role_member_id) do update
  set
    role = excluded.role,
    player_id = excluded.player_id,
    confirmed_at = excluded.confirmed_at;

  select count(*)
  into v_scorer_confirmation_count
  from public.season_end_confirmations sec
  join public.app_role_members arm
    on arm.id = sec.role_member_id
  where sec.season_id = p_season_id
    and arm.role = 'scorer';

  if v_scorer_confirmation_count >= v_required_scorers then
    perform public.recalculate_all_scores();

    update public.match_days
    set
      is_active = false,
      closed_at = coalesce(closed_at, v_now)
    where season_id = p_season_id
      and is_active = true;

    update public.match_results
    set
      hero_name = null,
      kills = null,
      deaths = null,
      assists = null
    where match_id in (
      select id
      from public.matches
      where season_id = p_season_id
    );

    delete from public.signup_queue
    where season_id = p_season_id;

    delete from public.daily_player_roster
    where season_id = p_season_id;

    delete from public.match_day_attendance_notes
    where season_id = p_season_id;

    v_next_start_date := (
      date_trunc(
        'month',
        coalesce(v_season.end_date, v_season.start_date, public.get_beijing_match_date(v_now))::timestamp
      ) + interval '1 month'
    )::date;
    v_next_end_date := (
      date_trunc('month', v_next_start_date::timestamp)
      + interval '1 month'
      - interval '1 day'
    )::date;
    v_next_season_name := to_char(v_next_start_date, 'YYYY-MM') || ' 赛季';

    select s.id
    into v_next_season_id
    from public.seasons s
    where s.start_date = v_next_start_date
    limit 1
    for update;

    if v_next_season_id is not null then
      select exists (
        select 1
        from public.matches
        where season_id = v_next_season_id
      )
      or exists (
        select 1
        from public.match_days
        where season_id = v_next_season_id
      )
      or exists (
        select 1
        from public.season_player_stats
        where season_id = v_next_season_id
      )
      into v_existing_next_has_data;

      if v_existing_next_has_data then
        raise exception '下赛季草稿已存在数据，请先人工检查后再完结当前赛季';
      end if;
    end if;

    update public.seasons
    set
      is_active = false,
      end_date = coalesce(end_date, (
        date_trunc('month', coalesce(v_season.end_date, v_season.start_date, public.get_beijing_match_date(v_now))::timestamp)
        + interval '1 month'
        - interval '1 day'
      )::date)
    where id = p_season_id;

    if v_next_season_id is null then
      insert into public.seasons (
        name,
        start_date,
        end_date,
        is_active,
        koi_player_id
      )
      values (
        v_next_season_name,
        v_next_start_date,
        v_next_end_date,
        true,
        null
      )
      returning id into v_next_season_id;
    else
      update public.seasons
      set
        name = v_next_season_name,
        start_date = v_next_start_date,
        end_date = v_next_end_date,
        is_active = true,
        koi_player_id = null
      where id = v_next_season_id;
    end if;

    insert into public.season_players (
      season_id,
      player_id,
      player_rank
    )
    select
      v_next_season_id,
      sp.player_id,
      sp.player_rank
    from public.season_players sp
    where sp.season_id = p_season_id
    on conflict (season_id, player_id) do update
    set player_rank = excluded.player_rank;

    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      reward_double_bonus,
      reward_extra_points,
      games_played,
      wins,
      losses
    )
    select
      v_next_season_id,
      p.id,
      10.00,
      (20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)) + coalesce(p.reward_extra_points, 0),
      coalesce(p.reward_floor_bonus, 0),
      coalesce(p.reward_double_bonus, 0),
      coalesce(p.reward_extra_points, 0),
      0,
      0,
      0
    from public.players p
    join public.season_players sp
      on sp.player_id = p.id
     and sp.season_id = v_next_season_id
    on conflict (season_id, player_id) do nothing;

    v_finalized := true;
  end if;

  return query
  select
    p_season_id,
    v_scorer_confirmation_count,
    v_required_scorers,
    v_role_member.role,
    true,
    v_finalized,
    v_next_season_id,
    v_next_season_name;
end;
$$;

grant select, insert, update on public.season_end_confirmations to anon, authenticated;
grant execute on function public.get_season_rollover_cutoff(uuid, timestamptz) to anon, authenticated;
grant execute on function public.confirm_season_rollover(uuid, uuid) to anon, authenticated;

commit;
