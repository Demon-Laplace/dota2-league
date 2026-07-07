begin;

create table if not exists public.official_match_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_date date not null,
  match_no integer,
  dota_match_id text not null,
  provider text not null default 'opendota',
  payload jsonb not null default '{}'::jsonb,
  source_url text,
  screenshot_bucket text,
  screenshot_path text,
  captured_at timestamptz,
  archive_status text not null default 'pending',
  archive_error text,
  archived_at timestamptz,
  archive_repository text,
  archive_branch text,
  archive_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint official_match_snapshots_provider_check
    check (provider in ('opendota')),
  constraint official_match_snapshots_dota_match_id_check
    check (dota_match_id ~ '^[0-9]+$'),
  constraint official_match_snapshots_archive_status_check
    check (archive_status in ('pending', 'archived', 'error')),
  constraint official_match_snapshots_screenshot_bucket_check
    check (screenshot_bucket is null or screenshot_bucket = 'opendota-match-screenshots'),
  constraint official_match_snapshots_screenshot_path_check
    check (screenshot_path is null or screenshot_path ~ '^[0-9]{4}-[0-9]{2}/[0-9]+\\.(jpg|jpeg|png|webp)$'),
  constraint official_match_snapshots_match_unique
    unique (match_id, provider)
);

comment on table public.official_match_snapshots is
  'Temporary structured OpenDota match snapshots. GitHub Actions exports rows to repository JSON and then removes the exported Supabase rows.';

create index if not exists official_match_snapshots_date_idx
  on public.official_match_snapshots (match_date, match_no);

create index if not exists official_match_snapshots_status_idx
  on public.official_match_snapshots (archive_status, match_date, updated_at);

create unique index if not exists official_match_snapshots_dota_match_unique_idx
  on public.official_match_snapshots (provider, dota_match_id)
  where dota_match_id is not null;

drop trigger if exists official_match_snapshots_set_updated_at on public.official_match_snapshots;
create trigger official_match_snapshots_set_updated_at
  before update on public.official_match_snapshots
  for each row execute function public.tg_set_updated_at();

alter table public.official_match_snapshots enable row level security;

drop policy if exists official_match_snapshots_public_select on public.official_match_snapshots;
create policy official_match_snapshots_public_select
  on public.official_match_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists official_match_snapshots_scorekeeper_insert on public.official_match_snapshots;
create policy official_match_snapshots_scorekeeper_insert
  on public.official_match_snapshots
  for insert
  to authenticated
  with check (
    public.can_adjust_scores(season_id)
    and exists (
      select 1
      from public.matches m
      where m.id = official_match_snapshots.match_id
        and m.season_id = official_match_snapshots.season_id
    )
  );

drop policy if exists official_match_snapshots_scorekeeper_update on public.official_match_snapshots;
create policy official_match_snapshots_scorekeeper_update
  on public.official_match_snapshots
  for update
  to authenticated
  using (public.can_adjust_scores(season_id))
  with check (
    public.can_adjust_scores(season_id)
    and exists (
      select 1
      from public.matches m
      where m.id = official_match_snapshots.match_id
        and m.season_id = official_match_snapshots.season_id
    )
  );

drop policy if exists official_match_snapshots_scorekeeper_delete on public.official_match_snapshots;
create policy official_match_snapshots_scorekeeper_delete
  on public.official_match_snapshots
  for delete
  to authenticated
  using (public.can_adjust_scores(season_id));

commit;
