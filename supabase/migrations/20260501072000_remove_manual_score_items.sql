begin;

delete from private.item_instances ii
using public.item_catalog ic
where ii.item_catalog_id = ic.id
  and ic.code in ('MAY_HEALING_HAND', 'MAY_DEATH_FINGER');

delete from public.item_catalog
where code in ('MAY_HEALING_HAND', 'MAY_DEATH_FINGER');

commit;
