import { env } from "cloudflare:workers";
import seedVideos from "../data/videos.seed.json";
import seedPhotos from "../data/photos.seed.json";
import seedShorts from "../data/shorts.seed.json";
import type { ProjectCategory, VideoProvider } from "../data/projects";
import {
	defaultPhotoCategories,
	photoMediaSrc,
	type PhotoCategory,
	type StoredPhoto,
	type StoredPhotoCategory,
} from "../data/photos";
import type { StoredShort } from "../data/shorts";
import {
	assertStoredPhotoCategories,
	assertStoredPhotos,
	assertStoredShorts,
	assertStoredVideos,
	CatalogConflictError,
	parseCatalogRev,
} from "./catalog-integrity";
import { withMediaVersion } from "./media-url";
import {
	refreshPublicHtmlCache,
	type SiteCacheRefreshOptions,
} from "./site-cache";

export interface StoredVideo {
	slug: string;
	url: string;
	id: string;
	title: string;
	category: ProjectCategory;
	year: number;
	duration: number;
	thumbnail: string;
	provider: VideoProvider;
	description?: string;
	featured?: boolean;
	sortOrder?: number;
}

export type { StoredPhotoCategory };

const VIDEOS_KEY = "catalog/videos.json";
const PHOTOS_KEY = "catalog/photos.json";
const PHOTO_CATEGORIES_KEY = "catalog/photo-categories.json";
const SHORTS_KEY = "catalog/shorts.json";
const HERO_META_KEY = "catalog/hero.json";

interface ShortsCatalogPayload {
	shorts: StoredShort[];
	/** Catalog-wide media version applied to clip src/poster URLs. */
	v?: string;
	rev?: number;
}

interface HeroCatalogPayload {
	v?: string;
	rev?: number;
}

/** Snapshot used for optimistic concurrency on the next write. */
export interface CatalogRevision {
	/** Monotonic revision stored in catalog JSON (0 if never written / legacy). */
	rev: number;
	/** R2 object etag when available; used for conditional puts. */
	etag?: string;
	/** True when a catalog object already exists in storage. */
	found: boolean;
}

interface MediaObject {
	json<T = unknown>(): Promise<T>;
	arrayBuffer(): Promise<ArrayBuffer>;
	body?: ReadableStream<Uint8Array>;
	size?: number;
	etag?: string;
	uploaded?: Date;
	httpMetadata?: { contentType?: string };
}

interface MediaHead {
	size: number;
	etag?: string;
	uploaded?: Date;
	httpMetadata?: { contentType?: string };
}

interface R2PutOptions {
	httpMetadata?: { contentType?: string };
	onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
}

interface MediaBucket {
	get(
		key: string,
		options?: { range?: { offset: number; length: number } },
	): Promise<MediaObject | null>;
	head?(key: string): Promise<MediaHead | null>;
	put(
		key: string,
		value: string | Uint8Array,
		options?: R2PutOptions,
	): Promise<unknown>;
	delete(key: string): Promise<unknown>;
}

function workerEnv() {
	return env as {
		MEDIA?: MediaBucket;
		YOUTUBE_API_KEY?: string;
		CDN_PURGE_SECRET?: string;
		DASHBOARD_ENFORCE_CF_ACCESS?: string;
	};
}

function getBucket(): MediaBucket | undefined {
	return workerEnv().MEDIA;
}

function seedVideoList(): StoredVideo[] {
	return (seedVideos as { videos: StoredVideo[] }).videos;
}

function seedPhotoList(): StoredPhoto[] {
	return (seedPhotos as { photos: StoredPhoto[] }).photos;
}

function seedPhotoCategoryList(): StoredPhotoCategory[] {
	return defaultPhotoCategories.map((entry) => ({
		slug: entry.slug,
		label: entry.label,
	}));
}

function seedShortList(): StoredShort[] {
	return (seedShorts as { shorts: StoredShort[] }).shorts;
}

async function localPath(key: string) {
	const { join } = await import("node:path");
	return join(process.cwd(), ".data", "media", key);
}

async function readLocalJson<T>(key: string): Promise<T | null> {
	try {
		const { readFile } = await import("node:fs/promises");
		const raw = await readFile(await localPath(key), "utf8");
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

async function writeLocalJson(key: string, value: unknown) {
	if (!import.meta.env.DEV) {
		throw new Error(
			"Media storage is not configured (missing R2 binding MEDIA).",
		);
	}
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	const path = await localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

async function readLocalBytes(key: string) {
	try {
		const { readFile } = await import("node:fs/promises");
		return await readFile(await localPath(key));
	} catch {
		return null;
	}
}

async function writeLocalBytes(key: string, bytes: Uint8Array) {
	if (!import.meta.env.DEV) {
		throw new Error(
			"Media storage is not configured (missing R2 binding MEDIA).",
		);
	}
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	const path = await localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
}

async function deleteLocal(key: string) {
	if (!import.meta.env.DEV) return;
	try {
		const { unlink } = await import("node:fs/promises");
		await unlink(await localPath(key));
	} catch {
		// ignore
	}
}

/** Serialize local catalog mutations per key (dev / single-process). */
const localCatalogLocks = new Map<string, Promise<void>>();

async function withLocalCatalogLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = localCatalogLocks.get(key) ?? Promise.resolve();
	let release!: () => void;
	const done = new Promise<void>((resolve) => {
		release = resolve;
	});
	const chain = previous.then(() => done);
	localCatalogLocks.set(key, chain);
	await previous.catch(() => undefined);
	try {
		return await fn();
	} finally {
		release();
		if (localCatalogLocks.get(key) === chain) {
			localCatalogLocks.delete(key);
		}
	}
}

interface CatalogRecord {
	payload: Record<string, unknown>;
	revision: CatalogRevision;
}

async function readCatalogRecord(key: string): Promise<CatalogRecord> {
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
async function writeCatalogRecord(
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

export function hasWritableMedia() {
	return Boolean(getBucket()) || import.meta.env.DEV;
}

function normalizeStoredVideo(video: StoredVideo): StoredVideo {
	const raw = video.category as string;
	const category =
		raw === "commercial" ? "indie" : raw === "art" ? "local" : video.category;
	if (category === video.category) return video;
	return { ...video, category };
}

export async function readVideosCatalog(): Promise<{
	videos: StoredVideo[];
	revision: CatalogRevision;
}> {
	const { payload, revision } = await readCatalogRecord(VIDEOS_KEY);
	if (revision.found && Array.isArray(payload.videos)) {
		return {
			videos: (payload.videos as StoredVideo[]).map(normalizeStoredVideo),
			revision,
		};
	}
	return {
		videos: seedVideoList().map(normalizeStoredVideo),
		revision,
	};
}

export async function listVideos(): Promise<StoredVideo[]> {
	return (await readVideosCatalog()).videos;
}

export async function saveVideos(
	videos: StoredVideo[],
	revision: CatalogRevision,
	cache?: SiteCacheRefreshOptions,
): Promise<CatalogRevision> {
	const validated = assertStoredVideos(videos).map(normalizeStoredVideo);
	return writeCatalogRecord(VIDEOS_KEY, { videos: validated }, revision, cache);
}

function photoVersion(photo: StoredPhoto) {
	if (photo.v?.trim()) return photo.v.trim();
	const match = /[?&]v=([^&]+)/.exec(photo.src);
	if (match?.[1]) return decodeURIComponent(match[1]);
	return "1";
}

function normalizeStoredPhoto(photo: StoredPhoto): StoredPhoto {
	const v = photoVersion(photo);
	return {
		...photo,
		v,
		src: photoMediaSrc(photo.category, photo.slug, v),
	};
}

export async function readPhotosCatalog(): Promise<{
	photos: StoredPhoto[];
	revision: CatalogRevision;
}> {
	const { payload, revision } = await readCatalogRecord(PHOTOS_KEY);
	if (revision.found && Array.isArray(payload.photos)) {
		return {
			photos: (payload.photos as StoredPhoto[]).map(normalizeStoredPhoto),
			revision,
		};
	}
	return {
		photos: seedPhotoList().map(normalizeStoredPhoto),
		revision,
	};
}

export async function listPhotos(): Promise<StoredPhoto[]> {
	return (await readPhotosCatalog()).photos;
}

export async function savePhotos(
	photos: StoredPhoto[],
	revision: CatalogRevision,
	cache?: SiteCacheRefreshOptions,
): Promise<CatalogRevision> {
	const normalized = assertStoredPhotos(photos).map(normalizeStoredPhoto);
	return writeCatalogRecord(
		PHOTOS_KEY,
		{ photos: normalized },
		revision,
		cache,
	);
}

export async function readPhotoCategoriesCatalog(): Promise<{
	categories: StoredPhotoCategory[];
	revision: CatalogRevision;
}> {
	const { payload, revision } = await readCatalogRecord(PHOTO_CATEGORIES_KEY);
	if (revision.found && Array.isArray(payload.categories)) {
		return {
			categories: payload.categories as StoredPhotoCategory[],
			revision,
		};
	}
	return {
		categories: seedPhotoCategoryList(),
		revision,
	};
}

export async function listPhotoCategories(): Promise<StoredPhotoCategory[]> {
	return (await readPhotoCategoriesCatalog()).categories;
}

export async function savePhotoCategories(
	categories: StoredPhotoCategory[],
	revision: CatalogRevision,
	cache?: SiteCacheRefreshOptions,
): Promise<CatalogRevision> {
	const validated = assertStoredPhotoCategories(categories);
	return writeCatalogRecord(
		PHOTO_CATEGORIES_KEY,
		{ categories: validated },
		revision,
		cache,
	);
}

export function photoObjectKey(category: PhotoCategory, slug: string) {
	return `photography/${category}/${slug}.webp`;
}

export async function putPhotoBytes(
	category: PhotoCategory,
	slug: string,
	bytes: Uint8Array,
) {
	const key = photoObjectKey(category, slug);
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(key, bytes, {
			httpMetadata: { contentType: "image/webp" },
		});
		return;
	}
	await writeLocalBytes(key, bytes);
}

export async function getPhotoBytes(category: PhotoCategory, slug: string) {
	const key = photoObjectKey(category, slug);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (object) return new Uint8Array(await object.arrayBuffer());
	}
	const local = await readLocalBytes(key);
	return local ? new Uint8Array(local) : null;
}

function guessMediaContentType(key: string) {
	const lower = key.toLowerCase();
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".mp4")) return "video/mp4";
	return "application/octet-stream";
}

/** R2 / local `.data/media` object (e.g. `media/hero-loop.mp4`). */
export async function getMediaObject(key: string) {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (object) {
			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType:
					object.httpMetadata?.contentType || guessMediaContentType(key),
			};
		}
	}

	const local = await readLocalBytes(key);
	if (!local) return null;
	return {
		body: new Uint8Array(local),
		size: local.byteLength,
		contentType: guessMediaContentType(key),
	};
}

export async function getMediaHead(key: string): Promise<MediaHead | null> {
	const bucket = getBucket();
	if (bucket) {
		if (bucket.head) {
			const head = await bucket.head(key);
			if (head) return head;
		} else {
			const object = await bucket.get(key);
			if (object) {
				const bytes = await object.arrayBuffer();
				return {
					size: object.size ?? bytes.byteLength,
					etag: object.etag,
					uploaded: object.uploaded,
					httpMetadata: object.httpMetadata,
				};
			}
		}
	}

	try {
		const { stat } = await import("node:fs/promises");
		const info = await stat(await localPath(key));
		return {
			size: info.size,
			uploaded: info.mtime,
			httpMetadata: { contentType: guessMediaContentType(key) },
		};
	} catch {
		return null;
	}
}

function versionFromMediaHead(head: MediaHead | null) {
	if (!head) return "1";
	if (head.etag) return head.etag.replace(/"/g, "");
	if (head.uploaded) return String(head.uploaded.getTime());
	return String(head.size || "1");
}

/** Cache-bust query for hero poster/loop from catalog or R2 object metadata. */
export async function heroMediaVersion() {
	const meta = await readHeroMeta();
	if (meta?.payload.v?.trim()) return meta.payload.v.trim();

	const [loop, poster] = await Promise.all([
		getMediaHead("media/hero-loop.mp4"),
		getMediaHead("media/hero-poster.webp"),
	]);
	return `${versionFromMediaHead(loop)}-${versionFromMediaHead(poster)}`;
}

export function heroMediaSrc(
	file: "hero-loop.mp4" | "hero-poster.webp",
	version: string,
) {
	return withMediaVersion(`/media/${file}`, version);
}

async function readHeroMeta(): Promise<{
	payload: HeroCatalogPayload;
	revision: CatalogRevision;
} | null> {
	const { payload, revision } = await readCatalogRecord(HERO_META_KEY);
	if (!revision.found) return null;
	return {
		payload: payload as HeroCatalogPayload,
		revision,
	};
}

/** Persist hero version + purge/warm when hero bytes are replaced. */
export async function touchHeroMedia(
	version = Date.now().toString(36),
	cache?: SiteCacheRefreshOptions,
) {
	const current = await readHeroMeta();
	const revision = current?.revision ?? { rev: 0, found: false };
	const payload: HeroCatalogPayload = { v: version };
	await writeCatalogRecord(
		HERO_META_KEY,
		payload as Record<string, unknown>,
		revision,
		cache,
	);
}

export async function deletePhotoBytes(category: PhotoCategory, slug: string) {
	const key = photoObjectKey(category, slug);
	const bucket = getBucket();
	if (bucket) {
		await bucket.delete(key);
		return;
	}
	await deleteLocal(key);
}

export async function readShortsCatalog(): Promise<{
	shorts: StoredShort[];
	revision: CatalogRevision;
	mediaVersion: string;
}> {
	const { payload, revision } = await readCatalogRecord(SHORTS_KEY);
	if (revision.found && Array.isArray(payload.shorts)) {
		const mediaVersion =
			typeof payload.v === "string" && payload.v.trim()
				? payload.v.trim()
				: "1";
		return {
			shorts: normalizeShortMedia(
				payload.shorts as StoredShort[],
				mediaVersion,
			),
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

export function shortObjectKey(campaign: string, file: string) {
	return `shorts/${campaign}/${file}`;
}

function shortContentType(file: string) {
	return file.toLowerCase().endsWith(".webp") ? "image/webp" : "video/mp4";
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
				const bytes = await object.arrayBuffer();
				return {
					size: object.size ?? bytes.byteLength,
					contentType:
						object.httpMetadata?.contentType || shortContentType(file),
				};
			}
		}
	}

	try {
		const { stat } = await import("node:fs/promises");
		const info = await stat(await localPath(key));
		return { size: info.size, contentType: shortContentType(file) };
	} catch {
		return null;
	}
}

export async function getShortRange(
	campaign: string,
	file: string,
	offset: number,
	length: number,
) {
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
	}

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

export async function getShortBytes(campaign: string, file: string) {
	const key = shortObjectKey(campaign, file);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (object) {
			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType: object.httpMetadata?.contentType || shortContentType(file),
			};
		}
	}

	const local = await readLocalBytes(key);
	if (!local) return null;
	return {
		body: new Uint8Array(local),
		size: local.byteLength,
		contentType: shortContentType(file),
	};
}

export function youtubeApiKey() {
	return workerEnv().YOUTUBE_API_KEY || import.meta.env.YOUTUBE_API_KEY;
}

export function dashboardAccessEnforced() {
	return workerEnv().DASHBOARD_ENFORCE_CF_ACCESS !== "false";
}
