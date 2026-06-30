begin;

create sequence if not exists private.item_catalog_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no maxvalue
  cache 1;

with ordered_items as (
  select
    ic.id,
    format('item%s', row_number() over (order by ic.created_at asc, ic.id asc)) as next_code
  from public.item_catalog ic
)
update public.item_catalog ic
set code = oi.next_code
from ordered_items oi
where ic.id = oi.id
  and ic.code is distinct from oi.next_code;

do $$
declare
  v_item_count bigint := 0;
begin
  select count(*)
  into v_item_count
  from public.item_catalog;

  if v_item_count > 0 then
    perform setval('private.item_catalog_code_seq', v_item_count, true);
  else
    perform setval('private.item_catalog_code_seq', 1, false);
  end if;
end;
$$;

create or replace function private.tg_item_catalog_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(btrim(new.code), '') = '' then
    new.code := format('item%s', nextval('private.item_catalog_code_seq'));
  end if;
  return new;
end;
$$;

drop trigger if exists item_catalog_assign_code on public.item_catalog;
create trigger item_catalog_assign_code
  before insert on public.item_catalog
  for each row execute function private.tg_item_catalog_assign_code();

comment on function private.tg_item_catalog_assign_code()
  is 'Assigns stable sequential internal item codes (item1, item2, ...) when item_catalog rows are created without an explicit code.';

commit;
