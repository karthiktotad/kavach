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

## 1. Emergency contacts — `public/pack/contacts.json`

These numbers are real Indian national services, but **we have not independently confirmed
them for the pilot region**, so every entry ships `verified: false` and must show an unverified
badge until someone checks it.

| ID | Number | Service | Check against | Status | Checked by | Date |
| --- | --- | --- | --- | --- | --- | --- |
| ec-112 | 112 | National emergency | DoT / MoC unified emergency number | UNVERIFIED | | |
| ec-108 | 108 | Ambulance | National Health Mission / GVK EMRI | UNVERIFIED | | |
| ec-100 | 100 | Police | Tamil Nadu Police | UNVERIFIED | | |
| ec-101 | 101 | Fire | Tamil Nadu Fire & Rescue | UNVERIFIED | | |
| ec-1070 | 1070 | TN state disaster control room | Tamil Nadu State Disaster Management Authority | UNVERIFIED | | |
| ec-1363 | 1363 | Tourist helpline | Ministry of Tourism / TN Tourism | UNVERIFIED | | |

**Consulates** — currently two `PLACEHOLDER` rows with `phone: null`. Per-nationality entries are
added at setup time. **Never guess a number**: an unknown number is stored as `null`, which the
app renders as "not available", rather than a plausible-looking wrong number.

---

## 2. First-aid knowledge base — `public/pack/kb/en.json`

**Every chunk below needs sign-off by a qualified medical professional before Kavach is used
in a real deployment.** The wording is our own summary of standard guidance, not a citation of
it, and compression into short steps can lose clinically important nuance.

| ID | Topic | Source we based it on | Status | Reviewed by | Date |
| --- | --- | --- | --- | --- | --- |
| bleeding-severe | Severe bleeding | WHO / IFRC basic first aid | UNVERIFIED | | |
| burns | Burns | WHO burn care / Red Cross | UNVERIFIED | | |
| fractures | Fractures | Red Cross first aid | UNVERIFIED | | |
| cpr-adult | Adult CPR | WHO BLS / Resuscitation Council UK | UNVERIFIED | | |
| drowning | Drowning & floodwater rescue | WHO / Red Cross | UNVERIFIED | | |
| heat-exhaustion | Heat exhaustion | WHO heat-health / ICMR | UNVERIFIED | | |
| heat-stroke | Heatstroke | WHO heat-health / ICMR | UNVERIFIED | | |
| hypothermia | Hypothermia | Red Cross / NHS | UNVERIFIED | | |
| snake-bite | Snake bite | WHO snakebite / ICMR | UNVERIFIED | | |
| electric-shock | Electric shock | Red Cross | UNVERIFIED | | |
| anaphylaxis | Anaphylaxis | WAO / Resuscitation Council UK | UNVERIFIED | | |
| fainting | Fainting | Red Cross first aid | UNVERIFIED | | |
| choking | Choking | Red Cross choking guidance | UNVERIFIED | | |
| flood-safety | Flood safety | FEMA / NDMA | UNVERIFIED | | |
| cyclone-safety | Cyclone safety | IMD / NDMA | UNVERIFIED | | |
| what-to-pack | What to pack | NDMA / UNICEF | UNVERIFIED | | |
| find-shelter | Finding shelter | NDMA | UNVERIFIED | | |

**Specific points a reviewer must confirm, not just wording:**

- **CPR** — compression depth (5 cm), rate (≈2/sec) and compression:ventilation ratio vary by
  national resuscitation body. Confirm which guideline Tamil Nadu / India follows. Currently the
  app teaches compressions only, with no rescue breaths.
- **Snake bite** — the "do not use a tight tourniquet" line is deliberate and current international
  guidance; confirm it matches the advice a traveller will actually receive locally.
- **Heatstroke vs heat exhaustion** — the 30-minute threshold in the decision tree is a common
  heuristic, not a clinical threshold. Confirm.
- **Anaphylaxis** — adrenaline auto-injector positioning (outer mid-thigh) and the second-dose
  interval (10–15 min) must match local guidance.
- **Decision trees** — the 5 trees (bleeding, CPR, drowning, heatstroke, anaphylaxis) were
  written by us. They need a clinician to walk the branches and confirm no branch gives unsafe
  advice.

---

## 3. Places — `public/pack/places.json`

63 places extracted from OpenStreetMap (17 hospitals, 10 clinics, 4 police, 1 fire station,
4 pharmacies, 27 shelter **candidates**).

| ID range | Item | Source to check | Status |
| --- | --- | --- | --- |
| `hospital-*` | Hospital names/coords | Tamil Nadu Health Dept / Google Maps business listings | UNVERIFIED |
| `clinic-*` | Clinic names/coords | Same | UNVERIFIED |
| `police-*` | Police station names/coords | Tamil Nadu Police | UNVERIFIED |
| `fire_station-*` | Fire station coords | Tamil Nadu Fire & Rescue | UNVERIFIED |
| `pharmacy-*` | Pharmacy coords | Local licensing | UNVERIFIED |
| `shelter_candidate-*` | **Candidate** shelters (schools, temples, community centres) | Mamallapuram town panchayat / TN DRDA official shelter list | UNVERIFIED |

**Critical:** every `shelter_candidate` is a building that *might* be usable — a temple, a
school ground, a community hall. **None of them are designated shelters.** The app must never
present one as an official shelter without the unverified badge, and the 27 candidates should be
checked against the official DRDA/panchayat shelter list before any demo claims a real shelter
capacity.

OSM data itself is ODbL — attribution is required. See `DISCLOSURES.md`.

---

## 4. Zones — `public/pack/zones.geojson`

9 hand-drawn zones (Z1–Z9) for Mamallapuram + the Chennai coast. **These polygons are
approximate.** They were sketched against the region's OSM coastline and road network to make
the routing demo work; they are not surveyed flood boundaries.

| ID | Zone | Status |
| --- | --- | --- |
| Z1 | Mamallapuram seafront & beach | UNVERIFIED — approximate polygon |
| Z2 | Mamallapuram old town & fort | UNVERIFIED — approximate polygon |
| Z3 | Theewari & west settlement | UNVERIFIED — approximate polygon |
| Z4 | Salavankuppam & backwater lowlands | UNVERIFIED — approximate polygon |
| Z5 | Seven Pagodas complex & hills | UNVERIFIED — approximate polygon |
| Z6 | Kovalam coast | UNVERIFIED — approximate polygon |
| Z7 | ECR corridor & Injambakkam | UNVERIFIED — approximate polygon |
| Z8 | Thiruvanmiyur coast | UNVERIFIED — approximate polygon |
| Z9 | OMR inland corridor | UNVERIFIED — approximate polygon |

**To confirm:** replace with official municipal / flood-board inundation boundaries if they can be
obtained before the demo. Until then the `floodProne` flag is our best-effort judgement and must
be described as such.

---

## 5. Translated content — pending

`scripts/translate-pack.ts` produces machine translations that are marked
`machineTranslated: true, reviewed: false`. **None have been generated yet** (no `GEMINI_API_KEY`
in CI).

| Set | Locales | Status |
| --- | --- | --- |
| `public/pack/templates/<locale>.json` | ta, hi, fr, de, ar, zh, ja | NOT GENERATED |
| `public/pack/phrases/<locale>.json` | ta, hi, fr, de, ar, zh, ja | NOT GENERATED |
| `public/pack/kb/<locale>.json` | ta, hi, fr, de, ar, zh, ja | NOT GENERATED |
| `src/i18n/messages/<locale>.json` | ta, hi, fr, de, ar, zh, ja | NOT GENERATED |

**Machine-translated medical and alert text must be reviewed by a native speaker before it is
shown to anyone in a real crisis.** Until reviewed, the UI should prefer the English source or
show the English alongside.

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