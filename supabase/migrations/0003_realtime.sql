-- =============================================================================
-- Kavach 0003 — Realtime
--
-- Only two tables need live updates, and both are read-mostly:
--   alerts  — a new signed alert must reach every tourist instantly
--   reports — corroboration changes the trust score live
--
-- The client falls back to 30 s polling when the socket is down, so realtime
-- is an optimisation, never a dependency (AGENTS.md rule 1).
-- =============================================================================

-- Realtime needs replica identity to stream changes.
alter table public.alerts replica identity full;
alter table public.reports replica identity full;

do $$
begin
  -- Add our tables to the publication if they are not already members.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end
$$;

-- =============================================================================
-- Optional: automatic risk refresh via pg_cron
--
-- NOT enabled by default, on purpose. `get-snapshot` already refreshes stale
-- data lazily, so the product does not depend on a scheduler being configured
-- — which also means a judge can run the whole system without cron.
--
-- To enable (after enabling the extension):
--
--   create extension if not exists pg_cron;
--   select cron.schedule(
--     'kavach-ingest-risk',
--     '*/10 * * * *',
--     $$ select net.http_post(
--           url     := current_setting('app.settings.url', true) || '/ingest-risk',
--           headers := jsonb_build_object(
--             'Content-Type', 'application/json',
--             'x-kavach-secret', current_setting('app.settings.ingest_secret', true)
--           ),
--           body    := '{}'::jsonb
--        ) $$
--   );
--
-- =============================================================================