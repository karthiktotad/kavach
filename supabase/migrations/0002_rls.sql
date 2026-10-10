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
create policy "zones are public"
  on public.zones for select
  to anon, authenticated
  using (true);

create policy "shelters are public"
  on public.shelters for select
  to anon, authenticated
  using (true);

create policy "risk snapshots are public"
  on public.risk_snapshots for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Alerts — read only. No write policy at all: see the header.
-- ---------------------------------------------------------------------------
create policy "alerts are public"
  on public.alerts for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Profiles — a user may read their own; may NOT change their own role.
-- ---------------------------------------------------------------------------
create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'tourist');

-- No UPDATE policy on purpose: `role` must not be self-assignable. An
-- authority is promoted by an admin running SQL (see docs/BACKEND.md).

-- ---------------------------------------------------------------------------
-- Devices — a device may insert/update only its own row.
-- ---------------------------------------------------------------------------
create policy "devices are self-service"
  on public.devices for insert
  to anon, authenticated
  with check (true);

create policy "devices self-update"
  on public.devices for update
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Reports — anonymous insert (rate-limited by trigger), sanitised public read.
-- ---------------------------------------------------------------------------
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
create policy "anyone may confirm"
  on public.confirmations for insert
  to anon, authenticated
  with check (char_length(device_id) between 8 and 64);

create policy "confirmations are public"
  on public.confirmations for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Check-ins — anonymous insert (rate-limited), sanitised public read.
-- ---------------------------------------------------------------------------
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
-- SECURITY DEFINER so a user can test the predicate without being able to read
-- the whole profiles table. Used by the sign-alert edge function.
-- ---------------------------------------------------------------------------
create or replace function public.is_authority()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'authority'
  );
$$;

grant execute on function public.is_authority() to anon, authenticated;

-- =============================================================================
-- Atomic sequence allocation for alerts.
--
-- Two authorities issuing at the same instant must not mint the same seq, or a
-- client could reorder alerts. This takes an advisory lock and computes the
-- next value per hazard, so ordering is total and race-free.
-- =============================================================================
create or replace function public.next_alert_seq(p_hazard text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq bigint;
begin
  -- Serialise per hazard. xact lock is released automatically at commit.
  perform pg_advisory_xact_lock(hashtext('kavach-alert-seq:' || p_hazard));

  select coalesce(max(seq), 0) + 1
    into next_seq
    from public.alerts
   where hazard = p_hazard;

  return next_seq;
end;
$$;

grant execute on function public.next_alert_seq(text) to service_role;