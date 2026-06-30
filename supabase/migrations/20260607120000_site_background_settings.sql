begin;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
    check (jsonb_typeof(value) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.site_settings is
  'Public, non-sensitive site-level settings that should be shared across clients.';

comment on column public.site_settings.key is
  'Stable setting identifier. Use separate RLS policies for every publicly readable setting.';

comment on column public.site_settings.value is
  'JSON object payload for a site-level setting.';

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.tg_set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists site_settings_select_background on public.site_settings;
create policy site_settings_select_background
  on public.site_settings
  for select
  to anon, authenticated
  using (key = 'background_settings');

grant select on public.site_settings to anon, authenticated;

create or replace function public.get_site_background_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select ss.value
      from public.site_settings ss
      where ss.key = 'background_settings'
    ),
    '{}'::jsonb
  );
$$;

comment on function public.get_site_background_settings() is
  'Returns the shared public site background settings JSON object.';

create or replace function private.normalize_site_background_asset_id(
  p_value text
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case
    when btrim(coalesce(p_value, '')) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      then btrim(coalesce(p_value, ''))
    else ''
  end;
$$;

comment on function private.normalize_site_background_asset_id(text) is
  'Normalizes a site background asset id to the same conservative id format used by the frontend manifest.';

create or replace function public.set_site_background_settings(
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_raw_settings jsonb := case
    when jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) = 'object'
      then coalesce(p_settings, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_player_backgrounds jsonb := '{}'::jsonb;
  v_player_id text;
  v_background_id text;
  v_settings jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins may update site background settings.'
      using errcode = '42501';
  end if;

  if octet_length(v_raw_settings::text) > 20000 then
    raise exception 'Background settings payload is too large.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_raw_settings -> 'playerBackgrounds') = 'object' then
    for v_player_id, v_background_id in
      select entry.key, entry.value
      from jsonb_each_text(v_raw_settings -> 'playerBackgrounds') as entry(key, value)
    loop
      if btrim(coalesce(v_player_id, '')) ~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
         and private.normalize_site_background_asset_id(v_background_id) <> '' then
        v_player_backgrounds := v_player_backgrounds || jsonb_build_object(
          btrim(v_player_id),
          private.normalize_site_background_asset_id(v_background_id)
        );
      end if;
    end loop;
  end if;

  v_settings := jsonb_build_object(
    'fallbackBackgroundId', private.normalize_site_background_asset_id(v_raw_settings ->> 'fallbackBackgroundId'),
    'manualSeasonKey', left(btrim(coalesce(v_raw_settings ->> 'manualSeasonKey', '')), 120),
    'manualBackgroundId', private.normalize_site_background_asset_id(v_raw_settings ->> 'manualBackgroundId'),
    'finalDayBackgroundId', private.normalize_site_background_asset_id(v_raw_settings ->> 'finalDayBackgroundId'),
    'playerBackgrounds', v_player_backgrounds
  );

  insert into public.site_settings (
    key,
    value,
    updated_by
  )
  values (
    'background_settings',
    v_settings,
    v_actor
  )
  on conflict (key)
  do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now());

  return v_settings;
end;
$$;

comment on function public.set_site_background_settings(jsonb) is
  'Admin-only writer for the shared public site background settings JSON object.';

revoke all on function public.get_site_background_settings() from public;
revoke all on function public.set_site_background_settings(jsonb) from public;

grant execute on function public.get_site_background_settings() to anon, authenticated;
grant execute on function public.set_site_background_settings(jsonb) to authenticated;

commit;
