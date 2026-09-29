begin;

create table public.season_player_item_credits (
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (season_id, player_id)
);

comment on table public.season_player_item_credits is
  'Season total item credit per player. This is an allowance, not a sponsorship donation.';

create trigger season_player_item_credits_set_updated_at
  before update on public.season_player_item_credits
  for each row execute function public.tg_set_updated_at();

alter table public.season_player_item_credits enable row level security;

create policy season_player_item_credits_read_anon
  on public.season_player_item_credits for select to anon
  using (exists (select 1 from public.seasons s where s.id = season_id and s.is_public));

create policy season_player_item_credits_read_authenticated
  on public.season_player_item_credits for select to authenticated
  using (exists (select 1 from public.seasons s where s.id = season_id and
    (s.is_public or public.can_manage_season(s.id))));

create policy season_player_item_credits_insert_staff
  on public.season_player_item_credits for insert to authenticated
  with check (public.is_scorekeeper() and public.is_season_editable(season_id)
    and exists (select 1 from public.season_memberships sm
      where sm.season_id = season_id and sm.player_id = player_id));

create policy season_player_item_credits_update_staff
  on public.season_player_item_credits for update to authenticated
  using (public.is_scorekeeper() and public.is_season_editable(season_id))
  with check (public.is_scorekeeper() and public.is_season_editable(season_id)
    and exists (select 1 from public.season_memberships sm
      where sm.season_id = season_id and sm.player_id = player_id));

grant select on public.season_player_item_credits to anon, authenticated;
grant insert, update on public.season_player_item_credits to authenticated;

commit;
