begin;

create extension if not exists pgcrypto;

-- 统一赛季基线：初始积分 10，默认赞助 20
alter table public.players
alter column score set default 10;

alter table public.players
alter column reward_points set default 20;

-- 1) 赛季主表
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date,
  end_date date,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    start_date is null
    or end_date is null
    or start_date <= end_date
  )
);

create unique index if not exists seasons_one_active_idx
on public.seasons (is_active)
where is_active = true;

-- 2) 赛季选手名单
create table if not exists public.season_players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  note text,
  unique (season_id, player_id)
);

create index if not exists idx_season_players_season_id
on public.season_players (season_id);

create index if not exists idx_season_players_player_id
on public.season_players (player_id);

-- 3) 赛季积分表
create table if not exists public.season_player_stats (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score integer not null default 10,
  reward_points integer not null default 20,
  games_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create index if not exists idx_season_player_stats_season_id
on public.season_player_stats (season_id);

create index if not exists idx_season_player_stats_player_id
on public.season_player_stats (player_id);

alter table public.season_player_stats
alter column score set default 10;

alter table public.season_player_stats
alter column reward_points set default 20;

-- 4) updated_at 自动维护
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_season_player_stats_set_updated_at on public.season_player_stats;
create trigger trg_season_player_stats_set_updated_at
before update on public.season_player_stats
for each row
execute function public.set_updated_at();

-- 5) 给报名表加 season_id
alter table public.signup_queue
add column if not exists season_id uuid references public.seasons(id);

alter table public.signup_queue
drop constraint if exists signup_queue_status_check;

alter table public.signup_queue
add constraint signup_queue_status_check
check (status = any (array['active'::text, 'cancelled'::text, 'confirmed'::text]));

create index if not exists idx_signup_queue_season_id
on public.signup_queue (season_id);

-- 新的唯一约束：同一赛季内同一玩家只能有一条 active 报名
create unique index if not exists signup_queue_one_active_per_player_per_season
on public.signup_queue (season_id, player_id)
where is_active = true;

-- 6) 比赛表也接上 season_id，方便以后按赛季查战绩
alter table public.matches
add column if not exists season_id uuid references public.seasons(id);

create index if not exists idx_matches_season_id
on public.matches (season_id);

-- 7) 自动创建一个当前赛季（如果还没有）
insert into public.seasons (name, start_date, end_date, is_active)
select '2026-04 赛季', date '2026-04-01', date '2026-04-30', true
where not exists (
  select 1 from public.seasons
);

-- 如果已经有赛季但没有 active，则把最新的一个设为 active
with latest_season as (
  select id
  from public.seasons
  order by created_at desc
  limit 1
)
update public.seasons
set is_active = true
where id in (select id from latest_season)
  and not exists (
    select 1 from public.seasons where is_active = true
  );

-- 8) 把当前 players 全量放进当前 active 赛季名单
insert into public.season_players (season_id, player_id)
select s.id, p.id
from public.seasons s
cross join public.players p
where s.is_active = true
on conflict (season_id, player_id) do nothing;

-- 9) 用 players 当前积分初始化 active 赛季积分
insert into public.season_player_stats (
  season_id,
  player_id,
  score,
  reward_points,
  games_played,
  wins,
  losses
)
select
  s.id,
  p.id,
  10,
  20,
  0,
  0,
  0
from public.seasons s
join public.players p on true
where s.is_active = true
on conflict (season_id, player_id) do nothing;

-- 10) 给现有报名记录补上当前 active 赛季
update public.signup_queue sq
set season_id = s.id
from public.seasons s
where s.is_active = true
  and sq.season_id is null;

alter table public.signup_queue
alter column season_id set not null;

-- 11) 给现有比赛记录补上当前 active 赛季
update public.matches m
set season_id = s.id
from public.seasons s
where s.is_active = true
  and m.season_id is null;

-- 12) 前端常用视图：当前赛季名单
create or replace view public.current_season_players as
select
  sp.id as season_player_id,
  s.id as season_id,
  s.name as season_name,
  p.id as player_id,
  p.display_name,
  sp.joined_at,
  sp.note
from public.season_players sp
join public.seasons s on s.id = sp.season_id
join public.players p on p.id = sp.player_id
where s.is_active = true;

-- 13) 前端常用视图：当前赛季排行榜
create or replace view public.current_season_leaderboard as
select
  sps.id,
  sps.season_id,
  s.name as season_name,
  p.id as player_id,
  p.display_name,
  sps.score,
  sps.reward_points,
  sps.games_played,
  sps.wins,
  sps.losses,
  case
    when sps.games_played = 0 then 0::numeric
    else round((sps.wins::numeric / sps.games_played::numeric) * 100, 2)
  end as win_rate
from public.season_player_stats sps
join public.seasons s on s.id = sps.season_id
join public.players p on p.id = sps.player_id
where s.is_active = true;

-- 14) RLS
alter table public.seasons enable row level security;
alter table public.season_players enable row level security;
alter table public.season_player_stats enable row level security;

drop policy if exists seasons_select_all on public.seasons;
create policy seasons_select_all
on public.seasons
for select
to anon, authenticated
using (true);

drop policy if exists season_players_select_all on public.season_players;
create policy season_players_select_all
on public.season_players
for select
to anon, authenticated
using (true);

drop policy if exists season_player_stats_select_all on public.season_player_stats;
create policy season_player_stats_select_all
on public.season_player_stats
for select
to anon, authenticated
using (true);

-- 15) 视图授权
grant select on public.current_season_players to anon, authenticated;
grant select on public.current_season_leaderboard to anon, authenticated;

commit;
