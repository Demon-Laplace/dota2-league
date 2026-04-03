begin;

create extension if not exists pgcrypto;

create table if not exists public.season_action_logs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  actor text not null default '系统',
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_season_action_logs_season_created_at
on public.season_action_logs (season_id, created_at desc);

alter table public.season_action_logs enable row level security;

drop policy if exists season_action_logs_select_all on public.season_action_logs;
create policy season_action_logs_select_all
on public.season_action_logs
for select
to anon, authenticated
using (true);

drop policy if exists season_action_logs_insert_all on public.season_action_logs;
create policy season_action_logs_insert_all
on public.season_action_logs
for insert
to anon, authenticated
with check (true);

grant select, insert on public.season_action_logs to anon, authenticated;

commit;
