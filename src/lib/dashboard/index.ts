/**
 * Client helpers for revision-aware mutations (Phase 3A foundation).
 * Workspaces adopt these in later phases — Videos/Photos flows unchanged.
 */
export type {
	CatalogDomain,
	CatalogRevisionMap,
	MutationRevisionPayload,
} from "./revision-state";

export {
	EMPTY_REVISION,
	applyRevisionUpdate,
	parseRevisionMap,
	serializeRevisionMap,
	toMutationRevision,
} from "./revision-state";

export type {
	PublishLifecycle,
	PublishStatusView,
	PublishRefreshState,
	MutationPublishPayload,
} from "./publish-status";
export {
	publishStatusView,
	mutationPublishFromRefresh,
	publishStatusFromApiRefresh,
} from "./publish-status";

export type {
	VideosCategoryFilter,
	VideosFeaturedFilter,
	VideosProviderFilter,
	VideosSort,
	VideosQuery,
} from "./videos-query";
export {
	videoMatchesSearch,
	filterVideosByCategory,
	filterVideosByFeatured,
	filterVideosByProvider,
	searchVideos,
	sortVideos,
	queryVideos,
	videosReorderAllowed,
} from "./videos-query";

export type {
	PhotosAlbumFilter,
	PhotosSort,
	PhotosQuery,
} from "./photos-query";
export {
	photoMatchesSearch,
	filterPhotosByAlbum,
	searchPhotos,
	sortPhotos,
	queryPhotos,
	photosReorderAllowed,
	albumsReorderAllowed,
	albumPhotoCounts,
} from "./photos-query";

export type {
	ShortsKindFilter,
	ShortsSort,
	ShortsQuery,
} from "./shorts-query";
export {
	shortMatchesSearch,
	filterShortsByKind,
	searchShorts,
	sortShorts,
	queryShorts,
	shortsReorderAllowed,
} from "./shorts-query";

export type { DashboardCatalogSnapshot } from "./catalog-snapshot";
export { readDashboardCatalogSnapshot } from "./catalog-snapshot";

export type { DashboardNavItem, DashboardSection } from "./nav";
export { DASHBOARD_NAV, dashboardNavGroups } from "./nav";
