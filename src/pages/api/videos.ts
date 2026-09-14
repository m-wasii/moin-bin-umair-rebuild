import type { APIRoute } from "astro";
import { unauthorizedMutationResponse } from "../../lib/api-auth";
import { publicApiError } from "../../lib/api-errors";
import {
	assertCompleteSlugOrder,
	assertExpectedRev,
	assertSafeStorageSegment,
	expectedRevFromRequest,
	optionalPositiveDuration,
	optionalYear,
} from "../../lib/catalog-integrity";
import { isProjectCategory } from "../../lib/video-metadata";
import { enrichVideo } from "../../lib/video-metadata";
import {
	waitUntilFromLocals,
	type SiteCacheRefreshOptions,
} from "../../lib/site-cache";
import {
	hasWritableMedia,
	readVideosCatalog,
	saveVideos,
	youtubeApiKey,
	type StoredVideo,
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
	return json({
		videos,
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

	const url = String(body.url ?? "").trim();
	const category = String(body.category ?? "");
	if (!url) return json({ error: "Video URL is required." }, 400);
	if (!isProjectCategory(category)) {
		return json({ error: "Category must be indie, local, or bts." }, 400);
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
		const video = await enrichVideo(
			{
				url,
				category,
				title: typeof body.title === "string" ? body.title : undefined,
				description:
					typeof body.description === "string" ? body.description : undefined,
				year,
				duration,
				featured: Boolean(body.featured),
				slug: typeof body.slug === "string" ? body.slug : undefined,
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
			return json({ error: "That video is already in the catalog." }, 409);
		}

		if (videos.some((item) => item.slug === video.slug)) {
			video.slug = assertSafeStorageSegment(
				`${video.slug}-${video.id}`.slice(0, 80),
				"video slug",
			);
		}

		videos.push(video);
		const next = await saveVideos(videos, revision, cacheOpts(request, locals));
		return json({ video, rev: next.rev }, 201);
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not save video.",
			"api/videos POST",
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
				cacheOpts(request, locals),
			);
			return json({ ok: true, rev: next.rev });
		}

		const slug = assertSafeStorageSegment(String(body.slug ?? ""), "slug");
		const index = videos.findIndex((item) => item.slug === slug);
		if (index === -1) return json({ error: "Video not found." }, 404);

		const current = videos[index];
		const url = String(body.url ?? current.url).trim();
		const category = String(body.category ?? current.category);

		if (!isProjectCategory(category)) {
			return json({ error: "Invalid category." }, 400);
		}

		const year =
			body.year != null && body.year !== ""
				? optionalYear(body.year)
				: current.year;
		const duration =
			body.duration != null && body.duration !== ""
				? optionalPositiveDuration(body.duration)
				: current.duration;

		const video = await enrichVideo(
			{
				url,
				category,
				slug,
				title: typeof body.title === "string" ? body.title : current.title,
				description:
					typeof body.description === "string"
						? body.description
						: current.description,
				year,
				duration,
				featured:
					body.featured == null ? current.featured : Boolean(body.featured),
				sortOrder: current.sortOrder,
			},
			youtubeApiKey(),
		);
		assertSafeStorageSegment(video.slug, "video slug");
		assertSafeStorageSegment(video.id, "video id");
		videos[index] = video;
		const next = await saveVideos(videos, revision, cacheOpts(request, locals));
		return json({ video, rev: next.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not update video.",
			"api/videos PATCH",
		);
		return json({ error: message }, status);
	}
};

export const DELETE: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	try {
		const url = new URL(request.url);
		const slugParam = url.searchParams.get("slug");
		if (!slugParam) return json({ error: "Missing slug." }, 400);
		const slug = assertSafeStorageSegment(slugParam, "slug");

		const expectedRev = expectedRevFromRequest(request);
		const { videos, revision } = await readVideosCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const nextVideos = videos.filter((item) => item.slug !== slug);
		if (nextVideos.length === videos.length) {
			return json({ error: "Video not found." }, 404);
		}
		const next = await saveVideos(
			nextVideos,
			revision,
			cacheOpts(request, locals),
		);
		return json({ ok: true, rev: next.rev });
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete video.",
			"api/videos DELETE",
		);
		return json({ error: message }, status);
	}
};
