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

Keystatic (no login locally): [http://127.0.0.1:4321/keystatic](http://127.0.0.1:4321/keystatic)

Useful checks:

```sh
npm run check
npm run build
npm run preview
```

## Content dashboard (Keystatic)

Portfolio films are managed in **Keystatic**. Each video is a JSON file under
`src/content/videos/`.

```text
Public site          dashboard.yourdomain.com
(www / apex)         └─ Cloudflare Access (Google login)
                     └─ Keystatic UI (/keystatic)
                     └─ Saves into GitHub (content/* branches)
                     └─ GitHub Action runs npm run sync:videos
```

### Add a video (local)

1. `npm run dev` → open `/keystatic`
2. **Videos** → **Create entry**
3. Paste Vimeo/YouTube URL, pick category, save
4. `npm run sync:videos`
5. Commit `src/content/videos/*` and `src/data/projects.generated.json`

### Add a video (production dashboard)

1. Open `https://dashboard.yourdomain.com` → **Sign in with Google** (Cloudflare Access)
2. Sign in to Keystatic with **GitHub** (needs write access on this repo)
3. Add/edit videos and save (creates a `content/…` branch / commit)
4. Merge; the Sync videos Action refreshes `projects.generated.json`

Optional fields: title override, description, featured, year, duration, sort order.

- **Vimeo:** title, year, duration, thumbnail auto-filled by sync
- **YouTube:** set **year** + **duration** (seconds), or set repo/Action secret `YOUTUBE_API_KEY`

Vimeo account for auto-fill: **Video settings** in Keystatic (`src/data/video-settings.json`).

Site chrome / profile link: `src/data/site.ts`.  
Hero reel: `public/media/hero-loop.mp4` + `public/media/hero-poster.webp`.  
German about-copy: `src/i18n/project-descriptions.ts`.

### Why Google + GitHub?

| Layer | Who | Purpose |
| ----- | --- | ------- |
| Cloudflare Access (Google) | Client / editors you allowlist | Gates `dashboard.*` — only those Google accounts can open it |
| Keystatic (GitHub) | Same people as GitHub repo collaborators | Keystatic can only write files via GitHub OAuth |

Keystatic does not support Google as its CMS login. Google sits in front (Access);
GitHub is how edits land in the repo.

## Deploy to Cloudflare Workers

This project uses the Cloudflare adapter (Workers + Assets). The public site and
`dashboard.*` are the same Worker with different hostnames.

1. Push this repository to GitHub (`m-wasii/moin-bin-umair-rebuild`).
2. Create / connect a **Worker** (not Pages) for this repo, or deploy with:

```sh
npm run build
npx wrangler deploy
```

3. **Custom domains** on the Worker:

   - `yourdomain.com` / `www` → public site
   - `dashboard.yourdomain.com` → Keystatic (same Worker)

4. **Environment variables / secrets** — see `.env.example`:

   - `SITE` = `https://yourdomain.com`
   - `PUBLIC_DASHBOARD_URL` = `https://dashboard.yourdomain.com`
   - `KEYSTATIC_GITHUB_CLIENT_ID` / `CLIENT_SECRET` / `KEYSTATIC_SECRET`
   - `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`
   - Optional: `KEYSTATIC_GITHUB_REPO_OWNER`, `KEYSTATIC_GITHUB_REPO_NAME`
   - Optional while testing Access: `DASHBOARD_ENFORCE_CF_ACCESS=false`

5. **KV** — Astro provisions a `SESSION` binding (used for Keystatic auth cookies).
   Confirm it exists under the Worker bindings if deploy does not auto-create it.

6. **Google login (Cloudflare Access)**

   1. Zero Trust → Access → Applications → Add → Self-hosted
   2. Domain: `dashboard.yourdomain.com` (all paths)
   3. Identity provider: **Google**
   4. Policy: allowlist editor emails (or a Workspace group)
   5. Do **not** put the public site hostname in this Access app

7. **Keystatic GitHub App**

   - Open `/keystatic` and follow Keystatic’s GitHub App connect flow, or paste
     existing app credentials into Worker secrets
   - Callback URL:
     `https://dashboard.yourdomain.com/api/keystatic/github/oauth/callback`
   - Editors need **write** access on the GitHub repo

Until Access is configured, production dashboard routes return **401**
(`DASHBOARD_ENFORCE_CF_ACCESS`). Set `false` only during bring-up.

## Structure

```text
src/
  components/   Page sections and project UI
  content/      Keystatic video entries
  data/         Generated projects + site settings
  layouts/      Document metadata and global shell
  pages/        Astro routes
  scripts/      Navigation, reveal, and video-dialog behavior
  styles/       Global visual system
  middleware.ts Dashboard host + Access gate
public/
  media/        Optimized hero media
keystatic.config.ts
```
