import type { APIRoute } from "astro";
import { isProjectCategory } from "../../lib/video-metadata";
import { enrichVideo } from "../../lib/video-metadata";
import { hasWritableMedia, listVideos, saveVideos, youtubeApiKey } from "../../lib/store";

export const prerender = false;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async () => {
	const videos = await listVideos();
	return json({ videos, writable: hasWritableMedia() });
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

	const url = String(body.url ?? "").trim();
	const category = String(body.category ?? "");
	if (!url) return json({ error: "Video URL is required." }, 400);
	if (!isProjectCategory(category)) {
		return json({ error: "Category must be commercial or art." }, 400);
	}

	try {
		const videos = await listVideos();
		const video = await enrichVideo(
			{
				url,
				category,
				title: typeof body.title === "string" ? body.title : undefined,
				description:
					typeof body.description === "string" ? body.description : undefined,
				year: body.year != null && body.year !== "" ? Number(body.year) : undefined,
				duration:
					body.duration != null && body.duration !== ""
						? Number(body.duration)
						: undefined,
				featured: Boolean(body.featured),
				slug: typeof body.slug === "string" ? body.slug : undefined,
			},
			youtubeApiKey(),
		);

		if (videos.some((item) => item.id === video.id && item.provider === video.provider)) {
			return json({ error: "That video is already in the catalog." }, 409);
		}

		if (videos.some((item) => item.slug === video.slug)) {
			video.slug = `${video.slug}-${video.id}`.slice(0, 80);
		}

		videos.push(video);
		await saveVideos(videos);
		return json({ video }, 201);
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : "Could not save video." },
			400,
		);
	}
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

	const slug = String(body.slug ?? "");
	if (!slug) return json({ error: "Missing slug." }, 400);

	const videos = await listVideos();
	const index = videos.findIndex((item) => item.slug === slug);
	if (index === -1) return json({ error: "Video not found." }, 404);

	const current = videos[index];
	const url = String(body.url ?? current.url).trim();
	const category = String(body.category ?? current.category);

	if (!isProjectCategory(category)) {
		return json({ error: "Invalid category." }, 400);
	}

	try {
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
				year: body.year != null && body.year !== "" ? Number(body.year) : current.year,
				duration:
					body.duration != null && body.duration !== ""
						? Number(body.duration)
						: current.duration,
				featured:
					body.featured == null ? current.featured : Boolean(body.featured),
				sortOrder: current.sortOrder,
			},
			youtubeApiKey(),
		);
		videos[index] = video;
		await saveVideos(videos);
		return json({ video });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : "Could not update video." },
			400,
		);
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	const slug = new URL(request.url).searchParams.get("slug");
	if (!slug) return json({ error: "Missing slug." }, 400);

	const videos = await listVideos();
	const next = videos.filter((item) => item.slug !== slug);
	if (next.length === videos.length) return json({ error: "Video not found." }, 404);
	await saveVideos(next);
	return json({ ok: true });
};
