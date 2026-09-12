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
}

interface HeroCatalogPayload {
	v?: string;
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

interface MediaBucket {
	get(
		key: string,
		options?: { range?: { offset: number; length: number } },
	): Promise<MediaObject | null>;
	head?(key: string): Promise<MediaHead | null>;
	put(
		key: string,
		value: string | Uint8Array,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
	delete(key: string): Promise<unknown>;
}

function workerEnv() {
	return env as {
		MEDIA?: MediaBucket;
		YOUTUBE_API_KEY?: string;
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

export function hasWritableMedia() {
	return Boolean(getBucket()) || import.meta.env.DEV;
}

export async function listVideos(): Promise<StoredVideo[]> {
	const raw = await readVideoCatalog();
	return raw.map(normalizeStoredVideo);
}

async function readVideoCatalog(): Promise<StoredVideo[]> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(VIDEOS_KEY);
		if (object) {
			const payload = (await object.json()) as { videos?: StoredVideo[] };
			if (Array.isArray(payload.videos)) return payload.videos;
		}
		return seedVideoList();
	}

	const local = await readLocalJson<{ videos: StoredVideo[] }>(VIDEOS_KEY);
	return local?.videos ?? seedVideoList();
}

function normalizeStoredVideo(video: StoredVideo): StoredVideo {
	const raw = video.category as string;
	const category =
		raw === "commercial" ? "indie" : raw === "art" ? "local" : video.category;
	if (category === video.category) return video;
	return { ...video, category };
}

export async function saveVideos(
	videos: StoredVideo[],
	cache?: SiteCacheRefreshOptions,
) {
	const payload = { videos };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(VIDEOS_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
	} else {
		await writeLocalJson(VIDEOS_KEY, payload);
	}
	refreshPublicHtmlCache(cache);
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

export async function listPhotos(): Promise<StoredPhoto[]> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(PHOTOS_KEY);
		if (object) {
			const payload = (await object.json()) as { photos?: StoredPhoto[] };
			if (Array.isArray(payload.photos)) {
				return payload.photos.map(normalizeStoredPhoto);
			}
		}
		return seedPhotoList().map(normalizeStoredPhoto);
	}

	const local = await readLocalJson<{ photos: StoredPhoto[] }>(PHOTOS_KEY);
	return (local?.photos ?? seedPhotoList()).map(normalizeStoredPhoto);
}

export async function savePhotos(
	photos: StoredPhoto[],
	cache?: SiteCacheRefreshOptions,
) {
	const normalized = photos.map(normalizeStoredPhoto);
	const payload = { photos: normalized };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(PHOTOS_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
	} else {
		await writeLocalJson(PHOTOS_KEY, payload);
	}
	refreshPublicHtmlCache(cache);
}

export async function listPhotoCategories(): Promise<StoredPhotoCategory[]> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(PHOTO_CATEGORIES_KEY);
		if (object) {
			const payload = (await object.json()) as {
				categories?: StoredPhotoCategory[];
			};
			if (Array.isArray(payload.categories)) return payload.categories;
		}
		return seedPhotoCategoryList();
	}

	const local = await readLocalJson<{ categories: StoredPhotoCategory[] }>(
		PHOTO_CATEGORIES_KEY,
	);
	return local?.categories ?? seedPhotoCategoryList();
}

export async function savePhotoCategories(
	categories: StoredPhotoCategory[],
	cache?: SiteCacheRefreshOptions,
) {
	const payload = { categories };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(PHOTO_CATEGORIES_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
	} else {
		await writeLocalJson(PHOTO_CATEGORIES_KEY, payload);
	}
	refreshPublicHtmlCache(cache);
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
	if (meta?.v?.trim()) return meta.v.trim();

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

async function readHeroMeta(): Promise<HeroCatalogPayload | null> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(HERO_META_KEY);
		if (object) {
			return (await object.json()) as HeroCatalogPayload;
		}
		return null;
	}
	return readLocalJson<HeroCatalogPayload>(HERO_META_KEY);
}

/** Persist hero version + purge/warm when hero bytes are replaced. */
export async function touchHeroMedia(
	version = Date.now().toString(36),
	cache?: SiteCacheRefreshOptions,
) {
	const payload: HeroCatalogPayload = { v: version };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(HERO_META_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
	} else {
		await writeLocalJson(HERO_META_KEY, payload);
	}
	refreshPublicHtmlCache(cache);
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

export async function listShorts(): Promise<StoredShort[]> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(SHORTS_KEY);
		if (object) {
			const payload = (await object.json()) as ShortsCatalogPayload;
			if (Array.isArray(payload.shorts) && payload.shorts.length) {
				return normalizeShortMedia(payload.shorts, payload.v ?? "1");
			}
		}
	}

	const local = await readLocalJson<ShortsCatalogPayload>(SHORTS_KEY);
	return normalizeShortMedia(
		local?.shorts ?? seedShortList(),
		local?.v ?? "1",
	);
}

export async function saveShorts(
	shorts: StoredShort[],
	cache?: SiteCacheRefreshOptions,
) {
	const v = Date.now().toString(36);
	const normalized = normalizeShortMedia(shorts, v);
	const payload: ShortsCatalogPayload = { shorts: normalized, v };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(SHORTS_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
	} else {
		await writeLocalJson(SHORTS_KEY, payload);
	}
	refreshPublicHtmlCache(cache);
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
