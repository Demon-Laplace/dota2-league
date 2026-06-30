begin;

create table if not exists public.reward_donations (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  category text not null default 'base'
    check (category in ('base', 'card', 'extra', 'misc')),
  note text,
  is_outside boolean not null default false,
  is_public boolean not null default true,
  donated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.reward_donations is 'Public-facing sponsorship and support records shown on the front-end reward panel.';
comment on column public.reward_donations.category is 'Support bucket used by the front-end reward summary cards.';
comment on column public.reward_donations.is_outside is 'Marks a contribution as coming from outside the active season roster.';

create index if not exists reward_donations_donated_at_idx
  on public.reward_donations (donated_at desc, created_at desc);

create index if not exists reward_donations_category_idx
  on public.reward_donations (category, is_public);

drop trigger if exists reward_donations_set_updated_at on public.reward_donations;
create trigger reward_donations_set_updated_at
  before update on public.reward_donations
  for each row execute function public.tg_set_updated_at();

alter table public.reward_donations enable row level security;

drop policy if exists reward_donations_select_public_anon on public.reward_donations;
create policy reward_donations_select_public_anon
  on public.reward_donations
  for select
  to anon
  using (is_public);

drop policy if exists reward_donations_select_public_authenticated on public.reward_donations;
create policy reward_donations_select_public_authenticated
  on public.reward_donations
  for select
  to authenticated
  using (is_public);

drop policy if exists reward_donations_admin_insert on public.reward_donations;
create policy reward_donations_admin_insert
  on public.reward_donations
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists reward_donations_admin_update on public.reward_donations;
create policy reward_donations_admin_update
  on public.reward_donations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists reward_donations_admin_delete on public.reward_donations;
create policy reward_donations_admin_delete
  on public.reward_donations
  for delete
  to authenticated
  using (public.is_admin());

grant select on public.reward_donations to anon, authenticated;
grant insert, update, delete on public.reward_donations to authenticated;

commit;
