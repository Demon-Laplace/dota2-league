create or replace function public.get_current_access_role()
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select jsonb_build_object(
    'username', (private.current_auth_identity()).username,
    'auth_email_normalized', private.current_auth_email(),
    'role', public.get_current_role(),
    'is_admin', public.is_admin(),
    'is_scorekeeper', public.is_scorekeeper(),
    'is_scorer', public.is_scorer()
  );
$$;

comment on function public.get_current_access_role() is 'Current authenticated access role payload for the front-end.';

revoke all on function public.get_current_access_role() from public;
grant execute on function public.get_current_access_role() to authenticated;

drop view if exists public.v_current_access_role;
drop view if exists public.v_my_admin_scope;
