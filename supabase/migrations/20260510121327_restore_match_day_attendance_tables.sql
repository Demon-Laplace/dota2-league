begin;

create table if not exists public.match_days (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_date date not null,
  started_at timestamptz,
  closed_at timestamptz,
  is_active boolean not null default false,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, match_date)
);

comment on table public.match_days is
  'Per-season business-day buckets for recent match grouping, attendance notes, and match-day lifecycle state.';

create index if not exists match_days_season_date_idx
  on public.match_days (season_id, match_date desc);

create unique index if not exists match_days_one_active_per_season_idx
  on public.match_days (season_id)
  where is_active;

drop trigger if exists set_match_days_updated_at on public.match_days;
create trigger set_match_days_updated_at
  before update on public.match_days
  for each row execute function public.tg_set_updated_at();

insert into public.match_days (
  season_id,
  match_date,
  started_at,
  created_at,
  updated_at,
  is_active,
  note
)
select
  m.season_id,
  m.match_date,
  min(m.created_at) as started_at,
  min(m.created_at) as created_at,
  timezone('utc', now()) as updated_at,
  false as is_active,
  null::text as note
from public.matches m
where m.match_date is not null
group by m.season_id, m.match_date
on conflict (season_id, match_date) do update
set started_at = coalesce(public.match_days.started_at, excluded.started_at),
    created_at = least(public.match_days.created_at, excluded.created_at),
    updated_at = timezone('utc', now());

alter table public.match_days enable row level security;

drop policy if exists match_days_select_authenticated on public.match_days;
create policy match_days_select_authenticated
  on public.match_days
  for select
  to authenticated
  using (true);

drop policy if exists match_days_select_anon_public on public.match_days;
create policy match_days_select_anon_public
  on public.match_days
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = match_days.season_id
        and s.is_public
    )
  );

drop policy if exists match_days_write_staff on public.match_days;
create policy match_days_write_staff
  on public.match_days
  for all
  to authenticated
  using (public.can_adjust_scores(season_id))
  with check (public.can_adjust_scores(season_id));

grant select on public.match_days to anon;
grant select, insert, update, delete on public.match_days to authenticated;

create table if not exists public.match_day_attendance_notes (
  id uuid primary key default gen_random_uuid(),
  match_day_id uuid references public.match_days(id) on delete set null,
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_date date not null,
  player_id uuid not null references public.players(id) on delete restrict,
  status text not null
    check (status in ('absent', 'standby', 'note')),
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (season_id, match_date, player_id, status)
);

comment on table public.match_day_attendance_notes is
  'Per-match-day attendance notes, including late arrivals and signed-up players who never appeared.';

create index if not exists match_day_attendance_notes_season_date_idx
  on public.match_day_attendance_notes (season_id, match_date desc, created_at asc);

create index if not exists match_day_attendance_notes_match_day_idx
  on public.match_day_attendance_notes (match_day_id, created_at asc);

create index if not exists match_day_attendance_notes_player_idx
  on public.match_day_attendance_notes (player_id, created_at desc);

create or replace function private.sync_match_day_attendance_note_context()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match_day public.match_days%rowtype;
begin
  if new.match_day_id is not null then
    select *
    into v_match_day
    from public.match_days
    where id = new.match_day_id;

    if not found then
      raise exception 'Match day % not found.', new.match_day_id
        using errcode = 'P0002';
    end if;

    if new.season_id is distinct from v_match_day.season_id then
      raise exception 'Attendance note season % does not match match day season %.', new.season_id, v_match_day.season_id
        using errcode = '23514';
    end if;

    if new.match_date is distinct from v_match_day.match_date then
      raise exception 'Attendance note date % does not match match day date %.', new.match_date, v_match_day.match_date
        using errcode = '23514';
    end if;
  end if;

  if new.season_id is null then
    raise exception 'Attendance notes require season_id.'
      using errcode = '23502';
  end if;

  if new.match_date is null then
    raise exception 'Attendance notes require match_date.'
      using errcode = '23502';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_match_day_attendance_note_context on public.match_day_attendance_notes;
create trigger sync_match_day_attendance_note_context
  before insert or update on public.match_day_attendance_notes
  for each row execute function private.sync_match_day_attendance_note_context();

alter table public.match_day_attendance_notes enable row level security;

drop policy if exists match_day_attendance_notes_select_authenticated on public.match_day_attendance_notes;
create policy match_day_attendance_notes_select_authenticated
  on public.match_day_attendance_notes
  for select
  to authenticated
  using (true);

drop policy if exists match_day_attendance_notes_select_anon_public on public.match_day_attendance_notes;
create policy match_day_attendance_notes_select_anon_public
  on public.match_day_attendance_notes
  for select
  to anon
  using (
    exists (
      select 1
      from public.seasons s
      where s.id = match_day_attendance_notes.season_id
        and s.is_public
    )
  );

drop policy if exists match_day_attendance_notes_write_staff on public.match_day_attendance_notes;
create policy match_day_attendance_notes_write_staff
  on public.match_day_attendance_notes
  for all
  to authenticated
  using (public.can_adjust_scores(season_id))
  with check (public.can_adjust_scores(season_id));

grant select on public.match_day_attendance_notes to anon;
grant select, insert, update, delete on public.match_day_attendance_notes to authenticated;

commit;
