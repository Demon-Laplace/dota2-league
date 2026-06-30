begin;

create or replace function public.match_history_player_display_name(
  p_match_id uuid,
  p_player_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select nullif(p.display_name, '')
  from public.players p
  where p.id = p_player_id
    and exists (
      select 1
      from public.match_players mp
      join public.matches m
        on m.id = mp.match_id
      join public.seasons s
        on s.id = m.season_id
      where mp.match_id = p_match_id
        and mp.player_id = p_player_id
        and m.status <> 'draft'
        and (
          s.is_public
          or public.can_manage_season(m.season_id)
        )
    );
$$;

comment on function public.match_history_player_display_name(uuid, uuid)
  is 'Returns a player display name for visible match history even when the master-roster player is soft-hidden.';

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
        'display_name', coalesce(p.display_name, public.match_history_player_display_name(m.id, mp.player_id)),
        'side', mp.side,
        'slot_no', mp.slot_no,
        'is_captain', mp.is_captain,
        'result', mp.result,
        'rank_no_snapshot', mp.rank_no_snapshot,
        'power_value_snapshot', mp.power_value_snapshot
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

comment on view public.v_match_detail
  is 'Front-end match detail projection with roster JSON. Soft-hidden players remain named in visible match history.';

revoke all on function public.match_history_player_display_name(uuid, uuid) from public;
grant execute on function public.match_history_player_display_name(uuid, uuid) to anon, authenticated;

grant select on public.v_match_detail to anon, authenticated;

commit;
