begin;

alter table public.reward_donations
  drop constraint if exists reward_donations_category_check;

alter table public.reward_donations
  add constraint reward_donations_category_check
  check (category in ('base', 'card', 'extra', 'misc', 'signup_fee'));

comment on column public.reward_donations.category is
  'Support bucket used by the front-end reward summary cards, including signup_fee rows for actual paid season entry fees.';

commit;
