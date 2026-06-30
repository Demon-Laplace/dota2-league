begin;

do $$
declare
  v_function_def text;
  v_original_pair text;
  v_replaced_pair text;
begin
  select pg_get_functiondef('private.apply_match_double_downs(uuid, jsonb, uuid)'::regprocedure)
  into v_function_def;

  if v_function_def is null then
    raise exception 'Function private.apply_match_double_downs(uuid, jsonb, uuid) not found.';
  end if;

  v_original_pair := $pair$
      where tie_a.target_player_id = v_target_player.target_player_id
        and not tie_a.is_consumed
        and tie_a.item_catalog_id is not null
        and tie_b.item_catalog_id is not null
      order by
$pair$;

  v_replaced_pair := $pair$
      where tie_a.target_player_id = v_target_player.target_player_id
        and not tie_a.is_consumed
        and tie_a.item_catalog_id is not null
        and tie_b.item_catalog_id is not null
        and not (
          coalesce(stacks.score_delta_special, '') = '@'
          and tie_a.base_points_delta <= 0
        )
      order by
$pair$;

  if position(v_replaced_pair in v_function_def) = 0 then
    if position(v_original_pair in v_function_def) = 0 then
      raise exception 'Failed to patch private.apply_match_double_downs; expected stack-pair selection block was not found.';
    end if;
    v_function_def := replace(v_function_def, v_original_pair, v_replaced_pair);
    execute v_function_def;
  end if;
end;
$$;

delete from private.item_usages iu
where coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
  and iu.match_id is not null
  and not exists (
    select 1
    from public.matches m
    where m.id = iu.match_id
  );

delete from private.item_instances ii
where coalesce(ii.metadata ->> 'source_kind', '') = 'match_double_down'
  and coalesce(ii.metadata ->> 'match_id', '') <> ''
  and not exists (
    select 1
    from public.matches m
    where m.id::text = ii.metadata ->> 'match_id'
  );

delete from public.reward_donations rd
where rd.match_id is not null
  and not exists (
    select 1
    from public.matches m
    where m.id = rd.match_id
  );

create or replace function public.delete_match_and_recalculate(
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor uuid := private.require_authenticated();
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found.', p_match_id
      using errcode = 'P0002';
  end if;

  if not public.can_adjust_scores(v_match.season_id) then
    raise exception 'You do not have permission to delete this match.'
      using errcode = '42501';
  end if;

  perform private.cleanup_match_item_catalog_usages(p_match_id);

  delete from public.reward_donations
  where match_id = p_match_id;

  delete from public.score_ledger
  where match_id = p_match_id;

  delete from public.matches
  where id = p_match_id;

  perform private.recalculate_season_scores(v_match.season_id, v_actor);
end;
$$;

comment on function public.delete_match_and_recalculate(uuid)
  is 'Deletes a recorded match, rolls back match-linked item usage and reward rows, then recalculates season scores.';

commit;
