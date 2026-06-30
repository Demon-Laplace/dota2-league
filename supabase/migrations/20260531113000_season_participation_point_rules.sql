begin;

create table if not exists public.season_participation_point_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  matches_played integer not null check (matches_played >= 0),
  participation_points numeric(10, 2) not null check (participation_points >= 0),
  points_per_extra_match numeric(10, 2) check (
    points_per_extra_match is null
    or points_per_extra_match >= 0
  ),
  is_open_ended boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, matches_played),
  check (
    (is_open_ended and points_per_extra_match is not null)
    or (not is_open_ended and points_per_extra_match is null)
  )
);

comment on table public.season_participation_point_rules
  is 'Season-scoped participation score rules. Exact rows are absolute scores; one optional open-ended row stores the starting score and per-match increment.';
comment on column public.season_participation_point_rules.matches_played
  is 'Exact match count for fixed rows, or the first covered match count for an open-ended rule such as 71+.';
comment on column public.season_participation_point_rules.participation_points
  is 'Absolute participation score at matches_played.';
comment on column public.season_participation_point_rules.points_per_extra_match
  is 'Open-ended increment applied for each match after matches_played.';

create unique index if not exists season_participation_point_rules_open_ended_uidx
  on public.season_participation_point_rules (season_id)
  where is_open_ended;

create index if not exists season_participation_point_rules_season_idx
  on public.season_participation_point_rules (season_id, matches_played);

drop trigger if exists season_participation_point_rules_set_updated_at
  on public.season_participation_point_rules;
create trigger season_participation_point_rules_set_updated_at
  before update on public.season_participation_point_rules
  for each row execute function public.tg_set_updated_at();

alter table public.season_participation_point_rules enable row level security;

drop policy if exists season_participation_point_rules_select_authenticated
  on public.season_participation_point_rules;
create policy season_participation_point_rules_select_authenticated
  on public.season_participation_point_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = season_participation_point_rules.season_id
        and (s.is_public or public.can_manage_season(s.id))
    )
  );

drop policy if exists season_participation_point_rules_select_anon
  on public.season_participation_point_rules;
create policy season_participation_point_rules_select_anon
  on public.season_participation_point_rules
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = season_participation_point_rules.season_id
        and s.is_public
    )
  );

drop policy if exists season_participation_point_rules_write_admin
  on public.season_participation_point_rules;
create policy season_participation_point_rules_write_admin
  on public.season_participation_point_rules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function private.default_participation_point_rules()
returns table (
  matches_played integer,
  participation_points numeric
)
language sql
immutable
set search_path = public, private
as $$
  values
    (0, 0), (1, 0), (2, 0), (3, 0), (4, 0), (5, 0),
    (6, 10), (7, 10), (8, 10), (9, 10), (10, 10),
    (11, 11), (12, 12), (13, 12), (14, 13), (15, 14),
    (16, 16), (17, 17), (18, 19), (19, 20), (20, 22),
    (21, 24), (22, 25), (23, 27), (24, 29), (25, 32),
    (26, 34), (27, 36), (28, 38), (29, 40), (30, 43),
    (31, 45), (32, 47), (33, 50), (34, 52), (35, 54),
    (36, 57), (37, 59), (38, 61), (39, 64), (40, 66),
    (41, 68), (42, 70), (43, 72), (44, 74), (45, 76),
    (46, 78), (47, 80), (48, 81), (49, 83), (50, 85),
    (51, 86), (52, 87), (53, 89), (54, 90), (55, 91),
    (56, 92), (57, 93), (58, 94), (59, 95), (60, 96),
    (61, 96), (62, 97), (63, 97), (64, 98), (65, 98),
    (66, 99), (67, 99), (68, 99), (69, 99), (70, 100);
$$;

insert into public.season_participation_point_rules (
  season_id,
  matches_played,
  participation_points
)
select
  s.id,
  d.matches_played,
  d.participation_points
from public.seasons s
cross join private.default_participation_point_rules() d
on conflict (season_id, matches_played) do nothing;

create or replace function public.tg_seed_season_participation_point_rules()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source_season_id uuid;
begin
  if exists (
    select 1
    from public.season_participation_point_rules r
    where r.season_id = new.id
  ) then
    return new;
  end if;

  select s.id
  into v_source_season_id
  from public.seasons s
  where s.id <> new.id
    and exists (
      select 1
      from public.season_participation_point_rules r
      where r.season_id = s.id
    )
  order by
    case
      when new.start_at is not null and s.start_at <= new.start_at then 0
      else 1
    end,
    s.start_at desc nulls last,
    s.created_at desc
  limit 1;

  if v_source_season_id is not null then
    insert into public.season_participation_point_rules (
      season_id,
      matches_played,
      participation_points,
      points_per_extra_match,
      is_open_ended
    )
    select
      new.id,
      r.matches_played,
      r.participation_points,
      r.points_per_extra_match,
      r.is_open_ended
    from public.season_participation_point_rules r
    where r.season_id = v_source_season_id
    order by r.matches_played;
  else
    insert into public.season_participation_point_rules (
      season_id,
      matches_played,
      participation_points
    )
    select
      new.id,
      d.matches_played,
      d.participation_points
    from private.default_participation_point_rules() d
    order by d.matches_played;
  end if;

  return new;
end;
$$;

drop trigger if exists seasons_seed_participation_point_rules
  on public.seasons;
create trigger seasons_seed_participation_point_rules
  after insert on public.seasons
  for each row execute function public.tg_seed_season_participation_point_rules();

create or replace function public.set_season_participation_point_rules(
  p_season_id uuid,
  p_rules jsonb
)
returns table (
  id uuid,
  season_id uuid,
  matches_played integer,
  participation_points numeric,
  points_per_extra_match numeric,
  is_open_ended boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rule_count integer;
  v_open_count integer;
  v_min_open_matches integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins may update participation point rules.'
      using errcode = '42501';
  end if;

  if p_season_id is null then
    raise exception 'Season id is required.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.seasons s where s.id = p_season_id) then
    raise exception 'Season % does not exist.', p_season_id
      using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Participation point rules must be a JSON array.'
      using errcode = '22023';
  end if;

  create temporary table participation_point_rule_input (
    matches_played integer not null,
    participation_points numeric(10, 2) not null,
    points_per_extra_match numeric(10, 2),
    is_open_ended boolean not null default false
  ) on commit drop;

  insert into participation_point_rule_input (
    matches_played,
    participation_points,
    points_per_extra_match,
    is_open_ended
  )
  select
    nullif(rule ->> 'matchesPlayed', '')::integer,
    nullif(rule ->> 'participationPoints', '')::numeric,
    nullif(rule ->> 'pointsPerExtraMatch', '')::numeric,
    coalesce(nullif(rule ->> 'isOpenEnded', '')::boolean, false)
  from jsonb_array_elements(p_rules) as rule;

  select count(*), count(*) filter (where is_open_ended)
  into v_rule_count, v_open_count
  from participation_point_rule_input;

  if v_rule_count = 0 then
    raise exception 'At least one participation point rule is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where matches_played < 0
       or participation_points < 0
       or (points_per_extra_match is not null and points_per_extra_match < 0)
  ) then
    raise exception 'Participation point rules cannot contain negative values.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    group by matches_played
    having count(*) > 1
  ) then
    raise exception 'Each match count can only have one participation point rule.'
      using errcode = '23505';
  end if;

  if v_open_count > 1 then
    raise exception 'Only one open-ended participation point rule is allowed.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where is_open_ended
      and points_per_extra_match is null
  ) then
    raise exception 'Open-ended participation point rules require points_per_extra_match.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from participation_point_rule_input
    where not is_open_ended
      and points_per_extra_match is not null
  ) then
    raise exception 'Fixed participation point rules cannot set points_per_extra_match.'
      using errcode = '22023';
  end if;

  select min(matches_played)
  into v_min_open_matches
  from participation_point_rule_input
  where is_open_ended;

  if v_min_open_matches is not null
     and exists (
       select 1
       from participation_point_rule_input
       where not is_open_ended
         and matches_played >= v_min_open_matches
     ) then
    raise exception 'Fixed participation point rules cannot overlap an open-ended rule.'
      using errcode = '22023';
  end if;

  update participation_point_rule_input open_rule
  set participation_points = coalesce(
    (
      select fixed_rule.participation_points
      from participation_point_rule_input fixed_rule
      where not fixed_rule.is_open_ended
        and fixed_rule.matches_played < open_rule.matches_played
      order by fixed_rule.matches_played desc
      limit 1
    ),
    0
  ) + open_rule.points_per_extra_match
  where open_rule.is_open_ended;

  delete from public.season_participation_point_rules
  where season_participation_point_rules.season_id = p_season_id;

  insert into public.season_participation_point_rules (
    season_id,
    matches_played,
    participation_points,
    points_per_extra_match,
    is_open_ended,
    updated_by
  )
  select
    p_season_id,
    r.matches_played,
    r.participation_points,
    r.points_per_extra_match,
    r.is_open_ended,
    auth.uid()
  from participation_point_rule_input r
  order by r.matches_played;

  return query
  select
    r.id,
    r.season_id,
    r.matches_played,
    r.participation_points,
    r.points_per_extra_match,
    r.is_open_ended,
    r.updated_at
  from public.season_participation_point_rules r
  where r.season_id = p_season_id
  order by r.matches_played;
end;
$$;

revoke all on function public.set_season_participation_point_rules(uuid, jsonb)
  from public;
grant execute on function public.set_season_participation_point_rules(uuid, jsonb)
  to authenticated;

grant select on public.season_participation_point_rules to anon, authenticated;
grant insert, update, delete on public.season_participation_point_rules to authenticated;

commit;
