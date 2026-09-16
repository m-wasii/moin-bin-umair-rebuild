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
import {
	hasWritableMedia,
	readPhotoCategoriesCatalog,
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
		const next = await savePhotoCategories(
			categories,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ category, rev: next.rev }, 201);
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
		if (body.action !== "reorder") {
			return jsonResponse({ error: "Unsupported action." }, 400);
		}

		const expectedRev = expectedRevFromRequest(request, body);
		const { categories, revision } = await readPhotoCategoriesCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
		const slugs = assertCompleteSlugOrder(
			categories.map((entry) => entry.slug),
			rawSlugs.map((slug) => String(slug)),
			"categories",
		);

		const bySlug = new Map(categories.map((entry) => [entry.slug, entry]));
		const next = slugs.map((slug) => bySlug.get(slug)!);
		const saved = await savePhotoCategories(
			next,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ ok: true, rev: saved.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not reorder categories.",
			"api/photo-categories PATCH",
		);
		return jsonResponse({ error: message }, status);
	}
};
