import type { StoredPhoto, StoredPhotoCategory } from "../../data/photos";

export type PhotosAlbumFilter = "all" | string;
export type PhotosSort = "order" | "title";

export interface PhotosQuery {
	/** Selected album slug, or `all` for every album. */
	album?: PhotosAlbumFilter;
	q?: string;
	sort?: PhotosSort;
}

function normalizeQuery(q: string): string {
	return q.trim().toLowerCase();
}

/** Case-insensitive match across title, alt, slug, and category slug. */
export function photoMatchesSearch(photo: StoredPhoto, q: string): boolean {
	const needle = normalizeQuery(q);
	if (!needle) return true;
	const haystack = [photo.title, photo.alt, photo.slug, photo.category]
		.join("\n")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterPhotosByAlbum(
	photos: StoredPhoto[],
	album: PhotosAlbumFilter = "all",
): StoredPhoto[] {
	if (album === "all") return photos;
	return photos.filter((photo) => photo.category === album);
}

export function searchPhotos(photos: StoredPhoto[], q = ""): StoredPhoto[] {
	const needle = normalizeQuery(q);
	if (!needle) return photos;
	return photos.filter((photo) => photoMatchesSearch(photo, needle));
}

/**
 * Catalog order is array order within each album.
 * Cross-album `all` preserves catalog array order.
 */
export function sortPhotos(
	photos: StoredPhoto[],
	sort: PhotosSort = "order",
): StoredPhoto[] {
	if (sort === "title") {
		return photos.slice().sort((a, b) =>
			a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
		);
	}
	return photos.slice();
}

/** Apply album filter → search → view sort. */
export function queryPhotos(
	photos: StoredPhoto[],
	query: PhotosQuery = {},
): StoredPhoto[] {
	const byAlbum = filterPhotosByAlbum(photos, query.album ?? "all");
	const searched = searchPhotos(byAlbum, query.q);
	return sortPhotos(searched, query.sort ?? "order");
}

/**
 * Photo reorder is only safe when the view shows one album's full catalog order.
 * Searching or title-sorting must not rewrite persistent order.
 */
export function photosReorderAllowed(query: PhotosQuery = {}): boolean {
	const album = query.album ?? "all";
	if (album === "all") return false;
	if ((query.sort ?? "order") !== "order") return false;
	if (normalizeQuery(query.q ?? "")) return false;
	return true;
}

/** Album rail reorder is independent of photo search; always allowed when writable. */
export function albumsReorderAllowed(): boolean {
	return true;
}

export function albumPhotoCounts(
	photos: StoredPhoto[],
	categories: StoredPhotoCategory[],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const category of categories) counts.set(category.slug, 0);
	for (const photo of photos) {
		counts.set(photo.category, (counts.get(photo.category) ?? 0) + 1);
	}
	return counts;
}
