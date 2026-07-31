begin;

create or replace function public.assign_player_steam_account(
  p_player_id uuid,
  p_steam_account_id text
)
returns setof public.player_external_accounts
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_account_id text;
begin
  if not public.is_scorekeeper() then
    raise exception 'Only admins or scorekeepers may manage Steam account mappings.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and p.is_active
  ) then
    raise exception 'Player % not found or inactive.', p_player_id
      using errcode = 'P0002';
  end if;

  v_account_id := private.normalize_steam_dota_account_id(p_steam_account_id);

  delete from public.player_external_accounts
  where provider = 'steam'
    and provider_account_id = v_account_id
    and player_id <> p_player_id;

  insert into public.player_external_accounts (
    player_id,
    provider,
    provider_account_id,
    metadata
  )
  values (
    p_player_id,
    'steam',
    v_account_id,
    jsonb_build_object('managed_by', auth.uid())
  )
  on conflict (provider, provider_account_id)
  do update set
    player_id = excluded.player_id,
    metadata = public.player_external_accounts.metadata
      || jsonb_build_object('managed_by', auth.uid()),
    updated_at = timezone('utc', now());

  return query
  select pea.*
  from public.player_external_accounts pea
  where pea.player_id = p_player_id
    and pea.provider = 'steam'
  order by pea.provider_account_id;
end;
$$;

revoke all on function public.assign_player_steam_account(uuid, text) from public;
grant execute on function public.assign_player_steam_account(uuid, text) to authenticated;

commit;
