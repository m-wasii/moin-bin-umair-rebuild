import { env } from "cloudflare:workers";

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

function timingSafeEqual(a: string, b: string) {
	const encoder = new TextEncoder();
	const left = encoder.encode(a);
	const right = encoder.encode(b);
	const length = Math.max(left.byteLength, right.byteLength);
	let mismatch = left.byteLength === right.byteLength ? 0 : 1;
	for (let i = 0; i < length; i++) {
		mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}
	return mismatch === 0;
}

function bearerToken(header: string | null) {
	if (!header) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
	return match?.[1] ?? null;
}

/**
 * Fail closed: missing secret or wrong bearer token → deny purge.
 * Returns a Response to send, or null when authorized.
 */
export function unauthorizedCdnPurgeResponse(
	request: Request,
): Response | null {
	const secret = cdnPurgeSecret();
	if (!secret) {
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

	const token = bearerToken(request.headers.get("authorization"));
	if (!token || !timingSafeEqual(token, secret)) {
		return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
			status: 401,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	}

	return null;
}
