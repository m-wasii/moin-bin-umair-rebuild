import { env } from "cloudflare:workers";
import seedVideos from "../data/videos.seed.json";
import seedPhotos from "../data/photos.seed.json";
import type { ProjectCategory, VideoProvider } from "../data/projects";
import type { PhotoCategory, StoredPhoto } from "../data/photos";

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

const VIDEOS_KEY = "catalog/videos.json";
const PHOTOS_KEY = "catalog/photos.json";

interface MediaObject {
	json<T = unknown>(): Promise<T>;
	arrayBuffer(): Promise<ArrayBuffer>;
}

interface MediaBucket {
	get(key: string): Promise<MediaObject | null>;
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

async function localPath(key: string) {
	const { join } = await import("node:path");
	return join(process.cwd(), ".data", "media", key);
}

async function readLocalJson<T>(key: string): Promise<T | null> {
	if (!import.meta.env.DEV) return null;
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
		throw new Error("Media storage is not configured (missing R2 binding MEDIA).");
	}
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	const path = await localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

async function readLocalBytes(key: string) {
	if (!import.meta.env.DEV) return null;
	try {
		const { readFile } = await import("node:fs/promises");
		return await readFile(await localPath(key));
	} catch {
		return null;
	}
}

async function writeLocalBytes(key: string, bytes: Uint8Array) {
	if (!import.meta.env.DEV) {
		throw new Error("Media storage is not configured (missing R2 binding MEDIA).");
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

export async function listPhotos(): Promise<StoredPhoto[]> {
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(PHOTOS_KEY);
		if (object) {
			const payload = (await object.json()) as { photos?: StoredPhoto[] };
			if (Array.isArray(payload.photos)) return payload.photos;
		}
		return seedPhotoList();
	}

	const local = await readLocalJson<{ photos: StoredPhoto[] }>(PHOTOS_KEY);
	return local?.photos ?? seedPhotoList();
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
		if (!object) return null;
		return new Uint8Array(await object.arrayBuffer());
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

export function youtubeApiKey() {
	return workerEnv().YOUTUBE_API_KEY || import.meta.env.YOUTUBE_API_KEY;
}

export function dashboardAccessEnforced() {
	return workerEnv().DASHBOARD_ENFORCE_CF_ACCESS !== "false";
}
