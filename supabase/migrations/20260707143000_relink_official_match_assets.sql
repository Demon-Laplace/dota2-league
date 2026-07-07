begin;

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
          when excluded.dota_match_id is not null
            and excluded.dota_match_id is distinct from official_match_assets.dota_match_id then 'pending'
          when excluded.dota_match_id is not null and official_match_assets.storage_path is null then 'pending'
          when official_match_assets.storage_path is null then 'requested'
          else official_match_assets.asset_status
        end,
        storage_path = case
          when excluded.storage_path is not null then excluded.storage_path
          when excluded.dota_match_id is not null
            and excluded.dota_match_id is distinct from official_match_assets.dota_match_id then null
          else official_match_assets.storage_path
        end,
        source_url = coalesce(excluded.source_url, official_match_assets.source_url),
        captured_at = case
          when excluded.storage_path is not null then excluded.captured_at
          when excluded.dota_match_id is not null
            and excluded.dota_match_id is distinct from official_match_assets.dota_match_id then null
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
          when excluded.dota_match_id is not null then null
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
