import seedShorts from "../../data/shorts.seed.json";
import {
	isShortMediaFile,
	isShortSlug,
	type StoredShort,
} from "../../data/shorts";
import { assertStoredShorts } from "../catalog-integrity";
import { withMediaVersion } from "../media-url";
import type { SiteCacheRefreshOptions } from "../site-cache";
import {
	assertSafeObjectKey,
	getBucket,
	localPath,
	readLocalBytes,
} from "./bucket";
import {
	readCatalogRecord,
	resolveCatalogList,
	writeCatalogRecord,
} from "./catalog";
import type { CatalogRevision, StoredMediaBody } from "./types";
import { SHORTS_KEY } from "./types";

interface ShortsCatalogPayload {
	shorts: StoredShort[];
	/** Catalog-wide media version applied to clip src/poster URLs. */
	v?: string;
	rev?: number;
}

function seedShortList(): StoredShort[] {
	return (seedShorts as { shorts: StoredShort[] }).shorts;
}

function rewriteShortMediaPath(path: string) {
	return path.startsWith("/shorts/") ? `/media${path}` : path;
}

/** Ensure clip src/poster URLs go through /media/shorts (R2), not bare /shorts. */
function normalizeShortMedia(
	shorts: StoredShort[],
	version = "1",
): StoredShort[] {
	return shorts.map((entry) => ({
		...entry,
		clips: entry.clips.map((clip) => ({
			...clip,
			src: withMediaVersion(rewriteShortMediaPath(clip.src), version),
			poster: withMediaVersion(rewriteShortMediaPath(clip.poster), version),
		})),
	}));
}

export async function readShortsCatalog(): Promise<{
	shorts: StoredShort[];
	revision: CatalogRevision;
	mediaVersion: string;
}> {
	const { payload, revision } = await readCatalogRecord(SHORTS_KEY);
	if (revision.found) {
		const list = resolveCatalogList<StoredShort>({
			key: SHORTS_KEY,
			found: true,
			list: payload.shorts,
			seed: seedShortList,
			label: "shorts",
		});
		const mediaVersion =
			typeof payload.v === "string" && payload.v.trim()
				? payload.v.trim()
				: "1";
		return {
			shorts: normalizeShortMedia(list, mediaVersion),
			revision,
			mediaVersion,
		};
	}
	return {
		shorts: normalizeShortMedia(seedShortList(), "1"),
		revision,
		mediaVersion: "1",
	};
}

export async function listShorts(): Promise<StoredShort[]> {
	return (await readShortsCatalog()).shorts;
}

export async function saveShorts(
	shorts: StoredShort[],
	revision: CatalogRevision,
	cache?: SiteCacheRefreshOptions,
): Promise<CatalogRevision> {
	const v = Date.now().toString(36);
	const normalized = normalizeShortMedia(assertStoredShorts(shorts), v);
	const payload: ShortsCatalogPayload = { shorts: normalized, v };
	return writeCatalogRecord(
		SHORTS_KEY,
		payload as unknown as Record<string, unknown>,
		revision,
		cache,
	);
}

export function shortObjectKey(campaign: string, file: string) {
	if (!isShortSlug(campaign)) {
		throw new Error("Invalid short campaign segment.");
	}
	if (!isShortMediaFile(file)) {
		throw new Error("Invalid short media file segment.");
	}
	return assertSafeObjectKey(`shorts/${campaign}/${file}`);
}

function shortContentType(file: string) {
	return file.toLowerCase().endsWith(".webp") ? "image/webp" : "video/mp4";
}

async function localShortHead(key: string, file: string) {
	try {
		const { stat } = await import("node:fs/promises");
		const info = await stat(await localPath(key));
		return { size: info.size, contentType: shortContentType(file) };
	} catch {
		return null;
	}
}

async function localShortRange(
	key: string,
	file: string,
	offset: number,
	length: number,
): Promise<StoredMediaBody | null> {
	try {
		const { open } = await import("node:fs/promises");
		const handle = await open(await localPath(key), "r");
		try {
			const bytes = new Uint8Array(length);
			const { bytesRead } = await handle.read(bytes, 0, length, offset);
			return {
				body: bytes.subarray(0, bytesRead),
				size: bytesRead,
				contentType: shortContentType(file),
			};
		} finally {
			await handle.close();
		}
	} catch {
		return null;
	}
}

export async function getShortHead(campaign: string, file: string) {
	const key = shortObjectKey(campaign, file);
	const bucket = getBucket();
	if (bucket) {
		if (bucket.head) {
			const head = await bucket.head(key);
			if (head) {
				return {
					size: head.size,
					contentType: head.httpMetadata?.contentType || shortContentType(file),
				};
			}
		} else {
			const object = await bucket.get(key);
			if (object) {
				if (typeof object.size === "number") {
					return {
						size: object.size,
						contentType:
							object.httpMetadata?.contentType || shortContentType(file),
					};
				}
				const bytes = await object.arrayBuffer();
				return {
					size: bytes.byteLength,
					contentType:
						object.httpMetadata?.contentType || shortContentType(file),
				};
			}
		}
		return localShortHead(key, file);
	}

	if (!import.meta.env.DEV) return null;
	return localShortHead(key, file);
}

export async function getShortRange(
	campaign: string,
	file: string,
	offset: number,
	length: number,
): Promise<StoredMediaBody | null> {
	const key = shortObjectKey(campaign, file);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key, { range: { offset, length } });
		if (object) {
			if (object.body) {
				return {
					body: object.body,
					size: length,
					contentType:
						object.httpMetadata?.contentType || shortContentType(file),
				};
			}
			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType: object.httpMetadata?.contentType || shortContentType(file),
			};
		}
		return localShortRange(key, file, offset, length);
	}

	if (!import.meta.env.DEV) return null;
	return localShortRange(key, file, offset, length);
}

export async function getShortBytes(
	campaign: string,
	file: string,
): Promise<StoredMediaBody | null> {
	const key = shortObjectKey(campaign, file);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (object) {
			const contentType =
				object.httpMetadata?.contentType || shortContentType(file);
			if (object.body) {
				const size =
					typeof object.size === "number"
						? object.size
						: (await bucket.head?.(key))?.size;
				if (typeof size === "number") {
					return { body: object.body, size, contentType };
				}
			}
			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType,
			};
		}
	} else if (!import.meta.env.DEV) {
		return null;
	}

	const local = await readLocalBytes(key);
	if (!local) return null;
	return {
		body: new Uint8Array(local),
		size: local.byteLength,
		contentType: shortContentType(file),
	};
}
