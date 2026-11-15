-- 0007: staff can close the whole site (players see a "closed" screen) and wipe all event data.
-- Safe to run more than once.

insert into config (key, value) values ('site_open', 'true') on conflict (key) do nothing;

-- Same as 0006, plus the new site_open switch.
create or replace function prism_admin_set_config(p_key text, p_value text) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v text := p_value;
begin
  if p_key in ('vote_bonus_enabled', 'submissions_open', 'site_open') then
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

-- Public: is the site open? Anything but an explicit 'false' counts as open.
create or replace function prism_site_open() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select prism_cfg('site_open', 'true') <> 'false'
$$;

-- Deletes ALL event data: players, runs, lucky draw entries, reactions and rate-limit counters.
-- Settings (config) are kept. Returns how many rows were deleted, for the confirmation message.
create or replace function prism_admin_reset() returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare out jsonb;
begin
  out := jsonb_build_object(
    'players', (select count(*) from players),
    'runs', (select count(*) from runs),
    'entries', (select count(*) from draw_entries),
    'reactions', (select count(*) from reactions)
  );
  truncate table draw_entries, runs, players, reactions, rate_limits restart identity cascade;
  return jsonb_build_object('ok', true, 'deleted', out);
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
