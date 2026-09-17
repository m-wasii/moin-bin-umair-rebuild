import type { APIRoute } from "astro";
import {
	isShortSlug,
	nextShortClipSlug,
	shortClipPosterPath,
	shortClipSrcPath,
	shortMediaFile,
	slugifyShortName,
	type StoredShort,
	type StoredShortClip,
} from "../../data/shorts";
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
	assertYear,
	expectedRevFromRequest,
	parseRequiredInt,
} from "../../lib/catalog-integrity";
import { mutationPublishFromRefresh } from "../../lib/dashboard/publish-status";
import { isValidWebp } from "../../lib/webp";
import {
	deleteShortBytes,
	deleteShortEntryMedia,
	hasWritableMedia,
	putShortBytes,
	readShortsCatalog,
	saveShorts,
} from "../../lib/store";

export const prerender = false;

const MAX_CLIP_VIDEO_BYTES = 40_000_000;
const MAX_CLIP_POSTER_BYTES = 4_500_000;

function httpError(error: unknown): { message: string; status: number } | null {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number" &&
		error instanceof Error
	) {
		return {
			message: error.message,
			status: (error as { status: number }).status,
		};
	}
	return null;
}

function requireText(value: unknown, field: string, max = 500): string {
	if (typeof value !== "string") {
		throw Object.assign(new Error(`Invalid ${field}.`), { status: 400 });
	}
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > max) {
		throw Object.assign(new Error(`Invalid ${field}.`), { status: 400 });
	}
	return trimmed;
}

function isValidMp4(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const limit = Math.min(bytes.length - 4, 64);
	for (let i = 0; i < limit; i++) {
		if (
			bytes[i] === 0x66 &&
			bytes[i + 1] === 0x74 &&
			bytes[i + 2] === 0x79 &&
			bytes[i + 3] === 0x70
		) {
			return true;
		}
	}
	return false;
}

async function readMp4Upload(file: File): Promise<Uint8Array> {
	if (!(file instanceof File) || file.size === 0) {
		throw Object.assign(new Error("Choose an MP4 clip to upload."), {
			status: 400,
		});
	}
	if (file.type && file.type !== "video/mp4") {
		throw Object.assign(new Error("Clip video must be MP4."), { status: 415 });
	}
	if (file.size > MAX_CLIP_VIDEO_BYTES) {
		throw Object.assign(new Error("Clip video is too large (max 40 MB)."), {
			status: 413,
		});
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isValidMp4(bytes)) {
		throw Object.assign(new Error("File is not a valid MP4 video."), {
			status: 415,
		});
	}
	return bytes;
}

async function readPosterUpload(file: File): Promise<Uint8Array> {
	if (!(file instanceof File) || file.size === 0) {
		throw Object.assign(new Error("Choose a WebP poster to upload."), {
			status: 400,
		});
	}
	if (file.type && file.type !== "image/webp") {
		throw Object.assign(new Error("Clip poster must be WebP."), { status: 415 });
	}
	if (file.size > MAX_CLIP_POSTER_BYTES) {
		throw Object.assign(new Error("Poster is too large (max 4.5 MB)."), {
			status: 413,
		});
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isValidWebp(bytes)) {
		throw Object.assign(new Error("Poster is not a valid WebP image."), {
			status: 415,
		});
	}
	return bytes;
}

function parseClipMetrics(form: FormData, prefix = "") {
	const duration = parseRequiredInt(
		String(form.get(`${prefix}duration`) ?? ""),
		"clip duration",
		{ min: 1, max: 3_600 },
	);
	const width = parseRequiredInt(String(form.get(`${prefix}width`) ?? ""), "clip width", {
		min: 1,
		max: 10_000,
	});
	const height = parseRequiredInt(
		String(form.get(`${prefix}height`) ?? ""),
		"clip height",
		{ min: 1, max: 10_000 },
	);
	return { duration, width, height };
}

function rewriteCompleteOrder(shorts: StoredShort[], slugs: string[]): StoredShort[] {
	const bySlug = new Map(shorts.map((entry) => [entry.slug, entry]));
	return slugs.map((slug, index) => ({
		...bySlug.get(slug)!,
		sortOrder: (index + 1) * 10,
	}));
}

function buildClip(
	campaign: string,
	clipSlug: string,
	metrics: { duration: number; width: number; height: number },
): StoredShortClip {
	return {
		slug: clipSlug,
		src: shortClipSrcPath(campaign, clipSlug),
		poster: shortClipPosterPath(campaign, clipSlug),
		duration: metrics.duration,
		width: metrics.width,
		height: metrics.height,
	};
}

async function writeClipMedia(
	campaign: string,
	clipSlug: string,
	video: Uint8Array,
	poster: Uint8Array,
) {
	await putShortBytes(campaign, shortMediaFile(clipSlug, "mp4"), video);
	try {
		await putShortBytes(campaign, shortMediaFile(clipSlug, "webp"), poster);
	} catch (error) {
		await deleteShortBytes(campaign, shortMediaFile(clipSlug, "mp4")).catch(
			() => undefined,
		);
		throw error;
	}
}

export const GET: APIRoute = async () => {
	const { shorts, revision } = await readShortsCatalog();
	return jsonResponse({
		shorts,
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
		const revField = form.get("rev");
		const expectedRev =
			revField != null && String(revField) !== ""
				? expectedRevFromRequest(request, { rev: String(revField) })
				: expectedRevFromRequest(request);

		const { shorts, revision } = await readShortsCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (intent === "add-clip" || intent === "replace-clip") {
			const slug = assertSafeStorageSegment(
				String(form.get("slug") ?? ""),
				"short slug",
			);
			if (!isShortSlug(slug)) {
				return jsonResponse({ error: "Invalid short slug." }, 400);
			}
			const index = shorts.findIndex((entry) => entry.slug === slug);
			if (index === -1) return jsonResponse({ error: "Short not found." }, 404);
			const existing = shorts[index]!;

			const video = await readMp4Upload(form.get("video") as File);
			const poster = await readPosterUpload(form.get("poster") as File);
			const metrics = parseClipMetrics(form);

			let clipSlug: string;
			if (intent === "replace-clip") {
				clipSlug = assertSafeStorageSegment(
					String(form.get("clipSlug") ?? ""),
					"clip slug",
				);
				const clipIndex = existing.clips.findIndex((clip) => clip.slug === clipSlug);
				if (clipIndex === -1) {
					return jsonResponse({ error: "Clip not found." }, 404);
				}
				await writeClipMedia(slug, clipSlug, video, poster);
				const nextClips = existing.clips.slice();
				nextClips[clipIndex] = buildClip(slug, clipSlug, metrics);
				shorts[index] = { ...existing, clips: nextClips };
			} else {
				try {
					clipSlug = nextShortClipSlug(existing.clips);
				} catch {
					return jsonResponse(
						{ error: "Campaign already has the maximum number of clips." },
						400,
					);
				}
				assertSafeStorageSegment(clipSlug, "clip slug");
				await writeClipMedia(slug, clipSlug, video, poster);
				shorts[index] = {
					...existing,
					clips: [...existing.clips, buildClip(slug, clipSlug, metrics)],
				};
			}

			const { revision: next, refresh } = await saveShorts(
				shorts,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				short: shorts[index],
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		// create
		const title = requireText(String(form.get("title") ?? ""), "title");
		const yearRaw = form.get("year");
		const year =
			yearRaw != null && String(yearRaw).trim() !== ""
				? assertYear(yearRaw)
				: assertYear(new Date().getFullYear());
		let slug = slugifyShortName(String(form.get("slug") ?? "") || title);
		if (!slug || !isShortSlug(slug)) {
			return jsonResponse(
				{ error: "Provide a valid kebab-case slug (or a title that slugifies)." },
				400,
			);
		}
		slug = assertSafeStorageSegment(slug, "short slug");
		if (shorts.some((entry) => entry.slug === slug)) {
			return jsonResponse({ error: "That short slug already exists." }, 409);
		}

		const video = await readMp4Upload(form.get("video") as File);
		const poster = await readPosterUpload(form.get("poster") as File);
		const metrics = parseClipMetrics(form);
		const clipSlug = "01";
		await writeClipMedia(slug, clipSlug, video, poster);

		const maxOrder = shorts.reduce(
			(max, item) => Math.max(max, item.sortOrder ?? 0),
			0,
		);
		const entry: StoredShort = {
			slug,
			title,
			year,
			sortOrder: maxOrder + 10,
			clips: [buildClip(slug, clipSlug, metrics)],
		};
		shorts.push(entry);

		try {
			const { revision: next, refresh } = await saveShorts(
				shorts,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse(
				{
					short: entry,
					rev: next.rev,
					publish: mutationPublishFromRefresh(refresh),
				},
				201,
			);
		} catch (error) {
			await deleteShortEntryMedia(entry);
			throw error;
		}
	} catch (error) {
		const mapped = httpError(error);
		if (mapped) return jsonResponse({ error: mapped.message }, mapped.status);
		const { message, status } = publicApiError(
			error,
			"Could not save short.",
			"api/shorts POST",
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
		const { shorts, revision } = await readShortsCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		if (body.action === "reorder") {
			const rawSlugs = Array.isArray(body.slugs) ? body.slugs : [];
			const slugs = assertCompleteSlugOrder(
				shorts.map((entry) => entry.slug),
				rawSlugs.map((slug) => String(slug)),
				"shorts",
			);
			const { revision: next, refresh } = await saveShorts(
				rewriteCompleteOrder(shorts, slugs),
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				ok: true,
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		if (body.action === "reorder-clips") {
			const slug = assertSafeStorageSegment(String(body.slug ?? ""), "short slug");
			const index = shorts.findIndex((entry) => entry.slug === slug);
			if (index === -1) return jsonResponse({ error: "Short not found." }, 404);
			const existing = shorts[index]!;
			const rawClipSlugs = Array.isArray(body.clipSlugs) ? body.clipSlugs : [];
			const clipSlugs = assertCompleteSlugOrder(
				existing.clips.map((clip) => clip.slug),
				rawClipSlugs.map((value) => String(value)),
				"clips",
			);
			const bySlug = new Map(existing.clips.map((clip) => [clip.slug, clip]));
			shorts[index] = {
				...existing,
				clips: clipSlugs.map((clipSlug) => bySlug.get(clipSlug)!),
			};
			const { revision: next, refresh } = await saveShorts(
				shorts,
				revision,
				mutationCacheOpts(request, locals),
			);
			return jsonResponse({
				short: shorts[index],
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		if (body.action === "remove-clip") {
			const slug = assertSafeStorageSegment(String(body.slug ?? ""), "short slug");
			const clipSlug = assertSafeStorageSegment(
				String(body.clipSlug ?? ""),
				"clip slug",
			);
			const index = shorts.findIndex((entry) => entry.slug === slug);
			if (index === -1) return jsonResponse({ error: "Short not found." }, 404);
			const existing = shorts[index]!;
			if (existing.clips.length <= 1) {
				return jsonResponse(
					{ error: "A short needs at least one clip. Delete the short instead." },
					400,
				);
			}
			const clipIndex = existing.clips.findIndex((clip) => clip.slug === clipSlug);
			if (clipIndex === -1) {
				return jsonResponse({ error: "Clip not found." }, 404);
			}
			const removed = existing.clips[clipIndex]!;
			shorts[index] = {
				...existing,
				clips: existing.clips.filter((clip) => clip.slug !== clipSlug),
			};
			const { revision: next, refresh } = await saveShorts(
				shorts,
				revision,
				mutationCacheOpts(request, locals),
			);
			await Promise.allSettled([
				deleteShortBytes(slug, shortMediaFile(removed.slug, "mp4")),
				deleteShortBytes(slug, shortMediaFile(removed.slug, "webp")),
			]);
			return jsonResponse({
				short: shorts[index],
				rev: next.rev,
				publish: mutationPublishFromRefresh(refresh),
			});
		}

		// metadata update
		const slug = assertSafeStorageSegment(String(body.slug ?? ""), "short slug");
		const index = shorts.findIndex((entry) => entry.slug === slug);
		if (index === -1) return jsonResponse({ error: "Short not found." }, 404);
		const existing = shorts[index]!;
		const title =
			body.title !== undefined
				? requireText(body.title, "title")
				: existing.title;
		const year =
			body.year !== undefined ? assertYear(body.year) : existing.year;
		shorts[index] = { ...existing, title, year };

		const { revision: next, refresh } = await saveShorts(
			shorts,
			revision,
			mutationCacheOpts(request, locals),
		);
		return jsonResponse({
			short: shorts[index],
			rev: next.rev,
			publish: mutationPublishFromRefresh(refresh),
		});
	} catch (error) {
		const mapped = httpError(error);
		if (mapped) return jsonResponse({ error: mapped.message }, mapped.status);
		const { message, status } = publicApiError(
			error,
			"Could not update short.",
			"api/shorts PATCH",
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
		const slugParam = url.searchParams.get("slug") ?? "";
		if (!slugParam) return jsonResponse({ error: "Missing slug." }, 400);
		const slug = assertSafeStorageSegment(slugParam, "short slug");

		const expectedRev = expectedRevFromRequest(request);
		const { shorts, revision } = await readShortsCatalog();
		assertExpectedRev(revision.rev, expectedRev);

		const index = shorts.findIndex((entry) => entry.slug === slug);
		if (index === -1) return jsonResponse({ error: "Short not found." }, 404);
		const [removed] = shorts.splice(index, 1);

		const { revision: next, refresh } = await saveShorts(
			shorts,
			revision,
			mutationCacheOpts(request, locals),
		);
		if (removed) await deleteShortEntryMedia(removed);

		return jsonResponse({
			ok: true,
			rev: next.rev,
			publish: mutationPublishFromRefresh(refresh),
		});
	} catch (error) {
		const { message, status } = publicApiError(
			error,
			"Could not delete short.",
			"api/shorts DELETE",
		);
		return jsonResponse({ error: message }, status);
	}
};
