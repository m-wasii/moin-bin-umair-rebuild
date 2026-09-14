import seedVideos from "../../data/videos.seed.json";
import { assertStoredVideos } from "../catalog-integrity";
import type { SiteCacheRefreshOptions } from "../site-cache";
import { readCatalogRecord, resolveCatalogList, writeCatalogRecord } from "./catalog";
import type { CatalogRevision, StoredVideo } from "./types";
import { VIDEOS_KEY } from "./types";

function seedVideoList(): StoredVideo[] {
	return (seedVideos as { videos: StoredVideo[] }).videos;
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
	const videos = resolveCatalogList<StoredVideo>({
		key: VIDEOS_KEY,
		found: revision.found,
		list: payload.videos,
		seed: seedVideoList,
		label: "videos",
	}).map(normalizeStoredVideo);
	return { videos, revision };
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
