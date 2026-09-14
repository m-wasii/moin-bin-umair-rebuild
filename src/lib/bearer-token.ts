/**
 * Pure bearer-token helpers (no Worker bindings).
 * Used by CDN purge auth and its Node verification script.
 */

export function timingSafeEqualString(a: string, b: string): boolean {
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

export function parseBearerToken(header: string | null): string | null {
	if (!header) return null;
	const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
	return match?.[1] ?? null;
}

/**
 * Fail-closed CDN purge authorization against a known secret.
 * - missing secret → 503 (misconfigured)
 * - missing/wrong token → 401
 * - match → authorized
 */
export function authorizeCdnPurgeBearer(
	secret: string | undefined,
	authorizationHeader: string | null,
): { ok: true } | { ok: false; status: 401 | 503 } {
	if (!secret) return { ok: false, status: 503 };
	const token = parseBearerToken(authorizationHeader);
	if (!token || !timingSafeEqualString(token, secret)) {
		return { ok: false, status: 401 };
	}
	return { ok: true };
}
