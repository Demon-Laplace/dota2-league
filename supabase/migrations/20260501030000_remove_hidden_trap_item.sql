begin;

delete from private.item_usages iu
using private.item_instances ii, public.item_catalog ic
where iu.item_instance_id = ii.id
  and ii.item_catalog_id = ic.id
  and ic.code = 'MAY_HIDDEN_TRAP';

delete from private.item_instances ii
using public.item_catalog ic
where ii.item_catalog_id = ic.id
  and ic.code = 'MAY_HIDDEN_TRAP';

delete from public.item_catalog
where code = 'MAY_HIDDEN_TRAP';

commit;
