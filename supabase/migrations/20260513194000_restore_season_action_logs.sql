begin;

create table if not exists public.season_action_logs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_role text not null
    check (actor_role in ('admin', 'scorekeeper')),
  actor_name text not null,
  text text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.season_action_logs is
  'Season-scoped operator action logs. Admins can view all logs for a season; scorekeepers can only view their own rows.';

create index if not exists season_action_logs_season_created_idx
  on public.season_action_logs (season_id, created_at desc);

create index if not exists season_action_logs_actor_idx
  on public.season_action_logs (actor_user_id, created_at desc);

alter table public.season_action_logs enable row level security;

drop policy if exists season_action_logs_select_authenticated on public.season_action_logs;
create policy season_action_logs_select_authenticated
  on public.season_action_logs
  for select
  to authenticated
  using (
    (
      public.can_adjust_scores(season_id)
      and (
        public.can_manage_season(season_id)
        or actor_user_id = auth.uid()
      )
    )
  );

drop policy if exists season_action_logs_insert_authenticated on public.season_action_logs;
create policy season_action_logs_insert_authenticated
  on public.season_action_logs
  for insert
  to authenticated
  with check (
    actor_user_id = auth.uid()
    and public.can_adjust_scores(season_id)
    and btrim(text) <> ''
  );

grant select, insert on public.season_action_logs to authenticated;

create or replace function private.prune_season_action_logs(
  p_keep_interval interval default interval '3 days'
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deleted_count integer := 0;
begin
  delete from public.season_action_logs
  where created_at < timezone('utc', now()) - p_keep_interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

comment on function private.prune_season_action_logs(interval) is
  'Deletes public.season_action_logs rows older than the retention interval. Default retention is 3 days.';

select private.prune_season_action_logs();

create or replace function public.append_season_action_log(
  p_season_id uuid,
  p_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.season_action_logs
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_actor_role text;
  v_actor_name text;
  v_text text := btrim(coalesce(p_text, ''));
  v_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
      then coalesce(p_metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_row public.season_action_logs;
begin
  if p_season_id is null then
    raise exception 'season_id is required.'
      using errcode = '22023';
  end if;

  if v_text = '' then
    raise exception 'text is required.'
      using errcode = '22023';
  end if;

  perform private.prune_season_action_logs();

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to append season action logs for season %.', p_season_id
      using errcode = '42501';
  end if;

  v_actor_role := case
    when public.can_manage_season(p_season_id) then 'admin'
    else 'scorekeeper'
  end;

  select coalesce(nullif(p.display_name, ''), nullif(auth.jwt() ->> 'email', ''), '未命名用户')
  into v_actor_name
  from public.profiles p
  where p.id = v_actor;

  if v_actor_name is null then
    v_actor_name := coalesce(nullif(auth.jwt() ->> 'email', ''), '未命名用户');
  end if;

  insert into public.season_action_logs (
    season_id,
    actor_user_id,
    actor_role,
    actor_name,
    text,
    metadata
  )
  values (
    p_season_id,
    v_actor,
    v_actor_role,
    v_actor_name,
    v_text,
    v_metadata
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.append_season_action_log(uuid, text, jsonb) is
  'Appends a season-scoped operation log row for the current authenticated actor and trims log retention to the most recent 3 days.';

revoke all on function public.append_season_action_log(uuid, text, jsonb) from public;
grant execute on function public.append_season_action_log(uuid, text, jsonb) to authenticated;

create or replace function public.get_season_action_logs(
  p_season_id uuid
)
returns table (
  id uuid,
  season_id uuid,
  actor_user_id uuid,
  actor_role text,
  actor_name text,
  text text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
begin
  if p_season_id is null then
    raise exception 'season_id is required.'
      using errcode = '22023';
  end if;

  perform private.prune_season_action_logs();

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to view season action logs for season %.', p_season_id
      using errcode = '42501';
  end if;

  if public.can_manage_season(p_season_id) then
    return query
    select
      sal.id,
      sal.season_id,
      sal.actor_user_id,
      sal.actor_role,
      sal.actor_name,
      sal.text,
      sal.created_at
    from public.season_action_logs sal
    where sal.season_id = p_season_id
    order by sal.created_at desc, sal.id desc
    limit 300;
  end if;

  return query
  select
    sal.id,
    sal.season_id,
    sal.actor_user_id,
    sal.actor_role,
    sal.actor_name,
    sal.text,
    sal.created_at
  from public.season_action_logs sal
  where sal.season_id = p_season_id
    and sal.actor_user_id = v_actor
  order by sal.created_at desc, sal.id desc
  limit 300;
end;
$$;

comment on function public.get_season_action_logs(uuid) is
  'Returns season action logs for the current actor after trimming retention to the most recent 3 days. Admins receive all rows; scorekeepers only receive their own rows.';

revoke all on function public.get_season_action_logs(uuid) from public;
grant execute on function public.get_season_action_logs(uuid) to authenticated;

commit;
