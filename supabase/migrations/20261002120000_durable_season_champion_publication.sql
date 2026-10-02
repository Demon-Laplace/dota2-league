begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
revoke all on net.http_request_queue from public, anon, authenticated, service_role;

create table private.champion_worker_config (
  singleton boolean primary key default true check (singleton),
  worker_token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  worker_url text not null default 'https://klxkkwwszqtgeuozwtkw.supabase.co/functions/v1/process-season-champion-publications'
);
insert into private.champion_worker_config(singleton) values (true);
revoke all on private.champion_worker_config from public, anon, authenticated, service_role;

-- Independent delivery record: frozen data must survive archival/purging of the
-- source season. season_id is the original stable identity, not a cascade FK.
create table private.season_champion_publications (
  season_id uuid primary key,
  source_snapshot jsonb not null,
  champion jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check ((status = 'processing') = (lease_id is not null and lease_until is not null)),
  check (status <> 'published' or (champion is not null and published_at is not null))
);
revoke all on private.season_champion_publications from public, anon, authenticated, service_role;
create index season_champion_publications_pending_idx
  on private.season_champion_publications(next_attempt_at) where status <> 'published';

create function private.capture_season_champion_publication(p_season_id uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_season public.seasons%rowtype; v_snapshot jsonb;
begin
  if exists (select 1 from private.season_champion_publications where season_id = p_season_id) then return; end if;
  select * into v_season from public.seasons where id = p_season_id for update;
  if not found or v_season.status not in ('closed', 'archived') then
    raise exception 'Season must be ended';
  end if;
  -- Empty seasons are deleted by rollover and have no champion to publish.
  if not exists (select 1 from public.matches where season_id = p_season_id) then return; end if;
  if v_season.code !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid season code'; end if;
  v_snapshot := jsonb_build_object(
    'season', jsonb_build_object('id', v_season.id, 'code', v_season.code, 'name', v_season.name, 'status', v_season.status),
    'players', coalesce((select jsonb_agg(to_jsonb(r) order by r.player_id) from (
      select player_id, display_name, score_total, wins, losses, matches_played from public.v_leaderboard where season_id = p_season_id
    ) r), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.matches_played) from (
      select matches_played, participation_points, points_per_extra_match, is_open_ended from public.season_participation_point_rules where season_id = p_season_id
    ) r), '[]'::jsonb),
    'manual', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select player_id, points_delta from public.manual_score_adjustments where season_id = p_season_id and revoked_at is null
    ) r), '[]'::jsonb),
    'heroes', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select player_id, points_delta from public.hero_reward_adjustments where season_id = p_season_id and revoked_at is null
    ) r), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (
      select id, player_id, entry_type, points_delta, reversal_of_id from public.score_ledger where season_id = p_season_id
    ) r), '[]'::jsonb)
  );
  if jsonb_array_length(v_snapshot->'players') = 0 then raise exception 'No leaderboard rows for closed season'; end if;
  insert into private.season_champion_publications(season_id, source_snapshot)
    values (p_season_id, v_snapshot) on conflict (season_id) do nothing;
end;
$$;
revoke all on function private.capture_season_champion_publication(uuid) from public, anon, authenticated, service_role;

create function private.dispatch_champion_publications(p_season_id uuid default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_config private.champion_worker_config%rowtype;
begin
  if not exists (
    select 1 from private.season_champion_publications
    where (p_season_id is null or season_id = p_season_id)
      and ((status = 'pending' and next_attempt_at <= now()) or (status = 'processing' and lease_until < now()))
  ) then return; end if;
  select * into strict v_config from private.champion_worker_config where singleton;
  perform net.http_post(
    url := v_config.worker_url,
    body := jsonb_build_object('seasonId', p_season_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Champion-Worker-Token', v_config.worker_token),
    timeout_milliseconds := 10000
  );
exception when others then
  -- Durable record is retained even if immediate delivery cannot be queued.
  raise warning 'Champion dispatch failed; durable task will retry';
end;
$$;
revoke all on function private.dispatch_champion_publications(uuid) from public, anon, authenticated, service_role;

create function private.enqueue_champion_on_season_close()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.capture_season_champion_publication(new.id);
  perform private.dispatch_champion_publications(new.id);
  return new;
end;
$$;
revoke all on function private.enqueue_champion_on_season_close() from public, anon, authenticated, service_role;
create trigger enqueue_champion_on_season_close after update of status on public.seasons
  for each row when (new.status = 'closed' and old.status is distinct from new.status)
  execute function private.enqueue_champion_on_season_close();

create function public.claim_champion_publications(p_worker_token text, p_season_id uuid default null)
returns setof private.season_champion_publications
language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from private.champion_worker_config where worker_token = p_worker_token) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    with due as (
      select season_id from private.season_champion_publications
      where (p_season_id is null or season_id = p_season_id)
        and ((status = 'pending' and next_attempt_at <= now()) or (status = 'processing' and lease_until < now()))
      order by next_attempt_at, created_at limit 3 for update skip locked
    )
    update private.season_champion_publications j
      set status = 'processing', lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes', attempts = attempts + 1
    from due where j.season_id = due.season_id returning j.*;
end;
$$;

create function public.freeze_champion_publication_result(p_season_id uuid, p_lease_id uuid, p_champion jsonb)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_job private.season_champion_publications%rowtype;
begin
  select * into v_job from private.season_champion_publications where season_id = p_season_id for update;
  if not found or v_job.lease_id is distinct from p_lease_id or v_job.lease_until <= now() then raise exception 'Publication lease expired'; end if;
  if p_champion is null or p_champion->>'seasonId' is distinct from p_season_id::text
    or p_champion->>'seasonCode' is distinct from v_job.source_snapshot->'season'->>'code'
    or jsonb_typeof(p_champion->'score') is distinct from 'number'
    or coalesce(p_champion->>'championName', '') = '' then raise exception 'Invalid champion result'; end if;
  if v_job.champion is not null and v_job.champion <> p_champion then raise exception 'Champion result is immutable'; end if;
  update private.season_champion_publications set champion = coalesce(champion, p_champion) where season_id = p_season_id;
  return coalesce(v_job.champion, p_champion);
end;
$$;

create function public.finish_champion_publication(p_season_id uuid, p_lease_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  update private.season_champion_publications
    set status = case when p_error is null then 'published' else 'pending' end,
        published_at = case when p_error is null then now() else null end,
        last_error = left(p_error, 1000),
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7)))::integer),
        lease_id = null, lease_until = null
    where season_id = p_season_id and lease_id = p_lease_id and lease_until > now();
  if not found then raise exception 'Publication lease expired'; end if;
end;
$$;

revoke all on function public.claim_champion_publications(text, uuid) from public, anon, authenticated;
revoke all on function public.freeze_champion_publication_result(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_champion_publication(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_champion_publications(text, uuid) to service_role;
grant execute on function public.freeze_champion_publication_result(uuid, uuid, jsonb) to service_role;
grant execute on function public.finish_champion_publication(uuid, uuid, text) to service_role;

create function public.request_champion_publication(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_job private.season_champion_publications%rowtype;
begin
  perform private.require_authenticated();
  if not (public.is_admin() or public.can_manage_season(p_season_id) or public.is_scorekeeper()) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform private.capture_season_champion_publication(p_season_id);
  perform private.dispatch_champion_publications(p_season_id);
  select * into v_job from private.season_champion_publications where season_id = p_season_id;
  return jsonb_build_object('status', coalesce(v_job.status, 'empty'), 'champion', v_job.champion);
end;
$$;
revoke all on function public.request_champion_publication(uuid) from public, anon;
grant execute on function public.request_champion_publication(uuid) to authenticated;

-- This checks only due delivery tasks, never seasons or historical champions.
-- No HTTP request is sent when there is no pending/expired delivery.
select cron.schedule('retry-pending-champion-publications', '* * * * *', 'select private.dispatch_champion_publications();');

commit;
