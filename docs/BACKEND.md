# Kavach — Backend (Supabase)

The backend is deliberately **thin**. It stores things, it signs things, and it
proxies the LLM. It never serves raw API feeds to the client and it is never
required for the app to be useful — every screen has a cached path.

---

## 1. What each piece does, and why it exists

| Piece | Exists because |
| --- | --- |
| `sign-alert` | Only component that can mint an **official** alert. Requires an authenticated authority. |
| `ingest-risk` | Turns third-party feeds into a **computed 0–4 level + plain-language reason**. |
| `get-snapshot` | The only endpoint clients call for risk. Adds **lazy refresh** so no cron is needed. |
| `assistant` | Placeholder returning **501** until M10, so no one points the app at a half-built LLM path. |

**Deliberately not here:** any endpoint a client could use to *write* an alert.
There is no INSERT policy on `alerts`. A leaked anon key cannot forge an official
alert — only `sign-alert` can, and it re-checks the caller's role first.

---

## 2. Schema overview

```
zones           id, name, lat, lon, flood_prone, geometry (jsonb), verified
shelters        id, name, type, lat, lon, phone?, capacity?, verified
profiles        id → auth.users, role ('tourist' | 'authority')
alerts          hazard, level 0-4, zone_ids[], packet, seq, is_drill, issued_at, expires_at
alert_sequences hazard (PK), last_seq   ← monotonic counter; survives alert pruning
reports         device_id, kind, lat, lon, geohash, zone_id, note, confidence, expires_at
confirmations   (report_id, device_id)  ← composite PK makes repeat taps a no-op
checkins        device_id, lat, lon, zone_id, status, note
risk_snapshots  zone_id (PK), level 0-4, reason, inputs jsonb, sources[], fresh
devices         id (client UUID), last_seen_at
```

**No PostGIS.** Nothing in Kavach runs a spatial SQL query — zones are polygons
in the content pack and the client does point-in-polygon offline. PostGIS would
be ~100 MB of extension for no query we run, and it breaks `supabase db reset` on
machines without the extension bundle. Plain lat/lon + coarse geohash is enough.

### Access matrix

| Table | anon read | anon write | notes |
| --- | --- | --- | --- |
| `zones`, `shelters`, `risk_snapshots` | ✅ | ❌ | reference data |
| `alerts` | ✅ | ❌ **no grant, no policy** | service-role insert only |
| `alert_sequences` | ❌ | ❌ | RLS on, **no policy at all** — only the `SECURITY DEFINER` allocator touches it |
| `profiles` | own row only | insert as `tourist` | **no UPDATE** — a user cannot self-promote to authority |
| `reports` | via `reports_public` view | ✅ insert | rate-limited: 10/hour/device |
| `confirmations` | ✅ | ✅ insert | PK prevents inflation |
| `checkins` | via `checkins_public` view | ✅ insert | rate-limited: 6 / 10 min / device |

Two independent gates protect every table: a **grant** and a **policy**. Both
must be open for a query to succeed, and the redundancy fails safe — a grant
with RLS on still filters rows, and a policy with no grant behind it simply
denies. `0002_rls.sql` revokes Supabase's default `anon`/`authenticated`
privileges on `public` and re-grants precisely, so the access model is legible
in the repo instead of living in an undocumented platform default.

The sanitised views exist so a public reader cannot deanonymise a reporter or see
internal trust scoring.

---

## 3. Endpoints

All responses are JSON. Errors are always:

```json
{ "code": "forbidden", "message": "caller is not an authority", "details": {} }
```

`code` is stable and machine-readable; the client maps it to a localised string,
so **`message` is for developers, never shown to users**.

### `POST /functions/v1/sign-alert`

Headers: `Authorization: Bearer <user JWT>`

```json
{
  "hazard": "FL",
  "level": 3,
  "zones": ["Z1", "Z2"],
  "durationMin": 360,
  "isDrill": true,
  "note": "Practice run"
}
```

Returns `200`:

```json
{
  "packet": "KV1.k1.FL.3.Z1-Z2.…",
  "seq": 1,
  "kid": "k1",
  "mode": "D",
  "shareUrl": "https://…/#/a/KV1.k1.…",
  "expiresAt": "2026-10-10T13:00:00.000Z",
  "length": 126
}
```

Rejections: `unauthorized` (no/invalid session) · `forbidden` (not authority) ·
`invalid_input` (bad hazard/level/unknown zone/bad duration) · `internal`.

`durationMin` is restricted to `[30, 60, 180, 360, 720, 1440]` so nobody mints a
packet that is valid until 2044. `seq` is allocated atomically per hazard.

### `GET /functions/v1/get-snapshot`

Public. Returns the computed snapshot plus its age, and kicks off a background
refresh when older than 10 minutes (rate-limited to once per minute per instance,
so a fleet of clients cannot turn page loads into an upstream API flood).

```json
{ "zones": [ { "zoneId": "Z1", "level": 3, "reason": "…", "sources": ["open-meteo"], "complete": true, "computedAt": "…" } ],
  "computedAt": "…", "ageMs": 240000, "stale": false, "refreshStarted": false }
```

### `POST /functions/v1/ingest-risk`

Requires `x-kavach-secret` matching the `INGEST_SECRET` secret. Called by
`get-snapshot` lazily, or by cron if you enable it (see migration `0003`).

### `POST /functions/v1/assistant`

Returns `501 not_implemented` with `details.planned = "M10"` until M10.

---

## 4. Environment and secrets

### Client-safe (in `.env`, prefixed `VITE_`, shipped in the bundle)

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon key — **public by design**, protected by RLS |

### Server-only — **secrets, never in `.env`**

| Secret | Used by | Set by you |
| --- | --- | --- |
| `ALERT_SIGNING_PRIVATE_JWK` | `sign-alert` | ✅ |
| `ALERT_SIGNING_KEY_ID` | `sign-alert` (default `k1`) | ✅ |
| `ALERT_SIGNING_PUBLIC_JWK` | `src/config/authorityKeys.json` (already committed) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | auto |
| `INGEST_SECRET` | `ingest-risk` / `get-snapshot` | ✅ |
| `GEMINI_API_KEY` | `assistant` (M10) | ✅ |
| `OPEN_METEO_BASE_URL` | `ingest-risk` (has a default) | optional |
| `GDACS_RSS_URL` | `ingest-risk` (has a default) | optional |
| `APP_URL` | `sign-alert` share links | ✅ |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into every function automatically by the platform.

---

## 5. Exact commands

### 5.1 Install the CLI and link your project

```bash
npm install -g supabase          # or: npx supabase …
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

### 5.2 Generate the signing key (once)

```bash
npm run keys:gen
```

It writes the **public** JWK into `src/config/authorityKeys.json` (safe to
commit) and prints the **private** JWK. Copy only the printed private JWK into
the secret below. Never commit the private half.

### 5.3 Set secrets

```bash
supabase secrets set ALERT_SIGNING_PRIVATE_JWK='{"kty":"EC",…,"d":"…"}' \
                   ALERT_SIGNING_KEY_ID=k1 \
                   INGEST_SECRET="$(openssl rand -hex 24)" \
                   GEMINI_API_KEY='…' \
                   APP_URL='https://your-app.pages.dev'
```

Verify (names only, never values):

```bash
supabase secrets list
```

### 5.4 Push the migrations

```bash
supabase db push            # applies 0001_init, 0002_rls, 0003_realtime
```

Apply the seed **after** the migrations (it needs the tables):

```bash
# regenerate from the current content pack, then apply
npm run seed:pack
supabase db execute --file supabase/seed.sql
```

Or, to preview what it would do first, run the whole stack locally:

```bash
supabase start              # needs Docker
supabase db reset            # migrations + seed.sql
supabase functions serve
```

### 5.5 Create an authority user

```bash
# 1. Sign the user up in the app (or Supabase dashboard → Authentication → Users)
# 2. Find their id
supabase db execute --query "select id, email from auth.users order by created_at desc limit 5"
# 3. Promote
supabase db execute --query "insert into public.profiles (id, role, display_name) values ('<USER_ID>','authority','District Control Room') on conflict (id) do update set role = 'authority'"
```

### 5.6 Deploy the functions

```bash
supabase functions deploy sign-alert
supabase functions deploy ingest-risk
supabase functions deploy get-snapshot
supabase functions deploy assistant
# or all at once:
supabase functions deploy
```

Logs:

```bash
supabase functions logs sign-alert --tail
```

---

## 6. Verifying the schema and the RLS (done locally, no Supabase needed)

```bash
npm run db:verify
```

This spins up a throwaway Postgres cluster in a temp directory, applies
`0001`–`0003` + `seed.sql` exactly as `supabase db push` would, re-applies them
to prove idempotency, then runs `supabase/verify/01-security-tests.sql`.

`supabase/verify/00-supabase-shim.sql` provides the minimum platform surface the
migrations touch: the `auth` schema, `auth.users`, `auth.uid()`, the three
Supabase roles, and the `supabase_realtime` publication. It is **not** a Supabase
emulator — passing here means the SQL is valid and the policies behave as
designed, not that this is byte-identical to your project.

This exists because *"the migration applied without error" is not evidence that
the security model is correct.* RLS has two independent gates — privileges and
policies — and a schema can apply perfectly while granting far too much. The
tests assert what a **hostile** client can actually do.

### What the tests caught

Running them found three real defects that reading the SQL had not:

| Defect | Consequence if shipped |
| --- | --- |
| `next_alert_seq()` derived the counter from `max(alerts.seq)` | Prune an expired alert and a later alert is handed a `seq` a phone **already has**. The client orders alerts by `seq`, so a stale packet could outrank a current one. |
| Grants were inherited from Supabase's undocumented default privileges | The whole access model lived in a platform default nobody can read from the repo. Now every grant is explicit. |
| `scripts/seed-from-pack.ts` wrote `place.notes` (a plain string) as a JSONB literal | `supabase db execute --file seed.sql` failed on the **first** insert. |

### The assertions

```
PASS  anon cannot INSERT into alerts (permission denied for table alerts)
PASS  anon cannot UPDATE alerts
PASS  anon cannot DELETE alerts
PASS  anon can read alerts (0 rows)
PASS  anon can read zones (9 rows)
PASS  anon can read shelters (63 rows)
PASS  report rate limit fired on insert #11 (max 10/hour)
PASS  rate limit is per-device, not global
PASS  reports_public hides device_id
PASS  check-in rate limit fired on insert #7 (max 6/10min)
PASS  a client cannot write to profiles
PASS  private.is_authority() is executable by neither anon nor authenticated
PASS  anon cannot reach the private schema at all
PASS  next_alert_seq is monotonic and per-hazard (FL: 1, 2)
PASS  seq is never reused after pruning (3, then 5)
PASS  unknown zone_id is rejected by the foreign key
PASS  expires_at before issued_at is rejected
PASS  realtime publication contains: alerts, reports
```

Requires a local Postgres **server** (not just `psql`) on `PATH`, or `PGBIN`
pointing at one. `brew install postgresql@18` / `apt-get install postgresql`.

---

## 7. Verifying Deno compatibility

`npm run typecheck` deliberately **excludes** `supabase/functions/`. Those files
run on Deno and use Deno globals; type-checking them with the Node config needed
a hand-written stub of `supabase-js` that produced false errors — which is worse
than no check, because it looks authoritative.

So the functions are checked by Deno itself:

```bash
npm run typecheck:fn        # runs: deno check supabase/functions/*/index.ts
```

**⚠️ In the environment where M5 was written, Deno was not installed, so this
check has NOT been run.** The functions are therefore **unverified against the
Deno runtime** until you either install Deno and run the check, or deploy — at
which point Supabase's runtime type-checks and refuses a broken function.

What *has* been verified locally:

- `shared/riskEngine.ts` — 45 table-driven tests passing under Vitest (`npm test`)
- `shared/packet.ts` — 18 packet/codec/tamper tests (from M4)
- `supabase/seed.sql` — regenerates cleanly from the pack (9 zones, 63 shelters)
- **The schema and the RLS** — `npm run db:verify` applies every migration
  against a real Postgres 18 and asserts 17 security properties (§6). Three real
  defects were found and fixed this way.

Still unverified: behaviour against **Supabase itself** (the shim is not an
emulator), and anything requiring your project — `auth.users` contents, the
service-role key, Realtime over websocket.

---

## 8. Local development without Supabase

The app must stay fully demoable with no backend at all (M3 requirement). With
`VITE_SUPABASE_URL` unset, `src/lib/api.ts` returns `null` from every call and the
app serves everything from the content pack and IndexedDB. That is the fallback
the offline e2e test exercises.