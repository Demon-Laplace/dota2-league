begin;

drop function if exists public.get_item_catalog_usage_summary(uuid);

create or replace function public.get_item_catalog_usage_summary(
  p_season_id uuid
)
returns table (
  item_catalog_id uuid,
  player_id uuid,
  usage_count numeric,
  remaining_count numeric
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
      coalesce(sics.initial_quantity, 0)::numeric as initial_quantity
    from public.item_catalog ic
    left join public.season_item_catalog_settings sics
      on sics.season_id = p_season_id
     and sics.item_catalog_id = ic.id
  ),
  usage_rows as (
    select
      ii.item_catalog_id,
      ii.player_id,
      case
        when coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
          and coalesce(iu.effect_payload ->> 'mode', '') = 'team'
          and coalesce(iu.effect_payload ->> 'payment_mode', 'solo') = 'split'
          then 1::numeric / nullif(
            count(*) over (
              partition by
                ii.season_id,
                iu.match_id,
                ii.item_catalog_id,
                coalesce(iu.effect_payload ->> 'target_team', ''),
                coalesce(iu.effect_payload ->> 'source_team', ''),
                coalesce(iu.effect_payload ->> 'payment_mode', 'solo')
            ),
            0
          )::numeric
        else 1::numeric
      end as usage_weight
    from private.item_instances ii
    left join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
      and iu.id is not null
  ),
  usage_counts as (
    select
      ur.item_catalog_id,
      ur.player_id,
      round(sum(ur.usage_weight), 2) as usage_count
    from usage_rows ur
    group by ur.item_catalog_id, ur.player_id
  )
  select
    cwi.id as item_catalog_id,
    sp.player_id,
    coalesce(uc.usage_count, 0)::numeric as usage_count,
    round(cwi.initial_quantity - coalesce(uc.usage_count, 0), 2)::numeric as remaining_count
  from catalog_with_initial cwi
  cross join season_players sp
  left join usage_counts uc
    on uc.item_catalog_id = cwi.id
   and uc.player_id = sp.player_id;
end;
$$;

revoke all on function public.get_item_catalog_usage_summary(uuid) from public;
grant execute on function public.get_item_catalog_usage_summary(uuid) to authenticated;

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
      coalesce(sics.initial_quantity, 0)::numeric as initial_quantity,
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
  usage_rows as (
    select
      ii.item_catalog_id,
      ii.player_id,
      case
        when coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
          and coalesce(iu.effect_payload ->> 'mode', '') = 'team'
          and coalesce(iu.effect_payload ->> 'payment_mode', 'solo') = 'split'
          then 1::numeric / nullif(
            count(*) over (
              partition by
                ii.season_id,
                iu.match_id,
                ii.item_catalog_id,
                coalesce(iu.effect_payload ->> 'target_team', ''),
                coalesce(iu.effect_payload ->> 'source_team', ''),
                coalesce(iu.effect_payload ->> 'payment_mode', 'solo')
            ),
            0
          )::numeric
        else 1::numeric
      end as usage_weight
    from private.item_instances ii
    join private.item_usages iu
      on iu.item_instance_id = ii.id
     and iu.status not in ('cancelled', 'rejected')
    where ii.season_id = p_season_id
  ),
  usage_counts as (
    select
      ur.item_catalog_id,
      ur.player_id,
      round(sum(ur.usage_weight), 2) as usage_count
    from usage_rows ur
    group by ur.item_catalog_id, ur.player_id
  ),
  effective_rows as (
    select
      p_season_id as season_id,
      sp.player_id,
      idf.item_catalog_id,
      idf.item_name,
      round(greatest(coalesce(uc.usage_count, 0) - idf.initial_quantity, 0), 2) as purchase_quantity,
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
    round(er.purchase_quantity * er.donation_amount, 2)::numeric(10, 2),
    'misc',
    format(
      '道具购买 · %s × %s%s',
      er.item_name,
      trim(trailing '.' from trim(trailing '0' from er.purchase_quantity::text)),
      case
        when abs(er.purchase_quantity - round(er.purchase_quantity)) > 0.0001 then '（5人平分）'
        else ''
      end
    ),
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
          coalesce(sics.initial_quantity, 0)::numeric as initial_quantity,
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
      usage_rows as (
        select
          ii.item_catalog_id,
          ii.player_id,
          case
            when coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
              and coalesce(iu.effect_payload ->> 'mode', '') = 'team'
              and coalesce(iu.effect_payload ->> 'payment_mode', 'solo') = 'split'
              then 1::numeric / nullif(
                count(*) over (
                  partition by
                    ii.season_id,
                    iu.match_id,
                    ii.item_catalog_id,
                    coalesce(iu.effect_payload ->> 'target_team', ''),
                    coalesce(iu.effect_payload ->> 'source_team', ''),
                    coalesce(iu.effect_payload ->> 'payment_mode', 'solo')
                ),
                0
              )::numeric
            else 1::numeric
          end as usage_weight
        from private.item_instances ii
        join private.item_usages iu
          on iu.item_instance_id = ii.id
         and iu.status not in ('cancelled', 'rejected')
        where ii.season_id = p_season_id
      ),
      usage_counts as (
        select
          ur.item_catalog_id,
          ur.player_id,
          round(sum(ur.usage_weight), 2) as usage_count
        from usage_rows ur
        group by ur.item_catalog_id, ur.player_id
      ),
      effective_rows as (
        select
          format('item_purchase:%s:%s:%s', p_season_id, sp.player_id, idf.item_catalog_id) as source_key,
          round(greatest(coalesce(uc.usage_count, 0) - idf.initial_quantity, 0), 2) as purchase_quantity,
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

commit;
