import type { APIRoute } from "astro";
import {
	parseByteRange,
	rangeUnsatisfiableHeaders,
} from "../../lib/http-range";
import {
	getMediaHead,
	getMediaObject,
	getMediaRange,
} from "../../lib/store";

export const prerender = false;

const HERO_FILES = new Set(["hero-loop.mp4", "hero-poster.webp"]);

const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

function asBody(body: ReadableStream<Uint8Array> | Uint8Array) {
	return body as BodyInit;
}

function baseHeaders(contentType: string, extra: Record<string, string> = {}) {
	return {
		"content-type": contentType,
		"cache-control": MEDIA_CACHE_CONTROL,
		"accept-ranges": "bytes",
		...extra,
	};
}

export const GET: APIRoute = async ({ params, request }) => {
	const file = params.file ?? "";
	if (!HERO_FILES.has(file)) {
		return new Response("Not found", { status: 404 });
	}

	const key = `media/${file}`;
	const head = await getMediaHead(key);
	if (!head) {
		return new Response("Not found", { status: 404 });
	}

	const contentType =
		head.httpMetadata?.contentType ||
		(file.endsWith(".mp4") ? "video/mp4" : "image/webp");

	const range = parseByteRange(request.headers.get("range"), head.size);

	if (range.kind === "invalid") {
		return new Response("Invalid Range", { status: 400 });
	}

	if (range.kind === "unsatisfiable") {
		return new Response(null, {
			status: 416,
			headers: rangeUnsatisfiableHeaders(head.size),
		});
	}

	if (range.kind === "range") {
		const object = await getMediaRange(key, range.start, range.length);
		if (!object) {
			return new Response("Not found", { status: 404 });
		}
		return new Response(asBody(object.body), {
			status: 206,
			headers: baseHeaders(contentType, {
				"content-length": String(object.size),
				"content-range": `bytes ${range.start}-${range.end}/${head.size}`,
			}),
		});
	}

	const object = await getMediaObject(key);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(asBody(object.body), {
		headers: baseHeaders(object.contentType || contentType, {
			"content-length": String(object.size),
		}),
	});
};
