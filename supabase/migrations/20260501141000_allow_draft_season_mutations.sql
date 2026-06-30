begin;

create or replace function public.is_season_editable(p_season_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.seasons s
    where s.id = p_season_id
      and s.status = any (array['draft', 'active'])
  );
$$;

comment on function public.is_season_editable(uuid)
  is 'Returns true when the target season is still editable. Draft and active seasons are writable; closed and archived seasons are read-only.';

commit;
