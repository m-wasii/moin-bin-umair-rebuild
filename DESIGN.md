---
name: Moin Bin Umair
description: Warm cinematic filmmaker portfolio — ink stage, tungsten amber, Outfit display.
colors:
  ink: "#050a12"
  ink-soft: "#091120"
  paper: "#ffedd5"
  peach: "#ffedd5"
  white: "#ffffff"
  muted: "#e8b45a"
  line: "rgba(245, 158, 11, 0.26)"
  line-strong: "rgba(245, 158, 11, 0.52)"
  panel: "rgba(5, 10, 18, 0.72)"
  amber: "#f59e0b"
  amber-deep: "#d97706"
  orange: "#ff6b00"
  orange-deep: "#ea580c"
  tungsten: "#f59e0b"
  tungsten-deep: "#070d18"
  stage-base: "#050a12"
typography:
  display:
    fontFamily: "Outfit, Avenir Next, Segoe UI, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.02em"
    lineHeight: 0.88
  body:
    fontFamily: "DM Sans, Avenir Next, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  surface: "1.35rem"
  pill: "999px"
spacing:
  gutter: "clamp(1rem, 3vw, 3rem)"
  header-height: "5.25rem"
components:
  site-header-link:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
  project-card:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  contact-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
  skip-link:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
---

# Design System: Moin Bin Umair

## Overview

Incumbent visual world for the Moin Bin Umair portfolio: a **warm cinematic stage** — near-black ink field washed with amber/orange tungsten glows, peach/paper text, and large Outfit display type. The work (hero reel, film stills, photography) is the primary visual material; chrome stays translucent and quiet.

Creative north star: **Tungsten Stage** — film-set darkness lit by practical amber, not neon and not cream editorial.

Source of truth: CSS custom properties and patterns in `src/styles/global.css` (+ `src/styles/shorts.css`). Google Fonts load Outfit + DM Sans from `src/layouts/BaseLayout.astro`.

## Colors

### Primary (tungsten / amber)
- **Amber** `#f59e0b` (`--amber`, also `--tungsten`) — accents, lines, muted labels
- **Amber deep** `#d97706` (`--amber-deep`)
- **Orange** `#ff6b00` (`--orange`) — warmer stage glow companion
- **Orange deep** `#ea580c` (`--orange-deep`)
- **Muted** `#e8b45a` (`--muted`) — secondary body/meta on dark stage

### Neutral (stage / paper)
- **Ink** `#050a12` (`--ink`) — page ground
- **Ink soft** `#091120` (`--ink-soft`)
- **Paper / peach** `#ffedd5` (`--paper`, `--peach`) — primary text on stage; contact section ground
- **White** `#ffffff` (`--white`)
- **Panel** `rgba(5, 10, 18, 0.72)` (`--panel`) — glass header / overlays
- **Line** / **line-strong** — amber hairlines at 26% / 52% opacity

### Stage atmosphere
`--stage` composites multiple radial amber/orange glows over `--stage-wash` (deep navy/black vertical wash). Do not flatten to a single solid; do not replace with purple/indigo gradients.

### Contact inversion
`.contact` flips to peach ground with ink type; selection colors invert with it.

## Typography

- **Display:** Outfit 500–800 (`--font-display`) — section titles (uppercase, tight tracking), brand mark, ghost headlines
- **Body / UI:** DM Sans 400–600 (`--font-sans`) — body, nav, meta, buttons
- Body size ~`1.125rem` / line-height `1.5` on `body`
- Section H2: `clamp(4rem, 9vw, 10rem)`, weight 700, line-height ~0.88, uppercase
- Ghost display behind sections: huge Outfit 800 at ~5.5% opacity
- Labels/meta: uppercase, weight 600, small sizes (`0.75rem`–`0.875rem`)

Do not introduce Inter, Roboto, system-ui-as-primary, or serif “editorial brochure” faces.

## Layout

- Horizontal rhythm via `--gutter: clamp(1rem, 3vw, 3rem)`
- Fixed header height `--header-height: 5.25rem`; `scroll-padding-top` accounts for it
- Hero is full-bleed viewport media (video + veil + grain); brand/orbit/tagline live in the stage — not carded media
- Work sections use mosaic / uniform project grids (`project-grid`, 12-col or 2-col uniform)
- Photography: album tiles → overlay gallery (not card stacks in the hero)
- Breakpoints in use include ~960px and ~1320px (compact header / grid collapse)
- One job per section: heading + short description + media grid

## Elevation & Depth

- Depth comes from **stage glows**, full-bleed media, and soft glass (`backdrop-filter` on header/overlays), not multi-layer drop-shadow stacks
- Header: frosted panel + soft shadow `0 1rem 2.5rem rgba(5, 10, 18, 0.32)`
- Dialogs/overlays: deep dim + blur; video dialog shadow `0 2rem 8rem rgba(0, 0, 0, 0.5)`
- Prefer tonal layering (ink → panel → paper) over decorative neon glow

## Shapes

- Surface radius: `--radius: 1.35rem` on project cards, dialogs, media frames
- Pills: `999px` for lang toggle, chips, contact pills, small chrome
- Avoid zero-radius broadsheet rules as a system; hairline amber borders (`--line`) are the divider language

## Components

### Navigation (`SiteHeader`)
- Fixed frosted bar; brand is Outfit/DM Sans weight 600 with slight optical bump
- Links: uppercase-ish quiet labels, hover softens to muted/amber
- Desktop: persistent **Get in touch** pill CTA in the header end (hidden under compact/hamburger breakpoint)
- Mobile: full-screen nav panel; body locks scroll when open; Contact remains in primary nav

### Hero
- Full-bleed looping reel + veil + grain (Experience mode: artifact leads)
- **Brand is the hero signal:** visible Outfit display name (`hero__title`), not only nav/sr-only
- One supporting tagline + dual CTA group: filled amber **Explore the work** + underlined **Get in touch**
- Orbiting SVG text (“Still · Motion · Story · …”) as atmosphere, not a competing headline
- No stat strips, cards, or floating badges on media

### Project cards / film tiles
- Radius `--radius`; image-led; play affordance strengthens on hover/focus (wash deepens, play chip snaps to orange)
- Uniform 16:9 tiles in Indie/Art and Local Films where specified
- Capped sibling stagger on reveal (`--card-index`, max 5 steps) — continuity, not a second focal moment

### Explore bridges
- Slim between-section rails (`ExploreBridge`): next-section jump + contact path
- Used after Local Films → Photography and after Shorts → Contact to deepen exploration and enquiry without new marketing copy claims

### Photography
- Album covers open overlay collections; lightbox chrome stays minimal and on-token

### Shorts
- Vertical-aware layouts in `shorts.css`; campaign groupings; still Outfit/DM Sans + amber system

### Contact
- Peach field, ink type; **Email** is the primary filled tungsten action (`text-link--primary`); phone/WhatsApp stay as amber rows; socials stay pills
- Enquiry hierarchy: primary email → other touch links → follow along

### Motion (engagement refine within Tungsten Stage)
- **Focal moment:** hero reel settle + brand/CTA stage rise (blur→sharp), not identical fades on every section
- Supporting: capped grid stagger; stronger project-tile hover feedback; short UI transitions (~180–280ms)
- Global `prefers-reduced-motion` kill-switch in `global.css` + `site.ts`
- Keep performance-first and **not photography-biased**; preview experimental Worker deploys on **`mbu-eng`** only until promoted

## Engagement goals (locked)

Primary: deeper project exploration + contact/CTA clicks. Palette tokens stay fixed; weight/contrast/placement may change. World remains Tungsten Stage (refine, not redesign).

## Do's and Don'ts

### Do:
- **Do** keep brand name / work as the first-viewport signal on Experience surfaces.
- **Do** reuse `--ink`, `--paper`, `--amber` / `--orange`, `--radius`, and Outfit + DM Sans.
- **Do** let media go full-bleed; keep chrome translucent and secondary.
- **Do** keep dual paths into work and contact discoverable from hero, header, and mid-scroll bridges.
- **Do** respect reduced motion and keep new motion CSS/JS lean.
- **Do** preview experimental engagement motion on Worker **`mbu-eng`** only.

### Don't:
- **Don't** invent a purple / indigo / glow-AI palette or warm-cream serif “editorial” rebrand.
- **Don't** put cards, promo chips, or badges over the hero media.
- **Don't** bias scroll engagement toward photography alone — site-wide, section-agnostic.
- **Don't** deploy motion experiments to production `mbu` without explicit promotion.
- **Don't** add Inter/Roboto/system stacks or generic SaaS dashboard chrome to the public site.
