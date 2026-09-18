/**
 * Public storage API — existing `from ".../lib/store"` imports resolve here.
 */
export type { CatalogRevision, StoredVideo, StoredMediaBody } from "./types";
export type { StoredPhotoCategory } from "./photos";
export type { WriteCatalogResult } from "./catalog";

export {
	hasWritableMedia,
	youtubeApiKey,
	dashboardAccessEnforced,
} from "./bucket";

export { listVideos, readVideosCatalog, saveVideos } from "./videos";

export {
	listPhotos,
	readPhotosCatalog,
	savePhotos,
	listPhotoCategories,
	readPhotoCategoriesCatalog,
	savePhotoCategories,
	photoObjectKey,
	putPhotoBytes,
	getPhotoObject,
	getPhotoBytes,
	deletePhotoBytes,
} from "./photos";

export {
	listShorts,
	readShortsCatalog,
	saveShorts,
	shortObjectKey,
	getShortHead,
	getShortRange,
	getShortBytes,
	putShortBytes,
	deleteShortBytes,
	deleteShortEntryMedia,
} from "./shorts";

export {
	getMediaObject,
	getMediaHead,
	getMediaRange,
	putMediaBytes,
	deleteMediaBytes,
	copyMediaBytes,
} from "./media";

export {
	heroMediaVersion,
	heroMediaSrc,
	touchHeroMedia,
	readHeroCatalog,
	HERO_LOOP_KEY,
	HERO_POSTER_KEY,
} from "./hero";
