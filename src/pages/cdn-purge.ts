import type { APIRoute } from "astro";
import { unauthorizedCdnPurgeResponse } from "../lib/purge-auth";
import { HTML_CACHE_TAG } from "../lib/site-cache";

export const prerender = false;

type PurgeScope = "html" | "everything";

function parseScope(url: URL): PurgeScope {
	const raw = (url.searchParams.get("scope") || "html").toLowerCase();
	return raw === "everything" ? "everything" : "html";
}

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

/**
 * Runs on the public `mbu` Worker so `cache.purge` hits the site cache
 * (dashboard Worker has a separate cache and only stores no-store responses).
 *
 * Authenticated via `Authorization: Bearer <CDN_PURGE_SECRET>` only.
 *
 * - `POST /cdn-purge` or `?scope=html` → purge Cache-Tag `html`
 * - `POST /cdn-purge?scope=everything` → purgeEverything (deploy)
 */
export const POST: APIRoute = async ({ request, url }) => {
	const denied = unauthorizedCdnPurgeResponse(request);
	if (denied) return denied;

	const scope = parseScope(url);
	try {
		const { cache } = await import("cloudflare:workers");
		const result =
			scope === "everything"
				? await cache.purge({ purgeEverything: true })
				: await cache.purge({ tags: [HTML_CACHE_TAG] });

		if (
			result &&
			typeof result === "object" &&
			"success" in result &&
			!result.success
		) {
			console.error("[cdn-purge] cache.purge reported failure", result);
			return json({ ok: false, error: "Purge failed" }, 502);
		}

		return json({ ok: true, scope }, 200);
	} catch (error) {
		console.error("[cdn-purge] cache.purge unavailable", error);
		return json({ ok: false, error: "Purge unavailable" }, 501);
	}
};
