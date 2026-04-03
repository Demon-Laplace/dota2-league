begin;

create extension if not exists pgcrypto;

create table if not exists public.app_role_members (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('admin', 'scorer')),
  status text not null default 'approved' check (status in ('approved', 'pending')),
  player_id uuid references public.players(id) on delete cascade,
  allow_auto_reconnect boolean not null default false,
  auto_reconnect_device_id text,
  created_at timestamptz not null default now()
);

alter table public.app_role_members
add column if not exists status text not null default 'approved';

update public.app_role_members
set status = 'approved'
where status is null;

alter table public.app_role_members
drop constraint if exists app_role_members_status_check;

alter table public.app_role_members
add constraint app_role_members_status_check
check (status in ('approved', 'pending'));

alter table public.app_role_members
add column if not exists allow_auto_reconnect boolean not null default false;

alter table public.app_role_members
add column if not exists auto_reconnect_device_id text;

create unique index if not exists idx_app_role_members_unique_scorer_player
on public.app_role_members (player_id)
where role = 'scorer';

create unique index if not exists idx_app_role_members_single_admin_role
on public.app_role_members (id, role);

grant select, insert, update, delete on public.app_role_members to anon, authenticated;

insert into public.app_role_members (role)
select 'admin'
where not exists (
  select 1
  from public.app_role_members
  where role = 'admin'
);

commit;
