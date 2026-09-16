import type { APIRoute } from "astro";
import {
	isPhotoCategory,
	photoMediaSrc,
	slugifyPhotoName,
	titleFromSlug,
} from "../../data/photos";
import { unauthorizedMutationResponse } from "../../lib/api-auth";
import { publicApiError } from "../../lib/api-errors";
import {
	jsonResponse,
	mutationCacheOpts,
	readMutationJsonBody,
} from "../../lib/api-http";
import {
	assertCompleteSlugOrder,
	assertExpectedRev,
	assertKebabSlug,
	assertSafeStorageSegment,
	expectedRevFromRequest,
} from "../../lib/catalog-integrity";
import { mediaVersionFromBytes } from "../../lib/media-url";
import {
	deletePhotoBytes,
	hasWritableMedia,
	listPhotoCategories,
	putPhotoBytes,
	readPhotosCatalog,
	savePhotos,
} from "../../lib/store";
import { isValidWebp } from "../../lib/webp";

export const prerender = false;

export const GET: APIRoute = async () => {
	const { photos, revision } = await readPhotosCatalog();
	return jsonResponse({
		photos,
		rev: revision.rev,
		writable: hasWritableMedia(),
	});
};

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return jsonResponse(
			{
				error:
					"R2 is not bound yet. Add a MEDIA bucket binding, then upload again.",
			},
			503,
		);
	}

	try {
		const form = await request.formData();
		const file = form.get("file");
		const categoryRaw = String(form.get("category") ?? "");
		const title = String(form.get("title") ?? "").trim();
		const alt = String(form.get("alt") ?? "").trim();
		const revField = form.get("rev");
		const expectedRev =
			revField != null && String(revField) !== ""
				? expectedRevFromRequest(request, { rev: String(revField) })
				: expectedRevFromRequest(request);

		if (!(file instanceof File) || file.size === 0) {
			return jsonResponse({ error: "Choose an image to upload." }, 400);
		}
		if (!isPhotoCategory(categoryRaw)) {
			return jsonResponse({ error: "Pick a photo category." }, 400);
		}
		const category = assertKebabSlug(categoryRaw, "photo category");
		const knownCategories = await listPhotoCategories();
		if (!knownCategories.some((entry) => entry.slug === category)) {
			return jsonResponse({ error: "Pick a photo category." }, 400);
		}
		if (file.type !== "image/webp") {
			return jsonResponse(
				{
					error:
						"Upload WebP only. The dashboard converts JPEG/PNG automatically — refresh and try again.",
				},
				415,
			);
		}
		if (file.size > 4_500_000) {
			return jsonResponse(
				{ error: "Converted image is too large (max 4.5 MB)." },
				413,
			);
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!isValidWebp(bytes)) {
			return jsonResponse({ error: "File is not a valid WebP image." }, 415);
		}

		const { photos, revision } = await readPhotosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		let slug = slugifyPhotoName(
			String(form.get("slug") ?? "") || title || file.name,
		);
		if (!slug) slug = `photo-${Date.now()}`;
		slug = assertSafeStorageSegment(slug, "photo slug");

		if (
			photos.some((photo) => photo.slug === slug && photo.category === category)
		) {
			slug = assertSafeStorageSegment(
				`${slug}-${Date.now().toString(36)}`.slice(0, 80),
				"photo slug",
			);
		}

		// Upload bytes first so the catalog never points at a missing object.
		await putPhotoBytes(category, slug, bytes);

		const v = mediaVersionFromBytes(bytes);
		const photo = {
			slug,
			category,
			title: title || titleFromSlug(slug),
			alt: alt || title || titleFromSlug(slug),
			v,
			src: photoMediaSrc(category, slug, v),
		};
		photos.push(photo);

		try {
			const next = await savePhotos(
				photos,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({ photo, rev: next.rev }, 201);
		} catch (error) {
			// Roll back orphaned bytes if the catalog CAS/write fails.
			await deletePhotoBytes(category, slug);
			throw error;
		}
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not upload photo.",
			"api/photos POST",
		);
		return jsonResponse({ error: message }, status);
	}
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return jsonResponse({ error: "R2 is not bound yet." }, 503);
	}

	const parsed = await readMutationJsonBody(request);
	if (!parsed.ok) return parsed.response;
	const body = parsed.body;

	try {
		if (body.action !== "reorder") {
			return jsonResponse({ error: "Unsupported action." }, 400);
		}

		const category = assertKebabSlug(
			String(body.category ?? ""),
			"photo category",
		);
		if (!isPhotoCategory(category)) {
			return jsonResponse({ error: "Missing category." }, 400);
		}

		const expectedRev = expectedRevFromRequest(request, body);
		const { photos, revision } = await readPhotosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const inCategory = photos.filter((photo) => photo.category === category);
		const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
		const slugs = assertCompleteSlugOrder(
			inCategory.map((photo) => photo.slug),
			rawSlugs.map((slug) => String(slug)),
			"photos",
		);

		const bySlug = new Map(inCategory.map((photo) => [photo.slug, photo]));
		const reordered = slugs.map((slug) => bySlug.get(slug)!);
		let inserted = false;
		const next = [];
		for (const photo of photos) {
			if (photo.category === category) {
				if (!inserted) {
					next.push(...reordered);
					inserted = true;
				}
				continue;
			}
			next.push(photo);
		}
		if (!inserted) next.push(...reordered);

		const saved = await savePhotos(
			next,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ ok: true, rev: saved.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not reorder photos.",
			"api/photos PATCH",
		);
		return jsonResponse({ error: message }, status);
	}
};

export const DELETE: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return jsonResponse({ error: "R2 is not bound yet." }, 503);
	}

	try {
		const url = new URL(request.url);
		const slugParam = url.searchParams.get("slug");
		const categoryParam = url.searchParams.get("category");
		if (!slugParam || !categoryParam || !isPhotoCategory(categoryParam)) {
			return jsonResponse({ error: "Missing slug or category." }, 400);
		}
		const slug = assertSafeStorageSegment(slugParam, "photo slug");
		const category = assertKebabSlug(categoryParam, "photo category");

		const expectedRev = expectedRevFromRequest(request);
		const { photos, revision } = await readPhotosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const next = photos.filter(
			(photo) => !(photo.slug === slug && photo.category === category),
		);
		if (next.length === photos.length) {
			return jsonResponse({ error: "Photo not found." }, 404);
		}

		// Catalog first so a failed delete cannot leave a dangling catalog entry.
		const saved = await savePhotos(
			next,
			revision,
			mutationCacheOpts(request, locals),
		);
		try {
			await deletePhotoBytes(category, slug);
		} catch (error) {
			console.error("[api/photos DELETE] media cleanup failed", error);
		}
		return jsonResponse({ ok: true, rev: saved.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete photo.",
			"api/photos DELETE",
		);
		return jsonResponse({ error: message }, status);
	}
};
