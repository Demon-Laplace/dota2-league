begin;

revoke all on function public.get_admin_system_usage() from public;
revoke execute on function public.get_admin_system_usage() from anon;
grant execute on function public.get_admin_system_usage() to authenticated;

commit;
