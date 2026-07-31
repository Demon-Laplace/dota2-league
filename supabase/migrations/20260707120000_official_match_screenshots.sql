begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'opendota-match-screenshots',
  'opendota-match-screenshots',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.official_match_assets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  dota_match_id text,
  provider text not null default 'opendota',
  asset_kind text not null default 'overview_screenshot',
  asset_status text not null default 'requested',
  storage_bucket text not null default 'opendota-match-screenshots',
  storage_path text,
  source_url text,
  captured_at timestamptz,
  requested_at timestamptz not null default timezone('utc', now()),
  last_requested_at timestamptz,
  request_count integer not null default 0,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint official_match_assets_provider_check
    check (provider in ('opendota')),
  constraint official_match_assets_kind_check
    check (asset_kind in ('overview_screenshot')),
  constraint official_match_assets_status_check
    check (asset_status in ('requested', 'pending', 'available', 'error')),
  constraint official_match_assets_bucket_check
    check (storage_bucket = 'opendota-match-screenshots'),
  constraint official_match_assets_dota_match_id_check
    check (dota_match_id is null or dota_match_id ~ '^[0-9]+$'),
  constraint official_match_assets_storage_path_check
    check (storage_path is null or storage_path ~ '^[0-9]{4}-[0-9]{2}/[0-9]+\\.(jpg|jpeg|png|webp)$'),
  constraint official_match_assets_request_count_check
    check (request_count >= 0),
  constraint official_match_assets_match_unique
    unique (match_id, provider, asset_kind)
);

comment on table public.official_match_assets is
  'External official-match assets, currently OpenDota overview screenshots linked to local match records.';

create index if not exists official_match_assets_season_idx
  on public.official_match_assets (season_id, match_id);

create index if not exists official_match_assets_status_idx
  on public.official_match_assets (asset_status, updated_at);

create index if not exists official_match_assets_dota_match_idx
  on public.official_match_assets (dota_match_id)
  where dota_match_id is not null;

create unique index if not exists official_match_assets_dota_match_unique_idx
  on public.official_match_assets (provider, dota_match_id, asset_kind)
  where dota_match_id is not null;

create unique index if not exists official_match_assets_storage_path_unique_idx
  on public.official_match_assets (storage_bucket, storage_path)
  where storage_path is not null;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'official_match_assets'
  ) then
    alter publication supabase_realtime add table public.official_match_assets;
  end if;
end;
$$;

drop trigger if exists official_match_assets_set_updated_at on public.official_match_assets;
create trigger official_match_assets_set_updated_at
  before update on public.official_match_assets
  for each row execute function public.tg_set_updated_at();

alter table public.official_match_assets enable row level security;

drop policy if exists official_match_assets_public_select on public.official_match_assets;
create policy official_match_assets_public_select
  on public.official_match_assets
  for select
  to anon, authenticated
  using (true);

drop policy if exists official_match_assets_scorekeeper_insert on public.official_match_assets;
create policy official_match_assets_scorekeeper_insert
  on public.official_match_assets
  for insert
  to authenticated
  with check (
    public.can_adjust_scores(season_id)
    and exists (
      select 1
      from public.matches m
      where m.id = official_match_assets.match_id
        and m.season_id = official_match_assets.season_id
    )
  );

drop policy if exists official_match_assets_scorekeeper_update on public.official_match_assets;
create policy official_match_assets_scorekeeper_update
  on public.official_match_assets
  for update
  to authenticated
  using (public.can_adjust_scores(season_id))
  with check (
    public.can_adjust_scores(season_id)
    and exists (
      select 1
      from public.matches m
      where m.id = official_match_assets.match_id
        and m.season_id = official_match_assets.season_id
    )
  );

drop policy if exists official_match_assets_scorekeeper_delete on public.official_match_assets;
create policy official_match_assets_scorekeeper_delete
  on public.official_match_assets
  for delete
  to authenticated
  using (public.can_adjust_scores(season_id));

drop policy if exists opendota_match_screenshots_public_select on storage.objects;
create policy opendota_match_screenshots_public_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'opendota-match-screenshots');

drop policy if exists opendota_match_screenshots_scorekeeper_insert on storage.objects;
create policy opendota_match_screenshots_scorekeeper_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'opendota-match-screenshots'
    and public.is_scorekeeper()
    and name ~ '^[0-9]{4}-[0-9]{2}/[0-9]+\\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists opendota_match_screenshots_scorekeeper_update on storage.objects;
create policy opendota_match_screenshots_scorekeeper_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'opendota-match-screenshots'
    and public.is_scorekeeper()
  )
  with check (
    bucket_id = 'opendota-match-screenshots'
    and public.is_scorekeeper()
    and name ~ '^[0-9]{4}-[0-9]{2}/[0-9]+\\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists opendota_match_screenshots_scorekeeper_delete on storage.objects;
create policy opendota_match_screenshots_scorekeeper_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'opendota-match-screenshots'
    and public.is_scorekeeper()
  );

create or replace function public.upsert_official_match_asset(
  p_match_id uuid,
  p_dota_match_id text default null,
  p_storage_path text default null,
  p_source_url text default null,
  p_captured_at timestamptz default timezone('utc', now())
)
returns public.official_match_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_match public.matches%rowtype;
  v_asset public.official_match_assets%rowtype;
  v_dota_match_id text := nullif(btrim(coalesce(p_dota_match_id, '')), '');
  v_storage_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_now timestamptz := timezone('utc', now());
begin
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_match.season_id) then
    raise exception 'You do not have permission to attach this match asset.'
      using errcode = '42501';
  end if;

  if v_dota_match_id is not null and v_dota_match_id !~ '^[0-9]+$' then
    raise exception 'Dota match id must contain only digits.'
      using errcode = '22023';
  end if;

  if v_storage_path is not null and v_storage_path !~ '^[0-9]{4}-[0-9]{2}/[0-9]+\\.(jpg|jpeg|png|webp)$' then
    raise exception 'Storage path must match YYYY-MM/match_id.ext.'
      using errcode = '22023';
  end if;

  insert into public.official_match_assets (
    match_id,
    season_id,
    dota_match_id,
    asset_status,
    storage_path,
    source_url,
    captured_at,
    requested_at,
    last_requested_at,
    request_count,
    last_error,
    created_by
  )
  values (
    v_match.id,
    v_match.season_id,
    v_dota_match_id,
    case
      when v_storage_path is not null then 'available'
      when v_dota_match_id is not null then 'pending'
      else 'requested'
    end,
    v_storage_path,
    coalesce(nullif(btrim(p_source_url), ''), case when v_dota_match_id is null then null else 'https://www.opendota.com/matches/' || v_dota_match_id end),
    case when v_storage_path is not null then coalesce(p_captured_at, v_now) else null end,
    v_now,
    case when v_storage_path is null then v_now else null end,
    case when v_storage_path is null then 1 else 0 end,
    null,
    v_actor
  )
  on conflict (match_id, provider, asset_kind)
  do update
    set dota_match_id = coalesce(excluded.dota_match_id, official_match_assets.dota_match_id),
        asset_status = case
          when excluded.storage_path is not null then 'available'
          when excluded.dota_match_id is not null and official_match_assets.storage_path is null then 'pending'
          when official_match_assets.storage_path is null then 'requested'
          else official_match_assets.asset_status
        end,
        storage_path = coalesce(excluded.storage_path, official_match_assets.storage_path),
        source_url = coalesce(excluded.source_url, official_match_assets.source_url),
        captured_at = case
          when excluded.storage_path is not null then excluded.captured_at
          else official_match_assets.captured_at
        end,
        requested_at = coalesce(official_match_assets.requested_at, excluded.requested_at),
        last_requested_at = case
          when excluded.storage_path is null then v_now
          else official_match_assets.last_requested_at
        end,
        request_count = case
          when excluded.storage_path is null then official_match_assets.request_count + 1
          else official_match_assets.request_count
        end,
        last_error = case
          when excluded.storage_path is not null then null
          else official_match_assets.last_error
        end,
        updated_at = v_now
  returning * into v_asset;

  return v_asset;
end;
$$;

revoke all on function public.upsert_official_match_asset(uuid, text, text, text, timestamptz) from public;
grant execute on function public.upsert_official_match_asset(uuid, text, text, text, timestamptz) to authenticated;

commit;
