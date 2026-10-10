# Preloaded content pack — `public/pack/`

This directory holds the **content pack**: the data every Kavach device already
has before it ever needs a network. It is the single source of truth for offline mode.

Built with:

```bash
npm run pack:build                  # fetch from Overpass (uses .cache/osm)
npm run pack:build -- --offline     # sample data only, no network
npm run pack:build -- --refresh     # ignore cache, re-query Overpass
npm run pack:build -- --manifest-only
```

| File | Size | Contents |
| --- | --- | --- |
| `manifest.json` | ~1 KB | Version, build time, region, and every file with size + SHA-256 |
| `places.json` | ~17 KB | 63 OSM places: hospitals, clinics, police, fire, pharmacies, **shelter candidates** |
| `roads.json` | ~785 KB | Offline road graph, 15 599 nodes / 18 292 edges, packed as tuples |
| `zones.geojson` | ~7 KB | 9 hand-drawn alert zones `Z1`–`Z9` with a `floodProne` flag |
| `contacts.json` | ~2 KB | Emergency numbers + a placeholder consulate list |
| `kb/en.json` | ~22 KB | 17 first-aid/disaster chunks + 5 decision trees |
| `templates/en.json` | ~9 KB | Alert templates for `FL`/`CY`/`HT`/`WN`/`LS`/`AC` × levels 1–4 |
| `phrases/en.json` | ~7 KB | 40 emergency phrases in 6 categories |

**Total: ~848 KB uncompressed**, which fits comfortably on a tourist's phone on
hotel wi-fi and precaches in under a second on 4G.

## Offline behaviour of the pack

- The service worker caches this directory with **stale-while-revalidate**, so the
  pack is always available instantly and refreshes quietly in the background.
- It is deliberately **not** in the install-time precache — a 785 KB road graph must
  not block the app becoming usable.
- The app falls back to whatever is cached when the network is gone (M3 wires this
  up; M2 only produces the files).

## Rules for anything in this directory

1. **Never fabricate safety data.** Phone numbers, shelter coordinates and medical
   instructions must carry `verified: false` until a qualified human has checked
   them, and must be listed in [`TODO_VERIFY.md`](../../TODO_VERIFY.md).
2. **A place tagged `shelter_candidate` is NOT a designated shelter.** It is a
   school, temple or community hall that *might* be usable. The UI must show an
   unverified badge.
3. **`sample: true` means the build ran offline.** The UI must refuse to present
   sample data as real.
4. **Offline is the target, not the exception.** The pack must always be a
   complete, self-sufficient snapshot.
5. **Small.** Every byte is downloaded before the storm. `roads.json` has a
   1.5 MB budget enforced in `tests/pack.test.ts` and by the build script.

Data is kept in git (text JSON only) so the pack is reviewable in pull requests.
Binary tiles (`.pmtiles`/`.pbf`) are gitignored and rebuilt.

## Attribution

`places.json` and `roads.json` are derived from OpenStreetMap data, © OpenStreetMap
contributors, licensed **ODbL 1.0**. See [`DISCLOSURES.md`](../../DISCLOSURES.md).