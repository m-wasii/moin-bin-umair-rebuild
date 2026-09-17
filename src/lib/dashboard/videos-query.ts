import type { ProjectCategory, VideoProvider } from "../../data/projects";
import type { StoredVideo } from "../store/types";

export type VideosCategoryFilter =
	"all" | Extract<ProjectCategory, "indie" | "local" | "bts">;
export type VideosFeaturedFilter = "all" | "featured" | "not-featured";
export type VideosProviderFilter = "all" | VideoProvider;
export type VideosSort = "order" | "title" | "category" | "year";

export interface VideosQuery {
	q?: string;
	category?: VideosCategoryFilter;
	featured?: VideosFeaturedFilter;
	provider?: VideosProviderFilter;
	sort?: VideosSort;
}

const CATEGORY_LABELS: Record<"indie" | "local" | "bts", string> = {
	indie: "Indie / Art",
	local: "Local",
	bts: "BTS",
};

function categoryLabel(category: ProjectCategory): string {
	if (category === "indie" || category === "local" || category === "bts") {
		return CATEGORY_LABELS[category];
	}
	return category;
}

function normalizeQuery(q: string): string {
	return q.trim().toLowerCase();
}

/** Case-insensitive match across title, description, slug, id, url, category label. */
export function videoMatchesSearch(video: StoredVideo, q: string): boolean {
	const needle = normalizeQuery(q);
	if (!needle) return true;
	const haystack = [
		video.title,
		video.description ?? "",
		video.slug,
		video.id,
		video.url,
		video.category,
		categoryLabel(video.category),
	]
		.join("\n")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterVideosByCategory(
	videos: StoredVideo[],
	category: VideosCategoryFilter = "all",
): StoredVideo[] {
	if (category === "all") return videos;
	return videos.filter((video) => video.category === category);
}

export function filterVideosByFeatured(
	videos: StoredVideo[],
	featured: VideosFeaturedFilter = "all",
): StoredVideo[] {
	if (featured === "all") return videos;
	if (featured === "featured") {
		return videos.filter((video) => video.featured === true);
	}
	return videos.filter((video) => !video.featured);
}

export function filterVideosByProvider(
	videos: StoredVideo[],
	provider: VideosProviderFilter = "all",
): StoredVideo[] {
	if (provider === "all") return videos;
	return videos.filter((video) => video.provider === provider);
}

export function searchVideos(videos: StoredVideo[], q = ""): StoredVideo[] {
	const needle = normalizeQuery(q);
	if (!needle) return videos;
	return videos.filter((video) => videoMatchesSearch(video, needle));
}

function compareOrder(a: StoredVideo, b: StoredVideo): number {
	const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
	const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
	if (ao !== bo) return ao - bo;
	return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function sortVideos(
	videos: StoredVideo[],
	sort: VideosSort = "order",
): StoredVideo[] {
	const copy = videos.slice();
	switch (sort) {
		case "title":
			return copy.sort((a, b) =>
				a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
			);
		case "category":
			return copy.sort((a, b) => {
				const byCat = a.category.localeCompare(b.category);
				if (byCat !== 0) return byCat;
				return compareOrder(a, b);
			});
		case "year":
			return copy.sort((a, b) => {
				if (a.year !== b.year) return b.year - a.year;
				return compareOrder(a, b);
			});
		case "order":
		default:
			return copy.sort(compareOrder);
	}
}

/** Apply search → filters → sort (stable pipeline for the Videos workspace). */
export function queryVideos(
	videos: StoredVideo[],
	query: VideosQuery = {},
): StoredVideo[] {
	const searched = searchVideos(videos, query.q);
	const byCategory = filterVideosByCategory(searched, query.category ?? "all");
	const byFeatured = filterVideosByFeatured(
		byCategory,
		query.featured ?? "all",
	);
	const byProvider = filterVideosByProvider(
		byFeatured,
		query.provider ?? "all",
	);
	return sortVideos(byProvider, query.sort ?? "order");
}

/** True when the list still represents full catalog order (reorder allowed). */
export function videosReorderAllowed(query: VideosQuery = {}): boolean {
	const sort = query.sort ?? "order";
	if (sort !== "order") return false;
	if (normalizeQuery(query.q ?? "")) return false;
	if ((query.category ?? "all") !== "all") return false;
	if ((query.featured ?? "all") !== "all") return false;
	if ((query.provider ?? "all") !== "all") return false;
	return true;
}
