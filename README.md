# Moin Bin Umair — Portfolio

A single-page Astro portfolio for filmmaker Moin Bin Umair. The public site and
the editor dashboard are the same Cloudflare Worker with different hostnames.

## Local development

Requirements: Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

The site opens at `http://localhost:4321`. The dashboard is
[http://127.0.0.1:4321/dashboard](http://127.0.0.1:4321/dashboard) (no login locally).
Photo uploads in `astro dev` write to `.data/media/` (gitignored).

```sh
npm run check
npm run build
npm run preview
```

## Dashboard (Google only)

There is **no GitHub login**. Cloudflare Access (Google allowlist) is the only
production sign-in. Videos and photos are saved to **R2**, not git.

```text
Public site                 dashboard.<same account>
(www / apex / mbu.*)        ├─ Cloudflare Access (Google) on custom domains
                            ├─ /dashboard          videos
                            ├─ /dashboard/photos   stills (auto WebP)
                            └─ writes R2 (MEDIA bucket)
```

Live workers.dev hosts (short names; the account suffix is `wasi-workdesk`):

- Site: https://mbu.wasi-workdesk.workers.dev
- Dashboard: https://dashboard.wasi-workdesk.workers.dev

`/dashboard` on the public host redirects to the dashboard subdomain.

### Videos

1. Open `/dashboard`
2. Paste a Vimeo or YouTube URL, pick Commercial / Art / Shorts
3. Save — title, thumbnail, and (for Vimeo) year/duration are fetched automatically
4. YouTube needs **year** and **duration** (seconds) unless `YOUTUBE_API_KEY` is set

### Photos

1. Open `/dashboard/photos`
2. Pick a category, drop JPEG / PNG / GIF / BMP / WebP
3. The browser resizes to 1600px and encodes **WebP** before upload
4. RAW, HEIC, and PDF are rejected

Seed stills (Drive Top) live in `public/photography/` plus `src/data/photos.seed.json`.
The Worker serves `/media/photos/...` from the `MEDIA` R2 bucket (`moin-media`)
when the object exists, otherwise it falls back to those public files.

Site chrome: `src/data/site.ts`.  
Hero reel: `public/media/hero-loop.mp4` + `public/media/hero-poster.webp`.  
German about-copy: `src/i18n/project-descriptions.ts`.

## Deploy to Cloudflare Workers

1. Connect this GitHub repo to the **mbu Worker** (not a Pages project), or deploy from CI / the CLI:

```sh
npm run deploy
```

That builds once and publishes two Workers that share the `MEDIA` bucket:

- `mbu` → https://mbu.wasi-workdesk.workers.dev
- `dashboard` → https://dashboard.wasi-workdesk.workers.dev (`wrangler deploy --name dashboard`)

Pull requests deploy a dedicated preview Worker (production `mbu` is unchanged):

- `https://mbu-pr-<number>.wasi-workdesk.workers.dev`

GitHub Actions publishes those hosts when two **repository** secrets exist
([Settings → Secrets and variables → Actions](https://github.com/m-wasii/moin-bin-umair-rebuild/settings/secrets/actions)):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from `npx wrangler whoami`, or Workers & Pages → Overview in the [Cloudflare dashboard](https://dash.cloudflare.com/) |
| `CLOUDFLARE_API_TOKEN` | API token created below (shown only once) |

Create the token at [Account API tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Edit Cloudflare Workers**. Confirm it has:

- Account · Cloudflare Workers · Edit
- Account · Workers R2 Storage · Edit (needed for the `MEDIA` / `moin-media` binding)
- Account resources: only this Cloudflare account

Then re-run the **Worker preview** workflow on the pull request.

From a machine that can already deploy (`wrangler whoami` works):

```sh
gh secret set CLOUDFLARE_API_TOKEN -R m-wasii/moin-bin-umair-rebuild
gh secret set CLOUDFLARE_ACCOUNT_ID -R m-wasii/moin-bin-umair-rebuild
```

Do not commit the token. Manual preview from a branch:

```sh
npm run build
npx wrangler deploy --name mbu-pr-26
```

2. R2: bucket `moin-media` is bound as `MEDIA` in `wrangler.jsonc`. After
   the first deploy (or whenever seed stills change), upload catalogs and
   WebP objects:

```sh
npm run seed:r2
```

Dashboard saves write to the same bucket. The API token needs
**Workers R2 Storage: Edit**.

3. Custom domains on the same Worker:

   - `yourdomain.com` / `www` → public site
   - `dashboard.yourdomain.com` → dashboard

4. Worker secrets / vars (see `.env.example`):

   - `SITE` = `https://yourdomain.com`
   - `PUBLIC_DASHBOARD_URL` = `https://dashboard.yourdomain.com`
   - Optional: `YOUTUBE_API_KEY`
   - Optional while testing Access: `DASHBOARD_ENFORCE_CF_ACCESS=false`

5. **Google login (Cloudflare Access)** on `dashboard.yourdomain.com` only:

   1. Zero Trust → Access → Applications → Add → Self-hosted
   2. Identity provider: **Google**
   3. Allowlist editor emails
   4. Do not put the public site hostname in this Access app

On `*.workers.dev`, Access is not enforced. The public Worker redirects
`/dashboard` to `dashboard.<account>.workers.dev`.

Handoff: give the client this repo, recreate the Worker + `moin-media` R2 bucket +
Access on **their** Cloudflare account, set `SITE` / dashboard URL, deploy. Do not
copy your R2; run `npm run seed:photos` there if they need the Drive Top stills
re-encoded into `public/photography/`, then `npm run seed:r2` to fill the bucket.

## Structure

```text
src/
  components/   Page sections and project UI
  data/         Seed catalogs + site settings
  layouts/      Document metadata and dashboard shell
  lib/          R2/media store and video metadata
  pages/        Public site, dashboard, APIs
  scripts/      Navigation, reveal, dialogs
  styles/       Global visual system
  middleware.ts Dashboard host + Access gate
public/
  media/        Hero reel
  photography/  Seed stills (WebP)
```
