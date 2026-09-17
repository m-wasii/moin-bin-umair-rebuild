import type { APIRoute } from "astro";
import {
	isPhotoCategory,
	photoMediaSrc,
	slugifyPhotoName,
	titleFromSlug,
	type StoredPhoto,
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
import { mutationPublishFromRefresh } from "../../lib/dashboard/publish-status";
import { mediaVersionFromBytes } from "../../lib/media-url";
import {
	deletePhotoBytes,
	getPhotoBytes,
	hasWritableMedia,
	listPhotoCategories,
	putPhotoBytes,
	readPhotosCatalog,
	savePhotos,
} from "../../lib/store";
import { isValidWebp } from "../../lib/webp";

export const prerender = false;

function requirePhotoText(value: unknown, field: string, max = 500): string {
	if (typeof value !== "string") {
		throw Object.assign(new Error(`Invalid ${field}.`), { status: 400 });
	}
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > max) {
		throw Object.assign(new Error(`Invalid ${field}.`), { status: 400 });
	}
	return trimmed;
}

function findPhotoIndex(
	photos: StoredPhoto[],
	slug: string,
	category: string,
): number {
	return photos.findIndex(
		(photo) => photo.slug === slug && photo.category === category,
	);
}

async function readWebpUpload(file: File): Promise<Uint8Array> {
	if (!(file instanceof File) || file.size === 0) {
		throw Object.assign(new Error("Choose an image to upload."), {
			status: 400,
		});
	}
	if (file.type !== "image/webp") {
		throw Object.assign(
			new Error(
				"Upload WebP only. The dashboard converts JPEG/PNG automatically — refresh and try again.",
			),
			{ status: 415 },
		);
	}
	if (file.size > 4_500_000) {
		throw Object.assign(new Error("Converted image is too large (max 4.5 MB)."), {
			status: 413,
		});
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isValidWebp(bytes)) {
		throw Object.assign(new Error("File is not a valid WebP image."), {
			status: 415,
		});
	}
	return bytes;
}

function httpError(error: unknown): { message: string; status: number } | null {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number" &&
		error instanceof Error
	) {
		return { message: error.message, status: (error as { status: number }).status };
	}
	return null;
}

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
		const intent = String(form.get("intent") ?? "create").trim() || "create";
		const file = form.get("file");
		const categoryRaw = String(form.get("category") ?? "");
		const title = String(form.get("title") ?? "").trim();
		const alt = String(form.get("alt") ?? "").trim();
		const revField = form.get("rev");
		const expectedRev =
			revField != null && String(revField) !== ""
				? expectedRevFromRequest(request, { rev: String(revField) })
				: expectedRevFromRequest(request);

		if (!isPhotoCategory(categoryRaw)) {
			return jsonResponse({ error: "Pick a photo category." }, 400);
		}
		const category = assertKebabSlug(categoryRaw, "photo category");
		const knownCategories = await listPhotoCategories();
		if (!knownCategories.some((entry) => entry.slug === category)) {
			return jsonResponse({ error: "Pick a photo category." }, 400);
		}

		const bytes = await readWebpUpload(file as File);
		const { photos, revision } = await readPhotosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (intent === "replace") {
			const slug = assertSafeStorageSegment(
				String(form.get("slug") ?? ""),
				"photo slug",
			);
			const index = findPhotoIndex(photos, slug, category);
			if (index === -1) {
				return jsonResponse({ error: "Photo not found." }, 404);
			}

			const existing = photos[index]!;
			// Overwrite bytes at the same identity key; catalog update follows.
			await putPhotoBytes(category, slug, bytes);
			const v = mediaVersionFromBytes(bytes);
			const photo: StoredPhoto = {
				...existing,
				title: title || existing.title,
				alt: alt || existing.alt,
				v,
				src: photoMediaSrc(category, slug, v),
			};
			photos[index] = photo;

			const { revision: next, refresh } = await savePhotos(
				photos,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				photo,
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		let slug = slugifyPhotoName(
			String(form.get("slug") ?? "") || title || (file as File).name,
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
		const photo: StoredPhoto = {
			slug,
			category,
			title: title || titleFromSlug(slug),
			alt: alt || title || titleFromSlug(slug),
			v,
			src: photoMediaSrc(category, slug, v),
		};
		photos.push(photo);

		try {
			const { revision: next, refresh } = await savePhotos(
				photos,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse(
				{
					photo,
					rev: next.rev,
					publish: mutationPublishFromRefresh(refresh),
				},
				201,
			);
		} catch (error) {
			// Roll back orphaned bytes if the catalog CAS/write fails.
			await deletePhotoBytes(category, slug);
			throw error;
		}
	} catch (error) {
		const mapped = httpError(error);
		if (mapped) return jsonResponse({ error: mapped.message }, mapped.status);
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
		const action = String(body.action ?? "");
		const expectedRev = expectedRevFromRequest(request, body);
		const { photos, revision } = await readPhotosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (action === "reorder") {
			const category = assertKebabSlug(
				String(body.category ?? ""),
				"photo category",
			);
			if (!isPhotoCategory(category)) {
				return jsonResponse({ error: "Missing category." }, 400);
			}

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
			const next: StoredPhoto[] = [];
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

			const { revision: saved, refresh } = await savePhotos(
				next,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				ok: true,
				rev: saved.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		if (action === "update") {
			const category = assertKebabSlug(
				String(body.category ?? ""),
				"photo category",
			);
			const slug = assertSafeStorageSegment(String(body.slug ?? ""), "photo slug");
			const index = findPhotoIndex(photos, slug, category);
			if (index === -1) {
				return jsonResponse({ error: "Photo not found." }, 404);
			}

			const existing = photos[index]!;
			const nextTitle =
				body.title !== undefined
					? requirePhotoText(body.title, "title")
					: existing.title;
			const nextAlt =
				body.alt !== undefined
					? requirePhotoText(body.alt, "alt")
					: existing.alt;

			let nextCategory = category;
			if (body.nextCategory != null && String(body.nextCategory).trim()) {
				nextCategory = assertKebabSlug(
					String(body.nextCategory),
					"photo category",
				);
				if (!isPhotoCategory(nextCategory)) {
					return jsonResponse({ error: "Invalid album." }, 400);
				}
				const knownCategories = await listPhotoCategories();
				if (!knownCategories.some((entry) => entry.slug === nextCategory)) {
					return jsonResponse({ error: "Pick a photo album." }, 400);
				}
			}

			if (nextCategory !== category) {
				if (
					photos.some(
						(photo) =>
							photo.slug === slug && photo.category === nextCategory,
					)
				) {
					return jsonResponse(
						{ error: "A photo with that slug already exists in the target album." },
						409,
					);
				}

				const object = await getPhotoBytes(category, slug);
				if (!object) {
					return jsonResponse(
						{ error: "Could not read the existing photo asset." },
						500,
					);
				}

				await putPhotoBytes(nextCategory, slug, object);
				const photo: StoredPhoto = {
					...existing,
					category: nextCategory,
					title: nextTitle,
					alt: nextAlt,
					src: photoMediaSrc(nextCategory, slug, existing.v ?? "1"),
				};
				photos[index] = photo;

				try {
					const { revision: saved, refresh } = await savePhotos(
						photos,
						revision,
						mutationCacheOpts(request, locals),
					);
					try {
						await deletePhotoBytes(category, slug);
					} catch (cleanupError) {
						console.error(
							"[api/photos PATCH] old asset cleanup failed after move",
							cleanupError,
						);
					}
					return jsonResponse({
						photo,
						rev: saved.rev,
						publish: mutationPublishFromRefresh(refresh),
					});
				} catch (error) {
					await deletePhotoBytes(nextCategory, slug);
					throw error;
				}
			}

			const photo: StoredPhoto = {
				...existing,
				title: nextTitle,
				alt: nextAlt,
			};
			photos[index] = photo;
			const { revision: saved, refresh } = await savePhotos(
				photos,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				photo,
				rev: saved.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		return jsonResponse({ error: "Unsupported action." }, 400);
	} catch (error) {
		const mapped = httpError(error);
		if (mapped) return jsonResponse({ error: mapped.message }, mapped.status);
		const { message, status } = publicApiError(
			error,
			"Could not update photos.",
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
		const { revision: saved, refresh } = await savePhotos(
			next,
			revision,
			mutationCacheOpts(request, locals),
		);
		try {
			await deletePhotoBytes(category, slug);
		} catch (error) {
			console.error("[api/photos DELETE] media cleanup failed", error);
		}
		return jsonResponse({
			ok: true,
			rev: saved.rev,
			publish: mutationPublishFromRefresh(refresh),
		});
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete photo.",
			"api/photos DELETE",
		);
		return jsonResponse({ error: message }, status);
	}
};
