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

	await putPhotoBytes(category, slug, bytes);

	const photo = {
		slug,
		category,
		title: title || titleFromSlug(slug),
		alt: alt || title || titleFromSlug(slug),
		src: photoMediaSrc(category, slug),
	};
	photos.push(photo);
	await savePhotos(photos);
	return json({ photo }, 201);
};

export const DELETE: APIRoute = async () => {
	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	return json(
		{
			error:
				"Hard delete is disabled. Mark items and use Move to recycle bin, then permanently delete from Trash.",
		},
		405,
	);
};
