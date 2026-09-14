import type { APIRoute } from "astro";
import {
	isPhotoCategorySlug,
	slugifyPhotoName,
	titleFromSlug,
} from "../../data/photos";
import { unauthorizedMutationResponse } from "../../lib/api-auth";
import { publicApiError } from "../../lib/api-errors";
import {
	assertCompleteSlugOrder,
	assertExpectedRev,
	assertKebabSlug,
	expectedRevFromRequest,
} from "../../lib/catalog-integrity";
import {
	waitUntilFromLocals,
	type SiteCacheRefreshOptions,
} from "../../lib/site-cache";
import {
	hasWritableMedia,
	readPhotoCategoriesCatalog,
	savePhotoCategories,
} from "../../lib/store";

export const prerender = false;

function cacheOpts(
	request: Request,
	locals: App.Locals,
): SiteCacheRefreshOptions {
	return {
		requestUrl: new URL(request.url),
		waitUntil: waitUntilFromLocals(locals),
	};
}

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async () => {
	const { categories, revision } = await readPhotoCategoriesCatalog();
	return json({
		categories,
		rev: revision.rev,
		writable: hasWritableMedia(),
	});
};

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

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

	try {
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
		assertKebabSlug(slug, "category slug");

		const expectedRev = expectedRevFromRequest(request, body);
		const { categories, revision } = await readPhotoCategoriesCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (categories.some((entry) => entry.slug === slug)) {
			return json({ error: "That category already exists." }, 409);
		}

		const category = {
			slug,
			label: label || titleFromSlug(slug),
		};
		categories.push(category);
		const next = await savePhotoCategories(
			categories,
			revision,
			cacheOpts(request, locals),
		);
		return json({ category, rev: next.rev }, 201);
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not save category.",
			"api/photo-categories POST",
		);
		return json({ error: message }, status);
	}
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	try {
		if (body.action !== "reorder") {
			return json({ error: "Unsupported action." }, 400);
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
			cacheOpts(request, locals),
		);
		return json({ ok: true, rev: saved.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not reorder categories.",
			"api/photo-categories PATCH",
		);
		return json({ error: message }, status);
	}
};
