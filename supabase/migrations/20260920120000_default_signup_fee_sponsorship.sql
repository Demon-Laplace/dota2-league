begin;

-- A signup-fee row is the durable source of truth for the season's base
-- sponsorship.  New active memberships receive it automatically; leaving a
-- season removes it.  Existing rows are intentionally not backfilled here so
-- applying this migration cannot change the current season retroactively.
create or replace function public.sync_season_signup_fee_reward()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player public.players%rowtype;
  v_source_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.reward_donations
    where season_id = old.season_id
      and source_key = format('signup_fee:%s:%s', old.season_id, old.player_id)
      and category = 'signup_fee';
    return old;
  end if;

  v_source_key := format('signup_fee:%s:%s', new.season_id, new.player_id);

  if new.join_status not in ('active', 'captain') then
    delete from public.reward_donations
    where season_id = new.season_id
      and source_key = v_source_key
      and category = 'signup_fee';
    return new;
  end if;

  select *
  into v_player
  from public.players
  where id = new.player_id;

  if not found or not v_player.is_active then
    delete from public.reward_donations
    where season_id = new.season_id
      and source_key = v_source_key
      and category = 'signup_fee';
    return new;
  end if;

  insert into public.reward_donations (
    season_id,
    source_key,
    donor_name,
    player_id,
    amount,
    category,
    note,
    is_outside,
    is_public
  )
  values (
    new.season_id,
    v_source_key,
    v_player.display_name,
    new.player_id,
    20,
    'signup_fee',
    '基础赞助确认',
    false,
    true
  )
  on conflict (source_key) do nothing;

  return new;
end;
$$;

drop trigger if exists season_memberships_sync_signup_fee_reward on public.season_memberships;
create trigger season_memberships_sync_signup_fee_reward
  after insert or update of join_status or delete on public.season_memberships
  for each row
  execute function public.sync_season_signup_fee_reward();

-- Hiding a player removes them from the editable season roster.  The membership
-- trigger above then cancels only the editable season's default sponsorship,
-- while closed-season history remains intact.
create or replace function public.sync_active_memberships_after_player_visibility_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.is_active is true and new.is_active is false then
    update public.season_memberships sm
    set join_status = 'inactive',
        rank_no = null,
        updated_at = timezone('utc', now())
    from public.seasons s
    where sm.season_id = s.id
      and sm.player_id = new.id
      and s.status in ('draft', 'active')
      and sm.join_status in ('active', 'captain');
  end if;

  return new;
end;
$$;

drop trigger if exists players_sync_active_memberships_after_visibility_change on public.players;
create trigger players_sync_active_memberships_after_visibility_change
  after update of is_active on public.players
  for each row
  when (old.is_active is distinct from new.is_active)
  execute function public.sync_active_memberships_after_player_visibility_change();

-- A permanent deletion can bypass membership updates through cascading FKs;
-- remove only the generated signup-fee rows in that case.
create or replace function public.remove_signup_fee_rewards_after_player_delete()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  delete from public.reward_donations
  where category = 'signup_fee'
    and (
      player_id = old.id
      or source_key like ('signup_fee:%:' || old.id::text)
    );
  return old;
end;
$$;

drop trigger if exists players_remove_signup_fee_rewards_after_delete on public.players;
create trigger players_remove_signup_fee_rewards_after_delete
  after delete on public.players
  for each row
  execute function public.remove_signup_fee_rewards_after_player_delete();

comment on function public.sync_season_signup_fee_reward()
  is 'Keeps the default season base sponsorship in sync with active season memberships. Existing seasons are not backfilled.';
comment on function public.sync_active_memberships_after_player_visibility_change()
  is 'Removes hidden players from the active season so their default base sponsorship is cancelled without rewriting closed-season history.';
comment on function public.remove_signup_fee_rewards_after_player_delete()
  is 'Removes generated signup-fee sponsorship rows when a player is permanently deleted.';

revoke all on function public.sync_season_signup_fee_reward() from public;
revoke all on function public.sync_active_memberships_after_player_visibility_change() from public;
revoke all on function public.remove_signup_fee_rewards_after_player_delete() from public;

commit;
