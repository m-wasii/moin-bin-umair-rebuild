import { workerCacheOrigin } from "./hosts";
import { cdnPurgeSecret } from "./purge-auth";
import { runPurgeThenWarm } from "./site-cache-refresh";

const HTML_CACHE_TAG = "html";
/** Public purge route on the site Worker (must not use Astro `_` private folders). */
export const SITE_CACHE_PURGE_PATH = "/cdn-purge";
const WARM_PATHS = ["/", "/de/"] as const;

export { HTML_CACHE_TAG };
export { runPurgeThenWarm } from "./site-cache-refresh";
export { waitUntilFromLocals } from "./wait-until-locals";

export interface SiteCacheRefreshOptions {
	/** Dashboard or site request URL — used to derive the public origin. */
	requestUrl?: URL;
	/** Explicit public origin; wins over requestUrl / env. */
	origin?: string;
	/**
	 * Worker ExecutionContext.waitUntil — from Astro.locals.cfContext
	 * (@astrojs/cloudflare sets this via createLocals).
	 */
	waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Outcome of a public HTML purge+warm attempt.
 * Catalog saves must treat failures as non-fatal and never throw on these.
 */
export type SiteCacheRefreshResult =
	| { status: "skipped-dev" }
	| { status: "skipped-no-origin" }
	| { status: "success"; purged: true; warmed: true }
	| {
			status: "partial";
			purged: boolean;
			warmed: boolean;
			detail?: string;
	  }
	| {
			status: "failed";
			purged: false;
			warmed: false;
			detail?: string;
	  };

function resolvePublicOrigin(options: SiteCacheRefreshOptions): string | null {
	if (options.origin) return options.origin.replace(/\/$/, "");
	// Derive from the dashboard/site request host — never from marketing SITE.
	if (options.requestUrl) return workerCacheOrigin(options.requestUrl);
	return null;
}

async function purgePublicHtmlOnSiteWorker(origin: string) {
	const secret = cdnPurgeSecret();
	if (!secret) {
		throw new Error("CDN_PURGE_SECRET is not configured");
	}

	// Dashboard and mbu are separate Workers; purge is entrypoint-scoped, so
	// catalog saves on dashboard must ask the public Worker to purge its cache.
	const purgeUrl = new URL(SITE_CACHE_PURGE_PATH, `${origin}/`);
	const response = await fetch(purgeUrl, {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/json",
			authorization: `Bearer ${secret}`,
		},
		body: "{}",
	});
	if (!response.ok) {
		throw new Error(`purge endpoint ${response.status} at ${purgeUrl.host}`);
	}
}

async function warmPublicHtml(origin: string) {
	await Promise.all(
		WARM_PATHS.map(async (path) => {
			const response = await fetch(new URL(path, `${origin}/`), {
				method: "GET",
				headers: { accept: "text/html" },
			});
			if (!response.ok) {
				throw new Error(`warm ${path} → ${response.status}`);
			}
			// Drain so the Worker finishes and Workers Caching can store the body.
			await response.arrayBuffer().catch(() => undefined);
		}),
	);
}

async function runRefresh(origin: string): Promise<SiteCacheRefreshResult> {
	// Never warm after a failed purge — that would re-store stale HTML under
	// the long public s-maxage and hide a successful catalog write.
	const result = await runPurgeThenWarm({
		purge: () => purgePublicHtmlOnSiteWorker(origin),
		warm: () => warmPublicHtml(origin),
		onPurgeError: (error) => {
			console.error("[site-cache] purge failed; skipping warm", error);
		},
		onWarmError: (error) => {
			console.error("[site-cache] warm failed", error);
		},
		onSkipWarmAfterPurgeFailure: () => {
			console.warn(
				"[site-cache] warm skipped after purge failure — stale HTML may remain until a successful purge",
			);
		},
	});

	if (result.purged && result.warmed) {
		return { status: "success", purged: true, warmed: true };
	}
	if (result.purged && !result.warmed) {
		return {
			status: "partial",
			purged: true,
			warmed: false,
			detail: "Purged but warm failed",
		};
	}
	return {
		status: "failed",
		purged: false,
		warmed: false,
		detail: "Purge failed; warm skipped",
	};
}

/**
 * After catalog/media mutations: purge public HTML on the site Worker, then
 * warm `/` and `/de/` so the next visitor is likely a HIT. Failures are logged
 * and returned — dashboard saves must not fail because of cache ops. Warm is
 * skipped when purge fails so stale responses are not re-cached.
 *
 * Always awaits purge/warm when a refresh runs (not skipped). Optional
 * `waitUntil` still receives the same promise for Worker lifetime extension.
 */
export async function refreshPublicHtmlCache(
	options: SiteCacheRefreshOptions = {},
): Promise<SiteCacheRefreshResult> {
	const origin = resolvePublicOrigin(options);
	if (!origin) {
		console.warn("[site-cache] skip refresh — no public site origin");
		return { status: "skipped-no-origin" };
	}
	if (import.meta.env.DEV) {
		return { status: "skipped-dev" };
	}

	const task = runRefresh(origin);
	if (options.waitUntil) {
		options.waitUntil(task);
	}

	try {
		return await task;
	} catch (error) {
		console.error("[site-cache] refresh unexpected error", error);
		return {
			status: "failed",
			purged: false,
			warmed: false,
			detail: error instanceof Error ? error.message : "Cache refresh failed",
		};
	}
}
