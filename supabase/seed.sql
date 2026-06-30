insert into public.seasons (
  code,
  name,
  status,
  is_public,
  start_at,
  end_at,
  rule_version,
  rule_config
)
select
  to_char(timezone('Asia/Shanghai', now()), 'YYYY-MM'),
  format(
    '%s 年 %s 月赛季',
    to_char(timezone('Asia/Shanghai', now()), 'YYYY'),
    to_char(timezone('Asia/Shanghai', now()), 'FMMM')
  ),
  'active',
  true,
  date_trunc('month', timezone('Asia/Shanghai', now()))::timestamptz,
  (date_trunc('month', timezone('Asia/Shanghai', now())) + interval '1 month' - interval '1 second')::timestamptz,
  to_char(timezone('Asia/Shanghai', now()), 'YYYY.MM'),
  jsonb_build_object(
    'win_points', 3,
    'loss_points', 0,
    'participation_points', 0
  )
on conflict (code) do update
set
  name = excluded.name,
  rule_version = excluded.rule_version,
  rule_config = excluded.rule_config,
  start_at = excluded.start_at,
  end_at = excluded.end_at;
