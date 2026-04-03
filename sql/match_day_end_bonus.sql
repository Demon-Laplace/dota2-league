create or replace function public.should_apply_match_day_absence_adjustment(
  p_match_date date,
  p_closed_at timestamptz default null,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date;
  v_local_time time;
begin
  if p_match_date is null then
    return false;
  end if;

  if p_closed_at is not null then
    return true;
  end if;

  v_business_date := public.get_beijing_match_date(p_now);
  v_local_time := (p_now at time zone 'Asia/Shanghai')::time;

  if p_match_date < v_business_date then
    return true;
  end if;

  if p_match_date > v_business_date then
    return false;
  end if;

  return v_local_time >= time '23:30'
    or v_local_time < time '02:00';
end;
$$;

create or replace function public.recalculate_all_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day record;
  v_match record;
  v_player record;
  v_koi_player_id uuid;
  v_day_lowest_score numeric(10,2);
  v_day_second_lowest_score numeric(10,2);
  v_base_delta numeric(10,2);
  v_final_delta numeric(10,2);
  v_is_winner boolean;
  v_has_winner boolean;
  v_has_team_double boolean;
  v_has_single_double boolean;
begin
  update public.players
  set
    score = 10.00,
    reward_double_bonus = 0,
    reward_points = (20 + coalesce(reward_floor_bonus, 0)) + coalesce(reward_extra_points, 0),
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  update public.season_player_stats
  set
    score = 10.00,
    reward_double_bonus = 0,
    reward_points = (20 + coalesce(reward_floor_bonus, 0)) + coalesce(reward_extra_points, 0),
    games_played = 0,
    wins = 0,
    losses = 0
  where true;

  insert into public.season_player_stats (
    season_id, player_id, score, reward_points, reward_floor_bonus, reward_double_bonus, reward_extra_points, games_played, wins, losses
  )
  select distinct
    src.season_id,
    src.player_id,
    10.00,
    (20 + coalesce(p.reward_floor_bonus, 0) + coalesce(p.reward_double_bonus, 0)) + coalesce(p.reward_extra_points, 0),
    coalesce(p.reward_floor_bonus, 0),
    coalesce(p.reward_double_bonus, 0),
    coalesce(p.reward_extra_points, 0),
    0, 0, 0
  from (
    select sp.season_id, sp.player_id
    from public.season_players sp
    where sp.season_id is not null

    union

    select m.season_id, mr.player_id
    from public.match_results mr
    join public.matches m on m.id = mr.match_id
    where m.season_id is not null

    union

    select mdd.season_id, mdd.user_player_id
    from public.match_double_downs mdd
    where mdd.season_id is not null
  ) src
  join public.players p on p.id = src.player_id
  on conflict (season_id, player_id) do nothing;

  update public.match_results
  set
    score_change = 0,
    reward_change = 0,
    is_winner = null
  where true;

  for v_day in
    select
      day_rows.season_id,
      day_rows.match_date,
      max(day_rows.created_at) as last_created_at,
      max(md.closed_at) as closed_at,
      count(*) as match_count
    from (
      select
        m.id,
        m.season_id,
        coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) as match_date,
        m.created_at
      from public.matches m
    ) day_rows
    left join public.match_days md
      on md.season_id is not distinct from day_rows.season_id
     and md.match_date = day_rows.match_date
    group by day_rows.season_id, day_rows.match_date
    order by day_rows.match_date, min(day_rows.created_at), day_rows.season_id
  loop
    for v_match in
      select
        m.id,
        m.season_id,
        m.winner_team,
        coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) as match_date,
        m.created_at
      from public.matches m
      where m.season_id is not distinct from v_day.season_id
        and coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) = v_day.match_date
      order by m.created_at, m.id
    loop
      v_has_winner := v_match.winner_team in ('A', 'B');

      select koi_player_id
      into v_koi_player_id
      from public.seasons
      where id = v_match.season_id;

      select min(score)
      into v_day_lowest_score
      from public.players;

      select min(score)
      into v_day_second_lowest_score
      from public.players
      where score > v_day_lowest_score;

      v_day_second_lowest_score := coalesce(v_day_second_lowest_score, v_day_lowest_score);

      for v_player in
        select
          mr.player_id,
          mr.team,
          p.score as current_score
        from public.match_results mr
        join public.players p on p.id = mr.player_id
        where mr.match_id = v_match.id
        order by mr.team, mr.player_id
      loop
        v_is_winner := case
          when not v_has_winner then null
          else v_player.team = v_match.winner_team
        end;

        if not v_has_winner then
          v_base_delta := 0.00;
        elsif v_is_winner then
          v_base_delta := case
            when v_koi_player_id is not null
              and exists (
                select 1
                from public.match_results mr_koi
                where mr_koi.match_id = v_match.id
                  and mr_koi.player_id = v_koi_player_id
                  and mr_koi.team = v_player.team
              )
            then 1.25
            else 1.00
          end;
        else
          v_base_delta := -1.00;
        end if;

        select exists (
          select 1
          from public.match_double_downs mdd
          where mdd.match_id = v_match.id
            and mdd.mode = 'team'
            and mdd.target_team = v_player.team
        )
        into v_has_team_double;

        select exists (
          select 1
          from public.match_double_downs mdd
          where mdd.match_id = v_match.id
            and mdd.mode = 'single'
            and mdd.target_player_id = v_player.player_id
        )
        into v_has_single_double;

        v_final_delta := v_base_delta;

        if v_has_winner and (v_has_team_double or v_has_single_double) then
          if v_base_delta > 0 then
            v_final_delta := v_base_delta * 2;
          elsif v_base_delta < 0 then
            if v_player.current_score <= v_day_second_lowest_score then
              v_final_delta := -1.00;
            else
              v_final_delta := -2.00;
            end if;
          end if;
        end if;

        update public.match_results
        set
          is_winner = v_is_winner,
          score_change = v_final_delta,
          reward_change = 0
        where match_id = v_match.id
          and player_id = v_player.player_id;

        if v_has_winner then
          update public.players
          set
            score = score + v_final_delta,
            games_played = games_played + 1,
            wins = wins + case when v_is_winner then 1 else 0 end,
            losses = losses + case when v_is_winner then 0 else 1 end
          where id = v_player.player_id;

          if v_match.season_id is not null then
            update public.season_player_stats
            set
              score = score + v_final_delta,
              games_played = games_played + 1,
              wins = wins + case when v_is_winner then 1 else 0 end,
              losses = losses + case when v_is_winner then 0 else 1 end
            where season_id = v_match.season_id
              and player_id = v_player.player_id;
          end if;
        end if;
      end loop;
    end loop;

	    if v_day.match_count > 0
	      and v_day.season_id is not null
	      and public.should_apply_match_day_absence_adjustment(v_day.match_date, v_day.closed_at)
	    then
	      with day_participants as (
        select distinct mr.player_id
        from public.match_results mr
        join public.matches m on m.id = mr.match_id
        where m.season_id = v_day.season_id
          and coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) = v_day.match_date
      ),
	      season_pool as (
	        select
	          sp.player_id,
	          sps.score,
	          coalesce(sps.games_played, 0) as games_played
	        from public.season_players sp
        join public.season_player_stats sps
          on sps.season_id = sp.season_id
         and sps.player_id = sp.player_id
	        where sp.season_id = v_day.season_id
	      ),
	      score_bounds as (
	        select
	          max(score) as max_score,
	          min(score) as min_score
	        from season_pool
	      ),
	      priority_bounds as (
	        select
	          (
	            select max(sp.games_played)
	            from season_pool sp
	            cross join score_bounds sb
	            where sp.score = sb.max_score
	          ) as max_score_games_played,
	          (
	            select max(sp.games_played)
	            from season_pool sp
	            cross join score_bounds sb
	            where sp.score = sb.min_score
	          ) as min_score_games_played
	      ),
	      adjustments as (
	        select
	          sp.player_id,
	          (
	            case
	              when sp.score = sb.min_score
	                and sp.games_played = pb.min_score_games_played
	                and not exists (
	                  select 1
	                  from day_participants dp
	                  where dp.player_id = sp.player_id
	                )
	              then 1
	              else 0
	            end
	            + case
	              when sp.score = sb.max_score
	                and sp.games_played = pb.max_score_games_played
	                and not exists (
	                  select 1
	                  from day_participants dp
	                  where dp.player_id = sp.player_id
	                )
	              then -1
	              else 0
	            end
	          )::numeric(10,2) as delta
	        from season_pool sp
	        cross join score_bounds sb
	        cross join priority_bounds pb
	        where (
	          sp.score = sb.min_score
	          and sp.games_played = pb.min_score_games_played
	        ) or (
	          sp.score = sb.max_score
	          and sp.games_played = pb.max_score_games_played
	        )
	      )
	      update public.season_player_stats sps
      set score = sps.score + adj.delta
      from adjustments adj
      where sps.season_id = v_day.season_id
        and sps.player_id = adj.player_id
        and adj.delta <> 0;

      with day_participants as (
        select distinct mr.player_id
        from public.match_results mr
        join public.matches m on m.id = mr.match_id
        where m.season_id = v_day.season_id
          and coalesce(m.match_date, public.get_beijing_match_date(m.created_at)) = v_day.match_date
      ),
	      season_pool as (
	        select
	          sp.player_id,
	          sps.score,
	          coalesce(sps.games_played, 0) as games_played
	        from public.season_players sp
        join public.season_player_stats sps
          on sps.season_id = sp.season_id
         and sps.player_id = sp.player_id
	        where sp.season_id = v_day.season_id
	      ),
	      score_bounds as (
	        select
	          max(score) as max_score,
	          min(score) as min_score
	        from season_pool
	      ),
	      priority_bounds as (
	        select
	          (
	            select max(sp.games_played)
	            from season_pool sp
	            cross join score_bounds sb
	            where sp.score = sb.max_score
	          ) as max_score_games_played,
	          (
	            select max(sp.games_played)
	            from season_pool sp
	            cross join score_bounds sb
	            where sp.score = sb.min_score
	          ) as min_score_games_played
	      ),
	      adjustments as (
	        select
	          sp.player_id,
	          (
	            case
	              when sp.score = sb.min_score
	                and sp.games_played = pb.min_score_games_played
	                and not exists (
	                  select 1
	                  from day_participants dp
	                  where dp.player_id = sp.player_id
	                )
	              then 1
	              else 0
	            end
	            + case
	              when sp.score = sb.max_score
	                and sp.games_played = pb.max_score_games_played
	                and not exists (
	                  select 1
	                  from day_participants dp
	                  where dp.player_id = sp.player_id
	                )
	              then -1
	              else 0
	            end
	          )::numeric(10,2) as delta
	        from season_pool sp
	        cross join score_bounds sb
	        cross join priority_bounds pb
	        where (
	          sp.score = sb.min_score
	          and sp.games_played = pb.min_score_games_played
	        ) or (
	          sp.score = sb.max_score
	          and sp.games_played = pb.max_score_games_played
	        )
	      )
	      update public.players p
      set score = p.score + adj.delta
      from adjustments adj
      where p.id = adj.player_id
        and adj.delta <> 0;
    end if;
  end loop;

  with season_usage as (
    select
      mdd.season_id,
      mdd.user_player_id as player_id,
      greatest(count(*) filter (where mdd.mode = 'single') - 2, 0) * 5
        + count(*) filter (where mdd.mode = 'team') * 10 as reward_double_bonus
    from public.match_double_downs mdd
    where mdd.season_id is not null
    group by mdd.season_id, mdd.user_player_id
  )
  update public.season_player_stats sps
  set
    reward_double_bonus = su.reward_double_bonus,
    reward_points = (20 + coalesce(sps.reward_floor_bonus, 0) + su.reward_double_bonus) + coalesce(sps.reward_extra_points, 0)
  from season_usage su
  where sps.season_id = su.season_id
    and sps.player_id = su.player_id;

  with player_usage as (
    select
      mdd.user_player_id as player_id,
      greatest(count(*) filter (where mdd.mode = 'single') - 2, 0) * 5
        + count(*) filter (where mdd.mode = 'team') * 10 as reward_double_bonus
    from public.match_double_downs mdd
    group by mdd.user_player_id
  )
  update public.players p
  set
    reward_double_bonus = pu.reward_double_bonus,
    reward_points = (20 + coalesce(p.reward_floor_bonus, 0) + pu.reward_double_bonus) + coalesce(p.reward_extra_points, 0)
  from player_usage pu
  where p.id = pu.player_id;

  update public.players
  set reward_points = (20 + coalesce(reward_floor_bonus, 0) + coalesce(reward_double_bonus, 0)) + coalesce(reward_extra_points, 0)
  where true;

  update public.season_player_stats
  set reward_points = (20 + coalesce(reward_floor_bonus, 0) + coalesce(reward_double_bonus, 0)) + coalesce(reward_extra_points, 0)
  where true;
end;
$$;

create or replace function public.close_active_match_day_and_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_days
  set
    is_active = false,
    closed_at = coalesce(closed_at, now())
  where is_active = true;

  delete from public.signup_queue
  where true;

  delete from public.daily_player_roster
  where true;

  perform public.recalculate_all_scores();
end;
$$;

create or replace function public.finalize_active_match_day(
  p_season_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_match_date date;
  v_has_target boolean := false;
  v_match_count integer := 0;
begin
  v_season_id := p_season_id;

  if v_season_id is null then
    select id
    into v_season_id
    from public.seasons
    where is_active = true
    limit 1;
  end if;

  if v_season_id is null then
    raise exception '未找到当前赛季';
  end if;

  v_match_date := public.get_beijing_match_date(now());

  select count(*)
  into v_match_count
  from public.matches
  where season_id = v_season_id
    and coalesce(match_date, public.get_beijing_match_date(created_at)) = v_match_date;

  if coalesce(v_match_count, 0) <= 0 then
    return false;
  end if;

  select exists (
    select 1
    from public.match_days
    where season_id = v_season_id
      and (is_active = true or match_date = v_match_date)
  ) or exists (
    select 1
    from public.matches
    where season_id = v_season_id
      and coalesce(match_date, public.get_beijing_match_date(created_at)) = v_match_date
  )
  into v_has_target;

  if not v_has_target then
    return false;
  end if;

  update public.match_days
  set
    is_active = false,
    closed_at = coalesce(closed_at, now())
  where season_id = v_season_id
    and (is_active = true or match_date = v_match_date);

  delete from public.signup_queue
  where season_id = v_season_id;

  delete from public.daily_player_roster
  where season_id = v_season_id;

  perform public.recalculate_all_scores();

  return true;
end;
$$;

grant execute on function public.should_apply_match_day_absence_adjustment(date, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.recalculate_all_scores() to anon, authenticated;
grant execute on function public.finalize_active_match_day(uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'recalculate-scores-beijing-2330'
  ) then
    perform cron.schedule(
      'recalculate-scores-beijing-2330',
      '30 15 * * *',
      'select public.recalculate_all_scores();'
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;
