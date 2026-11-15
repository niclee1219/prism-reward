-- 0006: booth rework.
--   * the spin wheel, prizes and redeem codes are gone
--   * lucky-draw entries (IRAS email + optional feedback) live in draw_entries
--   * live reactions (confetti, emoji) sent from phones and shown on /leaderboard
-- Safe to run more than once.

-- 1. Recreate the two functions that still mention the wheel, BEFORE prism_wheel is dropped.
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
  begin
    insert into players (device_id, nickname) values (p_device_id, p_nickname)
    on conflict (device_id) do update set nickname = players.nickname
    returning * into pl;
  exception when unique_violation then
    return jsonb_build_object('error', 'name_taken');
  end;

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
    'nickname', pl.nickname,
    'entered', exists (select 1 from draw_entries d where d.player_id = pl.id),
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true',
    'vote_bonus_multiplier', least(greatest(prism_cfg('vote_bonus_multiplier', '1.1')::numeric, 1.0), 1.2)
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
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true'
  );
end $$;

-- 2. Lucky-draw entries (created before prism_submit_run is ever called, which reads it).
create table if not exists draw_entries (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null unique references players(id) on delete cascade,
  email      text not null,
  message    text,
  created_at timestamptz not null default now()
);
create unique index if not exists draw_entries_email_unique on draw_entries (lower(email));
alter table draw_entries enable row level security;

create or replace function prism_draw_enter(p_device_id text, p_email text, p_message text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare pid uuid;
begin
  select id into pid from players where device_id = p_device_id;
  if not found then return jsonb_build_object('error', 'unknown_device'); end if;
  if exists (select 1 from draw_entries where player_id = pid) then
    return jsonb_build_object('error', 'already_entered');
  end if;
  begin
    insert into draw_entries (player_id, email, message)
    values (pid, lower(trim(p_email)), nullif(trim(coalesce(p_message, '')), ''));
  exception when unique_violation then
    return jsonb_build_object('error', 'email_taken');
  end;
  return jsonb_build_object('ok', true);
end $$;

-- 3. Reactions.
create table if not exists reactions (
  id         bigserial primary key,
  kind       text not null check (kind in ('confetti', 'heart', 'like', 'fire', 'penguin', 'party')),
  created_at timestamptz not null default now()
);
alter table reactions enable row level security;

create or replace function prism_react(p_kind text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  if p_kind not in ('confetti', 'heart', 'like', 'fire', 'penguin', 'party') then
    return jsonb_build_object('error', 'bad_kind');
  end if;
  insert into reactions (kind) values (p_kind);
  -- Housekeeping: occasionally drop old rows so the table stays tiny.
  if random() < 0.02 then
    delete from reactions where created_at < now() - interval '10 minutes';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- since < 0 means "just tell me the newest id" (a screen that just opened should not replay history).
create or replace function prism_reactions(p_since bigint default -1, p_limit int default 60) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare latest bigint;
begin
  select coalesce(max(id), 0) into latest from reactions;
  if p_since < 0 then
    return jsonb_build_object('latest', latest, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('latest', latest, 'items', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind) order by id), '[]'::jsonb)
    from (
      select id, kind from reactions
      where id > p_since and created_at > now() - interval '2 minutes'
      order by id limit least(greatest(p_limit, 1), 200)
    ) t
  ));
end $$;

-- 4. Admin functions that survive: run moderation, toggles, stats, export.
drop function if exists prism_admin_redeem(text);
drop function if exists prism_admin_prizes();
drop function if exists prism_admin_set_prize(uuid, int, int);
drop function if exists prism_spin(uuid, text);
drop function if exists prism_wheel();
drop table if exists spins;
drop table if exists prizes;
delete from config where key = 'fallback_weight';
drop function if exists prism_email(text, text, boolean);

create or replace function prism_admin_set_config(p_key text, p_value text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v text := p_value;
begin
  if p_key in ('vote_bonus_enabled', 'submissions_open') then
    if v not in ('true', 'false') then return jsonb_build_object('error', 'bad_value'); end if;
  elsif p_key = 'vote_bonus_multiplier' then
    v := least(greatest(v::numeric, 1.0), 1.2)::text; -- hard cap 1.2
  else
    return jsonb_build_object('error', 'bad_key');
  end if;
  insert into config (key, value) values (p_key, v) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'key', p_key, 'value', v);
exception when others then
  return jsonb_build_object('error', 'bad_value');
end $$;

create or replace function prism_admin_stats() returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'players', (select count(*) from players),
    'runs', (select count(*) from runs),
    'valid_runs', (select count(*) from runs where status = 'valid'),
    'avg_score', (select coalesce(round(avg(score)), 0) from runs where status = 'valid'),
    'top_score', (select coalesce(max(score), 0) from leaderboard),
    'median_duration_s', (select coalesce(round((percentile_cont(0.5) within group (order by duration_ms) / 1000)::numeric, 1), 0) from runs where status = 'valid'),
    'avg_correct_pct', (select coalesce(round(100.0 * sum(correct) / nullif(sum(gates), 0)), 0) from runs where status = 'valid'),
    'entries', (select count(*) from draw_entries),
    'voted', (select count(*) from players where voted)
  )
$$;

create or replace function prism_admin_export_entries() returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'nickname', p.nickname, 'email', d.email, 'message', d.message, 'created_at', d.created_at
  ) order by d.created_at), '[]'::jsonb)
  from draw_entries d join players p on p.id = d.player_id
$$;
drop function if exists prism_admin_export_emails();

-- 5. Lock every function down to the service role (same loop as 0002 and 0004).
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
