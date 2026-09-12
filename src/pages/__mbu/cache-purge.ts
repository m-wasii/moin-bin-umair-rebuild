import type { APIRoute } from "astro";
import { HTML_CACHE_TAG } from "../../lib/site-cache";

export const prerender = false;

/**
 * Runs on the public `mbu` Worker so `cache.purge` hits the site cache
 * (dashboard Worker has a separate cache and only stores no-store responses).
 */
export const POST: APIRoute = async () => {
	try {
		const { cache } = await import("cloudflare:workers");
		const result = await cache.purge({ tags: [HTML_CACHE_TAG] });
		if (result && typeof result === "object" && "success" in result && !result.success) {
			console.error("[site-cache] cache.purge reported failure", result);
			return new Response(JSON.stringify({ ok: false, result }), {
				status: 502,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store",
				},
			});
		}
		return new Response(JSON.stringify({ ok: true, tags: [HTML_CACHE_TAG] }), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	} catch (error) {
		console.error("[site-cache] cache.purge unavailable", error);
		return new Response(
			JSON.stringify({
				ok: false,
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
