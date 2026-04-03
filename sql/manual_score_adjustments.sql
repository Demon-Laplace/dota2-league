begin;

create extension if not exists pgcrypto;

create table if not exists public.manual_score_adjustments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  delta numeric(10,2) not null check (delta in (-1.00, 1.00)),
  kind text not null check (kind in ('death_finger', 'healing_hand')),
  created_by_role_member_id uuid not null references public.app_role_members(id) on delete restrict,
  created_by_name text not null default '未知记分员',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_role_member_id uuid references public.app_role_members(id) on delete restrict,
  revoked_by_name text,
  revoke_note text,
  check (
    (revoked_at is null and revoked_by_role_member_id is null)
    or (revoked_at is not null and revoked_by_role_member_id is not null)
  )
);

alter table public.manual_score_adjustments
add column if not exists created_by_name text not null default '未知记分员';

alter table public.manual_score_adjustments
add column if not exists revoked_by_name text;

create index if not exists idx_manual_score_adjustments_season_player
on public.manual_score_adjustments (season_id, player_id, created_at desc);

create index if not exists idx_manual_score_adjustments_active
on public.manual_score_adjustments (season_id, revoked_at, created_at desc);

alter table public.manual_score_adjustments enable row level security;

drop policy if exists manual_score_adjustments_select_all on public.manual_score_adjustments;
create policy manual_score_adjustments_select_all
on public.manual_score_adjustments
for select
to anon, authenticated
using (true);

drop policy if exists manual_score_adjustments_insert_all on public.manual_score_adjustments;
create policy manual_score_adjustments_insert_all
on public.manual_score_adjustments
for insert
to anon, authenticated
with check (true);

drop policy if exists manual_score_adjustments_update_all on public.manual_score_adjustments;
create policy manual_score_adjustments_update_all
on public.manual_score_adjustments
for update
to anon, authenticated
using (true)
with check (true);

create or replace function public.apply_manual_score_adjustment(
  p_season_id uuid,
  p_player_id uuid,
  p_delta numeric,
  p_kind text,
  p_role_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment_id uuid;
  v_role text;
  v_created_by_name text := '未知记分员';
begin
  if p_season_id is null then
    raise exception '缺少赛季 id';
  end if;
  if p_player_id is null then
    raise exception '缺少选手 id';
  end if;
  if p_role_member_id is null then
    raise exception '缺少角色成员 id';
  end if;
  if p_delta not in (-1, 1) then
    raise exception '人工积分调整每次只允许 +1 或 -1';
  end if;
  if p_kind not in ('death_finger', 'healing_hand') then
    raise exception '不支持的人工积分调整类型';
  end if;

  select role
  into v_role
  from public.app_role_members
  where id = p_role_member_id;

  if v_role not in ('admin', 'scorer') then
    raise exception '当前身份无权执行人工积分调整';
  end if;

  if v_role = 'admin' then
    v_created_by_name := '管理员';
  else
    select coalesce(p.display_name, '记分员')
    into v_created_by_name
    from public.app_role_members arm
    left join public.players p on p.id = arm.player_id
    where arm.id = p_role_member_id;
  end if;

  if not exists (
    select 1
    from public.season_players
    where season_id = p_season_id
      and player_id = p_player_id
  ) then
    raise exception '该选手不在当前赛季名单中';
  end if;

  insert into public.manual_score_adjustments (
    season_id,
    player_id,
    delta,
    kind,
    created_by_role_member_id,
    created_by_name
  )
  values (
    p_season_id,
    p_player_id,
    p_delta,
    p_kind,
    p_role_member_id,
    coalesce(v_created_by_name, '未知记分员')
  )
  returning id into v_adjustment_id;

  perform public.recalculate_all_scores();

  return v_adjustment_id;
end;
$$;

create or replace function public.revoke_manual_score_adjustment(
  p_adjustment_id uuid,
  p_role_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_adjustment public.manual_score_adjustments%rowtype;
  v_revoked_by_name text := '未知记分员';
begin
  if p_adjustment_id is null then
    raise exception '缺少调整记录 id';
  end if;
  if p_role_member_id is null then
    raise exception '缺少角色成员 id';
  end if;

  select role
  into v_role
  from public.app_role_members
  where id = p_role_member_id;

  if v_role not in ('admin', 'scorer') then
    raise exception '当前身份无权撤销人工积分调整';
  end if;

  if v_role = 'admin' then
    v_revoked_by_name := '管理员';
  else
    select coalesce(p.display_name, '记分员')
    into v_revoked_by_name
    from public.app_role_members arm
    left join public.players p on p.id = arm.player_id
    where arm.id = p_role_member_id;
  end if;

  select *
  into v_adjustment
  from public.manual_score_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception '未找到人工积分调整记录';
  end if;

  if v_adjustment.revoked_at is not null then
    return v_adjustment.id;
  end if;

  update public.manual_score_adjustments
  set
    revoked_at = now(),
    revoked_by_role_member_id = p_role_member_id,
    revoked_by_name = coalesce(v_revoked_by_name, '未知记分员')
  where id = p_adjustment_id;

  perform public.recalculate_all_scores();

  return p_adjustment_id;
end;
$$;

grant select, insert, update on public.manual_score_adjustments to anon, authenticated;
grant execute on function public.apply_manual_score_adjustment(uuid, uuid, numeric, text, uuid) to anon, authenticated;
grant execute on function public.revoke_manual_score_adjustment(uuid, uuid) to anon, authenticated;

commit;
