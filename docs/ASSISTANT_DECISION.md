# Architectural Decision: Kavach Assistant Multi-Tier Strategy

## Context & Challenge
Kavach is designed for tourists facing extreme weather events under unpredictable connectivity conditions (`Live` → `Degraded` → `Cellular-only` → `Offline` → `Relay`). During a disaster, tourists ask critical questions regarding immediate safety, medical first aid, shelter navigation, and phrasebook translation.

## Decision
We adopt a **deterministic-first, multi-tier provider architecture** with a unified contract:
1. **Deterministic Intent Handlers (Tier 0)**: Immediate local matching for critical safety intents (alert status, nearest verified shelter/hospital, emergency numbers, first aid decision trees, show-a-local phrasebook).
2. **Online Cloud LLM (Tier 1)**: Invoked **ONLY** via the Supabase Edge Function `ai-proxy` with strict 8-second timeouts and schema validation. The browser bundle never holds AI API keys.
3. **Offline On-Device Search (Tier 2)**: Bundled BM25 search (**MiniSearch**) over preloaded content-pack knowledge base chunks, alert templates, and decision trees. Always available with zero network reliance.
4. **On-Device WebLLM (Tier 3 - Optional / Experimental)**: Off by default. Reasons: high WebGPU requirements, large initial model weight downloads (hundreds of MBs) unsuited for tourists on emergency bandwidth, and high variance across mobile devices. A stub provider is provided with lazy dynamic import.

## Front-End Decoupling
The user interface and state machine remain **completely identical** across all modes (`'online-ai'`, `'offline-guidance'`, `'on-device-ai'`). Every answer contract specifies:
- `mode`: Provenance chip indicating which tier answered.
- `severity`: `'info' | 'caution' | 'serious'`
- `answer`: Plain-language text summary.
- `steps`: Up to 5 imperative action steps.
- `sources`: Attributed citations from the verified content pack.
- `escalate`: Boolean flag for medical/rescue urgency.
- `numbers`: Array of emergency dialling numbers **strictly verified against `contacts.json`** (hallucinated or unverified numbers stripped at the client layer).

## Privacy & Safety Invariants
- **No Personal Data Egress**: Medical ID, personal identity, and user contacts are stored exclusively on-device in local IndexedDB and are **NEVER** sent to the remote LLM proxy.
- **No Hallucinated Safety Facts**: Emergency numbers and shelter coordinates must originate exclusively from the deterministic content pack or verified signed alert packets.
