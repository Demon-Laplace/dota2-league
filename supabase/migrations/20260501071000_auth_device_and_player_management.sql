begin;

create table if not exists private.auth_identity_devices (
  id uuid primary key default gen_random_uuid(),
  auth_identity_id uuid not null references private.auth_identities(id) on delete cascade,
  device_id text not null check (length(btrim(device_id)) >= 8),
  device_label text,
  last_used_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (auth_identity_id, device_id)
);

comment on table private.auth_identity_devices is 'Remembered login devices for managed Auth identities. Each account may remember at most 3 devices.';

create index if not exists auth_identity_devices_identity_last_used_idx
  on private.auth_identity_devices (auth_identity_id, last_used_at desc);

drop trigger if exists auth_identity_devices_set_updated_at on private.auth_identity_devices;
create trigger auth_identity_devices_set_updated_at
  before update on private.auth_identity_devices
  for each row execute function public.tg_set_updated_at();

alter table private.auth_identity_devices enable row level security;

drop policy if exists auth_identity_devices_admin_select on private.auth_identity_devices;
create policy auth_identity_devices_admin_select
  on private.auth_identity_devices
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists auth_identity_devices_admin_manage on private.auth_identity_devices;
create policy auth_identity_devices_admin_manage
  on private.auth_identity_devices
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.remember_current_device(
  p_device_id text,
  p_device_label text default null
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_identity private.auth_identities;
  v_count integer;
begin
  perform private.require_authenticated();

  select *
  into v_identity
  from private.current_auth_identity();

  if v_identity.id is null then
    raise exception 'Managed auth identity not found.'
      using errcode = 'P0002';
  end if;

  if nullif(btrim(coalesce(p_device_id, '')), '') is null then
    raise exception 'device_id is required.'
      using errcode = '22023';
  end if;

  insert into private.auth_identity_devices (
    auth_identity_id,
    device_id,
    device_label,
    last_used_at
  )
  values (
    v_identity.id,
    btrim(p_device_id),
    nullif(left(btrim(coalesce(p_device_label, '')), 120), ''),
    timezone('utc', now())
  )
  on conflict (auth_identity_id, device_id)
  do update set
    device_label = excluded.device_label,
    last_used_at = excluded.last_used_at,
    updated_at = timezone('utc', now());

  select count(*)
  into v_count
  from private.auth_identity_devices d
  where d.auth_identity_id = v_identity.id;

  if v_count > 3 then
    delete from private.auth_identity_devices d
    where d.id in (
      select d2.id
      from private.auth_identity_devices d2
      where d2.auth_identity_id = v_identity.id
      order by d2.last_used_at desc, d2.created_at desc
      offset 3
    );

    select count(*)
    into v_count
    from private.auth_identity_devices d
    where d.auth_identity_id = v_identity.id;
  end if;

  return v_count;
end;
$$;

comment on function public.remember_current_device(text, text) is 'Records the current machine as a remembered device for the authenticated managed account, keeping only the latest 3 devices.';

create or replace function public.create_player_quick(
  p_display_name text
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_player public.players;
begin
  perform private.require_authenticated();

  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may add players.'
      using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'display_name is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.players p
    where lower(btrim(p.display_name)) = lower(v_name)
      and p.is_active
  ) then
    raise exception 'A player named "%" already exists.', v_name
      using errcode = '23505';
  end if;

  insert into public.players (display_name)
  values (v_name)
  returning * into v_player;

  return v_player;
end;
$$;

comment on function public.create_player_quick(text) is 'Creates a master-roster player entry. Accessible to admins and scorekeepers.';

create or replace function public.rename_player_quick(
  p_player_id uuid,
  p_display_name text
)
returns public.players
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_player public.players;
begin
  perform private.require_authenticated();

  if not public.is_admin() then
    raise exception 'Only admins may rename players.'
      using errcode = '42501';
  end if;

  if p_player_id is null then
    raise exception 'player_id is required.'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'display_name is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.players p
    where p.id <> p_player_id
      and lower(btrim(p.display_name)) = lower(v_name)
      and p.is_active
  ) then
    raise exception 'A player named "%" already exists.', v_name
      using errcode = '23505';
  end if;

  update public.players
  set display_name = v_name,
      updated_at = timezone('utc', now())
  where id = p_player_id
  returning * into v_player;

  if v_player.id is null then
    raise exception 'Player % not found.', p_player_id
      using errcode = 'P0002';
  end if;

  return v_player;
end;
$$;

comment on function public.rename_player_quick(uuid, text) is 'Renames a master-roster player entry. Accessible to admins only.';

revoke all on function public.remember_current_device(text, text) from public;
revoke all on function public.create_player_quick(text) from public;
revoke all on function public.rename_player_quick(uuid, text) from public;

grant execute on function public.remember_current_device(text, text) to authenticated;
grant execute on function public.create_player_quick(text) to authenticated;
grant execute on function public.rename_player_quick(uuid, text) to authenticated;

commit;
