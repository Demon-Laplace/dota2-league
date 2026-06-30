begin;

alter table private.item_usages
  add column if not exists effect_points_delta numeric(10, 2) not null default 0;

comment on column private.item_usages.effect_points_delta
  is 'Stored effect delta for compatibility with match item usage workflows.';

commit;
