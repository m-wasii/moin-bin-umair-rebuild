import type { CatalogRevision } from "../store/types";

/** Catalog keys the shell may track for concurrency-safe mutations. */
export type CatalogDomain =
	| "videos"
	| "photos"
	| "photoCategories"
	| "shorts"
	| "hero";

/**
 * Client-side revision map for optimistic / CAS-aware workspace mutations.
 * Phase 3A establishes the shape; workspaces adopt it in later phases.
 */
export interface CatalogRevisionMap {
	videos: CatalogRevision;
	photos: CatalogRevision;
	photoCategories: CatalogRevision;
	shorts: CatalogRevision;
	hero: CatalogRevision;
}

export interface MutationRevisionPayload {
	/** Monotonic catalog revision from the last successful read/write. */
	rev: number;
	/** Optional R2 etag when available. */
	etag?: string;
}

export const EMPTY_REVISION: CatalogRevision = {
	rev: 0,
	found: false,
};

export function toMutationRevision(
	revision: CatalogRevision,
): MutationRevisionPayload {
	const payload: MutationRevisionPayload = { rev: revision.rev };
	if (revision.etag) payload.etag = revision.etag;
	return payload;
}

export function applyRevisionUpdate(
	map: CatalogRevisionMap,
	domain: CatalogDomain,
	next: CatalogRevision,
): CatalogRevisionMap {
	return { ...map, [domain]: next };
}

export function serializeRevisionMap(map: CatalogRevisionMap): string {
	return JSON.stringify(map);
}

export function parseRevisionMap(raw: string): CatalogRevisionMap | null {
	try {
		const data = JSON.parse(raw) as Partial<CatalogRevisionMap>;
		if (!data || typeof data !== "object") return null;
		return {
			videos: asRevision(data.videos),
			photos: asRevision(data.photos),
			photoCategories: asRevision(data.photoCategories),
			shorts: asRevision(data.shorts),
			hero: asRevision(data.hero),
		};
	} catch {
		return null;
	}
}

function asRevision(value: unknown): CatalogRevision {
	if (!value || typeof value !== "object") return { ...EMPTY_REVISION };
	const record = value as Partial<CatalogRevision>;
	return {
		rev: typeof record.rev === "number" ? record.rev : 0,
		found: Boolean(record.found),
		...(typeof record.etag === "string" ? { etag: record.etag } : {}),
	};
}
