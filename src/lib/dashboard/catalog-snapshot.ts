import { isShortCampaign } from "../../data/shorts";
import {
	hasWritableMedia,
	heroMediaSrc,
	heroMediaVersion,
	readPhotoCategoriesCatalog,
	readPhotosCatalog,
	readShortsCatalog,
	readVideosCatalog,
} from "../store";
import { readCatalogRecord } from "../store/catalog";
import { getMediaHead } from "../store/media";
import { HERO_META_KEY } from "../store/types";
import { EMPTY_REVISION, type CatalogRevisionMap } from "./revision-state";

export interface DashboardCatalogSnapshot {
	writable: boolean;
	counts: {
		videos: number;
		albums: number;
		photos: number;
		shorts: number;
		shortCampaigns: number;
		shortSingles: number;
	};
	revisions: CatalogRevisionMap;
	hero: {
		posterSrc: string | null;
		version: string;
		managedInCms: true;
		loopPresent: boolean;
		posterPresent: boolean;
	};
	attention: Array<{
		id: string;
		title: string;
		detail: string;
		href?: string;
	}>;
}

/** Real catalog/state snapshot for Home and shell bootstrap. */
export async function readDashboardCatalogSnapshot(): Promise<DashboardCatalogSnapshot> {
	const [
		videosCatalog,
		photosCatalog,
		categoriesCatalog,
		shortsCatalog,
		heroRecord,
		heroVersion,
		posterHead,
		loopHead,
	] = await Promise.all([
		readVideosCatalog(),
		readPhotosCatalog(),
		readPhotoCategoriesCatalog(),
		readShortsCatalog(),
		readCatalogRecord(HERO_META_KEY),
		heroMediaVersion(),
		getMediaHead("media/hero-poster.webp"),
		getMediaHead("media/hero-loop.mp4"),
	]);

	const shorts = shortsCatalog.shorts;
	const shortCampaigns = shorts.filter(isShortCampaign).length;
	const shortSingles = shorts.length - shortCampaigns;
	const emptyAlbums = categoriesCatalog.categories.filter(
		(category) =>
			!photosCatalog.photos.some((photo) => photo.category === category.slug),
	);

	const revisions: CatalogRevisionMap = {
		videos: videosCatalog.revision,
		photos: photosCatalog.revision,
		photoCategories: categoriesCatalog.revision,
		shorts: shortsCatalog.revision,
		hero: heroRecord.revision.found
			? heroRecord.revision
			: { ...EMPTY_REVISION },
	};

	const writable = hasWritableMedia();
	const attention: DashboardCatalogSnapshot["attention"] = [];

	if (!writable) {
		attention.push({
			id: "media-unbound",
			title: "Media storage unavailable",
			detail:
				"R2 MEDIA is not bound on this Worker. Catalogs are readable, but saves and uploads will fail.",
		});
	}

	if (!posterHead || !loopHead) {
		attention.push({
			id: "hero-incomplete",
			title: "Hero media incomplete",
			detail: !posterHead && !loopHead
				? "Hero loop and poster are missing from MEDIA."
				: !posterHead
					? "Hero poster is missing from MEDIA."
					: "Hero loop is missing from MEDIA.",
			href: "/dashboard/site",
		});
	}

	for (const album of emptyAlbums) {
		attention.push({
			id: `empty-album-${album.slug}`,
			title: `Empty album: ${album.label}`,
			detail: "This album has no photos yet.",
			href: "/dashboard/photos",
		});
	}

	if (attention.length === 0) {
		attention.push({
			id: "all-clear",
			title: "Nothing needs attention",
			detail: "Catalogs are readable and hero media is present.",
		});
	}

	return {
		writable,
		counts: {
			videos: videosCatalog.videos.length,
			albums: categoriesCatalog.categories.length,
			photos: photosCatalog.photos.length,
			shorts: shorts.length,
			shortCampaigns,
			shortSingles,
		},
		revisions,
		hero: {
			posterSrc: posterHead
				? heroMediaSrc("hero-poster.webp", heroVersion)
				: null,
			version: heroVersion,
			managedInCms: true,
			loopPresent: Boolean(loopHead),
			posterPresent: Boolean(posterHead),
		},
		attention,
	};
}
