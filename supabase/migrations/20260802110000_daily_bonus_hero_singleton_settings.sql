begin;

create table public.daily_bonus_hero_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  hero_count integer not null default 4 check (hero_count >= 1),
  reward_points numeric[] not null default array[1, 1, 1, 1]::numeric[],
  base_seed bigint not null default floor(random() * 4294967296)::bigint
    check (base_seed between 0 and 4294967295),
  override_date date,
  override_seed bigint check (override_seed is null or override_seed between 0 and 4294967295),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (coalesce(array_length(reward_points, 1), 0) = hero_count),
  check ((override_date is null) = (override_seed is null))
);

comment on table public.daily_bonus_hero_settings is
  'One shared current configuration for daily bonus heroes. No daily history rows are stored.';

insert into public.daily_bonus_hero_settings (
  singleton,
  enabled,
  hero_count,
  reward_points
)
values (
  true,
  false,
  4,
  array[1, 1, 1, 1]::numeric[]
)
on conflict (singleton) do nothing;

drop trigger if exists daily_bonus_hero_settings_set_updated_at on public.daily_bonus_hero_settings;
create trigger daily_bonus_hero_settings_set_updated_at
  before update on public.daily_bonus_hero_settings
  for each row execute function public.tg_set_updated_at();

alter table public.daily_bonus_hero_settings enable row level security;

create policy daily_bonus_hero_settings_public_read
  on public.daily_bonus_hero_settings
  for select
  to anon, authenticated
  using (singleton);

grant select on public.daily_bonus_hero_settings to anon, authenticated;

create or replace function private.daily_bonus_business_date()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select timezone('Asia/Shanghai', current_timestamp)::date;
$$;

create or replace function private.daily_bonus_seed_for_date(
  p_base_seed bigint,
  p_business_date date
)
returns bigint
language sql
immutable
set search_path = pg_catalog
as $$
  select (
    ('x' || substr(md5(p_base_seed::text || ':' || p_business_date::text), 1, 8))::bit(32)::bigint
  );
$$;

create or replace function public.get_daily_bonus_hero_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settings public.daily_bonus_hero_settings%rowtype;
  v_business_date date := private.daily_bonus_business_date();
  v_seed bigint;
begin
  select settings.*
  into strict v_settings
  from public.daily_bonus_hero_settings settings
  where settings.singleton;

  v_seed := case
    when v_settings.override_date = v_business_date
      then v_settings.override_seed
    else private.daily_bonus_seed_for_date(v_settings.base_seed, v_business_date)
  end;

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'heroCount', v_settings.hero_count,
    'rewardPoints', to_jsonb(v_settings.reward_points),
    'businessDate', v_business_date,
    'seed', v_seed,
    'updatedAt', v_settings.updated_at
  );
end;
$$;

create or replace function public.set_daily_bonus_hero_settings(
  p_enabled boolean,
  p_hero_count integer,
  p_reward_points numeric[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_point numeric;
  v_points numeric[] := array[]::numeric[];
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may update daily bonus heroes.'
      using errcode = '42501';
  end if;

  if p_hero_count is null or p_hero_count < 1 then
    raise exception 'Hero count must be at least 1.'
      using errcode = '22023';
  end if;

  if coalesce(array_length(p_reward_points, 1), 0) <> p_hero_count then
    raise exception 'Reward point count must match hero count.'
      using errcode = '22023';
  end if;

  if octet_length(to_jsonb(p_reward_points)::text) > 50000 then
    raise exception 'Reward point payload is too large.'
      using errcode = '22023';
  end if;

  foreach v_point in array p_reward_points
  loop
    if v_point is null or abs(v_point) > 10000 then
      raise exception 'Each reward point must be between -10000 and 10000.'
        using errcode = '22023';
    end if;
    v_points := array_append(v_points, round(v_point, 2));
  end loop;

  update public.daily_bonus_hero_settings
  set
    enabled = coalesce(p_enabled, false),
    hero_count = p_hero_count,
    reward_points = v_points,
    updated_by = v_actor
  where singleton;

  return public.get_daily_bonus_hero_settings();
end;
$$;

create or replace function public.reroll_daily_bonus_heroes(
  p_seed bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_seed bigint := coalesce(p_seed, floor(random() * 4294967296)::bigint);
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins and scorekeepers may reroll daily bonus heroes.'
      using errcode = '42501';
  end if;

  if v_seed < 0 or v_seed > 4294967295 then
    raise exception 'Random seed must be between 0 and 4294967295.'
      using errcode = '22023';
  end if;

  update public.daily_bonus_hero_settings
  set
    override_date = private.daily_bonus_business_date(),
    override_seed = v_seed,
    updated_by = v_actor
  where singleton;

  return public.get_daily_bonus_hero_settings();
end;
$$;

comment on function public.get_daily_bonus_hero_settings() is
  'Returns the shared current configuration and a deterministic Beijing-date seed without creating daily records.';

comment on function public.set_daily_bonus_hero_settings(boolean, integer, numeric[]) is
  'Admin and scorekeeper writer for the one persistent daily bonus hero configuration row.';

comment on function public.reroll_daily_bonus_heroes(bigint) is
  'Admin and scorekeeper action that stores only the current Beijing date seed override in the configuration row.';

revoke all on function private.daily_bonus_business_date() from public;
revoke all on function private.daily_bonus_seed_for_date(bigint, date) from public;
revoke all on function public.get_daily_bonus_hero_settings() from public;
revoke all on function public.set_daily_bonus_hero_settings(boolean, integer, numeric[]) from public;
revoke all on function public.reroll_daily_bonus_heroes(bigint) from public;

grant execute on function public.get_daily_bonus_hero_settings() to anon, authenticated;
grant execute on function public.set_daily_bonus_hero_settings(boolean, integer, numeric[]) to authenticated;
grant execute on function public.reroll_daily_bonus_heroes(bigint) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_bonus_hero_settings'
  ) then
    alter publication supabase_realtime add table public.daily_bonus_hero_settings;
  end if;
end;
$$;

commit;
