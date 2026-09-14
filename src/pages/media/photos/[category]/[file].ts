import type { APIRoute } from "astro";
import { isPhotoCategory } from "../../../../data/photos";
import { assertSafeStorageSegment } from "../../../../lib/catalog-integrity";
import { getPhotoObject } from "../../../../lib/store";

export const prerender = false;

function asBody(body: ReadableStream<Uint8Array> | Uint8Array) {
	return body as BodyInit;
}

export const GET: APIRoute = async ({ params }) => {
	const category = params.category ?? "";
	const file = params.file ?? "";
	if (!isPhotoCategory(category) || !file.endsWith(".webp")) {
		return new Response("Not found", { status: 404 });
	}

	const slug = file.replace(/\.webp$/i, "");
	try {
		assertSafeStorageSegment(slug, "photo slug");
		assertSafeStorageSegment(category, "photo category");
	} catch {
		return new Response("Not found", { status: 404 });
	}

	const object = await getPhotoObject(category, slug);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(asBody(object.body), {
		headers: {
			"content-type": object.contentType || "image/webp",
			"content-length": String(object.size),
			"cache-control": "public, max-age=31536000, immutable",
		},
	});
};
