begin;

create or replace function public.should_apply_match_day_absence_adjustment(
  p_match_date date
)
returns boolean
language sql
stable
as $$
  select false;
$$;

create or replace function public.should_apply_match_day_absence_adjustment(
  p_match_date date,
  p_closed_at timestamptz
)
returns boolean
language sql
stable
as $$
  select false;
$$;

comment on function public.should_apply_match_day_absence_adjustment(date)
  is 'Compatibility no-op. Match-day absence score adjustments are disabled.';

comment on function public.should_apply_match_day_absence_adjustment(date, timestamptz)
  is 'Compatibility no-op. Match-day absence score adjustments are disabled.';

revoke all on function public.should_apply_match_day_absence_adjustment(date) from public;
revoke all on function public.should_apply_match_day_absence_adjustment(date, timestamptz) from public;

grant execute on function public.should_apply_match_day_absence_adjustment(date) to authenticated;
grant execute on function public.should_apply_match_day_absence_adjustment(date, timestamptz) to authenticated;

commit;
