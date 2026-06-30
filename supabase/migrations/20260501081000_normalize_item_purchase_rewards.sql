begin;

create table if not exists public.season_item_catalog_settings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  item_catalog_id uuid not null references public.item_catalog(id) on delete cascade,
  initial_quantity integer not null default 0
    check (initial_quantity >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, item_catalog_id)
);

comment on table public.season_item_catalog_settings is 'Season-scoped item sponsorship settings. Stores free starting quantity separately from the global item catalog.';
comment on column public.season_item_catalog_settings.initial_quantity is 'Free item count granted to each active player at the start of the season.';

drop trigger if exists season_item_catalog_settings_set_updated_at on public.season_item_catalog_settings;
create trigger season_item_catalog_settings_set_updated_at
  before update on public.season_item_catalog_settings
  for each row execute function public.tg_set_updated_at();

alter table public.season_item_catalog_settings enable row level security;

drop policy if exists season_item_catalog_settings_select_authenticated on public.season_item_catalog_settings;
create policy season_item_catalog_settings_select_authenticated
  on public.season_item_catalog_settings
  for select
  to authenticated
  using (true);

drop policy if exists season_item_catalog_settings_select_anon on public.season_item_catalog_settings;
create policy season_item_catalog_settings_select_anon
  on public.season_item_catalog_settings
  for select
  to anon
  using (true);

drop policy if exists season_item_catalog_settings_write_scorekeeper on public.season_item_catalog_settings;
create policy season_item_catalog_settings_write_scorekeeper
  on public.season_item_catalog_settings
  for all
  to authenticated
  using (public.is_scorekeeper())
  with check (public.is_scorekeeper());

grant select on public.season_item_catalog_settings to anon, authenticated;
grant insert, update, delete on public.season_item_catalog_settings to authenticated;

update public.item_catalog
set config = config - 'initial_quantity'
where config ? 'initial_quantity';

comment on column public.item_catalog.config is 'Extensible item definition. Current front-end stores donation_amount and operator_roles for catalog management.';

create or replace function public.get_item_catalog_usage_summary(
  p_season_id uuid
)
returns table (
  item_catalog_id uuid,
  player_id uuid,
  usage_count integer,
  remaining_count integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  perform private.require_authenticated();

  if p_season_id is null then
    raise exception 'season_id is required.'
      using errcode = '22023';
  end if;

  if not (
    public.is_scorekeeper()
    or public.can_manage_season(p_season_id)
    or private.has_season_role(p_season_id, array['item_operator'])
  ) then
    raise exception 'You do not have permission to view item usage for this season.'
      using errcode = '42501';
  end if;

  return query
  with season_players as (
    select sm.player_id
    from public.season_memberships sm
    where sm.season_id = p_season_id
      and sm.join_status in ('active', 'captain')
  ),
  catalog_with_initial as (
    select
      ic.id,
      coalesce(sics.initial_quantity, 0) as initial_quantity
    from public.item_catalog ic
    left join public.season_item_catalog_settings sics
      on sics.season_id = p_season_id
     and sics.item_catalog_id = ic.id
  ),
  usage_counts as (
    select
      ii.item_catalog_id,
      ii.player_id,
      count(iu.id)::integer as usage_count
    from private.item_instances ii
    left join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
    group by ii.item_catalog_id, ii.player_id
  )
  select
    cwi.id as item_catalog_id,
    sp.player_id,
    coalesce(uc.usage_count, 0) as usage_count,
    cwi.initial_quantity - coalesce(uc.usage_count, 0) as remaining_count
  from catalog_with_initial cwi
  cross join season_players sp
  left join usage_counts uc
    on uc.item_catalog_id = cwi.id
   and uc.player_id = sp.player_id;
end;
$$;

revoke all on function public.get_item_catalog_usage_summary(uuid) from public;
grant execute on function public.get_item_catalog_usage_summary(uuid) to authenticated;

alter table public.reward_donations
  add column if not exists season_id uuid references public.seasons(id) on delete cascade,
  add column if not exists source_key text;

comment on column public.reward_donations.season_id is 'Season this reward record belongs to. New writes should set it explicitly.';
comment on column public.reward_donations.source_key is 'Stable identifier for system-derived reward rows such as item purchases.';

create index if not exists reward_donations_season_id_idx
  on public.reward_donations (season_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reward_donations'::regclass
      and conname = 'reward_donations_source_key_key'
  ) then
    alter table public.reward_donations
      add constraint reward_donations_source_key_key unique (source_key);
  end if;
end;
$$;

update public.reward_donations rd
set season_id = m.season_id
from public.matches m
where rd.season_id is null
  and rd.match_id = m.id;

with active_memberships as (
  select distinct on (sm.player_id)
    sm.player_id,
    sm.season_id
  from public.season_memberships sm
  join public.seasons s
    on s.id = sm.season_id
  where sm.join_status in ('active', 'captain')
    and s.status = 'active'
  order by sm.player_id, s.start_at desc nulls last, sm.joined_at desc nulls last
)
update public.reward_donations rd
set season_id = am.season_id
from active_memberships am
where rd.season_id is null
  and rd.player_id = am.player_id;

with single_memberships as (
  select distinct on (sm.player_id)
    sm.player_id,
    sm.season_id
  from public.season_memberships sm
  join (
    select player_id
    from public.season_memberships
    group by player_id
    having count(distinct season_id) = 1
  ) single_player
    on single_player.player_id = sm.player_id
  order by sm.player_id, sm.season_id
)
update public.reward_donations rd
set season_id = sm.season_id
from single_memberships sm
where rd.season_id is null
  and rd.player_id = sm.player_id;

create or replace function private.tg_reward_donations_fill_context()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.match_id is not null then
    select m.season_id
    into new.season_id
    from public.matches m
    where m.id = new.match_id;
  elsif new.season_id is null and new.player_id is not null then
    select sm.season_id
    into new.season_id
    from public.season_memberships sm
    join public.seasons s
      on s.id = sm.season_id
    where sm.player_id = new.player_id
    order by
      case when s.status = 'active' then 0 else 1 end,
      s.start_at desc nulls last,
      sm.joined_at desc nulls last
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists reward_donations_fill_context on public.reward_donations;
create trigger reward_donations_fill_context
  before insert or update on public.reward_donations
  for each row execute function private.tg_reward_donations_fill_context();

create or replace function private.sync_item_purchase_reward_donations(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_season_id is null then
    return;
  end if;

  insert into public.reward_donations (
    season_id,
    donor_name,
    player_id,
    amount,
    category,
    note,
    is_outside,
    is_public,
    donated_at,
    source_key
  )
  with season_players as (
    select sm.player_id
    from public.season_memberships sm
    where sm.season_id = p_season_id
      and sm.join_status in ('active', 'captain')
  ),
  relevant_items as (
    select distinct ii.item_catalog_id
    from private.item_instances ii
    where ii.season_id = p_season_id
    union
    select distinct sics.item_catalog_id
    from public.season_item_catalog_settings sics
    where sics.season_id = p_season_id
  ),
  item_definitions as (
    select
      ic.id as item_catalog_id,
      ic.name as item_name,
      coalesce(sics.initial_quantity, 0) as initial_quantity,
      case
        when jsonb_typeof(ic.config -> 'donation_amount') = 'number'
          then greatest((ic.config ->> 'donation_amount')::numeric, 0)
        when jsonb_typeof(ic.config -> 'donation_amount') = 'string'
          and (ic.config ->> 'donation_amount') ~ '^-?\d+(?:\.\d+)?$'
          then greatest((ic.config ->> 'donation_amount')::numeric, 0)
        else 0
      end as donation_amount
    from relevant_items ri
    join public.item_catalog ic
      on ic.id = ri.item_catalog_id
    left join public.season_item_catalog_settings sics
      on sics.season_id = p_season_id
     and sics.item_catalog_id = ic.id
  ),
  usage_counts as (
    select
      ii.item_catalog_id,
      ii.player_id,
      count(iu.id)::integer as usage_count
    from private.item_instances ii
    join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
    group by ii.item_catalog_id, ii.player_id
  ),
  effective_rows as (
    select
      p_season_id as season_id,
      sp.player_id,
      idf.item_catalog_id,
      idf.item_name,
      greatest(coalesce(uc.usage_count, 0) - idf.initial_quantity, 0) as purchase_quantity,
      idf.donation_amount,
      format('item_purchase:%s:%s:%s', p_season_id, sp.player_id, idf.item_catalog_id) as source_key
    from season_players sp
    cross join item_definitions idf
    left join usage_counts uc
      on uc.item_catalog_id = idf.item_catalog_id
     and uc.player_id = sp.player_id
  )
  select
    er.season_id,
    coalesce(p.display_name, '未知赞助人'),
    er.player_id,
    (er.purchase_quantity * er.donation_amount)::numeric(10, 2),
    'misc',
    format('道具购买 · %s × %s', er.item_name, er.purchase_quantity),
    false,
    true,
    timezone('utc', now()),
    er.source_key
  from effective_rows er
  join public.players p
    on p.id = er.player_id
  where er.purchase_quantity > 0
    and er.donation_amount > 0
  on conflict (source_key) do update
  set season_id = excluded.season_id,
      donor_name = excluded.donor_name,
      player_id = excluded.player_id,
      amount = excluded.amount,
      category = excluded.category,
      note = excluded.note,
      is_outside = excluded.is_outside,
      is_public = excluded.is_public;

  delete from public.reward_donations rd
  where rd.season_id = p_season_id
    and rd.source_key like ('item_purchase:' || p_season_id::text || ':%')
    and not exists (
      with season_players as (
        select sm.player_id
        from public.season_memberships sm
        where sm.season_id = p_season_id
          and sm.join_status in ('active', 'captain')
      ),
      relevant_items as (
        select distinct ii.item_catalog_id
        from private.item_instances ii
        where ii.season_id = p_season_id
        union
        select distinct sics.item_catalog_id
        from public.season_item_catalog_settings sics
        where sics.season_id = p_season_id
      ),
      item_definitions as (
        select
          ic.id as item_catalog_id,
          coalesce(sics.initial_quantity, 0) as initial_quantity,
          case
            when jsonb_typeof(ic.config -> 'donation_amount') = 'number'
              then greatest((ic.config ->> 'donation_amount')::numeric, 0)
            when jsonb_typeof(ic.config -> 'donation_amount') = 'string'
              and (ic.config ->> 'donation_amount') ~ '^-?\d+(?:\.\d+)?$'
              then greatest((ic.config ->> 'donation_amount')::numeric, 0)
            else 0
          end as donation_amount
        from relevant_items ri
        join public.item_catalog ic
          on ic.id = ri.item_catalog_id
        left join public.season_item_catalog_settings sics
          on sics.season_id = p_season_id
         and sics.item_catalog_id = ic.id
      ),
      usage_counts as (
        select
          ii.item_catalog_id,
          ii.player_id,
          count(iu.id)::integer as usage_count
        from private.item_instances ii
        join private.item_usages iu
          on iu.item_instance_id = ii.id
         and iu.status not in ('cancelled', 'rejected')
        where ii.season_id = p_season_id
        group by ii.item_catalog_id, ii.player_id
      ),
      effective_rows as (
        select
          format('item_purchase:%s:%s:%s', p_season_id, sp.player_id, idf.item_catalog_id) as source_key,
          greatest(coalesce(uc.usage_count, 0) - idf.initial_quantity, 0) as purchase_quantity,
          idf.donation_amount
        from season_players sp
        cross join item_definitions idf
        left join usage_counts uc
          on uc.item_catalog_id = idf.item_catalog_id
         and uc.player_id = sp.player_id
      )
      select 1
      from effective_rows er
      where er.source_key = rd.source_key
        and er.purchase_quantity > 0
        and er.donation_amount > 0
    );
end;
$$;

create or replace function private.tg_sync_item_purchase_rewards_by_season()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_season_id uuid;
  v_old_season_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old_season_id := old.season_id;
  elsif tg_op = 'INSERT' then
    v_new_season_id := new.season_id;
  else
    v_new_season_id := new.season_id;
    v_old_season_id := old.season_id;
  end if;

  perform private.sync_item_purchase_reward_donations(v_new_season_id);
  if v_old_season_id is distinct from v_new_season_id then
    perform private.sync_item_purchase_reward_donations(v_old_season_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.tg_sync_item_purchase_rewards_by_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_item_catalog_id uuid;
  v_season_id uuid;
begin
  if tg_op = 'DELETE' then
    v_item_catalog_id := old.id;
  else
    v_item_catalog_id := new.id;
  end if;

  for v_season_id in
    select distinct sics.season_id
    from public.season_item_catalog_settings sics
    where sics.item_catalog_id = v_item_catalog_id
    union
    select distinct ii.season_id
    from private.item_instances ii
    where ii.item_catalog_id = v_item_catalog_id
  loop
    perform private.sync_item_purchase_reward_donations(v_season_id);
  end loop;

  if tg_op = 'DELETE' then
    delete from public.reward_donations
    where source_key like ('item_purchase:%:%:' || old.id::text);
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_item_purchase_rewards_from_item_usages on private.item_usages;
create trigger sync_item_purchase_rewards_from_item_usages
  after insert or update or delete on private.item_usages
  for each row execute function private.tg_sync_item_purchase_rewards_by_season();

drop trigger if exists sync_item_purchase_rewards_from_item_instances on private.item_instances;
create trigger sync_item_purchase_rewards_from_item_instances
  after insert or update or delete on private.item_instances
  for each row execute function private.tg_sync_item_purchase_rewards_by_season();

drop trigger if exists sync_item_purchase_rewards_from_season_item_settings on public.season_item_catalog_settings;
create trigger sync_item_purchase_rewards_from_season_item_settings
  after insert or update or delete on public.season_item_catalog_settings
  for each row execute function private.tg_sync_item_purchase_rewards_by_season();

drop trigger if exists sync_item_purchase_rewards_from_item_catalog on public.item_catalog;
create trigger sync_item_purchase_rewards_from_item_catalog
  after update or delete on public.item_catalog
  for each row execute function private.tg_sync_item_purchase_rewards_by_catalog();

do $$
declare
  v_season_id uuid;
begin
  for v_season_id in
    select distinct season_id
    from public.season_item_catalog_settings
    union
    select distinct season_id
    from private.item_instances
  loop
    perform private.sync_item_purchase_reward_donations(v_season_id);
  end loop;
end;
$$;

commit;
