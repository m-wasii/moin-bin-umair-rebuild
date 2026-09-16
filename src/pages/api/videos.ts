import type { APIRoute } from "astro";
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
	assertSafeStorageSegment,
	expectedRevFromRequest,
	optionalPositiveDuration,
	optionalYear,
} from "../../lib/catalog-integrity";
import { optionalString, parseOptionalBoolean } from "../../lib/request-body";
import { isProjectCategory, enrichVideo } from "../../lib/video-metadata";
import {
	hasWritableMedia,
	readVideosCatalog,
	saveVideos,
	youtubeApiKey,
	type StoredVideo,
} from "../../lib/store";

export const prerender = false;

function rewriteCompleteOrder(
	videos: StoredVideo[],
	slugs: string[],
): StoredVideo[] {
	const bySlug = new Map(videos.map((video) => [video.slug, video]));
	return slugs.map((slug, index) => ({
		...bySlug.get(slug)!,
		sortOrder: (index + 1) * 10,
	}));
}

export const GET: APIRoute = async () => {
	const { videos, revision } = await readVideosCatalog();
	return jsonResponse({
		videos,
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

	const url = String(body.url ?? "").trim();
	const category = String(body.category ?? "");
	if (!url) return jsonResponse({ error: "Video URL is required." }, 400);
	if (!isProjectCategory(category)) {
		return jsonResponse(
			{ error: "Category must be indie, local, or bts." },
			400,
		);
	}

	try {
		const expectedRev = expectedRevFromRequest(request, body);
		const { videos, revision } = await readVideosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const maxOrder = videos.reduce(
			(max, item) => Math.max(max, item.sortOrder ?? 0),
			0,
		);
		const year = optionalYear(body.year);
		const duration = optionalPositiveDuration(body.duration);
		const featured = parseOptionalBoolean(body.featured) ?? false;
		const video = await enrichVideo(
			{
				url,
				category,
				title: optionalString(body.title),
				description: optionalString(body.description),
				year,
				duration,
				featured,
				slug: optionalString(body.slug),
				sortOrder: maxOrder + 10,
			},
			youtubeApiKey(),
		);

		assertSafeStorageSegment(video.slug, "video slug");
		assertSafeStorageSegment(video.id, "video id");

		if (
			videos.some(
				(item) => item.id === video.id && item.provider === video.provider,
			)
		) {
			return jsonResponse(
				{ error: "That video is already in the catalog." },
				409,
			);
		}

		if (videos.some((item) => item.slug === video.slug)) {
			video.slug = assertSafeStorageSegment(
				`${video.slug}-${video.id}`.slice(0, 80),
				"video slug",
			);
		}

		videos.push(video);
		const next = await saveVideos(
			videos,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ video, rev: next.rev }, 201);
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not save video.",
			"api/videos POST",
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
		const expectedRev = expectedRevFromRequest(request, body);
		const { videos, revision } = await readVideosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (body.action === "reorder") {
			const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
			const slugs = assertCompleteSlugOrder(
				videos.map((video) => video.slug),
				rawSlugs.map((slug) => String(slug)),
				"videos",
			);

			const next = await saveVideos(
				rewriteCompleteOrder(videos, slugs),
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({ ok: true, rev: next.rev });
		}

		const slug = assertSafeStorageSegment(String(body.slug ?? ""), "slug");
		const index = videos.findIndex((item) => item.slug === slug);
		if (index === -1) return jsonResponse({ error: "Video not found." }, 404);

		const current = videos[index];
		const url = String(body.url ?? current.url).trim();
		const category = String(body.category ?? current.category);

		if (!isProjectCategory(category)) {
			return jsonResponse({ error: "Invalid category." }, 400);
		}

		const year =
			body.year != null && body.year !== ""
				? optionalYear(body.year)
				: current.year;
		const duration =
			body.duration != null && body.duration !== ""
				? optionalPositiveDuration(body.duration)
				: current.duration;
		const featured =
			parseOptionalBoolean(body.featured) ?? current.featured ?? false;

		const video = await enrichVideo(
			{
				url,
				category,
				slug,
				title: optionalString(body.title) ?? current.title,
				description: optionalString(body.description) ?? current.description,
				year,
				duration,
				featured,
				sortOrder: current.sortOrder,
			},
			youtubeApiKey(),
		);
		assertSafeStorageSegment(video.slug, "video slug");
		assertSafeStorageSegment(video.id, "video id");
		videos[index] = video;
		const next = await saveVideos(
			videos,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ video, rev: next.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not update video.",
			"api/videos PATCH",
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
		if (!slugParam) return jsonResponse({ error: "Missing slug." }, 400);
		const slug = assertSafeStorageSegment(slugParam, "slug");

		const expectedRev = expectedRevFromRequest(request);
		const { videos, revision } = await readVideosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const nextVideos = videos.filter((item) => item.slug !== slug);
		if (nextVideos.length === videos.length) {
			return jsonResponse({ error: "Video not found." }, 404);
		}
		const next = await saveVideos(
			nextVideos,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({ ok: true, rev: next.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete video.",
			"api/videos DELETE",
		);
		return jsonResponse({ error: message }, status);
	}
};
