import { CatalogConflictError, parseCatalogRev } from "../catalog-integrity";
import {
	refreshPublicHtmlCache,
	type SiteCacheRefreshOptions,
} from "../site-cache";
import {
	getBucket,
	readLocalJson,
	withLocalCatalogLock,
	writeLocalJson,
} from "./bucket";
import type { CatalogRecord, CatalogRevision } from "./types";

/**
 * Read a catalog JSON object from R2 or local `.data`.
 *
 * Distinguishes:
 * - R2/local object missing → `{ payload: {}, revision: { found: false } }`
 * - Object present → payload + revision (caller validates shape)
 *
 * Does not substitute seed data; callers decide bootstrap vs integrity errors.
 */
export async function readCatalogRecord(key: string): Promise<CatalogRecord> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (!object) {
			return {
				payload: {},
				revision: { rev: 0, found: false },
			};
		}
		const payload = (await object.json()) as Record<string, unknown>;
		return {
			payload,
			revision: {
				rev: parseCatalogRev(payload.rev),
				etag: object.etag,
				found: true,
			},
		};
	}

	if (!import.meta.env.DEV) {
		console.error(
			`[store] MEDIA binding missing; cannot read catalog ${key}`,
		);
		return {
			payload: {},
			revision: { rev: 0, found: false },
		};
	}

	const local = await readLocalJson<Record<string, unknown>>(key);
	if (!local) {
		return {
			payload: {},
			revision: { rev: 0, found: false },
		};
	}
	return {
		payload: local,
		revision: {
			rev: parseCatalogRev(local.rev),
			found: true,
		},
	};
}

async function withResolvedEtag(
	key: string,
	revision: CatalogRevision,
): Promise<CatalogRevision> {
	if (!revision.found || revision.etag) return revision;
	const bucket = getBucket();
	if (!bucket?.head) return revision;
	const head = await bucket.head(key);
	if (head?.etag) return { ...revision, etag: head.etag };
	return revision;
}

/**
 * Atomic (from the app's perspective) catalog replace using R2 conditional
 * puts when available, and revision checks under a local lock in DEV.
 */
export async function writeCatalogRecord(
	key: string,
	payload: Record<string, unknown>,
	expectedInput: CatalogRevision,
	cache?: SiteCacheRefreshOptions,
): Promise<CatalogRevision> {
	const expected = await withResolvedEtag(key, expectedInput);
	const nextRev = expected.rev + 1;
	const body = { ...payload, rev: nextRev };
	const serialized = JSON.stringify(body);

	const bucket = getBucket();
	if (bucket) {
		const onlyIf = expected.found
			? expected.etag
				? { etagMatches: expected.etag }
				: undefined
			: { etagDoesNotMatch: "*" };

		const result = await bucket.put(key, serialized, {
			httpMetadata: { contentType: "application/json" },
			...(onlyIf ? { onlyIf } : {}),
		});

		if (onlyIf && result === null) {
			throw new CatalogConflictError();
		}

		const etag =
			result && typeof result === "object" && "etag" in result
				? String((result as { etag?: string }).etag ?? "")
				: undefined;

		refreshPublicHtmlCache(cache);
		return { rev: nextRev, etag: etag || undefined, found: true };
	}

	await withLocalCatalogLock(key, async () => {
		const current = await readLocalJson<Record<string, unknown>>(key);
		const currentRev = current ? parseCatalogRev(current.rev) : 0;
		if (expected.found) {
			if (!current || currentRev !== expected.rev) {
				throw new CatalogConflictError();
			}
		} else if (current) {
			throw new CatalogConflictError();
		}
		await writeLocalJson(key, body);
	});

	refreshPublicHtmlCache(cache);
	return { rev: nextRev, found: true };
}

/**
 * Resolve catalog list payload.
 * - Object missing → seed (bootstrap; intended).
 * - Object present but malformed → throw in production / with R2;
 *   DEV-only local fallback may use seed with a warning.
 */
export function resolveCatalogList<T>(options: {
	key: string;
	found: boolean;
	list: unknown;
	seed: () => T[];
	label: string;
}): T[] {
	const { key, found, list, seed, label } = options;
	if (found) {
		if (Array.isArray(list)) return list as T[];
		const message = `Malformed ${label} catalog at ${key}: expected an array.`;
		if (getBucket() || !import.meta.env.DEV) {
			throw new Error(message);
		}
		console.warn(`[store] ${message} Using seed data for local DEV.`);
		return seed();
	}
	return seed();
}
