-- All trust-sensitive logic. Each function is one transaction, so stock can never go
-- negative and a code can never be redeemed twice, even under concurrent calls.
-- Functions return jsonb; a failed check returns {"error": "<code>"}.

create or replace function prism_cfg(p_key text, p_default text) returns text
language sql stable as $$
  select coalesce((select value from config where key = p_key), p_default)
$$;

-- Fixed-window rate limiter. Returns true while the caller is under the limit.
create or replace function prism_rate_ok(p_key text, p_max int, p_window_s int) returns jsonb
language plpgsql as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  c int;
begin
  insert into rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into c;
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '10 minutes';
  end if;
  return to_jsonb(c <= p_max);
end $$;

-- Same window as prism_rate_ok, but only looks; it does not count the call.
create or replace function prism_rate_peek(p_key text, p_max int, p_window_s int) returns jsonb
language sql stable as $$
  select to_jsonb(coalesce((
    select count < p_max from rate_limits
    where key = p_key and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s)
  ), true))
$$;

create or replace function prism_wheel() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(name order by name) filter (where stock > 0 and weight > 0), '[]'::jsonb)
         || jsonb_build_array('Better luck next time + sticker')
  from prizes
$$;

-- Rank of one player on the leaderboard. Ties go to the earlier run.
create or replace function prism_rank(p_player uuid) returns jsonb
language plpgsql stable as $$
declare
  me record;
  total int;
  ahead int;
begin
  select count(*) into total from leaderboard;
  select score, created_at into me from leaderboard where player_id = p_player;
  if not found then
    return jsonb_build_object('rank', null, 'score', null, 'total_players', total, 'beat_count', 0);
  end if;
  select count(*) into ahead from leaderboard l
  where l.score > me.score or (l.score = me.score and l.created_at < me.created_at);
  return jsonb_build_object('rank', ahead + 1, 'score', me.score, 'total_players', total, 'beat_count', total - ahead - 1);
end $$;

-- Stores a run. The caller (Edge Function) has already checked the score cap.
create or replace function prism_submit_run(
  p_run_id uuid, p_device_id text, p_nickname text,
  p_score int, p_correct int, p_wrong int, p_gates int, p_duration_ms int,
  p_cooldown_s int default 10
) returns jsonb
language plpgsql as $$
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
    insert into runs (id, player_id, score, correct, wrong, gates, duration_ms, vote_bonus)
    values (p_run_id, pl.id, p_score, p_correct, p_wrong, p_gates, p_duration_ms, pl.voted)
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
language plpgsql stable as $$
declare
  top jsonb;
  me jsonb := null;
  pid uuid;
begin
  select coalesce(jsonb_agg(jsonb_build_object('rank', rn, 'nickname', nickname, 'score', score, 'key', key) order by rn), '[]'::jsonb)
  into top
  from (
    select row_number() over (order by score desc, created_at asc) as rn, nickname, score, left(player_id::text, 8) as key
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

create or replace function prism_vote(p_device_id text, p_voted boolean) returns jsonb
language plpgsql as $$
declare pid uuid;
begin
  if prism_cfg('vote_bonus_enabled', 'false') <> 'true' then
    return jsonb_build_object('error', 'bonus_off');
  end if;
  update players set voted = p_voted where device_id = p_device_id returning id into pid;
  if not found then return jsonb_build_object('error', 'no_player'); end if;
  return prism_rank(pid) || jsonb_build_object('voted', p_voted);
end $$;

create or replace function prism_email(p_device_id text, p_email text, p_consent boolean) returns jsonb
language plpgsql as $$
begin
  update players set email = p_email, email_consent = coalesce(p_consent, false) where device_id = p_device_id;
  if not found then return jsonb_build_object('error', 'no_player'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- The server decides the spin: weighted by prizes.weight, limited by prizes.stock.
create or replace function prism_spin(p_run_id uuid, p_device_id text) returns jsonb
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no I, L, O, 0, 1
  fallback constant text := 'Better luck next time + sticker';
  r record;
  sp spins%rowtype;
  segments text[];
  names text[];
  chosen prizes%rowtype;
  pr prizes%rowtype;
  total int;
  pick numeric;
  acc int := 0;
  fb_weight int;
  v_code text;
  idx int;
begin
  -- Lock the run so two taps cannot spin it twice.
  select ru.id into r from runs ru join players p on p.id = ru.player_id
  where ru.id = p_run_id and p.device_id = p_device_id and ru.status = 'valid'
  for update of ru;
  if not found then return jsonb_build_object('error', 'no_run'); end if;

  select * into sp from spins where run_id = p_run_id;
  if found then
    -- Already spun: return the same result again.
    select coalesce(array_agg(name order by name) filter (where stock > 0 and weight > 0), '{}') into names from prizes;
    if sp.prize_id is not null then
      select * into chosen from prizes where id = sp.prize_id;
      if not (chosen.name = any (names)) then names := array(select unnest(names || chosen.name) order by 1); end if;
    end if;
    segments := names || fallback;
    return jsonb_build_object(
      'prize_id', sp.prize_id, 'prize_name', coalesce(chosen.name, fallback), 'code', sp.code,
      'segments', to_jsonb(segments), 'index', array_position(segments, coalesce(chosen.name, fallback)) - 1,
      'redeemed', sp.redeemed_at is not null);
  end if;

  -- Lock the prizes still in stock; concurrent spins queue here, so stock cannot go negative.
  fb_weight := greatest(prism_cfg('fallback_weight', '60')::int, 1);
  select coalesce(sum(weight), 0) into total from (
    select weight from prizes where stock > 0 and weight > 0 order by name for update
  ) locked;
  select coalesce(array_agg(name order by name), '{}') into names from prizes where stock > 0 and weight > 0;
  segments := names || fallback;

  pick := random() * (total + fb_weight);
  for pr in select * from prizes where stock > 0 and weight > 0 order by name loop
    acc := acc + pr.weight;
    if pick < acc then
      chosen := pr;
      exit;
    end if;
  end loop;

  if chosen.id is not null then
    update prizes set stock = stock - 1 where id = chosen.id and stock > 0;
    if not found then chosen := null; end if;
  end if;

  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into spins (run_id, prize_id, code) values (p_run_id, chosen.id, v_code);
      exit;
    exception when unique_violation then
      if exists (select 1 from spins where run_id = p_run_id) then raise; end if;
      -- code collision: try another
    end;
  end loop;

  idx := array_position(segments, coalesce(chosen.name, fallback)) - 1;
  return jsonb_build_object(
    'prize_id', chosen.id, 'prize_name', coalesce(chosen.name, fallback), 'code', v_code,
    'segments', to_jsonb(segments), 'index', idx, 'redeemed', false);
end $$;

-- ---------- admin ----------

create or replace function prism_admin_redeem(p_code text) returns jsonb
language plpgsql as $$
declare
  sp record;
  v_code text := upper(trim(p_code));
begin
  -- The "redeemed_at is null" condition makes a second redeem of the same code fail.
  update spins s set redeemed_at = now() where s.code = v_code and s.redeemed_at is null returning * into sp;
  if not found then
    select s.redeemed_at into sp from spins s where s.code = v_code;
    if not found then return jsonb_build_object('error', 'not_found'); end if;
    return jsonb_build_object('error', 'already_redeemed', 'redeemed_at', sp.redeemed_at);
  end if;
  return jsonb_build_object(
    'ok', true, 'code', v_code,
    'prize_name', coalesce((select name from prizes where id = sp.prize_id), 'Sticker (better luck next time)'),
    'nickname', (select p.nickname from runs r join players p on p.id = r.player_id where r.id = sp.run_id));
end $$;

create or replace function prism_admin_runs(p_search text default '', p_limit int default 50) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select r.id, p.nickname, r.score, r.correct, r.gates, r.duration_ms, r.status, r.created_at
    from runs r join players p on p.id = r.player_id
    where coalesce(p_search, '') = '' or p.nickname ilike '%' || p_search || '%'
    order by (r.status = 'valid') desc, r.score desc, r.created_at desc
    limit least(greatest(p_limit, 1), 200)
  ) t
$$;

create or replace function prism_admin_set_run_status(p_run_id uuid, p_status text) returns jsonb
language plpgsql as $$
begin
  if p_status not in ('valid', 'removed') then return jsonb_build_object('error', 'bad_status'); end if;
  update runs set status = p_status where id = p_run_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function prism_admin_prizes() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'stock', p.stock, 'weight', p.weight,
    'won', (select count(*) from spins s where s.prize_id = p.id),
    'redeemed', (select count(*) from spins s where s.prize_id = p.id and s.redeemed_at is not null)
  ) order by p.name), '[]'::jsonb) from prizes p
$$;

create or replace function prism_admin_set_prize(p_id uuid, p_stock int, p_weight int default null) returns jsonb
language plpgsql as $$
begin
  if p_stock < 0 or coalesce(p_weight, 0) < 0 then return jsonb_build_object('error', 'bad_value'); end if;
  update prizes set stock = p_stock, weight = coalesce(p_weight, weight) where id = p_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function prism_admin_config() returns jsonb
language sql stable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from config
$$;

create or replace function prism_admin_set_config(p_key text, p_value text) returns jsonb
language plpgsql as $$
declare v text := p_value;
begin
  if p_key in ('vote_bonus_enabled', 'submissions_open') then
    if v not in ('true', 'false') then return jsonb_build_object('error', 'bad_value'); end if;
  elsif p_key = 'vote_bonus_multiplier' then
    v := least(greatest(v::numeric, 1.0), 1.2)::text; -- hard cap 1.2
  elsif p_key = 'fallback_weight' then
    v := greatest(v::int, 1)::text;
  else
    return jsonb_build_object('error', 'bad_key');
  end if;
  insert into config (key, value) values (p_key, v) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'key', p_key, 'value', v);
exception when others then
  return jsonb_build_object('error', 'bad_value');
end $$;

-- Anonymous run statistics only.
create or replace function prism_admin_stats() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'players', (select count(*) from players),
    'runs', (select count(*) from runs),
    'valid_runs', (select count(*) from runs where status = 'valid'),
    'avg_score', (select coalesce(round(avg(score)), 0) from runs where status = 'valid'),
    'top_score', (select coalesce(max(score), 0) from leaderboard),
    'median_duration_s', (select coalesce(round((percentile_cont(0.5) within group (order by duration_ms) / 1000)::numeric, 1), 0) from runs where status = 'valid'),
    'avg_correct_pct', (select coalesce(round(100.0 * sum(correct) / nullif(sum(gates), 0)), 0) from runs where status = 'valid'),
    'spins', (select count(*) from spins),
    'prizes_won', (select count(*) from spins where prize_id is not null),
    'redeemed', (select count(*) from spins where redeemed_at is not null),
    'emails', (select count(*) from players where email is not null),
    'voted', (select count(*) from players where voted)
  )
$$;

create or replace function prism_admin_export_emails() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('nickname', nickname, 'email', email, 'updates_consent', email_consent) order by created_at), '[]'::jsonb)
  from players where email is not null
$$;

-- Lock every function down to the service role. On Supabase, new functions in "public"
-- are callable by the anon key through the REST API unless this is done.
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
