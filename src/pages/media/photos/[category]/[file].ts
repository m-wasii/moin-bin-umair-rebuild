import type { APIRoute } from "astro";
import { isPhotoCategorySlug } from "../../../../data/photos";
import { getPhotoBytes } from "../../../../lib/store";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	const category = params.category ?? "";
	const file = params.file ?? "";
	if (!isPhotoCategorySlug(category) || !file.endsWith(".webp")) {
		return new Response("Not found", { status: 404 });
	}

	const slug = file.replace(/\.webp$/i, "");
	const bytes = await getPhotoBytes(category, slug);
	if (bytes) {
		return new Response(bytes, {
			headers: {
				"content-type": "image/webp",
				"cache-control": "public, max-age=86400",
			},
		});
	}

	return new Response(null, {
		status: 302,
		headers: {
			location: `/photography/${category}/${slug}.webp`,
		},
	});
};
