import { siteOrigin } from "./hosts";

const HTML_CACHE_TAG = "html";
const WARM_PATHS = ["/", "/de/"] as const;

export { HTML_CACHE_TAG };

export interface SiteCacheRefreshOptions {
	/** Dashboard or site request URL — used to derive the public origin. */
	requestUrl?: URL;
	/** Explicit public origin; wins over requestUrl / env. */
	origin?: string;
	waitUntil?: (promise: Promise<unknown>) => void;
}

function resolvePublicOrigin(options: SiteCacheRefreshOptions): string | null {
	if (options.origin) return options.origin.replace(/\/$/, "");
	if (options.requestUrl) return siteOrigin(options.requestUrl);
	const configured = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL;
	if (configured) {
		try {
			return new URL(configured).origin;
		} catch {
			return null;
		}
	}
	return null;
}

async function purgePublicHtmlOnSiteWorker(origin: string) {
	// Dashboard and mbu are separate Workers; purge is entrypoint-scoped, so
	// catalog saves on dashboard must ask the public Worker to purge its cache.
	const response = await fetch(new URL("/__mbu/cache-purge", `${origin}/`), {
		method: "POST",
		headers: { accept: "application/json" },
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`purge endpoint ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
		);
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

async function runRefresh(origin: string) {
	try {
		await purgePublicHtmlOnSiteWorker(origin);
	} catch (error) {
		console.error("[site-cache] purge failed", error);
	}
	try {
		await warmPublicHtml(origin);
	} catch (error) {
		console.error("[site-cache] warm failed", error);
	}
}

/**
 * After catalog/media mutations: purge public HTML on the site Worker, then
 * warm `/` and `/de/` so the next visitor is likely a HIT. Failures are logged
 * only — dashboard saves must not fail because of cache ops.
 */
export function refreshPublicHtmlCache(options: SiteCacheRefreshOptions = {}) {
	const origin = resolvePublicOrigin(options);
	if (!origin) {
		console.warn("[site-cache] skip refresh — no public site origin");
		return;
	}
	if (import.meta.env.DEV) return;

	const task = runRefresh(origin);
	if (options.waitUntil) {
		options.waitUntil(task);
		return;
	}
	void task;
}

export function waitUntilFromLocals(
	locals: App.Locals | undefined,
): ((promise: Promise<unknown>) => void) | undefined {
	if (!locals) return undefined;
	const cfContext = (locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } })
		.cfContext;
	return cfContext?.waitUntil?.bind(cfContext);
}
