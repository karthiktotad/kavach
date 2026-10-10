-- =============================================================================
-- Kavach 0001 — initial schema
--
-- Design rules (AGENTS.md):
--  - The backend is thin. It stores and signs; it never serves raw API feeds.
--  - NO client writes to alerts or risk_snapshots. Those are authority/service
--    only, so a stolen anon key cannot forge an official alert.
--  - Clients must keep working when everything here is down. Nothing in this
--    schema is a hard dependency for rendering; it is a sync target.
--
-- Geometry: plain lat/lon + a coarse `geohash`, NOT PostGIS. Nothing in Kavach
-- does spatial joins — zones are polygons held in the content pack, and the
-- client does point-in-polygon offline. PostGIS would be ~100 MB of extension
-- for no query we actually run, and it blocks local `supabase db reset` on
-- machines without the extension bundle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles — who may sign. `role` is the only authority signal.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'tourist' check (role in ('tourist', 'authority')),
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Mirrors auth.users. role=authority may invoke sign-alert. Never trust a role sent by the client.';

-- ---------------------------------------------------------------------------
-- zones — the alert geometry, copied from the content pack so the server can
-- validate that a packet references zones that actually exist.
-- ---------------------------------------------------------------------------
create table if not exists public.zones (
  id text primary key check (id ~ '^Z[0-9]{1,3}$'),
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  flood_prone boolean not null default false,
  -- GeoJSON polygon. Kept as jsonb: we never run spatial SQL on it.
  geometry jsonb not null,
  note text,
  -- Our zones are hand-drawn and approximate; never present as surveyed truth.
  source text not null default 'hand-drawn, approximate',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.zones.verified is
  'Always false until a human confirms the polygon. UI must show an unverified badge.';

-- ---------------------------------------------------------------------------
-- shelters — server-side copy of the content pack places, for validation.
-- ---------------------------------------------------------------------------
create table if not exists public.shelters (
  id text primary key,
  name text,
  type text not null check (type in
    ('hospital', 'clinic', 'police', 'pharmacy', 'fire_station', 'shelter_candidate')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  address text,
  -- NULL is the correct value for an unknown number. Never invent one (rule 7).
  phone text,
  capacity integer check (capacity is null or capacity > 0),
  verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shelters_type_idx on public.shelters (type);
create index if not exists shelters_verified_idx on public.shelters (verified);

-- ---------------------------------------------------------------------------
-- alerts — official alerts. Inserted ONLY by the sign-alert function
-- (service role). There is deliberately no client INSERT policy.
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  hazard text not null check (hazard in ('FL', 'CY', 'HT', 'WN', 'LS', 'AC')),
  -- 0 is the All-Clear / cancellation level used by the packet codec.
  level smallint not null check (level between 0 and 4),
  zone_ids text[] not null default '{}',
  -- The signed packet. This is the authoritative artefact; the columns above
  -- are a convenience index for querying.
  packet text not null,
  -- Server-side English render, so the app can show something even if a locale
  -- pack is missing. Never a substitute for the translated template.
  text_en jsonb not null default '{}'::jsonb,
  -- Monotonic per hazard. Computed atomically in sign-alert; a higher seq
  -- supersedes a lower one for the same hazard+zone (see shared/alertState.ts).
  seq bigint not null,
  is_drill boolean not null default false,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint alerts_expiry_after_issue check (expires_at is null or expires_at > issued_at)
);

create index if not exists alerts_hazard_seq_idx on public.alerts (hazard, seq desc);
create index if not exists alerts_created_at_idx on public.alerts (created_at desc);
create index if not exists alerts_active_idx on public.alerts (expires_at) where expires_at is not null;

-- ---------------------------------------------------------------------------
-- alert_sequences — the authoritative counter behind `alerts.seq`.
--
-- Kept separate from the alerts table on purpose. If the sequence were derived
-- from max(alerts.seq), then pruning expired alerts would let a later alert be
-- handed a seq some phone has already seen with different content, and the client
-- (which orders alerts by seq) could show a stale warning as current.
--
-- One row per hazard, allocated under an advisory lock. Gaps are expected.
-- ---------------------------------------------------------------------------
create table if not exists public.alert_sequences (
  hazard text primary key check (hazard in ('FL', 'CY', 'HT', 'WN', 'LS', 'AC')),
  last_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.alert_sequences is
  'Monotonic per-hazard counter for alert seq. Never deleted, never decreased.';

comment on column public.alerts.packet is
  'ECDSA P-256 signed packet. The columns alongside are an index; the packet is the truth.';

-- ---------------------------------------------------------------------------
-- devices — anonymous device registry, for rate limiting.
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id text primary key,             -- client-generated UUID, never a real identity
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports — community hazard reports. Never shown as official alerts.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  kind text not null check (kind in ('flood', 'wind', 'heat', 'landslide', 'injury', 'other')),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  geohash text,
  zone_id text references public.zones (id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  photo_path text,                -- nullable; object storage is optional
  -- Deterministic trust score 0..1, computed by shared/trust on the server.
  confidence double precision check (confidence between 0 and 1),
  confidence_reason text,
  -- Auto-expiry: stale crowd reports are worse than none.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_zone_idx on public.reports (zone_id, created_at desc);
create index if not exists reports_device_idx on public.reports (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- confirmations — "I saw this too". A unique key makes repeat taps a no-op,
-- so a device cannot inflate corroboration.
-- ---------------------------------------------------------------------------
create table if not exists public.confirmations (
  report_id uuid not null references public.reports (id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (report_id, device_id)
);

create index if not exists confirmations_device_idx on public.confirmations (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- checkins — "I'm safe". Identity stays on the device; we store coordinates
-- and a status, nothing more.
-- ---------------------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  zone_id text references public.zones (id) on delete set null,
  status text not null default 'safe' check (status in ('safe', 'need_help', 'evacuating')),
  note text not null default '' check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists checkins_created_at_idx on public.checkins (created_at desc);
create index if not exists checkins_device_idx on public.checkins (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- risk_snapshots — computed risk per zone. Written only by ingest-risk
-- (service role). `inputs` keeps the raw readings so the reason is auditable.
-- ---------------------------------------------------------------------------
create table if not exists public.risk_snapshots (
  zone_id text primary key references public.zones (id) on delete cascade,
  level smallint not null check (level between 0 and 4),
  -- Plain-language explanation. Shown verbatim to the user, so it must never
  -- be a debug string.
  reason text not null,
  inputs jsonb not null default '{}'::jsonb,
  -- Which sources actually answered, so a degraded snapshot is visible.
  sources text[] not null default '{}',
  -- False when some source failed: the level is real but incomplete.
  fresh boolean not null default true,
  computed_at timestamptz not null default now()
);

create index if not exists risk_snapshots_computed_idx on public.risk_snapshots (computed_at desc);

-- =============================================================================
-- Device-scoped rate limiting, enforced in the database.
--
-- A client-side limit is advisory; this one cannot be bypassed without a
-- service-role key. Limits are deliberately generous — the goal is to stop a
-- runaway client, not a determined flooder, which needs auth.
--
-- SECURITY DEFINER because the trigger must read the full reports table (RLS
-- would otherwise hide rows from other devices) and write to devices on the
-- inserter's behalf. `search_path = ''` closes the shadowing hole that an
-- exposed schema creates for a definer function; pg_catalog is still searched,
-- so builtins like count(*) and now() resolve.
--
-- SECURITY INVOKER would be safer, but then the rate limit only sees the rows
-- the caller is already allowed to see, which is not a limit at all.
-- =============================================================================
create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.reports
  where device_id = new.device_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 10 then
    raise exception 'rate_limit_exceeded'
      using hint = 'max 10 reports per hour per device';
  end if;

  -- Touch the device row so the server knows it exists.
  insert into public.devices (id) values (new.device_id)
    on conflict (id) do update set last_seen_at = now();

  return new;
end;
$$;

create or replace function public.enforce_checkin_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.checkins
  where device_id = new.device_id
    and created_at > now() - interval '10 minutes';

  if recent_count >= 6 then
    raise exception 'rate_limit_exceeded'
      using hint = 'max 6 check-ins per 10 minutes per device';
  end if;

  insert into public.devices (id) values (new.device_id)
    on conflict (id) do update set last_seen_at = now();

  return new;
end;
$$;

-- DROP ... IF EXISTS first because CREATE TRIGGER has no IF NOT EXISTS, and this
-- migration should survive a re-apply (a `db reset`, or a hand-run of the file).
drop trigger if exists reports_rate_limit on public.reports;

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_report_rate_limit();

drop trigger if exists checkins_rate_limit on public.checkins;

create trigger checkins_rate_limit
  before insert on public.checkins
  for each row execute function public.enforce_checkin_rate_limit();