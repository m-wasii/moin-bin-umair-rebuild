---
name: Moin Bin Umair
description: Contact Sheet — darkroom proof-strip portfolio; amber safelight primary; Saira Condensed + Karla.
colors:
  ink: "#0a0a0a"
  ink-soft: "#121212"
  paper: "#f2efe8"
  white: "#ffffff"
  muted: "#c4a574"
  line: "rgba(242, 239, 232, 0.16)"
  line-strong: "rgba(245, 158, 11, 0.55)"
  panel: "rgba(10, 10, 10, 0.92)"
  amber: "#f59e0b"
  amber-deep: "#d97706"
typography:
  display:
    fontFamily: "Saira Condensed, Arial Narrow, Segoe UI, sans-serif"
    fontWeight: 700
    letterSpacing: "0.02em"
    lineHeight: 0.9
  body:
    fontFamily: "Karla, Avenir Next, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Saira Condensed, Arial Narrow, Segoe UI, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  surface: "0.2rem"
  pill: "0.2rem"
spacing:
  gutter: "clamp(1rem, 3vw, 2.75rem)"
  header-height: "4.5rem"
---

# Design System: Moin Bin Umair — Contact Sheet

## Overview

Replacement visual world for the public Experience portfolio: a **photographic contact sheet / darkroom proof strip**. Near-black matte ground, thin paper-edge frames, condensed film-strip type, and locked amber `#f59e0b` as safelight / grease-pencil select. Tungsten Stage (multi-glow ink stage, frosted pill nav, Outfit/DM Sans, orbit widget, peach contact invert) is the anti-reference.

Creative north star: **Contact Sheet** — work is a continuous strip of frames; enquiry is a print request.

Seed: `cc8c0df9` · grounded list #5 · Experience mode.

## Colors

### Primary (locked)
- **Amber** `#f59e0b` — sole primary accent (CTAs, active marks, meta)
- **Amber deep** `#d97706` — hover / pressed

### Neutrals
- **Ink** `#0a0a0a` — darkroom ground
- **Paper** `#f2efe8` — text on dark; contact print-order ground
- **Muted** `#c4a574` — secondary labels
- **Line** — paper hairlines at ~16% opacity

### Atmosphere
`--stage` is a quiet vignette over a matte wash — not a stack of amber radial glows.

## Typography
- **Display:** Saira Condensed 500–700 — brand, section titles, strip labels
- **Body / UI:** Karla 400–700
- Do not use Outfit, DM Sans, Inter, or cream-serif editorial stacks

## Layout
- Full-bleed hero reel; brand + dual CTAs anchored to bottom edge rule
- Edge-strip header (full-bleed bar), not floating pill
- Contact-sheet grids with sharp `--radius: 0.2rem` frames
- Explore bridges as strip continuations between section bands
- Compact header ≤1320px

## Components
- **Header:** strip links + amber underline indicator; solid amber Get in touch
- **Hero:** edge label “Proof sheet · Select a frame”; condensed brand; Explore / Get in touch
- **Frames:** project/album tiles with thin borders; play chip as amber select mark
- **Contact:** paper ground print-order form; Email primary filled amber

## Motion
- Focal: hero reel settle + stage rise
- Supporting: capped frame stagger; frame lift on hover
- Honor `prefers-reduced-motion`

## Engagement
Primary goals: deeper project exploration + contact/CTA clicks. Paths: hero dual CTAs, header contact, bridges, Email primary.

## Do's and Don'ts
### Do
- Keep amber `#f59e0b` as the only primary accent
- Let media lead; chrome stays strip-thin
- Preview experimental Worker on **`mbu-eng`** only

### Don't
- Restore Tungsten Stage glows, pills, orbit, or Outfit/DM Sans
- Invent awards, logos, or testimonials
- Touch the dashboard Operate surface
- Deploy engagement experiments to production `mbu` without approval
