begin;

create table if not exists public.daily_player_roster (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  play_date date not null default current_date,
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  unique (season_id, play_date, player_id)
);

create index if not exists idx_daily_player_roster_season_date
on public.daily_player_roster (season_id, play_date);

create index if not exists idx_daily_player_roster_player
on public.daily_player_roster (player_id);

alter table public.daily_player_roster enable row level security;

drop policy if exists daily_player_roster_select_all on public.daily_player_roster;
create policy daily_player_roster_select_all
on public.daily_player_roster
for select
to anon, authenticated
using (true);

drop policy if exists daily_player_roster_insert_all on public.daily_player_roster;
create policy daily_player_roster_insert_all
on public.daily_player_roster
for insert
to anon, authenticated
with check (true);

drop policy if exists daily_player_roster_delete_all on public.daily_player_roster;
create policy daily_player_roster_delete_all
on public.daily_player_roster
for delete
to anon, authenticated
using (true);

create or replace view public.current_day_players as
select
  dpr.id,
  dpr.season_id,
  dpr.play_date,
  dpr.player_id,
  p.display_name,
  dpr.source,
  dpr.note,
  dpr.created_at
from public.daily_player_roster dpr
join public.players p on p.id = dpr.player_id
where dpr.play_date = public.get_beijing_match_date(now());

create or replace function public.confirm_queue_to_today_players(
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_inserted_count integer := 0;
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

  update public.signup_queue
  set
    is_active = false,
    status = 'confirmed'
  where id in (
    select sq.id
    from public.signup_queue sq
    join public.daily_player_roster dpr
      on dpr.season_id = v_season_id
     and dpr.play_date = public.get_beijing_match_date(now())
     and dpr.player_id = sq.player_id
    where sq.season_id = v_season_id
      and sq.is_active = true
  );

  get diagnostics v_inserted_count = row_count;

  return v_inserted_count;
end;
$$;

create or replace function public.clear_signup_queue_for_testing(
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

  delete from public.signup_queue
  where season_id = v_season_id;

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;
end;
$$;

grant select on public.current_day_players to anon, authenticated;
grant execute on function public.confirm_queue_to_today_players(uuid) to anon, authenticated;
grant execute on function public.clear_signup_queue_for_testing(uuid) to anon, authenticated;

commit;
