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

Projects are grouped into Commercial, Art & Films, and Shorts (vertical
9:16 videos) in `src/data/projects.ts`. Add vertical shorts with
`category: "shorts"`. That split is easy to revise as the gallery grows.

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

## Deploy to Cloudflare Pages

This is a static Astro site. No Cloudflare adapter is required.

1. Push this repository to GitHub (already at
   `https://github.com/m-wasii/moin-bin-umair-rebuild`).
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Workers & Pages** → **Create** → **Pages** → **Import an existing Git repository**.
3. Select `m-wasii/moin-bin-umair-rebuild` and use these build settings:

   - Framework preset: `Astro`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: from `.nvmrc` (`22.12.0`). If the build still uses Node 18, set the environment variable `NODE_VERSION` to `22.12.0` and use build system v3.

The live URL will be `https://moin-bin-umair.pages.dev` (or the project name you choose). Add a custom domain under **Custom domains** when you have one, then set a `SITE` environment variable to that URL (for example `https://moinbinumair.com`) so canonical and Open Graph tags stay correct.

To publish a one-off build from this machine instead of Git:

```sh
npm run build
npx wrangler pages deploy ./dist
```
