begin;

create table if not exists public.player_external_accounts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_account_id),
  check (provider in ('steam')),
  check (provider_account_id ~ '^[0-9]+$')
);

comment on table public.player_external_accounts is
  'Optional external account bindings for league players. Used by Dota match import to map Steam account IDs to player IDs.';
comment on column public.player_external_accounts.provider_account_id is
  'For provider steam, stores the Dota 2 32-bit account_id, not the 64-bit SteamID.';

create index if not exists player_external_accounts_player_idx
  on public.player_external_accounts (player_id, provider);

create trigger set_player_external_accounts_updated_at
  before update on public.player_external_accounts
  for each row execute function public.tg_set_updated_at();

alter table public.player_external_accounts enable row level security;

create policy player_external_accounts_select_authenticated
  on public.player_external_accounts
  for select
  to authenticated
  using (public.is_scorekeeper());

create policy player_external_accounts_manage_scorekeepers
  on public.player_external_accounts
  for all
  to authenticated
  using (public.is_scorekeeper())
  with check (public.is_scorekeeper());

create or replace function private.normalize_steam_dota_account_id(p_value text)
returns text
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v_value text := trim(coalesce(p_value, ''));
  v_numeric numeric;
  v_steamid64_base numeric := 76561197960265728;
begin
  if v_value !~ '^[0-9]+$' then
    raise exception 'Steam account ID must contain digits only.'
      using errcode = '22023';
  end if;

  v_numeric := v_value::numeric;
  if v_numeric >= v_steamid64_base then
    v_numeric := v_numeric - v_steamid64_base;
  end if;

  if v_numeric < 0 or v_numeric > 4294967295 then
    raise exception 'Steam account ID is outside the supported Dota account_id range.'
      using errcode = '22023';
  end if;

  return trim(to_char(v_numeric, 'FM999999999999999999999999999999'));
end;
$$;

create or replace function public.set_player_steam_accounts(
  p_player_id uuid,
  p_steam_account_ids text[]
)
returns setof public.player_external_accounts
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account_ids text[] := array[]::text[];
  v_account_id text;
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may manage Steam account mappings.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and p.is_active
  ) then
    raise exception 'Player % not found or inactive.', p_player_id
      using errcode = 'P0002';
  end if;

  if p_steam_account_ids is null or array_length(p_steam_account_ids, 1) is null then
    raise exception 'At least one Steam account ID is required.'
      using errcode = '22023';
  end if;

  foreach v_account_id in array p_steam_account_ids
  loop
    if trim(coalesce(v_account_id, '')) <> '' then
      v_account_ids := array_append(v_account_ids, private.normalize_steam_dota_account_id(v_account_id));
    end if;
  end loop;

  select coalesce(array_agg(distinct account_id order by account_id), array[]::text[])
  into v_account_ids
  from unnest(v_account_ids) as normalized(account_id);

  if array_length(v_account_ids, 1) is null then
    raise exception 'At least one Steam account ID is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.player_external_accounts pea
    where pea.provider = 'steam'
      and pea.provider_account_id = any (v_account_ids)
      and pea.player_id <> p_player_id
  ) then
    raise exception 'One or more Steam account IDs are already mapped to another player.'
      using errcode = '23505';
  end if;

  delete from public.player_external_accounts
  where player_id = p_player_id
    and provider = 'steam'
    and provider_account_id <> all (v_account_ids);

  insert into public.player_external_accounts (
    player_id,
    provider,
    provider_account_id,
    metadata
  )
  select
    p_player_id,
    'steam',
    account_id,
    jsonb_build_object('managed_by', auth.uid())
  from unnest(v_account_ids) as normalized(account_id)
  on conflict (provider, provider_account_id)
  do update set
    player_id = excluded.player_id,
    metadata = public.player_external_accounts.metadata
      || jsonb_build_object('managed_by', auth.uid()),
    updated_at = timezone('utc', now());

  return query
  select pea.*
  from public.player_external_accounts pea
  where pea.player_id = p_player_id
    and pea.provider = 'steam'
  order by pea.provider_account_id;
end;
$$;

create or replace function public.clear_player_steam_account(
  p_player_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may manage Steam account mappings.'
      using errcode = '42501';
  end if;

  delete from public.player_external_accounts
  where player_id = p_player_id
    and provider = 'steam';

  return found;
end;
$$;

revoke all on function public.set_player_steam_accounts(uuid, text[]) from public;
revoke all on function public.clear_player_steam_account(uuid) from public;

grant execute on function public.set_player_steam_accounts(uuid, text[]) to authenticated;
grant execute on function public.clear_player_steam_account(uuid) to authenticated;

commit;
