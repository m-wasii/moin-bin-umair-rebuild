import seedPhotos from "../../data/photos.seed.json";
import {
	defaultPhotoCategories,
	photoMediaSrc,
	type PhotoCategory,
	type StoredPhoto,
	type StoredPhotoCategory,
} from "../../data/photos";
import {
	assertSafeStorageSegment,
	assertStoredPhotoCategories,
	assertStoredPhotos,
} from "../catalog-integrity";
import type { SiteCacheRefreshOptions } from "../site-cache";
import {
	assertSafeObjectKey,
	deleteLocal,
	getBucket,
	readLocalBytes,
	writeLocalBytes,
} from "./bucket";
import {
	readCatalogRecord,
	resolveCatalogList,
	writeCatalogRecord,
} from "./catalog";
import type { CatalogRevision, StoredMediaBody } from "./types";
import { PHOTO_CATEGORIES_KEY, PHOTOS_KEY } from "./types";

export type { StoredPhotoCategory };

function seedPhotoList(): StoredPhoto[] {
	return (seedPhotos as { photos: StoredPhoto[] }).photos;
}

function seedPhotoCategoryList(): StoredPhotoCategory[] {
	return defaultPhotoCategories.map((entry) => ({
		slug: entry.slug,
		label: entry.label,
	}));
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
	const photos = resolveCatalogList<StoredPhoto>({
		key: PHOTOS_KEY,
		found: revision.found,
		list: payload.photos,
		seed: seedPhotoList,
		label: "photos",
	}).map(normalizeStoredPhoto);
	return { photos, revision };
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
	const categories = resolveCatalogList<StoredPhotoCategory>({
		key: PHOTO_CATEGORIES_KEY,
		found: revision.found,
		list: payload.categories,
		seed: seedPhotoCategoryList,
		label: "photo-categories",
	});
	return { categories, revision };
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
	const safeCategory = assertSafeStorageSegment(category, "photo category");
	const safeSlug = assertSafeStorageSegment(slug, "photo slug");
	return assertSafeObjectKey(`photography/${safeCategory}/${safeSlug}.webp`);
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

/**
 * Prefer streaming the R2 body for photo delivery; buffer only for local DEV.
 * R2 miss falls through to `.data/media` (local / node_compat).
 */
export async function getPhotoObject(
	category: PhotoCategory,
	slug: string,
): Promise<StoredMediaBody | null> {
	const key = photoObjectKey(category, slug);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(key);
		if (object) {
			const contentType = object.httpMetadata?.contentType || "image/webp";
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
			return { body: bytes, size: bytes.byteLength, contentType };
		}
	} else if (!import.meta.env.DEV) {
		console.error("[store] MEDIA binding missing; cannot read photo");
		return null;
	}

	const local = await readLocalBytes(key);
	if (!local) return null;
	return {
		body: new Uint8Array(local),
		size: local.byteLength,
		contentType: "image/webp",
	};
}

/** @deprecated Prefer getPhotoObject for HTTP delivery; kept for callers needing bytes. */
export async function getPhotoBytes(category: PhotoCategory, slug: string) {
	const object = await getPhotoObject(category, slug);
	if (!object) return null;
	if (object.body instanceof Uint8Array) return object.body;
	const reader = object.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
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
