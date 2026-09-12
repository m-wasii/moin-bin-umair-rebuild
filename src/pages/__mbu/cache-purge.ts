import type { APIRoute } from "astro";
import { HTML_CACHE_TAG } from "../../lib/site-cache";

export const prerender = false;

type PurgeScope = "html" | "everything";

function parseScope(url: URL): PurgeScope {
	const raw = (url.searchParams.get("scope") || "html").toLowerCase();
	return raw === "everything" ? "everything" : "html";
}

/**
 * Runs on the public `mbu` Worker so `cache.purge` hits the site cache
 * (dashboard Worker has a separate cache and only stores no-store responses).
 *
 * - `POST /__mbu/cache-purge` or `?scope=html` → purge Cache-Tag `html`
 * - `POST /__mbu/cache-purge?scope=everything` → purgeEverything (deploy)
 */
export const POST: APIRoute = async ({ url }) => {
	const scope = parseScope(url);
	try {
		const { cache } = await import("cloudflare:workers");
		const result =
			scope === "everything"
				? await cache.purge({ purgeEverything: true })
				: await cache.purge({ tags: [HTML_CACHE_TAG] });

		if (result && typeof result === "object" && "success" in result && !result.success) {
			console.error("[site-cache] cache.purge reported failure", result);
			return new Response(JSON.stringify({ ok: false, scope, result }), {
				status: 502,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}
		return new Response(
			JSON.stringify({
				ok: true,
				scope,
				...(scope === "html" ? { tags: [HTML_CACHE_TAG] } : { purgeEverything: true }),
			}),
			{
				status: 200,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store",
				},
			},
		);
	} catch (error) {
		console.error("[site-cache] cache.purge unavailable", error);
		return new Response(
			JSON.stringify({
				ok: false,
				scope,
				error: error instanceof Error ? error.message : "purge failed",
			}),
			{
				status: 501,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store",
				},
			},
		);
	}
};
