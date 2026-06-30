begin;

create or replace function public.confirm_season_rollover(
  p_season_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season public.seasons%rowtype;
  v_role text;
  v_scorer_confirmation_count integer := 0;
  v_cutoff timestamptz;
  v_next_start timestamptz;
  v_next_end timestamptz;
  v_next_code text;
  v_next_name text;
  v_next_season_id uuid;
  v_match_count integer := 0;
  v_retain_closed_season boolean := false;
  v_season_month_start date;
  v_relation_all_seasons_min_games integer := 3;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to close season %.', p_season_id
      using errcode = '42501';
  end if;

  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if v_season.status <> all (array['draft', 'active']) then
    raise exception 'Only draft or active seasons may be closed.'
      using errcode = 'P0001';
  end if;

  v_season_month_start := case
    when coalesce(v_season.code, '') ~ '^\d{4}-\d{2}$'
      then to_date(v_season.code || '-01', 'YYYY-MM-DD')
    else date_trunc(
      'month',
      timezone('Asia/Shanghai', coalesce(v_season.start_at, v_season.end_at, timezone('utc', now())))
    )::date
  end;

  v_cutoff := (
    v_season_month_start::timestamp
    + interval '1 month'
    - interval '1 day'
    + interval '6 hours'
  ) at time zone 'Asia/Shanghai';

  if now() < v_cutoff then
    raise exception 'Season rollover is not yet open.'
      using errcode = 'P0001';
  end if;

  v_role := case
    when public.can_manage_season(p_season_id) then 'admin'
    else 'scorekeeper'
  end;

  insert into public.season_end_confirmations (
    season_id,
    user_id,
    role
  )
  values (
    p_season_id,
    v_actor,
    v_role
  )
  on conflict (season_id, user_id) do update
    set role = excluded.role;

  select count(*)
  into v_scorer_confirmation_count
  from public.season_end_confirmations sec
  where sec.season_id = p_season_id
    and sec.role = 'scorekeeper';

  if v_role <> 'admin' and v_scorer_confirmation_count < 1 then
    return jsonb_build_object(
      'finalized', false,
      'scorer_confirmation_count', v_scorer_confirmation_count,
      'actor_role', v_role
    );
  end if;

  select count(*)
  into v_match_count
  from public.matches
  where season_id = p_season_id;

  v_retain_closed_season := v_match_count > 0;

  v_next_start := timezone('utc', ((v_season_month_start::timestamp + interval '1 month') at time zone 'Asia/Shanghai'));
  v_next_end := timezone('utc', ((v_season_month_start::timestamp + interval '2 month' - interval '1 second') at time zone 'Asia/Shanghai'));
  v_next_code := to_char(v_season_month_start + interval '1 month', 'YYYY-MM');
  v_next_name := format(
    '%s 年 %s 月赛季',
    to_char(v_season_month_start + interval '1 month', 'YYYY'),
    to_char(v_season_month_start + interval '1 month', 'FMMM')
  );
  v_relation_all_seasons_min_games := private.calculate_relation_all_seasons_min_games();

  insert into public.seasons (
    code,
    name,
    status,
    is_public,
    start_at,
    end_at,
    rule_version,
    rule_config
  )
  values (
    v_next_code,
    v_next_name,
    'active',
    true,
    v_next_start,
    v_next_end,
    to_char(v_season_month_start + interval '1 month', 'YYYY.MM'),
    jsonb_set(
      jsonb_set(
        coalesce(v_season.rule_config, '{}'::jsonb),
        '{rank_count}',
        to_jsonb(greatest(1, least(coalesce(nullif(v_season.rule_config ->> 'rank_count', '')::integer, 3), 12))),
        true
      ),
      '{relation_all_seasons_min_games}',
      to_jsonb(v_relation_all_seasons_min_games),
      true
    )
  )
  on conflict (code) do update
    set status = 'active',
        is_public = true,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        rule_version = excluded.rule_version,
        rule_config = excluded.rule_config,
        updated_at = timezone('utc', now())
  returning id into v_next_season_id;

  update public.seasons
  set status = 'closed',
      updated_at = timezone('utc', now())
  where id <> v_next_season_id
    and status = 'active';

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status
  )
  select
    v_next_season_id,
    p.id,
    'inactive'
  from public.players p
  where p.is_active
    and not exists (
      select 1
      from public.season_memberships sm
      where sm.season_id = v_next_season_id
        and sm.player_id = p.id
    );

  insert into public.season_memberships (
    season_id,
    player_id,
    join_status,
    rank_no,
    joined_at
  )
  select
    v_next_season_id,
    sm.player_id,
    sm.join_status,
    sm.rank_no,
    sm.joined_at
  from public.season_memberships sm
  where sm.season_id = p_season_id
  on conflict (season_id, player_id) do update
    set join_status = excluded.join_status,
        rank_no = excluded.rank_no,
        joined_at = excluded.joined_at,
        updated_at = timezone('utc', now());

  insert into public.season_item_catalog_settings (
    season_id,
    item_catalog_id,
    initial_quantity
  )
  select
    v_next_season_id,
    sics.item_catalog_id,
    sics.initial_quantity
  from public.season_item_catalog_settings sics
  where sics.season_id = p_season_id
  on conflict (season_id, item_catalog_id) do update
    set initial_quantity = excluded.initial_quantity;

  if v_retain_closed_season then
    update public.seasons
    set status = 'closed',
        updated_at = timezone('utc', now())
    where id = p_season_id;
  else
    perform private.purge_season_records(p_season_id);
  end if;

  return jsonb_build_object(
    'finalized', true,
    'scorer_confirmation_count', v_scorer_confirmation_count,
    'actor_role', v_role,
    'next_season_id', v_next_season_id,
    'next_season_name', v_next_name,
    'closed_season_id', p_season_id,
    'closed_season_code', v_season.code,
    'closed_season_name', v_season.name,
    'closed_season_match_count', v_match_count,
    'closed_season_retained_in_database', v_retain_closed_season,
    'relation_all_seasons_min_games', v_relation_all_seasons_min_games
  );
end;
$$;

comment on function public.confirm_season_rollover(uuid)
  is 'Closes the current editable season (draft or active). Rollover opens at 06:00 Asia/Shanghai on the last calendar day of the current season month; season managers may finalize immediately, and one scorekeeper confirmation is sufficient. It also caches the all-season relationship minimum sample size for the next season.';

grant execute on function public.confirm_season_rollover(uuid) to authenticated;

commit;
