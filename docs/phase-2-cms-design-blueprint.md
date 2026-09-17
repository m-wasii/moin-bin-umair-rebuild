# Phase 2 — CMS Redesign Blueprint

**Status:** Design complete · no application code changed  
**Scope:** Product definition, information architecture, interaction model, Phase 3 plan  
**Public site studied:** https://mbu.wasi-workdesk.workers.dev/  
**Architecture source of truth:** Phase 1 verified baseline  

---

## 1. Product definition

### What this product is

A **specialized creative portfolio CMS**: a single-operator content-operations console for Moin Bin Umair’s public filmmaker/photography site.

It is:

- a **content operations console** for the live portfolio catalogs in R2  
- a **media management workspace** for owned photo and Shorts assets  
- a **site surface controller** for singleton presentation assets (Hero)

It is **not**:

- a general-purpose enterprise CMS  
- a multi-tenant SaaS CMS  
- a collaborative publishing platform  
- a website builder or page composer  
- a schema/builder toolkit  

### Architectural identity (from Phase 1)

```
One Astro app → two Workers → shared R2 MEDIA binding
Public Worker serves HTML
Dashboard mutations write R2 catalogs + trigger public HTML purge/warm
Cloudflare Access + JWT protect dashboard host
Public /api → redirects to Access-gated dashboard API
```

### Design implications

| Implication | Consequence |
|---|---|
| Single operator | No RBAC UI, no presence, no approval queues |
| Catalog + cache publish model | Status = saved → refreshing → live (not draft/review) |
| Content architecture already exists | CMS mirrors public entities; do not invent a generic “Entries” model |
| Access is the login | Settings stay thin; identity is external |
| Media is visual | Photography and Shorts deserve grid/inspector patterns, not only tables |
| Mutations are consequential | Confirm destructive actions; surface publish/cache outcome |

### Decision frame used throughout

For each major choice:

- **CURRENT PROBLEM**  
- **PROPOSED SOLUTION**  
- **WHY**  
- **TRADEOFF**  
- **FUTURE IMPACT**

---

## 2. Current UX diagnosis

### What the dashboard is today

A thin **Videos + Photos CRUD shell**:

- Top bar: Videos | Photos | View site  
- Root `/dashboard` = Videos (no Home)  
- Forms stacked above lists  
- Drag-handle reorder  
- Create-focused; edit surfaces incomplete  

### Gaps as symptoms (not separate products)

| Observed gap | Underlying symptom |
|---|---|
| No video edit UI (API PATCH exists) | Create-form IA; no edit destination pattern |
| No photo metadata edit/replace | Same; list/delete without inspector |
| Shorts CMS absent | Nav only models two CRUD pages, not public content set |
| Hero CMS absent | Site presentation treated as deploy-time, not operable content |
| Album rename/delete absent | Albums treated as upload targets, not managed entities |
| Weak search/filter | Catalog assumed small; no discovery model |
| CAS/`rev` often omitted in UI | Optimistic concurrency is backend-only |
| No Home/workspace | Product framed as “admin pages,” not an operations console |
| Basic feedback | Success = form status text; no publish lifecycle language |

**Root cause:** the product was built as **two CRUD pages for the entities that had APIs**, not as a **console for the portfolio’s full content architecture**.

---

## 3. Research findings

Patterns studied from current product docs/interfaces (Sanity Studio, Directus, Contentful, Storyblok/Strapi patterns, Linear/GitHub-style ops UX) plus WCAG 2.2 and OWASP ASVS admin guidance. **Do not copy any vendor.**

### Useful patterns and why they work

| Pattern | Source inspiration | Why it works here |
|---|---|---|
| Structure navigation by editorial workflow / domain, not raw schema dump | Sanity Structure Builder | Matches public site domains (Films, Photography, Shorts, Site) |
| Shallow nav + filtered lists | Sanity, Contentful | Catalogs are hundreds of items, not millions |
| Media grid + detail/inspector | Directus files drawer, Contentful asset editor | Photography is visual-first |
| Singleton editors for site settings | Sanity singleton docs | Hero is a singleton, not a list |
| Calm, sparse chrome; primary action obvious | Linear / modern ops UIs | Single operator needs speed, not feature density |
| Saved views / filters only when lists grow | Contentful Media views | Useful later; overkill for Core Now |
| Dragging + non-drag alternative | WCAG 2.2 SC 2.5.7 | Reorder is core; must have click/keyboard alternatives |
| Admin MFA / Access + mutation auth | OWASP ASVS 4.3.x / CSRF guidance | Already on Access + JWT; redesign must not weaken this |

### Patterns explicitly rejected for this product

- Multi-space / environment switchers (Contentful spaces)  
- Schema builders / collection builders (Strapi builder mindset)  
- Visual page builders (Storyblok-style blocks as primary)  
- Heavy collaboration (comments, assignments, roles)  
- Draft → review → schedule pipelines without storage support  

---

## 4. Content model from the user’s perspective

### PUBLIC → R2 → DASHBOARD map

| Public presentation | R2 / data | Dashboard today | Should be CMS-managed? |
|---|---|---|---|
| Hero loop + poster | `media/hero-loop.mp4`, `media/hero-poster.webp`, `catalog/hero.json` | None | **Yes** |
| Hero copy / orbit / CTAs | i18n + `site.name` | None | **No** (code/i18n) |
| About section | components + i18n | None | **No** (editorial site copy) |
| Indie / Local / BTS video grids | `catalog/videos.json` by `category` | Videos CRUD (create/reorder/delete; edit UI gap) | **Yes** |
| Photography albums | `catalog/photo-categories.json` + photos | Create album + upload + reorder | **Yes** (rename/delete missing) |
| Photo lightbox media | `photos/{category}/{slug}.webp` + `catalog/photos.json` | Upload/delete/reorder | **Yes** (metadata edit/replace missing) |
| Shorts campaigns + standalone | `catalog/shorts.json` + `shorts/*` | None | **Yes** |
| Contact / socials | `src/data/site.ts` | None | **Not now** (rare change; code-owned) |
| EN/DE chrome strings | i18n | None | **No** |
| Section order / layout heuristics | components (e.g. photo hero spans) | None | **No** |

### Entity definitions

#### VIDEOS

- **Represents:** Hosted film projects (Vimeo/YouTube) shown in Indie / Local / BTS sections  
- **Nav:** Films → Videos (or top-level Videos)  
- **Primary ops:** Add URL, edit metadata, reorder within category, delete, toggle featured  
- **Secondary:** Open source URL, preview on site section, copy public deep link  
- **Relationships:** Belongs to one fixed category (`indie` \| `local` \| `bts`); categories are **site structure**, not freeform albums  
- **Metadata:** title, year, duration, description, featured, thumbnail (from provider), sortOrder  
- **Lifecycle:** Create → enrich → catalog save → cache refresh → live  
- **Visual:** Thumbnail table/hybrid list  
- **Discovery:** Filter by category, featured, year, text search  
- **Editing complexity:** Medium (few fields + preview)

#### PHOTOS

- **Represents:** Individual stills inside an album  
- **Nav:** Photography workspace (not a separate top-level forever)  
- **Primary ops:** Upload, reorder, edit title/alt, replace file, delete  
- **Secondary:** Select / bulk delete, open public album  
- **Relationships:** Belongs to one Album  
- **Metadata:** title, alt, src/v, slug, category  
- **Lifecycle:** Upload/process WebP → catalog → refresh → live  
- **Visual:** Media grid  
- **Discovery:** By album first; then title/alt search within album  
- **Editing complexity:** Low fields, high visual judgment

#### ALBUMS

- **Represents:** Public photography collections (Trieste, Fashion, …)  
- **Nav:** Same Photography workspace (album rail / picker)  
- **Primary ops:** Create, rename, reorder albums, open album  
- **Secondary:** Delete album (with clear empty/cascade rules), preview on site  
- **Relationships:** Contains many Photos  
- **Metadata:** slug, label, order  
- **Lifecycle:** Create → populate → reorder → (rare) rename/delete  
- **Visual:** Album cards + ordered list  
- **Discovery:** Small set (~10); search optional  
- **Editing complexity:** Low, but delete is high-risk

#### SHORTS

- **Represents:** Vertical/short-form entries: **campaigns** (multi-clip) and **standalone** singles  
- **Nav:** Shorts (first-class)  
- **Primary ops:** Create campaign/single, manage clips (upload/order), edit title/year, reorder entries  
- **Secondary:** Preview clip, replace poster/src, delete clip/entry  
- **Relationships:** Entry → clips[]; campaigns vs singles derived from clip count  
- **Metadata:** slug, title, year, sortOrder, clip media dims/duration  
- **Lifecycle:** Asset upload → catalog → refresh → live  
- **Visual:** Campaign cards + clip strip  
- **Discovery:** Campaign vs standalone filter + text  
- **Editing complexity:** High (media + structure)

#### HERO

- **Represents:** The singleton home hero media pair (loop + poster)  
- **Nav:** Site → Hero  
- **Primary ops:** Replace loop, replace poster, preview, confirm live version  
- **Secondary:** Open public home  
- **Relationships:** None (singleton)  
- **Metadata:** version fingerprint (`catalog/hero.json` + object etags)  
- **Lifecycle:** Replace bytes → touch version → purge/warm → live  
- **Visual:** Full-bleed preview workspace  
- **Discovery:** N/A  
- **Editing complexity:** Low fields, high visual QA

### Grouping decisions

| Question | Decision | Why |
|---|---|---|
| Photos + Albums together? | **Yes — one Photography workspace** | Public site presents “Photography” as albums; operators think in albums then photos |
| Videos + Shorts together? | **No shared workspace; adjacent in nav** | Different media ownership, UI, and public sections; merging would create a confused hybrid editor |
| Hero under Site? | **Yes** | Not a catalog list; it is site presentation control |

---

## 5. Information architecture options

### Option A — Flat content types

```
Home
Videos
Photos
Shorts
Hero
Activity
```

- **Grouping:** None; one nav item per entity  
- **Strengths:** Extremely clear; maps 1:1 to catalogs  
- **Weaknesses:** Photos vs Albums awkward (Photos page becomes overloaded again); Hero looks like a “list type”  
- **Scalability:** Fine until more site singletons appear  
- **Complexity:** Lowest  

### Option B — Domain workspaces (recommended)

```
Home
Films
  └ Videos
Photography
  ├ Albums (structure)
  └ Photos (inside selected album)
Shorts
Site
  └ Hero
Activity (lightweight)
```

- **Grouping:** Matches public mental model (Films / Photography / Shorts / Site)  
- **Strengths:** Fixes Photos+Albums split; Hero correctly singleton; Shorts first-class without bloating Films  
- **Weaknesses:** One extra nesting level vs today’s two links  
- **Scalability:** Room for future Site items (e.g. contact) without polluting content lists  
- **Complexity:** Moderate  

### Option C — Task / ops oriented

```
Home
Content
Media
Site
Activity
Settings
```

- **Grouping:** By task abstraction  
- **Strengths:** Familiar SaaS shape  
- **Weaknesses:** “Content” vs “Media” is artificial here (photos/shorts are both); forces generic CMS language onto a portfolio console  
- **Scalability:** Looks scalable but adds cognitive translation cost  
- **Complexity:** Highest for this product size  

---

## 6. Recommended information architecture

**Choose Option B — Domain workspaces.**

### CURRENT PROBLEM
Nav only exposes Videos and Photos, so live Shorts/Hero (and album management depth) are invisible.

### PROPOSED SOLUTION
Sidebar workspaces aligned to how the public site is understood: Films, Photography, Shorts, Site — plus Home and later Activity.

### WHY
Operators manage a portfolio, not abstract “entries.” Photography already behaves as album→grid on the public site. Hero is a site singleton. Shorts are a distinct public section with a distinct data shape.

### TRADEOFF
Slightly more navigation structure than today’s two links; Films currently has only Videos (Shorts stays sibling, not child).

### FUTURE IMPACT
Phase 3 can ship shell + Photography unification first, then Shorts/Hero surfaces, without redoing IA.

---

## 7. Navigation proposal

### Sidebar (desktop ≥1024)

```
[MBU]

Home

FILMS
  Videos

PHOTOGRAPHY
  (opens Photography workspace; album list is contextual)

SHORTS

SITE
  Hero

────────
Activity          (Phase 3.5 / Useful Later)
View public site  (external)
```

### Principles

- Emphasize **domain workspaces**, not generic “Content/Media”  
- Active state: workspace + optional child  
- Breadcrumbs inside workspaces: e.g. `Photography / Fashion`  
- Contextual back: album → photography root; video editor → videos list  
- Global actions: **Quick create** (video / photo upload / short) + **View site**  
- Mobile: bottom or top app bar with workspaces in a sheet; no persistent wide sidebar  

### Content types vs tasks

Prefer **content-domain destinations** with **task actions inside** (Create, Reorder, Replace). Task-only top nav would hide Shorts/Hero behind vague labels.

---

## 8. Home proposal

### CURRENT PROBLEM
Root redirects to Videos; no orientation, no publish awareness, no unmanaged-content signal.

### PROPOSED SOLUTION
A real Home that answers: **“What needs my attention?”** — not analytics.

### Home contents (exact)

| Block | Purpose |
|---|---|
| Publish status | Last successful catalog save + cache refresh state (ok / refreshing / failed) |
| Hero snapshot | Current poster + “Replace” CTA |
| Counts | Videos · Albums · Photos · Shorts (campaigns/singles) |
| Attention | Failed refreshes; empty albums; Shorts/Hero unmanaged until those UIs ship |
| Quick create | Add video · Upload photos · New short |
| Recent activity | Last N mutations (when Activity exists); until then omit rather than fake |

### Explicitly not on Home

- Decorative charts  
- Traffic analytics  
- Marketing tips  
- Multi-widget SaaS clutter  

### WHY
Single operator needs orientation and gaps, not dashboards theater.

### TRADEOFF
One more route before the most-used list (Videos). Mitigate with Quick create + “Continue in Videos.”

### FUTURE IMPACT
Home becomes the place to surface publish failures from purge/warm without inventing a separate monitoring product.

---

## 9. Videos workspace concept

### Primary interface: **Hybrid table + side drawer**

| Region | Content |
|---|---|
| Header | Title, count, Add video |
| Filter bar | Category tabs (All / Indie / Local / BTS), Featured, search |
| List | Thumbnail · Title · Category · Year · Duration · Featured · handle |
| Drawer | Edit fields + preview + Save / Delete |

### Why not full-page only
Field count is small; drawer preserves list context and reorder.

### Why not grid only
Videos are catalogued more like projects than stills; metadata comparison matters.

### Decision block

- **CURRENT PROBLEM:** Create form on page; no edit UI despite PATCH  
- **PROPOSED SOLUTION:** List-first + drawer editor; create opens same drawer empty  
- **WHY:** Matches task (scan → tweak → reorder)  
- **TRADEOFF:** Less space for huge descriptions (rare here)  
- **FUTURE IMPACT:** Same drawer pattern reusable for photo metadata  

---

## 10. Photography workspace concept

### Primary interface: **Album navigation + media grid + right inspector**

```
┌────────────┬─────────────────────────────┬──────────────┐
│ Albums     │  Fashion · 32               │ Inspector    │
│ rail       │  [Upload] [Reorder]         │ preview      │
│            │  ▦ ▦ ▦ ▦                    │ title / alt  │
│            │  ▦ ▦ ▦ ▦                    │ replace      │
│            │                             │ delete       │
└────────────┴─────────────────────────────┴──────────────┘
```

### Album management

- Reorder albums in rail (drag + move up/down)  
- Create / rename in place or small dialog  
- Delete only with confirmation + rule (block if photos remain, or explicit cascade — decide in Phase 3 with API)  

### Why this pattern

- Matches public album→lightbox mental model  
- Grid is the correct density for stills  
- Inspector avoids page-per-photo for 2 fields  

### Decision block

- **CURRENT PROBLEM:** Albums and photos are one crowded page of forms  
- **PROPOSED SOLUTION:** Unified Photography workspace  
- **WHY:** Operators browse by album; metadata is secondary  
- **TRADEOFF:** Harder on narrow screens (inspector becomes bottom sheet)  
- **FUTURE IMPACT:** Bulk select/delete becomes natural  

---

## 11. Shorts workspace concept

### Primary interface: **Campaign/single cards → detail workspace**

1. **Index:** Campaigns section + Standalone section (mirrors public site)  
2. **Detail:** Title/year + clip strip (order, upload, poster, duration) + preview  

### First-class without bloat

- Top-level Shorts nav (not buried under Videos)  
- No fake “channels,” tags, or analytics  
- Campaign = entry with ≥2 clips; Single = 1 clip (existing model)

### Decision block

- **CURRENT PROBLEM:** Public Shorts exist; CMS cannot manage them  
- **PROPOSED SOLUTION:** Dedicated Shorts workspace matching campaign/single split  
- **WHY:** Removes the largest content/CMS mismatch  
- **TRADEOFF:** Requires new APIs/UI in Phase 3+ (store already exists)  
- **FUTURE IMPACT:** Completes motion content coverage  

---

## 12. Hero workspace concept

### Primary interface: **Singleton full-width preview editor**

- Large live preview (poster + optional muted loop)  
- Replace poster / replace loop  
- Version / live indicator  
- Publish status after replace  
- Link: View public home  

### Decision block

- **CURRENT PROBLEM:** Hero is live but unmanaged in dashboard  
- **PROPOSED SOLUTION:** Site → Hero singleton  
- **WHY:** Highest-visibility asset; replacement must be deliberate and previewable  
- **TRADEOFF:** Another nav item for one pair of files  
- **FUTURE IMPACT:** Pattern for other future singletons without a “settings dump”  

---

## 13. Editing model

### Philosophy

One **editing grammar**, many surfaces:

| Surface | Use when |
|---|---|
| Inline | Tiny toggles (featured), rare |
| Drawer | ≤8 fields + small preview (Videos, photo meta) |
| Inspector (persistent) | Selection-driven media (Photos) |
| Modal/dialog | Confirmations, rename, short create |
| Dedicated page | Shorts entry detail; Hero singleton |
| Full-screen | Optional Shorts clip focus / Hero QA on mobile |

### Rules

- Unsaved changes: block navigate; confirm discard  
- Mobile: drawers → full-height sheets  
- Media preview always adjacent to the fields that describe it  
- Do not invent a unique editor chrome per entity  

---

## 14. Search / discovery model

### Smallest system for hundreds of items

1. **Contextual search** in each workspace (title/alt/url)  
2. **Workspace filters:** category, featured, campaign/single, album  
3. **Sort:** manual order (default), title, year  
4. **Global search (Useful Later):** jump to video/photo/short by title  

### Not in scope

- Enterprise search, facets across tenants, saved views (until lists hurt)  

### Decision block

- **CURRENT PROBLEM:** Hard to find items as catalogs grow  
- **PROPOSED SOLUTION:** Per-workspace search + a few filters first  
- **WHY:** Matches where operators already are  
- **TRADEOFF:** No cross-type jump until global search  
- **FUTURE IMPACT:** Global search can index the same fields later  

---

## 15. Action hierarchy

### Primary

Create · Save · Upload · Replace (Hero/photo) · Update site (implicit after save)

### Secondary

Edit · Preview on site · Open source · Copy link · Reorder · Move (photo→album if added later)

### Destructive

Delete · Remove clip · Delete album  

Destructive controls: danger tone, separated, never icon-only without label in dense toolbars.

### Feedback behaviors

| State | Behavior |
|---|---|
| Loading | Disable primary; show progress on upload |
| Disabled | Explain why (R2 unbound, conflict, empty required) |
| Success | Toast: “Saved · updating site…” then “Live” when warm completes / best-effort |
| Failure | Inline + toast; Retry for refresh failures |
| Confirmation | Required for delete / hero replace / album delete |
| Undo | Useful Later for reorder/delete if feasible; not Core Now |

---

## 16. Status / feedback model

### Do **not** invent draft/review/schedule

Architecture has no draft catalogs. Items are in the catalog or not.

### Real statuses that matter

```
Catalog saved  →  Site updating (purge/warm)  →  Public live
                      ↘ refresh failed (retry)
```

Also:

- **Writable / not writable** (R2 binding)  
- **Conflict** (rev mismatch) — reload + retry  
- **Hero version** fingerprint for cache-bust confidence  

### Communication

- Persist soft publish chip in shell after mutations  
- Home surfaces last failure  
- Never claim “published” if purge failed and warm was skipped (Phase 1 behavior)

---

## 17. Activity model

### Smallest useful feed (Useful Later → then Core adjacent)

`WHO · WHAT · WHEN · RESULT`

- WHO: Access identity email if available, else “Dashboard”  
- WHAT: entity + action (Video created, Photo deleted, Hero replaced…)  
- WHEN: relative + absolute  
- RESULT: ok / conflict / refresh failed  

Single-operator → **lightweight chronological feed**, not enterprise audit vault.  
Optional: client-side recent list until server log exists.

**NOT APPLICABLE now:** immutable compliance audit store, export, SIEM.

---

## 18. Responsive strategy

| Width | Shell | Lists | Photography | Editors |
|---|---|---|---|---|
| 375–390 | Top bar + workspace sheet | Cards stacked | Album select → full-width grid; inspector bottom sheet | Full-height sheet |
| 768 | Collapsible sidebar or rail | Hybrid cards | Album dropdown + grid | Drawer |
| 1024 | Persistent sidebar | Table/hybrid | Rail + grid + inspector | Drawer |
| 1280+ | Comfortable density | Full columns | 3-pane photography | Drawer + preview |

### Principles

- Mobile is **task-sequential**, not shrunk desktop  
- Reorder offers button alternatives at all sizes (WCAG 2.5.7)  
- Touch targets ≥44×44 CSS px (WCAG 2.5.5 / 2.5.8 related)  
- Filters collapse into a sheet on small screens  

---

## 19. Accessibility principles (WCAG 2.2–aligned)

| Requirement | Application |
|---|---|
| Keyboard operable (2.1.1) | All create/edit/reorder/delete paths |
| Focus visible (2.4.7 / 2.4.13) | High-contrast focus rings in admin chrome |
| Focus not obscured (2.4.11) | Toasts/sticky bars must not cover focused controls |
| Focus order (2.4.3) | DOM order matches reading order; avoid CSS reordering traps |
| Dragging alternatives (2.5.7) | Move up/down or “Move to position” for every drag reorder |
| Target size (2.5.8) | Adequate hit areas for icon actions |
| Accessible dialogs | Modal focus trap, Esc, return focus, labelled titles |
| Tables | Row headers / accessible names for actions |
| Media grids | Roving tabindex; arrows; Enter opens inspector |
| Status announcements | `aria-live` for save/publish/errors |
| Form errors | Linked messages, not color alone |
| Contrast | Text/UI ≥ AA |
| Reduced motion | Respect `prefers-reduced-motion` for previews/animations |

Admin security UX (OWASP): keep Access/MFA at edge; no mute of auth errors; confirm destructive ops; never put mutations on GET.

---

## 20. Visual design principles

### Should feel

Premium · creative · editorial · professional · calm · fast · purposeful  

### Should not feel

Bootstrap admin · WordPress clone · generic SaaS · ERP · “AI SaaS” purple glow template  

### Principles (implement in Phase 3+)

1. **Dark, quiet chrome** — content/media carry color; UI stays restrained  
2. **Editorial typography** — distinctive, not Inter-default admin  
3. **Large previews, small labels** — filmmaker workflow  
4. **One accent** — used for primary actions and focus, sparingly  
5. **Density with breath** — lists dense; hero/photo stages airy  
6. **Motion = feedback** — short, meaningful; never decorative noise  
7. **Match public brand gravity** without copying the marketing site layout into the CMS  

Do not implement CSS in this phase.

---

## 21. Future component-system concept (no implementation)

### Necessary primitives

| Primitive | Role |
|---|---|
| AppShell | Sidebar + main + publish chip |
| Sidebar / MobileNav | Workspace navigation |
| PageHeader | Title, count, primary action |
| Breadcrumbs | Nested album/short detail |
| Search + FilterBar | Discovery |
| DataTable | Videos |
| MediaGrid + MediaCard | Photos / Shorts clips |
| Inspector | Selection details |
| Drawer / Sheet | Editors |
| Dialog | Confirms / rename |
| Toast + StatusBadge | Feedback |
| EmptyState / LoadingState / ErrorState | Resilience |
| Form fields + Dropzone | Create/upload |
| ActivityItem | Feed rows |

### Defer

CommandPalette (Useful Later) · complex SavedViews · Chart widgets  

Avoid proliferation: prefer composing AppShell + Table/Grid + Inspector + Drawer before adding one-off widgets.

---

## 22. Feature-scope decisions

| Feature | Classification | Notes |
|---|---|---|
| Domain workspaces + Home | **CORE NOW** | IA foundation |
| Video edit drawer + rev-aware saves | **CORE NOW** | Closes API/UI gap |
| Photography album+grid+inspector | **CORE NOW** | Fixes primary visual workflow |
| Photo metadata edit + replace | **CORE NOW** | Public content completeness |
| Album rename (+ delete policy) | **CORE NOW** | Entity completeness |
| Shorts workspace | **CORE NOW** (after shell) | Closes public/CMS mismatch |
| Hero workspace | **CORE NOW** (after shell) | Same |
| Publish status (saved→updating→live) | **CORE NOW** | Matches architecture |
| Contextual search/filters | **CORE NOW** | Discovery baseline |
| Drag + non-drag reorder | **CORE NOW** | A11y + usability |
| Lightweight activity feed | **USEFUL LATER** | After mutations emit events |
| Global search / command palette | **USEFUL LATER** | When cross-type jump hurts |
| Bulk photo actions | **USEFUL LATER** | After selection model |
| Undo | **USEFUL LATER** | If reorder/delete regret is common |
| Soft delete | **FUTURE / SCALE** | Needs trash semantics |
| Version history | **FUTURE / SCALE** | Not in R2 model today |
| Saved views / favorites | **FUTURE / SCALE** | Small catalogs |
| Analytics | **NOT APPLICABLE** | Wrong product |
| RBAC / multi-user collab | **NOT APPLICABLE** | Access single-operator |
| Approval workflow / drafts / scheduling | **NOT APPLICABLE** | No draft architecture |
| Localization of CMS UI | **USEFUL LATER** | Public site is EN/DE; CMS can stay EN first |
| Schema builder / webhooks | **NOT APPLICABLE** | Fixed portfolio model |
| Import/export | **FUTURE / SCALE** | Ops convenience only |

---

## 23. DO NOT BUILD YET

Explicitly out of Phase 2 and blocked until Phase 3+ planning says go:

- Any application code, CSS, components, routes, APIs  
- Storage/contract changes  
- Production config changes  
- Page builder / block editor  
- Draft/publish workflow productization  
- Multi-user roles  
- Analytics dashboards  
- Generic “Media library” disconnected from albums/shorts  
- CMS editing of About/Contact/i18n chrome  
- Schema/plugin marketplace thinking  
- Visual redesign of the **public** site  

---

## 24. Phase 3 implementation plan

Phase 3+ should implement the blueprint **incrementally**, still without unrelated refactors.

### Phase 3A — Shell + Home + editing grammar

1. AppShell (sidebar, breadcrumbs, publish chip, mobile nav)  
2. Home (counts, hero snapshot, publish status, quick create)  
3. Shared Drawer/Inspector/Toast patterns  
4. Wire `rev` through all dashboard mutations  

### Phase 3B — Films (Videos) completeness

1. Videos hybrid list + filters/search  
2. Create/edit drawer (PATCH UI)  
3. Accessible reorder  
4. Conflict handling UX  

### Phase 3C — Photography workspace

1. Unify albums + photos into one workspace  
2. Media grid + inspector (title/alt)  
3. Replace image flow  
4. Album rename; define delete rules + API if missing  
5. Accessible reorder for photos and albums  

### Phase 3D — Shorts + Hero (close public/CMS gap)

1. Shorts APIs (if absent) following existing store  
2. Shorts index + detail clip manager  
3. Hero singleton replace + preview + version/live status  

### Phase 3E — Hardening

1. Activity feed (lightweight)  
2. Global search / command palette if needed  
3. Bulk photo actions  
4. Accessibility pass (WCAG 2.2 targets above)  
5. Regression against Phase 1 verify scripts + manual publish-status checks  

### Sequencing rationale

Shell first (everything hangs on it) → fix existing Videos/Photos depth → add missing Shorts/Hero → only then extras.

---

## Appendix A — Public site structure (observed)

Nav: Home · About · Indie/Art · Local Films · Photography · BTS & trailers · Shorts · Contact  

Sections map to CMS domains as in §4. About/Contact remain code-owned.

## Appendix B — Decision log (short)

| Decision | Choice |
|---|---|
| Product type | Creative portfolio CMS + ops console |
| IA | Domain workspaces (Option B) |
| Photos+Albums | Unified Photography |
| Videos+Shorts | Separate; adjacent in nav |
| Hero | Site singleton |
| Home | Attention-oriented, yes |
| Status model | saved → updating → live |
| Drafts/RBAC/etc. | Not applicable |

---

**PHASE 2 COMPLETE**
