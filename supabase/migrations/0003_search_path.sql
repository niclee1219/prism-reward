-- Pin search_path on every prism_* function (Supabase linter 0011_function_search_path_mutable).
-- Without it, a function resolves table names using the caller's search_path, so a caller who
-- can create objects in an earlier schema could shadow "players", "runs", etc. Safe to rerun.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'prism\_%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
