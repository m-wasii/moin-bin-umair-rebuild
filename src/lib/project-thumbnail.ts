/**
 * Sized srcsets for remote Vimeo / YouTube thumbs.
 * Cloudflare Image Resizing only rewrites `/media/*` — third-party CDNs
 * must be sized via their own URL conventions.
 */

export interface ProjectThumbnailAttrs {
	src: string;
	srcset?: string;
	sizes: string;
}

const VIMEO_SIZES = [
	{ w: 640, token: "640x360" },
	{ w: 960, token: "960x540" },
	{ w: 1280, token: "1280x720" },
] as const;

const YOUTUBE_SIZES = [
	{ w: 480, file: "hqdefault.jpg" },
	{ w: 640, file: "sddefault.jpg" },
	{ w: 1280, file: "maxresdefault.jpg" },
] as const;

function vimeoSized(src: string, token: string) {
	return src.replace(/_(\d+x\d+)(?=\?|$)/, `_${token}`);
}

function youtubeSized(src: string, file: string) {
	return src.replace(
		/\/(default|mqdefault|hqdefault|sddefault|hq720|maxresdefault)\.jpg(\?.*)?$/i,
		`/${file}$2`,
	);
}

export function buildProjectThumbnailAttrs(
	thumbnail: string,
	sizes: string,
): ProjectThumbnailAttrs {
	try {
		const url = new URL(thumbnail);
		const host = url.hostname.replace(/^www\./, "");

		if (host === "i.vimeocdn.com" && /_\d+x\d+(?:\?|$)/.test(thumbnail)) {
			const srcset = VIMEO_SIZES.map(
				({ w, token }) => `${vimeoSized(thumbnail, token)} ${w}w`,
			).join(", ");
			return {
				src: vimeoSized(thumbnail, "960x540"),
				srcset,
				sizes,
			};
		}

		if (
			(host === "i.ytimg.com" || host === "img.youtube.com") &&
			/\/vi\/[^/]+\//.test(url.pathname)
		) {
			const srcset = YOUTUBE_SIZES.map(
				({ w, file }) => `${youtubeSized(thumbnail, file)} ${w}w`,
			).join(", ");
			return {
				src: youtubeSized(thumbnail, "hqdefault.jpg"),
				srcset,
				sizes,
			};
		}
	} catch {
		/* keep original */
	}

	return { src: thumbnail, sizes };
}
