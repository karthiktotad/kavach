# `supabase/` — backend

Supabase free tier: Postgres + PostGIS, Realtime, Auth (anonymous sign-ins) and
Deno Edge Functions.

```
supabase/
  migrations/   – SQL: zones, alerts, packets, reports, checkins, drills, RLS
  functions/    – Edge Functions (the ONLY place secrets and the LLM are touched)
```

## Planned Edge Functions (M5)

| Function | Purpose | Secrets required |
| --- | --- | --- |
| `issue-alert` | Signs an alert packet (ECDSA P-256) and publishes it | `PACKET_SIGNING_PRIVATE_KEY_PEM`, `PACKET_SIGNING_KEY_ID` |
| `ingest-live` | Pulls Open-Meteo / GDACS / NDMA / IMD → per-zone risk 0–4 with a plain-language reason | `SUPABASE_SERVICE_ROLE_KEY` |
| `snapshot` | Serves the **computed** risk snapshot to clients (never raw feeds) | none |
| `ai-proxy` | The **only** place Gemini is called; grounded prompt + citation enforcement | `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

## Security rules (engineering rule 2)

- **No secret ever enters this repo or the client bundle.** Signing keys and API
  keys live in Supabase secrets (`supabase secrets set ...`), never in `.env`.
- Row Level Security is what actually protects the data; the anon key is public
  by design and is only useful when RLS is correct.
- `supabase/functions/_shared/` is gitignored — Edge Functions must import from
  the top-level `shared/` directory instead, so there is exactly one copy of the
  packet codec.

Status: the directories are empty until M5.