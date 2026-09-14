import type { ProjectCategory, VideoProvider } from "../../data/projects";

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

/** Snapshot used for optimistic concurrency on the next write. */
export interface CatalogRevision {
	/** Monotonic revision stored in catalog JSON (0 if never written / legacy). */
	rev: number;
	/** R2 object etag when available; used for conditional puts. */
	etag?: string;
	/** True when a catalog object already exists in storage. */
	found: boolean;
}

export interface MediaObject {
	json<T = unknown>(): Promise<T>;
	arrayBuffer(): Promise<ArrayBuffer>;
	body?: ReadableStream<Uint8Array>;
	size?: number;
	etag?: string;
	uploaded?: Date;
	httpMetadata?: { contentType?: string };
}

export interface MediaHead {
	size: number;
	etag?: string;
	uploaded?: Date;
	httpMetadata?: { contentType?: string };
}

export interface R2PutOptions {
	httpMetadata?: { contentType?: string };
	onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
}

export interface MediaBucket {
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

/** Body returned from R2 stream or local buffer. */
export interface StoredMediaBody {
	body: ReadableStream<Uint8Array> | Uint8Array;
	size: number;
	contentType: string;
}

export interface CatalogRecord {
	payload: Record<string, unknown>;
	revision: CatalogRevision;
}

export const VIDEOS_KEY = "catalog/videos.json";
export const PHOTOS_KEY = "catalog/photos.json";
export const PHOTO_CATEGORIES_KEY = "catalog/photo-categories.json";
export const SHORTS_KEY = "catalog/shorts.json";
export const HERO_META_KEY = "catalog/hero.json";
