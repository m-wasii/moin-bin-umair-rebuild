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

/** Catalog path for a clip video (version query applied by the store). */
export function shortClipSrcPath(campaign: string, clipSlug: string) {
	return `/media/shorts/${campaign}/${clipSlug}.mp4`;
}

/** Catalog path for a clip poster (version query applied by the store). */
export function shortClipPosterPath(campaign: string, clipSlug: string) {
	return `/media/shorts/${campaign}/${clipSlug}.webp`;
}

export function shortMediaFile(clipSlug: string, kind: "mp4" | "webp") {
	return `${clipSlug}.${kind}`;
}

export function slugifyShortName(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

/** Next `01`-style clip slug that does not collide with existing clips. */
export function nextShortClipSlug(clips: StoredShortClip[]) {
	let max = 0;
	for (const clip of clips) {
		const n = Number.parseInt(clip.slug, 10);
		if (Number.isFinite(n) && n > max) max = n;
	}
	const next = max + 1;
	if (next > 99) throw new Error("Campaign already has the maximum number of clips.");
	return String(next).padStart(2, "0");
}
