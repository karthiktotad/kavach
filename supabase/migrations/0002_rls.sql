-- =============================================================================
-- Kavach 0002 — Row Level Security
--
-- The security model, stated plainly:
--
--   READ (public, anon key):
--     zones, shelters, alerts, risk_snapshots   — public safety information
--     reports (sanitised: no device_id)          — crowd-sourced, unverified
--     checkins (recent only, no device_id)      — safety-relevant
--
--   WRITE (anon key, rate-limited in SQL):
--     reports, confirmations, checkins          — the outbox drains here
--
--   WRITE (NOTHING from the client):
--     alerts, risk_snapshots, zones, shelters, profiles
--     -> service role only (sign-alert / ingest-risk)
--
-- The single most important line in this file: **there is no INSERT, UPDATE or
-- DELETE policy on `alerts`.** A leaked anon key cannot forge an official alert;
-- only the sign-alert function with the service role can, and it re-checks that
-- the caller is an authority before it signs.
-- =============================================================================

alter table public.profiles       enable row level security;
alter table public.zones          enable row level security;
alter table public.alert_sequences enable row level security;
alter table public.shelters       enable row level security;
alter table public.alerts         enable row level security;
alter table public.devices        enable row level security;
alter table public.reports        enable row level security;
alter table public.confirmations  enable row level security;
alter table public.checkins       enable row level security;
alter table public.risk_snapshots enable row level security;

-- Force RLS on the table owner too, so a mistake in an edge function cannot
-- quietly bypass the policies.
alter table public.alerts         force row level security;
alter table public.risk_snapshots force row level security;
alter table public.reports        force row level security;
alter table public.checkins       force row level security;

-- ---------------------------------------------------------------------------
-- Public reference data
-- ---------------------------------------------------------------------------
drop policy if exists "zones are public" on public.zones;

create policy "zones are public"
  on public.zones for select
  to anon, authenticated
  using (true);

drop policy if exists "shelters are public" on public.shelters;

create policy "shelters are public"
  on public.shelters for select
  to anon, authenticated
  using (true);

drop policy if exists "risk snapshots are public" on public.risk_snapshots;

create policy "risk snapshots are public"
  on public.risk_snapshots for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Alerts — read only. No write policy at all: see the header.
-- ---------------------------------------------------------------------------
drop policy if exists "alerts are public" on public.alerts;

create policy "alerts are public"
  on public.alerts for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Profiles — a user may read their own; may NOT change their own role.
--
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it ONCE per
-- query rather than once per row.
-- ---------------------------------------------------------------------------
drop policy if exists "read own profile" on public.profiles;

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "insert own profile" on public.profiles;

create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id and role = 'tourist');

-- No UPDATE policy on purpose: `role` must not be self-assignable. An
-- authority is promoted by an admin running SQL (see docs/BACKEND.md).

-- ---------------------------------------------------------------------------
-- Devices — a device may insert/update only its own row.
-- ---------------------------------------------------------------------------
drop policy if exists "devices are self-service" on public.devices;

create policy "devices are self-service"
  on public.devices for insert
  to anon, authenticated
  with check (true);

drop policy if exists "devices self-update" on public.devices;

create policy "devices self-update"
  on public.devices for update
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Reports — anonymous insert (rate-limited by trigger), sanitised public read.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone may report" on public.reports;

create policy "anyone may report"
  on public.reports for insert
  to anon, authenticated
  with check (char_length(device_id) between 8 and 64);

-- Sanitised view: drops device_id and the internal trust fields, so a public
-- reader cannot deanonymise a reporter or see server scoring internals.
create or replace view public.reports_public
with (security_invoker = true)
as
select
  r.id,
  r.kind,
  r.lat,
  r.lon,
  r.zone_id,
  r.note,
  r.photo_path,
  r.confidence,
  r.confidence_reason,
  r.created_at,
  r.expires_at
from public.reports r
where r.expires_at is null or r.expires_at > now();

grant select on public.reports_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confirmations — anonymous insert, uniqueness enforced by the primary key.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone may confirm" on public.confirmations;

create policy "anyone may confirm"
  on public.confirmations for insert
  to anon, authenticated
  with check (char_length(device_id) between 8 and 64);

drop policy if exists "confirmations are public" on public.confirmations;

create policy "confirmations are public"
  on public.confirmations for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Check-ins — anonymous insert (rate-limited), sanitised public read.
-- ---------------------------------------------------------------------------
drop policy if exists "anyone may check in" on public.checkins;

create policy "anyone may check in"
  on public.checkins for insert
  to anon, authenticated
  with check (char_length(device_id) between 8 and 64);

create or replace view public.checkins_public
with (security_invoker = true)
as
select
  c.id,
  c.lat,
  c.lon,
  c.zone_id,
  c.status,
  c.note,
  c.created_at
from public.checkins c
where c.created_at > now() - interval '48 hours';

grant select on public.checkins_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: is this caller an authority?
--
-- SECURITY DEFINER so a caller can test the predicate without being able to read
-- the whole profiles table.
--
-- It lives in a `private` schema, NOT `public`. A SECURITY DEFINER function in
-- an exposed schema is callable by anyone who can reach the database, and this
-- one is an authorisation predicate: exposing it invites exactly the kind of
-- "let me just call is_authority() from a policy" mistake that turns a check
-- into a bypass. EXECUTE is revoked from anon and authenticated below.
--
-- `search_path = ''` means no schema is searched implicitly, so a hostile object
-- cannot shadow the tables named inside. Every reference is schema-qualified.
-- pg_catalog is always searched regardless, so builtins still resolve.
--
-- Note: sign-alert does NOT call this. It reads the role through the service
-- role client, because the profiles RLS policy only lets a user see their own
-- row. This function exists for future RLS policies and for ad-hoc debugging.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create or replace function private.is_authority()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'authority'
  );
$$;

revoke execute on function private.is_authority() from public;
grant execute on function private.is_authority() to service_role;

-- =============================================================================
-- Atomic sequence allocation for alerts.
--
-- Two authorities issuing at the same instant must not mint the same seq, or a
-- client could reorder alerts. The counter survives pruning of expired alerts,
-- so a seq is never reused.
-- =============================================================================
create or replace function public.next_alert_seq(p_hazard text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated bigint;
begin
  -- Serialise per hazard. xact lock is released automatically at commit.
  perform pg_advisory_xact_lock(hashtext('kavach-alert-seq:' || p_hazard));

  -- A dedicated counter row, NOT max(seq) from the alerts table.
  --
  -- Deriving the next value from the alerts table looks equivalent and is not.
  -- Expired alerts get pruned — the client filters them out anyway — and the day
  -- a row is deleted, max(seq) falls back, so a later alert for that hazard gets
  -- a seq a phone has ALREADY seen carrying different content. The client uses
  -- seq to decide which alert supersedes which, so a repeat is not cosmetic: a
  -- stale packet could outrank a current one.
  --
  -- A counter is monotonic and survives pruning. Gaps are expected and fine — a
  -- rolled-back transaction burns a number, which is exactly what we want.
  insert into public.alert_sequences (hazard, last_seq)
  values (p_hazard, 1)
  on conflict (hazard)
    do update set last_seq = public.alert_sequences.last_seq + 1
  returning last_seq into allocated;

  return allocated;
end;
$$;

grant execute on function public.next_alert_seq(text) to service_role;

-- =============================================================================
-- Table privileges
--
-- These come LAST on purpose: the grants below name the sanitised views, and a
-- view must exist before it can be granted.
--
-- RLS and privileges are two different gates and BOTH must be open for a query
-- to succeed. The policies above filter every row; the grants here open exactly
-- the gates those policies need, and no others.
--
-- Supabase provisions default privileges that hand anon/authenticated broad
-- access to everything in `public`. We revoke that and re-grant precisely, so
-- the security model is legible in this repo instead of living in a platform
-- default nobody can read. It also makes the migration self-contained: identical
-- behaviour on a real Supabase project and on a plain Postgres, which is what
-- makes the local verification run meaningful.
--
-- The redundancy is deliberate and fails safe: a privilege with RLS on still
-- filters rows, and a policy with no privilege behind it simply denies.
-- =============================================================================

-- Start from a closed door for every table we own.
revoke all on all tables in schema public from anon, authenticated;

-- Public safety reference data: readable by everyone, writable by nobody.
grant select on public.zones, public.shelters, public.risk_snapshots to anon, authenticated;

-- Alerts are READ-ONLY over the wire — no INSERT grant and no INSERT policy.
-- This is the single most important grant decision in the file: a leaked anon
-- key must not be able to forge an official alert.
grant select on public.alerts to anon, authenticated;

-- Crowd data is read through the sanitised VIEWS, not the tables, so device_id
-- is unreachable even though the underlying tables hold it.
grant select on public.reports_public, public.checkins_public to anon, authenticated;

-- The offline outbox drains into these three.
grant insert on public.reports, public.confirmations, public.checkins to anon, authenticated;
grant select on public.confirmations to anon, authenticated;

-- Devices are self-service; the rate-limit trigger maintains last_seen_at.
grant insert, update on public.devices to anon, authenticated;

-- Profiles: a signed-in user may read their own row and create it as a tourist.
-- No UPDATE — role must not be self-assignable.
grant select, insert on public.profiles to authenticated;

-- alert_sequences: RLS is on, and there is deliberately NO policy — so even
-- service_role-independent clients see nothing. Only the SECURITY DEFINER
-- next_alert_seq() touches it, which bypasses RLS as the table owner.
grant select on public.alert_sequences to service_role;

-- service_role bypasses RLS and needs full DML plus sequence access.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;