begin;

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
  v_background_brightness integer := 42;
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

  if coalesce(v_raw_settings ->> 'backgroundBrightness', '') ~ '^\d+(\.\d+)?$' then
    v_background_brightness := round((v_raw_settings ->> 'backgroundBrightness')::numeric)::integer;
  end if;
  v_background_brightness := greatest(20, least(100, v_background_brightness));

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
    'backgroundBrightness', v_background_brightness,
    'automaticChampionAppliedSeasonKey', left(btrim(coalesce(v_raw_settings ->> 'automaticChampionAppliedSeasonKey', '')), 120),
    'automaticFinalDayAppliedKey', left(btrim(coalesce(v_raw_settings ->> 'automaticFinalDayAppliedKey', '')), 160),
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
  'Admin-only writer for shared background selection, brightness, and one-shot automation state.';

commit;
