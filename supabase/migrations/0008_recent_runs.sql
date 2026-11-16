-- 0008: the leaderboard also returns the latest finished runs, so /leaderboard can give every
-- finisher a moment on screen (not only the ones who make the top 10). Safe to run more than once.

create or replace function prism_leaderboard(p_limit int default 10, p_device_id text default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  top jsonb;
  recent jsonb;
  me jsonb := null;
  pid uuid;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rn, 'nickname', nickname, 'score', score, 'key', key, 'dish', dish, 'served', served
  ) order by rn), '[]'::jsonb)
  into top
  from (
    select row_number() over (order by score desc, created_at asc) as rn, nickname, score,
           left(player_id::text, 8) as key, dish, served
    from leaderboard order by score desc, created_at asc
    limit least(greatest(p_limit, 1), 100)
  ) t;

  -- The last few valid runs (newest first), each with the player's current board rank and score.
  -- `best`: this run is the player's best. `first`: it is the player's first valid run.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'key', key, 'nickname', nickname, 'run_score', run_score, 'score', score,
    'rank', rank, 'best', best, 'first', is_first, 'dish', dish
  ) order by created_at desc), '[]'::jsonb)
  into recent
  from (
    select left(r.id::text, 8) as id, left(r.player_id::text, 8) as key, l.nickname, r.score as run_score,
           l.score, l.rn as rank, l.run_id = r.id as best, r.dish, r.created_at,
           not exists (select 1 from runs o where o.player_id = r.player_id and o.status = 'valid' and o.created_at < r.created_at) as is_first
    from runs r
    join (
      select player_id, run_id, nickname, score, row_number() over (order by score desc, created_at asc) as rn
      from leaderboard
    ) l on l.player_id = r.player_id
    where r.status = 'valid' and r.created_at > now() - interval '10 minutes'
    order by r.created_at desc
    limit 8
  ) t;

  if p_device_id is not null then
    select id into pid from players where device_id = p_device_id;
    if found then
      me := prism_rank(pid);
      if me->>'rank' is null then me := null; end if;
    end if;
  end if;
  return jsonb_build_object(
    'top', top,
    'recent', recent,
    'total_players', (select count(*) from leaderboard),
    'total_plays', (select count(*) from runs where status = 'valid'),
    'me', me,
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true'
  );
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'prism\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;
