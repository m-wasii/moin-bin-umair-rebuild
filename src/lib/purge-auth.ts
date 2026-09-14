import { env } from "cloudflare:workers";
import { authorizeCdnPurgeBearer } from "./bearer-token";

function workerPurgeSecret() {
	return (env as { CDN_PURGE_SECRET?: string }).CDN_PURGE_SECRET;
}

/** Shared secret for Worker-to-Worker and CI `/cdn-purge` calls. */
export function cdnPurgeSecret(): string | undefined {
	const raw = workerPurgeSecret() || import.meta.env.CDN_PURGE_SECRET;
	if (typeof raw !== "string") return undefined;
	const trimmed = raw.trim();
	return trimmed || undefined;
}

/**
 * Fail closed: missing secret or wrong bearer token → deny purge.
 * Returns a Response to send, or null when authorized.
 */
export function unauthorizedCdnPurgeResponse(
	request: Request,
): Response | null {
	const decision = authorizeCdnPurgeBearer(
		cdnPurgeSecret(),
		request.headers.get("authorization"),
	);
	if (decision.ok) return null;

	if (decision.status === 503) {
		console.error("[cdn-purge] CDN_PURGE_SECRET is not configured");
		return new Response(
			JSON.stringify({ ok: false, error: "Service unavailable" }),
			{
				status: 503,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store",
				},
			},
		);
	}

	return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
		status: 401,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}
