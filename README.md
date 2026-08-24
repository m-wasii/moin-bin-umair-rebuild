# Moin Bin Umair — Portfolio

A single-page Astro portfolio for filmmaker Moin Bin Umair. The site replaces the
Focus template with a minimal, cinematic presentation centered on the work.

## Local development

Requirements: Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

The development server opens at `http://localhost:4321`.

Useful checks:

```sh
npm run check
npm run build
npm run preview
```

## Content

- Edit project titles, categories, durations, and Vimeo IDs in
  `src/data/projects.ts`.
- Edit portfolio metadata and the Vimeo profile in `src/data/site.ts`.
- Replace `public/media/hero-loop.mp4` and
  `public/media/hero-poster.webp` when the final showreel is available.

The current Commercial / Art & Films split is inferred from the original Vimeo
gallery and is intentionally easy to revise.

## Structure

```text
src/
  components/   Page sections and project UI
  data/         Portfolio content
  layouts/      Document metadata and global shell
  pages/        Astro routes
  scripts/      Navigation, reveal, and video-dialog behavior
  styles/       Global visual system
public/
  media/        Optimized hero media
```

The Vimeo player is only loaded after a visitor selects a project. This keeps the
initial page lightweight while retaining a no-JavaScript fallback to Vimeo.
