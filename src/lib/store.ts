import { env } from "cloudflare:workers";
import seedVideos from "../data/videos.seed.json";
import seedPhotos from "../data/photos.seed.json";
import seedShorts from "../data/shorts.seed.json";
import type { ProjectCategory, VideoProvider } from "../data/projects";
import {
	defaultPhotoCategories,
	isActiveCategory,
	isActivePhoto,
	type PhotoCategory,
	type StoredPhoto,
	type StoredPhotoCategory,
} from "../data/photos";
import type { StoredShort } from "../data/shorts";

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
	/** ISO timestamp when moved to recycle bin; omitted when active. */
	deletedAt?: string | null;
}

const VIDEOS_KEY = "catalog/videos.json";
const PHOTOS_KEY = "catalog/photos.json";
const PHOTO_CATEGORIES_KEY = "catalog/photo-categories.json";
const SHORTS_KEY = "catalog/shorts.json";

export type { StoredPhotoCategory };
interface MediaObject {
	json<T = unknown>(): Promise<T>;
	arrayBuffer(): Promise<ArrayBuffer>;
	body?: ReadableStream<Uint8Array>;
	size?: number;
	httpMetadata?: { contentType?: string };
}

interface MediaHead {
	size: number;
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

export async function listVideos(
	options: { includeDeleted?: boolean } = {},
): Promise<StoredVideo[]> {
	const { includeDeleted = false } = options;
	let videos: StoredVideo[];

	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(VIDEOS_KEY);
		if (object) {
			const payload = (await object.json()) as { videos?: StoredVideo[] };
			videos = Array.isArray(payload.videos) ? payload.videos : seedVideoList();
		} else {
			videos = seedVideoList();
		}
	} else {
		const local = await readLocalJson<{ videos: StoredVideo[] }>(VIDEOS_KEY);
		videos = local?.videos ?? seedVideoList();
	}

	if (includeDeleted) return videos;
	return videos.filter((video) => !video.deletedAt);
}

export async function saveVideos(videos: StoredVideo[]) {
	const payload = { videos };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(VIDEOS_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
		return;
	}
	await writeLocalJson(VIDEOS_KEY, payload);
}

export async function listPhotos(
	options: { includeDeleted?: boolean } = {},
): Promise<StoredPhoto[]> {
	const { includeDeleted = false } = options;
	let photos: StoredPhoto[];

	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(PHOTOS_KEY);
		if (object) {
			const payload = (await object.json()) as { photos?: StoredPhoto[] };
			photos = Array.isArray(payload.photos) ? payload.photos : seedPhotoList();
		} else {
			photos = seedPhotoList();
		}
	} else {
		const local = await readLocalJson<{ photos: StoredPhoto[] }>(PHOTOS_KEY);
		photos = local?.photos ?? seedPhotoList();
	}

	if (includeDeleted) return photos;

	const categories = await listPhotoCategories({ includeDeleted: true });
	const activeCategorySlugs = new Set(
		categories.filter(isActiveCategory).map((entry) => entry.slug),
	);
	return photos.filter(
		(photo) => isActivePhoto(photo) && activeCategorySlugs.has(photo.category),
	);
}

export async function savePhotos(photos: StoredPhoto[]) {
	const payload = { photos };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(PHOTOS_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
		return;
	}
	await writeLocalJson(PHOTOS_KEY, payload);
}

export async function listPhotoCategories(
	options: { includeDeleted?: boolean } = {},
): Promise<StoredPhotoCategory[]> {
	const { includeDeleted = false } = options;
	let categories: StoredPhotoCategory[];

	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(PHOTO_CATEGORIES_KEY);
		if (object) {
			const payload = (await object.json()) as {
				categories?: StoredPhotoCategory[];
			};
			categories = Array.isArray(payload.categories)
				? payload.categories
				: seedPhotoCategoryList();
		} else {
			categories = seedPhotoCategoryList();
		}
	} else {
		const local = await readLocalJson<{ categories: StoredPhotoCategory[] }>(
			PHOTO_CATEGORIES_KEY,
		);
		categories = local?.categories ?? seedPhotoCategoryList();
	}

	if (includeDeleted) return categories;
	return categories.filter(isActiveCategory);
}

export async function savePhotoCategories(categories: StoredPhotoCategory[]) {
	const payload = { categories };
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(PHOTO_CATEGORIES_KEY, JSON.stringify(payload), {
			httpMetadata: { contentType: "application/json" },
		});
		return;
	}
	await writeLocalJson(PHOTO_CATEGORIES_KEY, payload);
}

export async function findPhotoCategory(
	slug: string,
	options: { includeDeleted?: boolean } = {},
) {
	const categories = await listPhotoCategories({
		includeDeleted: options.includeDeleted ?? true,
	});
	return categories.find((entry) => entry.slug === slug) ?? null;
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
			const payload = (await object.json()) as { shorts?: StoredShort[] };
			if (Array.isArray(payload.shorts) && payload.shorts.length) {
				return normalizeShortMedia(payload.shorts);
			}
		}
	}

	const local = await readLocalJson<{ shorts: StoredShort[] }>(SHORTS_KEY);
	return normalizeShortMedia(local?.shorts ?? seedShortList());
}

function rewriteShortMediaPath(path: string) {
	return path.startsWith("/shorts/") ? `/media${path}` : path;
}

/** Ensure clip src/poster URLs go through /media/shorts (R2 + static fallback), not bare /shorts. */
function normalizeShortMedia(shorts: StoredShort[]): StoredShort[] {
	return shorts.map((entry) => ({
		...entry,
		clips: entry.clips.map((clip) => ({
			...clip,
			src: rewriteShortMediaPath(clip.src),
			poster: rewriteShortMediaPath(clip.poster),
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
