begin;

update public.seasons
set rule_config = coalesce(rule_config, '{}'::jsonb) - 'koi_player_id',
    updated_at = timezone('utc', now())
where coalesce(rule_config, '{}'::jsonb) ? 'koi_player_id';

comment on table public.seasons is 'Season definitions. rule_config stores season-scoped settings such as rank_count and no longer stores koi_player_id.';

commit;
