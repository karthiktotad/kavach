# `scripts/` — content-pack build and project tooling

Node scripts, run with `npm run <name>` or directly via `node scripts/<file>`.

| Script | Milestone | Purpose |
| --- | --- | --- |
| `build-pack.mjs` | M2 | Validate and emit the preloaded content pack into `public/pack/` |
| `check-pack.mjs` | M2 | Fail the build if any safety-critical entry lacks a `verified` flag |

## Rules

- Scripts must be **idempotent** and runnable on a clean checkout.
- Scripts must **never** invent data. If a source value cannot be confirmed, the
  script writes `verified: false` and the entry goes into
  [`TODO_VERIFY.md`](../TODO_VERIFY.md).
- No secrets are read here; the client `.env` only ever contains public values.

Status: the directory is empty until M2.