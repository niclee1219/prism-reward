-- One account per device, one name per account, and names are unique (case-insensitive).
-- A player claims a name when they press PLAY (prism_claim_name); after that it never changes.

-- 1. Make existing names unique: the earliest player keeps the name, later ones get " 2", " 3", ...
with ranked as (
  select id, nickname,
         row_number() over (partition by lower(nickname) order by created_at, id) as n
  from players
)
update players p
set nickname = left(r.nickname, 16 - length(' ' || r.n::text)) || ' ' || r.n::text
from ranked r
where p.id = r.id and r.n > 1;

create unique index if not exists players_nickname_unique on players (lower(nickname));

-- 2. Claim a name for a device. Idempotent: a device that already has a player gets its locked
--    name back and the requested one is ignored. The unique index makes the claim race-safe.
create or replace function prism_claim_name(p_device_id text, p_nickname text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pl players%rowtype;
begin
  select * into pl from players where device_id = p_device_id;
  if found then
    return jsonb_build_object('nickname', pl.nickname, 'locked', true);
  end if;
  begin
    insert into players (device_id, nickname) values (p_device_id, p_nickname) returning * into pl;
  exception when unique_violation then
    -- Either a parallel claim from this same device won, or the name belongs to someone else.
    select * into pl from players where device_id = p_device_id;
    if found then
      return jsonb_build_object('nickname', pl.nickname, 'locked', true);
    end if;
    return jsonb_build_object('error', 'name_taken');
  end;
  return jsonb_build_object('nickname', pl.nickname, 'locked', true);
end $$;

-- 3. Submitting a run never renames a player. A brand-new device that skipped the claim step
--    still works, and gets name_taken if its name is already used.
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
  -- The no-op update locks the player row, so two submissions from one device run one after the other.
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
    'vote_bonus_enabled', prism_cfg('vote_bonus_enabled', 'false') = 'true',
    'vote_bonus_multiplier', least(greatest(prism_cfg('vote_bonus_multiplier', '1.1')::numeric, 1.0), 1.2),
    'wheel', prism_wheel()
  );
end $$;
