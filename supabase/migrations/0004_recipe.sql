-- Ah Ma's Recipe: remember which dish each run cooked, and show "served" (all 8 steps
-- recovered) on the leaderboard. "Served" is derived from runs.correct, which the score cap
-- already checks, so the client has no extra field to lie about. Safe to run more than once.

alter table runs add column if not exists dish text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'runs_dish_check') then
    alter table runs add constraint runs_dish_check check (dish is null or dish in ('chicken-rice', 'char-kway-teow', 'laksa'));
  end if;
end $$;

-- Leaderboard view: same columns as before, plus dish and served at the end
-- (create or replace view may only append columns).
create or replace view leaderboard with (security_invoker = true) as
with cfg as (
  select
    coalesce((select value from config where key = 'vote_bonus_enabled'), 'false') = 'true' as enabled,
    least(greatest(coalesce((select value::numeric from config where key = 'vote_bonus_multiplier'), 1.1), 1.0), 1.2) as mult
),
best as (
  select distinct on (r.player_id) r.player_id, r.id as run_id, r.score, r.created_at, r.dish, r.correct
  from runs r
  where r.status = 'valid'
  order by r.player_id, r.score desc, r.created_at asc
)
select
  p.id as player_id,
  p.nickname,
  b.run_id,
  b.score as raw_score,
  case when cfg.enabled and p.voted then floor(b.score * cfg.mult)::int else b.score end as score,
  b.created_at,
  b.dish,
  b.correct >= 8 as served
from best b
join players p on p.id = b.player_id
cross join cfg;

-- New parameter => drop the old signature first, or Postgres keeps both as overloads.
drop function if exists prism_submit_run(uuid, text, text, int, int, int, int, int, int);

create or replace function prism_submit_run(
  p_run_id uuid, p_device_id text, p_nickname text,
  p_score int, p_correct int, p_wrong int, p_gates int, p_duration_ms int,
  p_cooldown_s int default 10, p_dish text default null
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pl players%rowtype;
  existing runs%rowtype;
  best int;
  is_new boolean := false;
begin
  -- Upsert locks the player row, so two submissions from one device run one after the other.
  insert into players (device_id, nickname) values (p_device_id, p_nickname)
  on conflict (device_id) do update set nickname = excluded.nickname
  returning * into pl;

  -- A retry of a run we already have returns the stored result (idempotent).
  select * into existing from runs where id = p_run_id;
  if found then
    if existing.player_id <> pl.id then return jsonb_build_object('error', 'run_id_taken'); end if;
  else
    if prism_cfg('submissions_open', 'true') <> 'true' then
      return jsonb_build_object('error', 'closed');
    end if;
    if exists (select 1 from runs where player_id = pl.id and created_at > now() - make_interval(secs => p_cooldown_s)) then
      return jsonb_build_object('error', 'cooldown');
    end if;
    insert into runs (id, player_id, score, correct, wrong, gates, duration_ms, vote_bonus, dish)
    values (p_run_id, pl.id, p_score, p_correct, p_wrong, p_gates, p_duration_ms, pl.voted, p_dish)
    returning * into existing;
    is_new := true;
  end if;

  select max(score) into best from runs where player_id = pl.id and status = 'valid';
  return prism_rank(pl.id) || jsonb_build_object(
    'run_id', existing.id,
    'run_score', existing.score,
    'is_best', existing.status = 'valid' and existing.score >= coalesce(best, 0),
    'is_new', is_new,
    'voted', pl.voted,
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true',
    'vote_bonus_multiplier', least(greatest(prism_cfg('vote_bonus_multiplier', '1.1')::numeric, 1.0), 1.2),
    'wheel', prism_wheel()
  );
end $$;

create or replace function prism_leaderboard(p_limit int default 10, p_device_id text default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  top jsonb;
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
  if p_device_id is not null then
    select id into pid from players where device_id = p_device_id;
    if found then
      me := prism_rank(pid);
      if me->>'rank' is null then me := null; end if;
    end if;
  end if;
  return jsonb_build_object(
    'top', top,
    'total_players', (select count(*) from leaderboard),
    'total_plays', (select count(*) from runs where status = 'valid'),
    'me', me,
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true',
    'wheel', prism_wheel()
  );
end $$;

-- Re-apply the lockdown from 0002 to the (re)created functions: service role only.
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
