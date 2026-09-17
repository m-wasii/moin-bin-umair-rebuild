import type { APIRoute } from "astro";
import {
	isPhotoCategorySlug,
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
	expectedRevFromRequest,
} from "../../lib/catalog-integrity";
import { mutationPublishFromRefresh } from "../../lib/dashboard/publish-status";
import {
	hasWritableMedia,
	readPhotoCategoriesCatalog,
	readPhotosCatalog,
	savePhotoCategories,
} from "../../lib/store";

export const prerender = false;

export const GET: APIRoute = async () => {
	const { categories, revision } = await readPhotoCategoriesCatalog();
	return jsonResponse({
		categories,
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
					"R2 is not bound yet. Add a MEDIA bucket binding, then save again.",
			},
			503,
		);
	}

	const parsed = await readMutationJsonBody(request);
	if (!parsed.ok) return parsed.response;
	const body = parsed.body;

	try {
		const label = String(body.label ?? "").trim();
		if (!label)
			return jsonResponse({ error: "Category name is required." }, 400);

		const slug = slugifyPhotoName(
			typeof body.slug === "string" && body.slug.trim() ? body.slug : label,
		);
		if (!slug || !isPhotoCategorySlug(slug)) {
			return jsonResponse(
				{ error: "Could not build a valid category slug from that name." },
				400,
			);
		}
		assertKebabSlug(slug, "category slug");

		const expectedRev = expectedRevFromRequest(request, body);
		const { categories, revision } = await readPhotoCategoriesCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (categories.some((entry) => entry.slug === slug)) {
			return jsonResponse({ error: "That category already exists." }, 409);
		}

		const category = {
			slug,
			label: label || titleFromSlug(slug),
		};
		categories.push(category);
		const { revision: next, refresh } = await savePhotoCategories(
			categories,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse(
			{
				category,
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			},
			201,
		);
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not save category.",
			"api/photo-categories POST",
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
		const { categories, revision } = await readPhotoCategoriesCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (action === "reorder") {
			const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
			const slugs = assertCompleteSlugOrder(
				categories.map((entry) => entry.slug),
				rawSlugs.map((slug) => String(slug)),
				"categories",
			);

			const bySlug = new Map(categories.map((entry) => [entry.slug, entry]));
			const next = slugs.map((slug) => bySlug.get(slug)!);
			const { revision: saved, refresh } = await savePhotoCategories(
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

		if (action === "rename") {
			const slug = assertKebabSlug(String(body.slug ?? ""), "category slug");
			const label = String(body.label ?? "").trim();
			if (!label) {
				return jsonResponse({ error: "Album name is required." }, 400);
			}
			if (label.length > 200) {
				return jsonResponse({ error: "Album name is too long." }, 400);
			}

			const index = categories.findIndex((entry) => entry.slug === slug);
			if (index === -1) {
				return jsonResponse({ error: "Album not found." }, 404);
			}

			categories[index] = { ...categories[index]!, label };
			const { revision: saved, refresh } = await savePhotoCategories(
				categories,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				category: categories[index],
				rev: saved.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		return jsonResponse({ error: "Unsupported action." }, 400);
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not update categories.",
			"api/photo-categories PATCH",
		);
		return jsonResponse({ error: message }, status);
	}
};

/**
 * Delete an album only when it contains no photos.
 * Never cascades photo deletion — empty albums only.
 */
export const DELETE: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return jsonResponse({ error: "R2 is not bound yet." }, 503);
	}

	try {
		const url = new URL(request.url);
		const slugParam = url.searchParams.get("slug");
		if (!slugParam) {
			return jsonResponse({ error: "Missing album slug." }, 400);
		}
		const slug = assertKebabSlug(slugParam, "category slug");

		const expectedRev = expectedRevFromRequest(request);
		const { categories, revision } = await readPhotoCategoriesCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (!categories.some((entry) => entry.slug === slug)) {
			return jsonResponse({ error: "Album not found." }, 404);
		}

		const { photos } = await readPhotosCatalog();
		const remaining = photos.filter((photo) => photo.category === slug).length;
		if (remaining > 0) {
			return jsonResponse(
				{
					error: `This album still has ${remaining} photo${remaining === 1 ? "" : "s"}. Move or delete them first.`,
				},
				400,
			);
		}

		const next = categories.filter((entry) => entry.slug !== slug);
		const { revision: saved, refresh } = await savePhotoCategories(
			next,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({
			ok: true,
			rev: saved.rev,
			publish: mutationPublishFromRefresh(refresh),
		});
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete album.",
			"api/photo-categories DELETE",
		);
		return jsonResponse({ error: message }, status);
	}
};
