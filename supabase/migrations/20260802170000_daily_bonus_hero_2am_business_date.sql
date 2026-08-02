begin;

create or replace function private.daily_bonus_business_date()
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select (timezone('Asia/Shanghai', current_timestamp) - interval '2 hours')::date;
$$;

comment on function private.daily_bonus_business_date() is
  'Returns the daily bonus hero business date using the shared Beijing 02:00 day boundary.';

commit;
