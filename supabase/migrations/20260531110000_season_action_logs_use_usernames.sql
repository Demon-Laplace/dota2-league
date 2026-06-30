begin;

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
  v_identity private.auth_identities;
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
  v_identity := private.current_auth_identity();

  select coalesce(
    nullif(v_identity.username, ''),
    nullif(p.display_name, ''),
    nullif(auth.jwt() ->> 'email', ''),
    '未命名用户'
  )
  into v_actor_name
  from public.profiles p
  where p.id = v_actor;

  if v_actor_name is null then
    v_actor_name := coalesce(
      nullif(v_identity.username, ''),
      nullif(auth.jwt() ->> 'email', ''),
      '未命名用户'
    );
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
  'Appends a season-scoped operation log row for the current authenticated actor, storing the managed username when available, and trims log retention to the most recent 3 days.';

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
      coalesce(nullif(ai.username, ''), sal.actor_name) as actor_name,
      sal.text,
      sal.created_at
    from public.season_action_logs sal
    left join private.auth_identities ai
      on ai.auth_user_id = sal.actor_user_id
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
    coalesce(nullif(ai.username, ''), sal.actor_name) as actor_name,
    sal.text,
    sal.created_at
  from public.season_action_logs sal
  left join private.auth_identities ai
    on ai.auth_user_id = sal.actor_user_id
  where sal.season_id = p_season_id
    and sal.actor_user_id = v_actor
  order by sal.created_at desc, sal.id desc
  limit 300;
end;
$$;

comment on function public.get_season_action_logs(uuid) is
  'Returns season action logs for the current actor after trimming retention to the most recent 3 days. Admins receive all rows; scorekeepers only receive their own rows. Actor names prefer managed usernames.';

commit;
