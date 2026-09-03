export interface StoredShortClip {
	slug: string;
	src: string;
	poster: string;
	duration: number;
	width: number;
	height: number;
}

export interface StoredShort {
	slug: string;
	title: string;
	year: number;
	sortOrder: number;
	clips: StoredShortClip[];
}

export function isShortCampaign(entry: StoredShort) {
	return entry.clips.length > 1;
}

export function isShortSlug(value: string) {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isShortMediaFile(value: string) {
	return /^\d{2}\.(mp4|webp)$/i.test(value);
}

export function shortCover(entry: StoredShort) {
	return entry.clips[0];
}

export function shortDuration(entry: StoredShort) {
	return entry.clips.reduce((total, clip) => total + clip.duration, 0);
}
