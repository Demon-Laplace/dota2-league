begin;

do $$
declare
  v_table text;
  v_schema text;
  v_name text;
  v_tables text[] := array[
    'public.seasons',
    'public.players',
    'public.season_memberships',
    'public.season_end_confirmations',
    'public.match_days',
    'public.match_day_attendance_notes',
    'public.matches',
    'public.match_players',
    'public.score_ledger',
    'public.manual_score_adjustments',
    'public.season_participation_point_rules',
    'public.reward_donations'
  ];
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach v_table in array v_tables
  loop
    v_schema := split_part(v_table, '.', 1);
    v_name := split_part(v_table, '.', 2);

    if to_regclass(v_table) is null then
      continue;
    end if;

    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = v_schema
        and tablename = v_name
    ) then
      continue;
    end if;

    execute format('alter publication supabase_realtime add table %I.%I', v_schema, v_name);
  end loop;
end;
$$;

commit;
