/** Responsive /media URLs via Cloudflare Image Resizing (no variants stored in git). */

export const RESPONSIVE_WIDTHS = {
	album: [480, 720, 960, 1280],
	short: [480, 720, 1080],
	hero: [960, 1280, 1920],
	lightbox: [960, 1280, 1920],
} as const;

/**
 * `/cdn-cgi/image/` requires Image Resizing on a proxied custom zone.
 * workers.dev / pages.dev previews 404 those URLs — serve raw `/media/` there.
 */
export function cfImageResizingAvailable(hostname: string) {
	const host = hostname.split(":")[0]?.toLowerCase() ?? "";
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

export function cfImageSrc(
	src: string,
	width: number,
	options: { enabled?: boolean } = {},
) {
	if (!isOptimizableMedia(src)) return src;
	if (options.enabled === false) return src;
	const { path, search } = splitSrc(src);
	return `/cdn-cgi/image/width=${width},format=auto,quality=82${path}${search}`;
}

export function buildSrcSet(
	src: string,
	widths: readonly number[],
	options: { enabled?: boolean } = {},
): string | undefined {
	if (!isOptimizableMedia(src) || options.enabled === false) return undefined;
	return widths.map((w) => `${cfImageSrc(src, w)} ${w}w`).join(", ");
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
	/** When false, skip `/cdn-cgi/image/` (preview hosts). Default true. */
	cfImages?: boolean;
}): ResponsiveImageAttrs {
	const cf = { enabled: options.cfImages !== false };
	const srcset = buildSrcSet(options.src, options.widths, cf);
	const fallbackWidth = options.widths[options.widths.length - 1] ?? options.width;

	return {
		src: srcset ? cfImageSrc(options.src, fallbackWidth, cf) : options.src,
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
