import type { APIRoute } from "astro";
import {
	isPhotoCategorySlug,
	slugifyPhotoName,
	titleFromSlug,
} from "../../data/photos";
import {
	hasWritableMedia,
	listPhotoCategories,
	savePhotoCategories,
} from "../../lib/store";

export const prerender = false;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async () => {
	const categories = await listPhotoCategories();
	return json({ categories, writable: hasWritableMedia() });
};

export const POST: APIRoute = async ({ request }) => {
	if (!hasWritableMedia()) {
		return json(
			{
				error:
					"R2 is not bound yet. Add a MEDIA bucket binding, then save again.",
			},
			503,
		);
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const label = String(body.label ?? "").trim();
	if (!label) return json({ error: "Category name is required." }, 400);

	let slug = slugifyPhotoName(
		typeof body.slug === "string" && body.slug.trim()
			? body.slug
			: label,
	);
	if (!slug || !isPhotoCategorySlug(slug)) {
		return json(
			{ error: "Could not build a valid category slug from that name." },
			400,
		);
	}

	const categories = await listPhotoCategories({ includeDeleted: true });
	const existing = categories.find((entry) => entry.slug === slug);
	if (existing && !existing.deletedAt) {
		return json({ error: "That category already exists." }, 409);
	}
	if (existing?.deletedAt) {
		return json(
			{
				error:
					"A category with that slug is in the recycle bin. Restore it or choose another name.",
			},
			409,
		);
	}

	const category = {
		slug,
		label: label || titleFromSlug(slug),
	};
	categories.push(category);
	await savePhotoCategories(categories);
	return json({ category }, 201);
};
