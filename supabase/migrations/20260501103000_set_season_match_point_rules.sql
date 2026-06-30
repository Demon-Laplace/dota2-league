begin;

create or replace function public.set_season_match_point_rules(
  p_season_id uuid,
  p_win_points numeric,
  p_loss_points numeric
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to update season %.', p_season_id
      using errcode = '42501';
  end if;

  update public.seasons
  set rule_config = jsonb_set(
        jsonb_set(
          coalesce(rule_config, '{}'::jsonb),
          '{win_points}',
          to_jsonb(coalesce(p_win_points, 3)),
          true
        ),
        '{loss_points}',
        to_jsonb(coalesce(p_loss_points, 0)),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  return v_season;
end;
$$;

revoke all on function public.set_season_match_point_rules(uuid, numeric, numeric) from public;
grant execute on function public.set_season_match_point_rules(uuid, numeric, numeric) to authenticated;

comment on function public.set_season_match_point_rules(uuid, numeric, numeric) is
  'Updates season rule_config win_points and loss_points for match-result scoring.';

commit;
