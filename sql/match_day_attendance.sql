begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.match_day_attendance_notes (
  id uuid primary key default gen_random_uuid(),
  match_day_id uuid not null references public.match_days(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  match_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null check (status in ('standby', 'absent')),
  note text,
  created_at timestamptz not null default now(),
  unique (match_day_id, player_id)
);

create index if not exists idx_match_day_attendance_notes_match_day
on public.match_day_attendance_notes (match_day_id, created_at);

create index if not exists idx_match_day_attendance_notes_season_date
on public.match_day_attendance_notes (season_id, match_date);

alter table public.match_day_attendance_notes enable row level security;

drop policy if exists match_day_attendance_notes_select_all on public.match_day_attendance_notes;
create policy match_day_attendance_notes_select_all
on public.match_day_attendance_notes
for select
to anon, authenticated
using (true);

drop policy if exists match_day_attendance_notes_insert_all on public.match_day_attendance_notes;
create policy match_day_attendance_notes_insert_all
on public.match_day_attendance_notes
for insert
to anon, authenticated
with check (true);

drop policy if exists match_day_attendance_notes_delete_all on public.match_day_attendance_notes;
create policy match_day_attendance_notes_delete_all
on public.match_day_attendance_notes
for delete
to anon, authenticated
using (true);

create or replace function public.fill_match_day_attendance_note_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_match_date date;
begin
  select season_id, match_date
  into v_season_id, v_match_date
  from public.match_days
  where id = new.match_day_id;

  if v_season_id is null or v_match_date is null then
    raise exception '未找到对应的比赛日';
  end if;

  new.season_id := v_season_id;
  new.match_date := v_match_date;
  return new;
end;
$$;

drop trigger if exists trg_fill_match_day_attendance_note_context on public.match_day_attendance_notes;
create trigger trg_fill_match_day_attendance_note_context
before insert or update on public.match_day_attendance_notes
for each row
execute function public.fill_match_day_attendance_note_context();

create or replace function public.ensure_previous_match_day_placeholder(
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_match_date date;
  v_match_day_id uuid;
begin
  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    return null;
  end if;

  v_match_date := ((now() at time zone 'Asia/Shanghai')::date - 1);

  insert into public.match_days (
    season_id,
    match_date,
    note,
    is_active,
    started_at,
    closed_at
  )
  values (
    v_season_id,
    v_match_date,
    '未记录比赛',
    false,
    now(),
    now()
  )
  on conflict (season_id, match_date)
  do update set
    note = coalesce(public.match_days.note, excluded.note)
  returning id into v_match_day_id;

  return v_match_day_id;
end;
$$;

grant select, insert, delete on public.match_day_attendance_notes to anon, authenticated;
grant execute on function public.ensure_previous_match_day_placeholder(uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'ensure-match-day-placeholder-beijing-2am'
  ) then
    perform cron.schedule(
      'ensure-match-day-placeholder-beijing-2am',
      '5 18 * * *',
      'select public.ensure_previous_match_day_placeholder();'
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;

commit;
