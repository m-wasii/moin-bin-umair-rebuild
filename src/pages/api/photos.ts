import type { APIRoute } from "astro";
import {
	isPhotoCategorySlug,
	photoMediaSrc,
	slugifyPhotoName,
	titleFromSlug,
} from "../../data/photos";
import {
	findPhotoCategory,
	hasWritableMedia,
	listPhotos,
	putPhotoBytes,
	savePhotos,
} from "../../lib/store";

export const prerender = false;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async () => {
	const photos = await listPhotos();
	return json({ photos, writable: hasWritableMedia() });
};

export const POST: APIRoute = async ({ request }) => {
	if (!hasWritableMedia()) {
		return json(
			{
				error:
					"R2 is not bound yet. Add a MEDIA bucket binding, then upload again.",
			},
			503,
		);
	}

	const form = await request.formData();
	const file = form.get("file");
	const category = String(form.get("category") ?? "");
	const title = String(form.get("title") ?? "").trim();
	const alt = String(form.get("alt") ?? "").trim();

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: "Choose an image to upload." }, 400);
	}
	if (!isPhotoCategorySlug(category)) {
		return json({ error: "Pick a photo category." }, 400);
	}
	const categoryMeta = await findPhotoCategory(category, {
		includeDeleted: true,
	});
	if (!categoryMeta || categoryMeta.deletedAt) {
		return json(
			{ error: "That category is missing or in the recycle bin." },
			400,
		);
	}
	if (file.type !== "image/webp") {
		return json(
			{
				error:
					"Upload WebP only. The dashboard converts JPEG/PNG automatically — refresh and try again.",
			},
			415,
		);
	}
	if (file.size > 4_500_000) {
		return json({ error: "Converted image is too large (max 4.5 MB)." }, 413);
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const header = String.fromCharCode(...bytes.slice(0, 4));
	if (header !== "RIFF") {
		return json({ error: "File is not a valid WebP image." }, 415);
	}

	let slug = slugifyPhotoName(
		String(form.get("slug") ?? "") || title || file.name,
	);
	if (!slug) slug = `photo-${Date.now()}`;

	const photos = await listPhotos({ includeDeleted: true });
	if (
		photos.some((photo) => photo.slug === slug && photo.category === category)
	) {
		slug = `${slug}-${Date.now().toString(36)}`;
	}

	const activeInCategory = photos.filter(
		(photo) =>
			!photo.deletedAt &&
			!photo.trashedWithCategory &&
			photo.category === category,
	);
	const maxOrder = activeInCategory.reduce(
		(max, photo) => Math.max(max, photo.sortOrder ?? 0),
		0,
	);

	await putPhotoBytes(category, slug, bytes);

	const photo = {
		slug,
		category,
		title: title || titleFromSlug(slug),
		alt: alt || title || titleFromSlug(slug),
		src: photoMediaSrc(category, slug),
		sortOrder: maxOrder + 10,
	};
	photos.push(photo);
	await savePhotos(photos);
	return json({ photo }, 201);
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

	const photos = await listPhotos({ includeDeleted: true });

	if (body.action === "reorder") {
		const category = String(body.category ?? "");
		const slugs = Array.isArray(body.slugs)
			? body.slugs.map((slug) => String(slug))
			: [];
		if (!category || !isPhotoCategorySlug(category)) {
			return json({ error: "Missing category." }, 400);
		}
		if (!slugs.length) return json({ error: "Missing slugs." }, 400);

		const orderBySlug = new Map(
			slugs.map((slug, index) => [slug, (index + 1) * 10]),
		);
		let matched = 0;
		const next = photos.map((photo) => {
			if (photo.deletedAt || photo.category !== category) return photo;
			const sortOrder = orderBySlug.get(photo.slug);
			if (sortOrder == null) return photo;
			matched += 1;
			return { ...photo, sortOrder };
		});
		if (matched !== slugs.length) {
			return json({ error: "One or more photos were not found." }, 404);
		}
		await savePhotos(next);
		return json({ ok: true });
	}

	const slug = String(body.slug ?? "");
	const category = String(body.category ?? "");
	if (!slug || !category || !isPhotoCategorySlug(category)) {
		return json({ error: "Missing slug or category." }, 400);
	}

	const index = photos.findIndex(
		(photo) =>
			photo.slug === slug && photo.category === category && !photo.deletedAt,
	);
	if (index === -1) return json({ error: "Photo not found." }, 404);

	const current = photos[index];
	const title =
		typeof body.title === "string" ? body.title.trim() : current.title;
	const alt = typeof body.alt === "string" ? body.alt.trim() : current.alt;
	if (!title) return json({ error: "Title is required." }, 400);

	photos[index] = {
		...current,
		title,
		alt: alt || title,
	};
	await savePhotos(photos);
	return json({ photo: photos[index] });
};

export const DELETE: APIRoute = async () => {
	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	return json(
		{
			error:
				"Hard delete is disabled. Select items and use Delete (sends to Trash), then permanently delete from Trash.",
		},
		405,
	);
};
