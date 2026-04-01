begin;

alter table public.players
add column if not exists reward_floor_bonus integer not null default 0;

alter table public.season_player_stats
add column if not exists reward_floor_bonus integer not null default 0;

alter table public.players
add column if not exists reward_extra_points integer not null default 0;

alter table public.season_player_stats
add column if not exists reward_extra_points integer not null default 0;

create table if not exists public.reward_donations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  donor_name text,
  amount integer not null check (amount >= 0),
  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reward_donations
alter column player_id drop not null;

alter table public.reward_donations
add column if not exists donor_name text;

create index if not exists idx_reward_donations_season_created_at
on public.reward_donations (season_id, created_at desc);

create index if not exists idx_reward_donations_player_id
on public.reward_donations (player_id);

alter table public.reward_donations enable row level security;

drop policy if exists reward_donations_select_all on public.reward_donations;
create policy reward_donations_select_all
on public.reward_donations
for select
to anon, authenticated
using (true);

drop policy if exists reward_donations_insert_all on public.reward_donations;
create policy reward_donations_insert_all
on public.reward_donations
for insert
to anon, authenticated
with check (true);

drop policy if exists reward_donations_update_all on public.reward_donations;
create policy reward_donations_update_all
on public.reward_donations
for update
to anon, authenticated
using (true)
with check (true);

alter table public.reward_donations
drop constraint if exists reward_donations_player_or_name_check;

alter table public.reward_donations
add constraint reward_donations_player_or_name_check
check (
  player_id is not null
  or (donor_name is not null and btrim(donor_name) <> '')
);

update public.players
set
  reward_extra_points = greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0),
  reward_points = (20 + coalesce(reward_floor_bonus, 0)) + greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0)
where true;

update public.season_player_stats
set
  reward_extra_points = greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0),
  reward_points = (20 + coalesce(reward_floor_bonus, 0)) + greatest(coalesce(reward_points, 20) - (20 + coalesce(reward_floor_bonus, 0)), 0)
where true;

create or replace function public.sync_player_reward_totals(
  p_player_id uuid,
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_reward_minimum integer := 20;
  v_current_extra integer := 0;
  v_total integer := 20;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is not null then
    select
      20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0),
      coalesce((
        select sum(rd.amount)::integer
        from public.reward_donations rd
        where rd.season_id = v_season_id
          and rd.player_id = p_player_id
          and rd.is_cancelled = false
      ), 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select
      20 + coalesce(p.reward_floor_bonus, 0),
      coalesce(p.reward_extra_points, 0)
    into v_reward_minimum, v_current_extra
    from public.players p
    where p.id = p_player_id;
  end if;

  v_total := v_reward_minimum + coalesce(v_current_extra, 0);

  update public.players
  set
    reward_extra_points = coalesce(v_current_extra, 0),
    reward_points = v_total
  where id = p_player_id;

  if v_season_id is not null then
    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      reward_extra_points,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      v_total,
      coalesce(p.reward_floor_bonus, 0),
      coalesce(v_current_extra, 0),
      0,
      0,
      0
    from public.players p
    where p.id = p_player_id
    on conflict (season_id, player_id) do update
    set
      reward_extra_points = excluded.reward_extra_points,
      reward_points = excluded.reward_points;
  end if;

  return v_total;
end;
$$;

create or replace function public.update_player_reward_points(
  p_player_id uuid,
  p_reward_points integer,
  p_season_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_reward_minimum integer := 20;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is not null then
    select 20 + coalesce(sps.reward_floor_bonus, p.reward_floor_bonus, 0)
    into v_reward_minimum
    from public.players p
    left join public.season_player_stats sps
      on sps.player_id = p.id
     and sps.season_id = v_season_id
    where p.id = p_player_id;
  else
    select 20 + coalesce(p.reward_floor_bonus, 0)
    into v_reward_minimum
    from public.players p
    where p.id = p_player_id;
  end if;

  if p_reward_points is null or p_reward_points < v_reward_minimum then
    raise exception '赞助额不能低于该选手当前最低值 %', v_reward_minimum;
  end if;

  update public.players
  set reward_points = p_reward_points
  where id = p_player_id;

  if v_season_id is not null then
    insert into public.season_player_stats (
      season_id,
      player_id,
      score,
      reward_points,
      reward_floor_bonus,
      games_played,
      wins,
      losses
    )
    select
      v_season_id,
      p.id,
      10.00,
      p_reward_points,
      coalesce(p.reward_floor_bonus, 0),
      0,
      0,
      0
    from public.players p
    where p.id = p_player_id
    on conflict (season_id, player_id) do update
    set reward_points = excluded.reward_points;
  end if;

  return p_reward_points;
end;
$$;

grant execute on function public.update_player_reward_points(uuid, integer, uuid) to anon, authenticated;

create or replace function public.add_player_reward_extra(
  p_player_id uuid,
  p_extra_amount integer,
  p_season_id uuid default null,
  p_donor_name text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_reward_minimum integer := 20;
  v_total integer;
begin
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;

  if p_extra_amount is null or p_extra_amount < 0 then
    raise exception '额外赞助额必须是大于等于 0 的整数';
  end if;

  if p_player_id is null and (p_donor_name is null or btrim(p_donor_name) = '') then
    raise exception '请选择赛季选手或填写场外赞助姓名';
  end if;

  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  insert into public.reward_donations (season_id, player_id, donor_name, amount)
  values (v_season_id, p_player_id, nullif(btrim(p_donor_name), ''), p_extra_amount);

  if p_player_id is null then
    return p_extra_amount;
  end if;

  select public.sync_player_reward_totals(p_player_id, v_season_id)
  into v_total;

  return v_total;
end;
$$;

grant execute on function public.add_player_reward_extra(uuid, integer, uuid, text) to anon, authenticated;

create or replace function public.cancel_reward_donation(
  p_donation_id uuid,
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid;
  v_season_id uuid;
begin
  if p_donation_id is null then
    raise exception '缺少赞助记录 id';
  end if;

  update public.reward_donations
  set
    is_cancelled = true,
    cancelled_at = now()
  where id = p_donation_id
    and is_cancelled = false
  returning player_id, season_id into v_player_id, v_season_id;

  if v_player_id is null then
    raise exception '未找到可取消的赞助记录';
  end if;

  perform public.sync_player_reward_totals(v_player_id, coalesce(p_season_id, v_season_id));

  return p_donation_id;
end;
$$;

grant execute on function public.cancel_reward_donation(uuid, uuid) to anon, authenticated;

commit;
