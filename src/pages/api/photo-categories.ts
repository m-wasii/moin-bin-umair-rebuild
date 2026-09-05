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

	const maxOrder = categories
		.filter((entry) => !entry.deletedAt)
		.reduce((max, entry) => Math.max(max, entry.sortOrder ?? 0), 0);

	const category = {
		slug,
		label: label || titleFromSlug(slug),
		sortOrder: maxOrder + 10,
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

	const categories = await listPhotoCategories({ includeDeleted: true });

	if (body.action === "reorder") {
		const slugs = Array.isArray(body.slugs)
			? body.slugs.map((slug) => String(slug))
			: [];
		if (!slugs.length) return json({ error: "Missing slugs." }, 400);

		const orderBySlug = new Map(
			slugs.map((slug, index) => [slug, (index + 1) * 10]),
		);
		let matched = 0;
		const next = categories.map((category) => {
			if (category.deletedAt) return category;
			const sortOrder = orderBySlug.get(category.slug);
			if (sortOrder == null) return category;
			matched += 1;
			return { ...category, sortOrder };
		});
		if (matched !== slugs.length) {
			return json({ error: "One or more categories were not found." }, 404);
		}
		await savePhotoCategories(next);
		return json({ ok: true });
	}

	const slug = String(body.slug ?? "");
	if (!slug) return json({ error: "Missing slug." }, 400);

	const index = categories.findIndex(
		(entry) => entry.slug === slug && !entry.deletedAt,
	);
	if (index === -1) return json({ error: "Category not found." }, 404);

	const label =
		typeof body.label === "string"
			? body.label.trim()
			: categories[index].label;
	if (!label) return json({ error: "Category name is required." }, 400);

	categories[index] = { ...categories[index], label };
	await savePhotoCategories(categories);
	return json({ category: categories[index] });
};
