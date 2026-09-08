# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Visitors browsing a filmmaker and photographer portfolio — commissioners, collaborators, and peers who want to experience Moin Bin Umair’s work quickly, then dig into films, stills, and shorts without dashboard friction.

Secondary audience (Operate surface, not the public Experience mode): Moin (and trusted editors) using the Cloudflare Access–protected dashboard to manage videos, photo albums, and shorts.

## Product Purpose

A single-page Astro portfolio for filmmaker **Moin Bin Umair** (Berlin). It presents indie/art films, local films, photography albums, BTS & trailers, and short-form campaigns so visitors can watch and browse the work itself. Success means the artifact leads: media is immediate, navigation stays quiet, and enquiries are one clear step away.

## Positioning

A warm cinematic personal portfolio for a working filmmaker — real Vimeo/YouTube films and R2-hosted photography — not a generic agency template, SaaS landing page, or AI-generated “creative studio” brochure.

## Operating Context

- Public site (EN/DE): `/` and `/de/` — one long-scroll Experience surface with section anchors (Indie / Art, Local Films, Photography, BTS & trailers, Shorts, Contact).
- Editor dashboard on a separate hostname (`dashboard.*`) behind Cloudflare Access (Google allowlist only); content writes to the `MEDIA` R2 bucket (`moin-media`).
- Local: `npm run dev` (Astro); photo uploads in dev land under `.data/media/` (gitignored).
- Production Workers: `mbu` (site) and `dashboard`; shared R2 binding `MEDIA`.

## Capabilities and Constraints

- **Stack:** Astro + Cloudflare Workers (`nodejs_compat`), Wrangler, R2 media, EN/DE i18n.
- **Performance-first:** prefer CSS/scroll-driven or lightweight JS; avoid heavy animation libraries and photography-biased scroll hijacking.
- **Planned engagement motion (locked):** site-wide engagement motion with **no photography bias**; preview only on Worker name **`mbu-eng`** (`wrangler deploy --name mbu-eng`). Do **not** deploy motion experiments to production `mbu` until explicitly approved.
- **Primary color locked:** amber `#f59e0b` remains the sole primary accent across worlds.
- **Visual world (Experience):** **Contact Sheet** — darkroom proof-strip grammar (see `DESIGN.md`). Tungsten Stage is retired as anti-reference for the public site.
- Reject purple-glow / generic AI-slop redesigns.
- **Media:** films via Vimeo/YouTube embeds; stills and hero reel from R2 via `/media/...` routes — binaries are not shipped in Worker ASSETS.
- **Do not invent** client logos, awards, testimonials, or case-study metrics that are not already in the repo.

## Brand Commitments

- Brand name: **Moin Bin Umair** (short: **MBU**). Brand must read as a hero-level signal on Experience surfaces; chrome must not outrank the work or the name.
- Voice: concise filmmaker language (“Filmmaker · Visual storyteller”; contact: “Let’s make something worth watching.”).
- Location / contact facts live in `src/data/site.ts` (Berlin, email, phone, WhatsApp, Instagram, LinkedIn, Vimeo).
- Bilingual EN/DE copy in `src/i18n/`; keep parity when adding UI strings.

## Evidence on Hand

- Real project/film metadata: `src/data/projects.ts`, `videos.seed.json`
- Photography albums/seeds: `src/data/photos.ts`, `photos.seed.json`
- Shorts: `src/data/shorts.ts`, `shorts.seed.json`
- Site chrome & contact: `src/data/site.ts`
- Visual system source of truth: `src/styles/global.css`, `src/styles/shorts.css`, components under `src/components/`
- Hero reel keys: `media/hero-loop.mp4`, `media/hero-poster.webp` (R2; local seed under `.data/media/`)

## Product Principles

1. **Work leads** — Experience mode: media and atmosphere first; UI chrome recedes.
2. **Performance before flourish** — motion must earn its cost; respect `prefers-reduced-motion`.
3. **One visual language** — extend the existing warm cinematic system; do not invent a parallel brand.
4. **Preview safely** — experimental engagement motion ships only to `mbu-eng` until promoted.
5. **Truthful content** — only real films, stills, and contact details already in the product.

## Accessibility & Inclusion

- Skip link, focus-visible outlines, `sr-only` titles where visual brand replaces a visible H1, and bilingual UI are established patterns — preserve and extend them.
- Honor reduced-motion preferences for any new engagement motion.
