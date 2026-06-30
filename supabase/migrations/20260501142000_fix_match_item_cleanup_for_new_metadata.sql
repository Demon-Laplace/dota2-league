begin;

create or replace function private.cleanup_match_item_catalog_usages(
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_match_id is null then
    return;
  end if;

  delete from private.item_usages iu
  using private.item_instances ii
  where iu.item_instance_id = ii.id
    and iu.match_id = p_match_id
    and coalesce(ii.metadata ->> 'match_id', '') = p_match_id::text;

  delete from private.item_usages iu
  where iu.match_id = p_match_id
    and coalesce(iu.effect_payload ->> 'source_kind', '') = 'match_double_down'
    and not exists (
      select 1
      from private.item_instances ii
      where ii.id = iu.item_instance_id
    );

  delete from private.item_instances ii
  where coalesce(ii.metadata ->> 'match_id', '') = p_match_id::text
    and not exists (
      select 1
      from private.item_usages iu
      where iu.item_instance_id = ii.id
    );
end;
$$;

comment on function private.cleanup_match_item_catalog_usages(uuid)
  is 'Deletes match-created item usage and inventory rows for one match, supporting both legacy and current item metadata formats.';

commit;
