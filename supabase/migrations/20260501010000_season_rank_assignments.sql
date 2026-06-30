begin;

alter table public.season_memberships
  add column if not exists rank_no smallint
    check (rank_no is null or rank_no >= 1);

comment on column public.season_memberships.rank_no is 'Season-scoped rank bucket assignment for this member.';

create index if not exists season_memberships_season_rank_idx
  on public.season_memberships (season_id, rank_no);

update public.seasons
set rule_config = jsonb_set(
  rule_config,
  '{rank_count}',
  to_jsonb(
    greatest(
      1,
      least(
        12,
        coalesce(nullif(rule_config ->> 'rank_count', '')::integer, 3)
      )
    )
  ),
  true
)
where coalesce(rule_config ->> 'rank_count', '') = ''
   or (rule_config ->> 'rank_count') !~ '^\d+$'
   or ((rule_config ->> 'rank_count')::integer) < 1
   or ((rule_config ->> 'rank_count')::integer) > 12;

create or replace function public.set_season_rank_count(
  p_season_id uuid,
  p_rank_count integer
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_rank_count integer := greatest(1, least(coalesce(p_rank_count, 0), 12));
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  if coalesce(p_rank_count, 0) < 1 or coalesce(p_rank_count, 0) > 12 then
    raise exception 'rank_count must be between 1 and 12.'
      using errcode = '22023';
  end if;

  update public.seasons
  set rule_config = jsonb_set(
        coalesce(rule_config, '{}'::jsonb),
        '{rank_count}',
        to_jsonb(v_rank_count),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  if not found then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  update public.season_memberships
  set rank_no = null,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and rank_no is not null
    and rank_no > v_rank_count;

  return v_season;
end;
$$;

comment on function public.set_season_rank_count(uuid, integer) is 'Adjusts the allowed rank bucket count for a season. Only season admins / score keepers may call it.';

create or replace function public.set_season_player_rank(
  p_season_id uuid,
  p_player_id uuid,
  p_rank_no integer default null
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_rank_count integer;
  v_membership public.season_memberships;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  select greatest(
           1,
           least(12, coalesce(nullif(s.rule_config ->> 'rank_count', '')::integer, 3))
         )
  into v_rank_count
  from public.seasons s
  where s.id = p_season_id;

  if v_rank_count is null then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if p_rank_no is not null and (p_rank_no < 1 or p_rank_no > v_rank_count) then
    raise exception 'rank_no must be between 1 and % for season %.', v_rank_count, p_season_id
      using errcode = '22023';
  end if;

  update public.season_memberships
  set rank_no = p_rank_no,
      join_status = case
        when p_rank_no is null then 'inactive'
        when season_memberships.join_status = 'captain' then 'captain'
        else 'active'
      end,
      updated_at = timezone('utc', now())
  where season_id = p_season_id
    and player_id = p_player_id
    and join_status in ('inactive', 'active', 'captain')
  returning * into v_membership;

  if not found then
    raise exception 'Editable season membership for season % and player % not found.', p_season_id, p_player_id
      using errcode = 'P0002';
  end if;

  return v_membership;
end;
$$;

comment on function public.set_season_player_rank(uuid, uuid, integer) is 'Assigns or clears a player rank bucket within a season. Only season admins / score keepers may call it.';

create or replace view public.v_season_rank_assignments
with (security_invoker = true)
as
select
  sm.season_id,
  s.code as season_code,
  s.name as season_name,
  greatest(
    1,
    least(12, coalesce(nullif(s.rule_config ->> 'rank_count', '')::integer, 3))
  ) as rank_count,
  sm.player_id,
  p.display_name,
  sm.join_status,
  sm.rank_no,
  sm.joined_at,
  sm.updated_at
from public.season_memberships sm
join public.seasons s
  on s.id = sm.season_id
join public.players p
  on p.id = sm.player_id
where sm.join_status in ('inactive', 'active', 'captain');

comment on view public.v_season_rank_assignments is 'Public season player assignments. inactive rows represent the master-roster players who are not participating in the season.';

grant select on public.v_season_rank_assignments to anon, authenticated;

revoke all on function public.set_season_rank_count(uuid, integer) from public;
revoke all on function public.set_season_player_rank(uuid, uuid, integer) from public;

grant execute on function public.set_season_rank_count(uuid, integer) to authenticated;
grant execute on function public.set_season_player_rank(uuid, uuid, integer) to authenticated;

commit;
