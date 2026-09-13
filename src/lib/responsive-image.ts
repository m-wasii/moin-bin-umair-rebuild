/** Responsive /media URLs via Cloudflare Image Resizing (no variants stored in git). */

export const RESPONSIVE_WIDTHS = {
	album: [480, 720, 960, 1280],
	short: [480, 720, 1080],
	hero: [960, 1280, 1920],
} as const;

function splitSrc(src: string) {
	const qIndex = src.indexOf("?");
	if (qIndex === -1) return { path: src, search: "" };
	return { path: src.slice(0, qIndex), search: src.slice(qIndex) };
}

/** R2-backed paths served from this Worker. */
export function isOptimizableMedia(src: string) {
	return src.startsWith("/media/");
}

export function cfImageSrc(src: string, width: number) {
	if (!isOptimizableMedia(src)) return src;
	const { path, search } = splitSrc(src);
	return `/cdn-cgi/image/width=${width},format=auto,quality=82${path}${search}`;
}

export function buildSrcSet(
	src: string,
	widths: readonly number[],
): string | undefined {
	if (!isOptimizableMedia(src)) return undefined;
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
}): ResponsiveImageAttrs {
	const srcset = buildSrcSet(options.src, options.widths);
	const fallbackWidth = options.widths[options.widths.length - 1] ?? options.width;

	return {
		src: srcset ? cfImageSrc(options.src, fallbackWidth) : options.src,
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
