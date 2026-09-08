---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: ["src/pages/de/index.astro"]
---

# Surface: Public portfolio home

## Scope
Primary targets: `src/pages/index.astro`, `src/pages/de/index.astro` (shared `HomePage` composition).

## Mode
Experience — the visitor is inside the work; films, stills, and shorts lead; interface chrome recedes.

## Audience & job
Visitors browsing a filmmaker/photographer portfolio to experience Moin’s work, then optionally enquire.

## Constraints (locked)
- Performance-first engagement motion when implemented
- Site-wide motion with **no photography bias**
- Preview Worker **`mbu-eng` only** (do not deploy motion experiments to production `mbu`)
- Preserve incumbent Tungsten Stage visual language (DESIGN.md) — no purple-glow AI redesign

## Motion
Site-wide mid-viewport pop/drift on all work media (`data-engage`), equal intensity, preview on `mbu-eng` only. Contact uses `data-engage="calm"`.

## Planned next commands
`/impeccable audit` after each motion revision; `/impeccable live` only if visual steering is needed.
