begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.match_days (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_date date not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  is_active boolean not null default true,
  note text,
  unique (season_id, match_date)
);

create index if not exists idx_match_days_season_date
on public.match_days (season_id, match_date);

alter table public.match_days enable row level security;

drop policy if exists match_days_select_all on public.match_days;
create policy match_days_select_all
on public.match_days
for select
to anon, authenticated
using (true);

drop policy if exists match_days_insert_all on public.match_days;
create policy match_days_insert_all
on public.match_days
for insert
to anon, authenticated
with check (true);

drop policy if exists match_days_update_all on public.match_days;
create policy match_days_update_all
on public.match_days
for update
to anon, authenticated
using (true)
with check (true);

alter table public.matches
add column if not exists match_day_id uuid references public.match_days(id);

alter table public.matches
add column if not exists match_date date;

create index if not exists idx_matches_match_day_id
on public.matches (match_day_id);

create index if not exists idx_matches_match_date
on public.matches (match_date desc);

create or replace function public.get_beijing_match_date(p_now timestamptz default now())
returns date
language sql
stable
as $$
  select
    case
      when ((p_now at time zone 'Asia/Shanghai')::time < time '02:00')
        then ((p_now at time zone 'Asia/Shanghai')::date - 1)
      else (p_now at time zone 'Asia/Shanghai')::date
    end
$$;

create or replace function public.start_match_day(
  p_season_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_match_date date;
  v_match_day_id uuid;
begin
  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  v_match_date := public.get_beijing_match_date(now());

  update public.match_days
  set
    is_active = false,
    closed_at = coalesce(closed_at, now())
  where season_id = v_season_id
    and is_active = true;

  insert into public.match_days (season_id, match_date, note, is_active, started_at)
  values (v_season_id, v_match_date, p_note, true, now())
  on conflict (season_id, match_date)
  do update set
    is_active = true,
    closed_at = null,
    note = coalesce(excluded.note, public.match_days.note)
  returning id into v_match_day_id;

  return v_match_day_id;
end;
$$;

create or replace function public.close_active_match_day_and_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_days
  set
    is_active = false,
    closed_at = now()
  where is_active = true;

  delete from public.signup_queue
  where true;

  delete from public.daily_player_roster
  where true;
end;
$$;

create or replace function public.cancel_active_match_day(
  p_season_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  update public.match_days
  set
    is_active = false,
    closed_at = now()
  where season_id = v_season_id
    and is_active = true;

  delete from public.signup_queue
  where season_id = v_season_id;

  delete from public.daily_player_roster
  where season_id = v_season_id;
end;
$$;

create or replace function public.clear_today_players_for_testing(
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_deleted_count integer := 0;
begin
  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  delete from public.daily_player_roster
  where season_id = v_season_id;

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;
end;
$$;

create or replace view public.match_day_groups as
select
  md.id as match_day_id,
  md.season_id,
  md.match_date,
  md.started_at,
  md.closed_at,
  md.is_active,
  count(m.id)::integer as match_count
from public.match_days md
left join public.matches m on m.match_day_id = md.id
group by md.id, md.season_id, md.match_date, md.started_at, md.closed_at, md.is_active
order by md.match_date desc, md.started_at desc;

drop view if exists public.match_day_recent_matches;

create view public.match_day_recent_matches as
select
  m.id as match_id,
  m.match_day_id,
  m.season_id,
  coalesce(m.match_date, md.match_date, public.get_beijing_match_date(m.created_at)) as match_date,
  coalesce(md.is_active, false) as day_is_active,
  m.winner_team,
  m.note,
  m.created_at,
  json_agg(
    json_build_object(
      'player_id', mr.player_id,
      'team', mr.team,
      'team_slot', mr.team_slot,
      'is_winner', mr.is_winner,
      'display_name', p.display_name,
      'hero_name', mr.hero_name
    )
    order by mr.team, coalesce(mr.team_slot, 999), p.display_name
  ) as players
from public.matches m
join public.match_results mr on mr.match_id = m.id
join public.players p on p.id = mr.player_id
left join public.match_days md on md.id = m.match_day_id
group by
  m.id,
  m.match_day_id,
  m.season_id,
  m.match_date,
  md.match_date,
  md.is_active,
  m.winner_team,
  m.note,
  m.created_at;

grant select on public.match_day_groups to anon, authenticated;
grant select on public.match_day_recent_matches to anon, authenticated;
grant execute on function public.start_match_day(uuid, text) to anon, authenticated;
grant execute on function public.cancel_active_match_day(uuid) to anon, authenticated;
grant execute on function public.close_active_match_day_and_reset() to anon, authenticated;
grant execute on function public.clear_today_players_for_testing(uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'close-match-day-beijing-2am'
  ) then
    perform cron.schedule(
      'close-match-day-beijing-2am',
      '0 18 * * *',
      'select public.close_active_match_day_and_reset();'
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;

commit;
