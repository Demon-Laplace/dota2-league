begin;

drop index if exists public.players_linked_profile_idx;

alter table public.players
  drop column if exists linked_profile_id;

comment on table public.profiles is 'Operator identity records backed by Supabase Auth.';

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := private.require_authenticated();
  v_profile public.profiles;
  v_display_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    '未命名用户'
  );
  v_avatar_url text := nullif(auth.jwt() -> 'user_metadata' ->> 'avatar_url', '');
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (v_uid, v_display_name, v_avatar_url)
  on conflict (id) do update
    set display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = timezone('utc', now())
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '未命名用户'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.manual_adjust_score(
  p_season_id uuid,
  p_player_id uuid,
  p_points_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_entry_id uuid;
begin
  if p_points_delta is null or p_points_delta = 0 then
    raise exception 'points_delta must be non-zero.'
      using errcode = '22023';
  end if;

  if coalesce(nullif(trim(p_reason), ''), '') = '' then
    raise exception 'A reason is required for manual score adjustments.'
      using errcode = '22023';
  end if;

  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to adjust scores for this season.'
      using errcode = '42501';
  end if;

  insert into public.score_ledger (
    season_id,
    player_id,
    entry_type,
    points_delta,
    reason,
    source_table,
    created_by,
    metadata
  )
  values (
    p_season_id,
    p_player_id,
    'manual_adjustment',
    p_points_delta,
    p_reason,
    'public.score_ledger',
    v_actor,
    jsonb_build_object('adjusted_by', v_actor)
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

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

drop view if exists public.v_season_rank_assignments;

create view public.v_season_rank_assignments
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

drop view if exists public.v_leaderboard;

create view public.v_leaderboard
with (security_invoker = true)
as
with eligible_members as (
  select
    sm.season_id,
    sm.player_id
  from public.season_memberships sm
  where sm.join_status in ('active', 'captain')
),
match_stats as (
  select
    mp.season_id,
    mp.player_id,
    count(*) filter (where m.status = 'approved') as matches_played,
    count(*) filter (where m.status = 'approved' and mp.result = 'win') as wins,
    count(*) filter (where m.status = 'approved' and mp.result = 'loss') as losses
  from public.match_players mp
  join public.matches m
    on m.id = mp.match_id
  group by mp.season_id, mp.player_id
),
ledger_totals as (
  select
    sl.season_id,
    sl.player_id,
    sum(sl.points_delta) as score_delta_total
  from public.score_ledger sl
  group by sl.season_id, sl.player_id
)
select
  em.season_id,
  em.player_id,
  p.display_name,
  private.season_initial_score(em.season_id)::numeric(10, 2) as initial_score,
  coalesce(ms.matches_played, 0) as matches_played,
  coalesce(ms.wins, 0) as wins,
  coalesce(ms.losses, 0) as losses,
  case
    when coalesce(ms.matches_played, 0) = 0 then 0::numeric(5, 2)
    else round((coalesce(ms.wins, 0)::numeric / ms.matches_played::numeric) * 100, 2)
  end as win_rate,
  (
    private.season_initial_score(em.season_id)
    + coalesce(lt.score_delta_total, 0)
  )::numeric(10, 2) as score_total,
  dense_rank() over (
    partition by em.season_id
    order by (
      private.season_initial_score(em.season_id)
      + coalesce(lt.score_delta_total, 0)
    ) desc,
             coalesce(ms.wins, 0) desc,
             coalesce(ms.matches_played, 0) desc,
             p.display_name asc
  ) as rank
from eligible_members em
join public.players p
  on p.id = em.player_id
left join match_stats ms
  on ms.season_id = em.season_id
 and ms.player_id = em.player_id
left join ledger_totals lt
  on lt.season_id = em.season_id
 and lt.player_id = em.player_id;

comment on view public.v_leaderboard is 'Season leaderboard aggregated from score_ledger and approved matches.';

create or replace view public.v_match_detail
with (security_invoker = true)
as
select
  m.id as match_id,
  m.season_id,
  s.code as season_code,
  s.name as season_name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name as created_by_name,
  submitter.display_name as submitted_by_name,
  approver.display_name as approved_by_name,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', mp.player_id,
        'display_name', p.display_name,
        'side', mp.side,
        'slot_no', mp.slot_no,
        'is_captain', mp.is_captain,
        'result', mp.result
      )
      order by case when mp.side = 'radiant' then 0 else 1 end, mp.slot_no
    ) filter (where mp.id is not null),
    '[]'::jsonb
  ) as players
from public.matches m
join public.seasons s
  on s.id = m.season_id
left join public.profiles creator
  on creator.id = m.created_by
left join public.profiles submitter
  on submitter.id = m.submitted_by
left join public.profiles approver
  on approver.id = m.approved_by
left join public.match_players mp
  on mp.match_id = m.id
left join public.players p
  on p.id = mp.player_id
group by
  m.id,
  m.season_id,
  s.code,
  s.name,
  m.match_no,
  m.match_date,
  m.status,
  m.winner_side,
  m.notes,
  m.metadata,
  m.created_at,
  m.updated_at,
  m.submitted_at,
  m.approved_at,
  creator.display_name,
  submitter.display_name,
  approver.display_name;

comment on view public.v_match_detail is 'Front-end match detail projection with roster JSON.';

commit;
