begin;

create or replace function public.recalculate_all_scores()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_season_id uuid;
  v_match record;
  v_deleted_for_season integer := 0;
  v_deleted_entries integer := 0;
  v_recalculated_matches integer := 0;
  v_recalculated_seasons integer := 0;
begin
  for v_season_id in
    select s.id
    from public.seasons s
    where public.can_adjust_scores(s.id)
    order by s.created_at, s.id
  loop
    v_recalculated_seasons := v_recalculated_seasons + 1;

    delete from public.score_ledger sl
    where sl.season_id = v_season_id
      and (
        (
          sl.entry_type = 'match_result'
          and sl.match_id is not null
          and sl.source_table = 'public.matches'
        )
        or (
          sl.entry_type = 'item_effect'
          and sl.match_id is not null
          and sl.source_table = 'public.matches'
        )
        or (
          sl.entry_type = 'rollback'
          and sl.metadata ? 'rolled_back_match_id'
        )
      );

    get diagnostics v_deleted_for_season = row_count;
    v_deleted_entries := v_deleted_entries + v_deleted_for_season;

    update public.match_players mp
    set result = 'pending',
        updated_at = timezone('utc', now())
    where mp.season_id = v_season_id;

    for v_match in
      select
        m.id,
        case
          when jsonb_typeof(m.metadata -> 'double_downs') = 'array' then m.metadata -> 'double_downs'
          else '[]'::jsonb
        end as double_downs
      from public.matches m
      where m.season_id = v_season_id
        and m.status = 'approved'
      order by m.match_date, m.match_no, m.created_at, m.id
    loop
      perform private.post_match_score_entries(v_match.id, v_actor);
      perform private.apply_match_double_downs(v_match.id, v_match.double_downs, v_actor);
      v_recalculated_matches := v_recalculated_matches + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'seasons_recalculated', v_recalculated_seasons,
    'matches_recalculated', v_recalculated_matches,
    'ledger_entries_deleted', v_deleted_entries
  );
end;
$$;

revoke all on function public.recalculate_all_scores() from public;
grant execute on function public.recalculate_all_scores() to authenticated;

commit;
