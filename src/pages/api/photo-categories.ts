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

	const slug = slugifyPhotoName(
		typeof body.slug === "string" && body.slug.trim() ? body.slug : label,
	);
	if (!slug || !isPhotoCategorySlug(slug)) {
		return json(
			{ error: "Could not build a valid category slug from that name." },
			400,
		);
	}

	const categories = await listPhotoCategories();
	if (categories.some((entry) => entry.slug === slug)) {
		return json({ error: "That category already exists." }, 409);
	}

	const category = {
		slug,
		label: label || titleFromSlug(slug),
	};
	categories.push(category);
	await savePhotoCategories(categories);
	return json({ category }, 201);
};

export const PATCH: APIRoute = async ({ request }) => {
	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	if (body.action !== "reorder") {
		return json({ error: "Unsupported action." }, 400);
	}

	const slugs = Array.isArray(body.slugs)
		? body.slugs.map((slug) => String(slug))
		: [];
	if (!slugs.length) return json({ error: "Missing slugs." }, 400);

	const categories = await listPhotoCategories();
	const bySlug = new Map(categories.map((entry) => [entry.slug, entry]));
	if (
		slugs.some((slug) => !bySlug.has(slug)) ||
		slugs.length !== categories.length
	) {
		return json({ error: "One or more categories were not found." }, 404);
	}

	const next = slugs.map((slug) => bySlug.get(slug)!);
	await savePhotoCategories(next);
	return json({ ok: true });
};
