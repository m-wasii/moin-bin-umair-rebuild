/** Responsive /media URLs: CF Image Resizing on custom zones, else host `?w=`. */

export const RESPONSIVE_WIDTHS = {
	/** Album cover cards (~424–650 CSS px → ~800–1200 device px). */
	albumCover: [400, 600, 800, 1200],
	/** Stacked peek cards (smaller on-screen than covers). */
	albumPeek: [400, 600, 800],
	/** Album masonry / lightbox grid thumbs. */
	album: [400, 600, 800, 1200],
	short: [480, 720, 1080],
	hero: [960, 1280, 1920],
	lightbox: [960, 1280, 1920],
} as const;

/** Widths accepted by the host photo resize route (`?w=`). */
export const HOST_IMAGE_WIDTHS = [400, 600, 800, 1200, 1600] as const;

export type HostImageWidth = (typeof HOST_IMAGE_WIDTHS)[number];

/**
 * `/cdn-cgi/image/` requires Image Resizing on a proxied custom zone.
 * workers.dev / pages.dev / local 404 those URLs — use host `?w=` there.
 */
export function cfImageResizingAvailable(hostname: string) {
	const host = hostname.split(":")[0]?.toLowerCase() ?? "";
	if (host === "localhost" || host === "127.0.0.1") return false;
	return !(host.endsWith(".workers.dev") || host.endsWith(".pages.dev"));
}

function splitSrc(src: string) {
	const qIndex = src.indexOf("?");
	if (qIndex === -1) return { path: src, search: "" };
	return { path: src.slice(0, qIndex), search: src.slice(qIndex) };
}

/** R2-backed paths served from this Worker. */
export function isOptimizableMedia(src: string) {
	return src.startsWith("/media/");
}

/** Host `?w=` resize is implemented for photography objects only. */
export function isHostResizableMedia(src: string) {
	return src.startsWith("/media/photos/");
}

export function isHostImageWidth(value: number): value is HostImageWidth {
	return (HOST_IMAGE_WIDTHS as readonly number[]).includes(value);
}

/** Host-side width variant: preserves existing query (e.g. `v=`) and sets `w`. */
export function hostImageSrc(src: string, width: number) {
	if (!isHostResizableMedia(src)) return src;
	const { path, search } = splitSrc(src);
	const params = new URLSearchParams(
		search.startsWith("?") ? search.slice(1) : search,
	);
	params.set("w", String(width));
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}

export function cfImageSrc(
	src: string,
	width: number,
	options: { enabled?: boolean } = {},
) {
	if (!isOptimizableMedia(src)) return src;
	if (options.enabled === false) {
		return isHostResizableMedia(src) ? hostImageSrc(src, width) : src;
	}
	const { path, search } = splitSrc(src);
	return `/cdn-cgi/image/width=${width},format=auto,quality=82${path}${search}`;
}

export function buildSrcSet(
	src: string,
	widths: readonly number[],
	options: { enabled?: boolean } = {},
): string | undefined {
	if (!isOptimizableMedia(src)) return undefined;
	const useCf = options.enabled !== false;
	if (!useCf && !isHostResizableMedia(src)) return undefined;
	return widths
		.map((w) => `${cfImageSrc(src, w, { enabled: useCf })} ${w}w`)
		.join(", ");
}

export interface ResponsiveImageAttrs {
	src: string;
	srcset?: string;
	sizes?: string;
	width: number;
	height: number;
	loading?: "lazy" | "eager";
	decoding?: "async" | "auto" | "sync";
	fetchpriority?: "high" | "low" | "auto";
	alt?: string;
	class?: string;
}

export function buildResponsiveImageAttrs(options: {
	src: string;
	widths: readonly number[];
	sizes: string;
	width: number;
	height: number;
	loading?: "lazy" | "eager";
	decoding?: "async" | "auto" | "sync";
	fetchpriority?: "high" | "low" | "auto";
	alt?: string;
	class?: string;
	/** When false, emit host `?w=` srcset (preview hosts). Default true. */
	cfImages?: boolean;
}): ResponsiveImageAttrs {
	const cf = { enabled: options.cfImages !== false };
	const srcset = buildSrcSet(options.src, options.widths, cf);
	const fallbackWidth =
		options.widths[options.widths.length - 1] ?? options.width;

	return {
		src: srcset
			? cfImageSrc(options.src, fallbackWidth, cf)
			: options.src,
		...(srcset ? { srcset, sizes: options.sizes } : {}),
		width: options.width,
		height: options.height,
		loading: options.loading ?? "lazy",
		decoding: options.decoding ?? "async",
		...(options.fetchpriority ? { fetchpriority: options.fetchpriority } : {}),
		...(options.alt !== undefined ? { alt: options.alt } : {}),
		...(options.class ? { class: options.class } : {}),
	};
}
