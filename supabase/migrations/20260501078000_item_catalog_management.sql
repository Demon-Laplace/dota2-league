begin;

delete from private.item_instances ii
using public.item_catalog ic
where ii.item_catalog_id = ic.id
  and ic.code in ('MAY_HEALING_HAND', 'MAY_DEATH_FINGER');

delete from public.item_catalog
where code in ('MAY_HEALING_HAND', 'MAY_DEATH_FINGER');

comment on column public.item_catalog.config is 'Extensible item definition. Current front-end stores donation_amount and score_multiplier here for later rule expansion.';

drop policy if exists item_catalog_insert_scorekeeper on public.item_catalog;
create policy item_catalog_insert_scorekeeper
  on public.item_catalog
  for insert
  to authenticated
  with check (public.is_scorekeeper());

drop policy if exists item_catalog_update_scorekeeper on public.item_catalog;
create policy item_catalog_update_scorekeeper
  on public.item_catalog
  for update
  to authenticated
  using (public.is_scorekeeper())
  with check (public.is_scorekeeper());

drop policy if exists item_catalog_delete_scorekeeper on public.item_catalog;
create policy item_catalog_delete_scorekeeper
  on public.item_catalog
  for delete
  to authenticated
  using (public.is_scorekeeper());

grant insert, update, delete on public.item_catalog to authenticated;

commit;
