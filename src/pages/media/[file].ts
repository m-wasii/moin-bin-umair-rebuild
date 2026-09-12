import type { APIRoute } from "astro";
import { getMediaObject } from "../../lib/store";

export const prerender = false;

const HERO_FILES = new Set(["hero-loop.mp4", "hero-poster.webp"]);

const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const GET: APIRoute = async ({ params }) => {
	const file = params.file ?? "";
	if (!HERO_FILES.has(file)) {
		return new Response("Not found", { status: 404 });
	}

	const object = await getMediaObject(`media/${file}`);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(object.body, {
		headers: {
			"content-type": object.contentType,
			"content-length": String(object.size),
			"cache-control": MEDIA_CACHE_CONTROL,
			"accept-ranges": "bytes",
		},
	});
};
