-- "Reset all data" failed in production with "must be owner of sequence reactions_id_seq":
-- TRUNCATE ... RESTART IDENTITY needs ownership of the sequence, and the edge functions call as
-- service_role, which only has table privileges. Reaction ids do not need to start again at 1
-- (the big screen only remembers the newest id it saw), so the reset simply keeps counting.
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
  truncate table draw_entries, runs, players, reactions, rate_limits cascade;
  return jsonb_build_object('ok', true, 'deleted', out);
end $$;

revoke all on function prism_admin_reset() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function prism_admin_reset() from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function prism_admin_reset() to service_role;
  end if;
end $$;
