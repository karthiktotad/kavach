# Preloaded content pack — `public/pack/`

This directory holds the **content pack**: the data every Kavach device already
has before it ever needs a network.

Ships here in **M2**, built by `scripts/build-pack.mjs`:

| File | Contents |
| --- | --- |
| `pack.json` | Manifest: version, region id, locale list, per-file sizes + checksums |
| `zones.json` | Hazard zones with ids, polygons and the codes used in signed packets |
| `shelters.json` | Shelters, hospitals, police, first-aid points (`verified` flag per entry) |
| `hazards.json` | Hazard polygons (flood-prone lowlands, canal/river buffers) as GeoJSON |
| `roadgraph.json` | Node/edge graph for offline hazard-aware routing |
| `firstaid.json` | Deterministic first-aid knowledge base |
| `phrasebook.json` | Show-a-local phrases in 8 languages |
| `templates.json` | Alert templates per hazard × level, in 8 languages |

## Rules for anything in this directory

1. **Never fabricate safety data.** Phone numbers, shelter coordinates and
   medical instructions must carry `verified: false` until a qualified human has
   checked them, and must be listed in [`TODO_VERIFY.md`](../../TODO_VERIFY.md).
2. **Offline is the target, not the exception.** The service worker caches this
   directory with a stale-while-revalidate strategy, so it must always be a
   complete, self-sufficient snapshot.
3. **Small.** Every byte here is downloaded by tourists on hotel wi-fi before the
   storm. Budget is checked by the build script.

The directory is kept in git (text JSON only) so the content pack is reviewable
in pull requests. Binary tiles (`.pmtiles`/`.pbf`) are gitignored and rebuilt.