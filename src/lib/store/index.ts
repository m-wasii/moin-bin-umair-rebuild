/**
 * Public storage API — existing `from ".../lib/store"` imports resolve here.
 */
export type {
	CatalogRevision,
	StoredVideo,
	StoredMediaBody,
} from "./types";
export type { StoredPhotoCategory } from "./photos";

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
} from "./shorts";

export { getMediaObject, getMediaHead, getMediaRange } from "./media";

export { heroMediaVersion, heroMediaSrc, touchHeroMedia } from "./hero";
