# TODO_VERIFY.md

**Engineering rule 7 — never fabricate safety data.**

Every safety-critical value in the content pack (phone numbers, shelter locations, hospital
addresses, medical advice) MUST carry `verified: false` until a qualified human has confirmed it
against an authoritative source. This file is the register of everything awaiting that check.

> **Anything marked `UNVERIFIED` must never be shown to a user without a visible "unverified"
> badge in the UI.**

---

## Status legend

- `UNVERIFIED` — placeholder or best-effort value, **must not** be presented as fact
- `PENDING` — value sourced from a named authority, awaiting confirmation
- `VERIFIED` — confirmed against the cited source, with the date of confirmation
- `REMOVED` — could not be confirmed; removed from the pack

---

## Register

*(No entries yet — the content pack is built in milestone M2.)*

| ID | Item | Value in pack | Source to check | Status | Checked by | Date |
| --- | --- | --- | --- | --- | --- | --- |
| — | *(empty template)* | | | | | |

---

## Intended entries (seeded during M2, refined as we go)

| ID | Item | Source to check | Status |
| --- | --- | --- | --- |
| SHELTER-001 | Emergency shelter list, Mamallapuram | Mamallapuram town panchayat / Tamil Nadu DRDA shelter list | UNVERIFIED |
| HOSP-001 | Hospital list + emergency numbers (108, 112, 100) | Tamil Nadu Health Dept / NHA | UNVERIFIED |
| POL-001 | Police station contacts | Tamil Nadu Police | UNVERIFIED |
| FIRSTAID-001 | First-aid procedure wording | Red Cross / WHO basic first aid | UNVERIFIED |
| NUM-001 | One-tap SOS numbers | Must be confirmed per country; do **not** guess | UNVERIFIED |
| HAZARD-001 | Flood-prone zone polygons | OSM + municipal flood maps | UNVERIFIED |

---

## Policy

1. **Numbers are never guessed.** If an emergency number is not confirmed for the pilot region, the
   SOS button falls back to a user-configurable number with a clear "not verified" warning.
2. **Shelter capacity is never invented.** If capacity is unknown, omit the field entirely rather
   than showing a guess.
3. **Medical advice comes from a reviewed knowledge base**, not from the model and not from memory.
4. Any entry promoted to `VERIFIED` must record: the source URL/authority, the person who checked
   it, and the date.
5. Drill data is **never** stored in this register as if it were real — drills are labelled in-band
   and live in a separate table.