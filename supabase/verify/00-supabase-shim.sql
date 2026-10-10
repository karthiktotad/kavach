-- Minimal stand-in for the Supabase platform, so the Kavach migrations can be
-- executed on a plain Postgres for verification.
--
-- This is TEST SCAFFOLDING, not part of the project. It recreates only what
-- 0001-0003 actually touch:
--   * the `auth` schema, `auth.users` and `auth.uid()`
--   * the three Postgres roles Supabase provisions
--   * the `supabase_realtime` publication
--
-- It is deliberately NOT a Supabase emulator. Passing here means "the SQL is
-- syntactically valid and the policies behave as designed", not "this will work
-- on Supabase".

create schema if not exists auth;

-- Supabase reads the subject claim out of this GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Supabase provisions these three roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Realtime publication, created by Supabase on every project.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;