create or replace function public.set_season_rank_profile(
  p_season_id uuid,
  p_rank_no integer,
  p_label text default null,
  p_power_value integer default null
)
returns public.seasons
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rank_count integer;
  v_rank_labels jsonb := '{}'::jsonb;
  v_rank_power_values jsonb := '{}'::jsonb;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_season public.seasons;
begin
  if not public.can_adjust_scores(p_season_id) then
    raise exception 'You do not have permission to manage season ranks for season %.', p_season_id
      using errcode = '42501';
  end if;

  select greatest(
           1,
           least(12, coalesce(nullif(s.rule_config ->> 'rank_count', '')::integer, 2))
         ),
         case
           when jsonb_typeof(s.rule_config -> 'rank_labels') = 'object' then s.rule_config -> 'rank_labels'
           else '{}'::jsonb
         end,
         case
           when jsonb_typeof(s.rule_config -> 'rank_power_values') = 'object' then s.rule_config -> 'rank_power_values'
           else '{}'::jsonb
         end
  into v_rank_count, v_rank_labels, v_rank_power_values
  from public.seasons s
  where s.id = p_season_id
  for update;

  if v_rank_count is null then
    raise exception 'Season % not found.', p_season_id
      using errcode = 'P0002';
  end if;

  if p_rank_no < 1 or p_rank_no > v_rank_count then
    raise exception 'rank_no must be between 1 and % for season %.', v_rank_count, p_season_id
      using errcode = '22023';
  end if;

  if p_power_value is not null and p_power_value < 0 then
    raise exception 'power_value must be a non-negative integer.'
      using errcode = '22023';
  end if;

  if v_label is null then
    v_rank_labels := v_rank_labels - p_rank_no::text;
  else
    v_rank_labels := jsonb_set(v_rank_labels, array[p_rank_no::text], to_jsonb(v_label), true);
  end if;

  if p_power_value is null then
    v_rank_power_values := v_rank_power_values - p_rank_no::text;
  else
    v_rank_power_values := jsonb_set(v_rank_power_values, array[p_rank_no::text], to_jsonb(p_power_value), true);
  end if;

  update public.seasons
  set rule_config = jsonb_set(
        jsonb_set(
          coalesce(rule_config, '{}'::jsonb),
          '{rank_labels}',
          v_rank_labels,
          true
        ),
        '{rank_power_values}',
        v_rank_power_values,
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_season_id
  returning * into v_season;

  return v_season;
end;
$$;

comment on function public.set_season_rank_profile(uuid, integer, text, integer) is 'Sets or clears the display label and non-negative integer power value for a season rank bucket.';

revoke all on function public.set_season_rank_profile(uuid, integer, text, integer) from public;
grant execute on function public.set_season_rank_profile(uuid, integer, text, integer) to authenticated;
