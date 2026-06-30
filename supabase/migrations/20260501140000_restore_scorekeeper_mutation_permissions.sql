begin;

create or replace function public.can_submit_matches(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_editable(p_season_id)
    and (
      public.is_scorekeeper()
      or public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
    );
$$;

comment on function public.can_submit_matches(uuid)
  is 'Returns true when the current authenticated scorekeeper/admin may record matches for an active season.';

create or replace function public.can_adjust_scores(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    public.is_season_editable(p_season_id)
    and (
      public.is_scorekeeper()
      or public.can_manage_season(p_season_id)
      or private.has_season_role(p_season_id, array['score_keeper'])
    );
$$;

comment on function public.can_adjust_scores(uuid)
  is 'Returns true when the current authenticated scorekeeper/admin may mutate score-affecting data for an active season.';

commit;
