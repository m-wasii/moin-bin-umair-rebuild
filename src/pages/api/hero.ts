import type { APIRoute } from "astro";
import { unauthorizedMutationResponse } from "../../lib/api-auth";
import { publicApiError } from "../../lib/api-errors";
import { jsonResponse, mutationCacheOpts } from "../../lib/api-http";
import {
	assertExpectedRev,
	expectedRevFromRequest,
} from "../../lib/catalog-integrity";
import { mutationPublishFromRefresh } from "../../lib/dashboard/publish-status";
import { newMediaVersion } from "../../lib/media-url";
import { isValidWebp } from "../../lib/webp";
import {
	copyMediaBytes,
	deleteMediaBytes,
	hasWritableMedia,
	HERO_LOOP_KEY,
	HERO_POSTER_KEY,
	putMediaBytes,
	readHeroCatalog,
	touchHeroMedia,
} from "../../lib/store";

export const prerender = false;

const MAX_LOOP_BYTES = 80_000_000;
const MAX_POSTER_BYTES = 4_500_000;
const HERO_LOOP_BAK_KEY = `${HERO_LOOP_KEY}.bak`;
const HERO_POSTER_BAK_KEY = `${HERO_POSTER_KEY}.bak`;

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

async function readLoopUpload(file: File): Promise<Uint8Array> {
	if (!(file instanceof File) || file.size === 0) {
		throw Object.assign(new Error("Choose an MP4 loop to upload."), {
			status: 400,
		});
	}
	if (file.type && file.type !== "video/mp4") {
		throw Object.assign(new Error("Hero loop must be MP4."), { status: 415 });
	}
	if (file.size > MAX_LOOP_BYTES) {
		throw Object.assign(new Error("Hero loop is too large (max 80 MB)."), {
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
		throw Object.assign(new Error("Hero poster must be WebP."), {
			status: 415,
		});
	}
	if (file.size > MAX_POSTER_BYTES) {
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

async function backupHeroAsset(liveKey: string, bakKey: string) {
	const copied = await copyMediaBytes(liveKey, bakKey);
	return copied ? bakKey : null;
}

async function restoreHeroBackups(
	backups: Array<{ liveKey: string; bakKey: string }>,
) {
	for (const { liveKey, bakKey } of backups) {
		await copyMediaBytes(bakKey, liveKey).catch(() => undefined);
		await deleteMediaBytes(bakKey).catch(() => undefined);
	}
}

async function clearHeroBackups(bakKeys: string[]) {
	await Promise.allSettled(bakKeys.map((key) => deleteMediaBytes(key)));
}

export const GET: APIRoute = async () => {
	const hero = await readHeroCatalog();
	return jsonResponse({
		rev: hero.revision.rev,
		found: hero.revision.found,
		version: hero.mediaVersion,
		catalogVersion: hero.catalogVersion,
		writable: hasWritableMedia(),
		loop: hero.loop
			? {
					src: hero.loopSrc,
					size: hero.loop.size,
					contentType: hero.loop.httpMetadata?.contentType ?? "video/mp4",
				}
			: null,
		poster: hero.poster
			? {
					src: hero.posterSrc,
					size: hero.poster.size,
					contentType: hero.poster.httpMetadata?.contentType ?? "image/webp",
				}
			: null,
	});
};

/**
 * Replace hero loop and/or poster.
 * Sequence: validate → backup live objects → write fixed keys → touch catalog +
 * refresh. On any failure after a live write, restore from `.bak` copies so the
 * loop/poster pair cannot diverge permanently.
 */
export const POST: APIRoute = async ({ request, locals }) => {
	const denied = await unauthorizedMutationResponse(request);
	if (denied) return denied;

	if (!hasWritableMedia()) {
		return jsonResponse(
			{
				error:
					"R2 is not bound yet. Add a MEDIA bucket binding, then replace again.",
			},
			503,
		);
	}

	const backups: Array<{ liveKey: string; bakKey: string }> = [];

	try {
		const form = await request.formData();
		const revField = form.get("rev");
		const expectedRev =
			revField != null && String(revField) !== ""
				? expectedRevFromRequest(request, { rev: String(revField) })
				: expectedRevFromRequest(request);

		const current = await readHeroCatalog();
		assertExpectedRev(current.revision.rev, expectedRev);

		const loopFile = form.get("loop");
		const posterFile = form.get("poster");
		const hasLoop = loopFile instanceof File && loopFile.size > 0;
		const hasPoster = posterFile instanceof File && posterFile.size > 0;

		if (!hasLoop && !hasPoster) {
			return jsonResponse(
				{ error: "Choose a loop and/or poster file to replace." },
				400,
			);
		}

		// Validate fully before writing so a bad companion file cannot partially apply.
		const loopBytes = hasLoop ? await readLoopUpload(loopFile as File) : null;
		const posterBytes = hasPoster
			? await readPosterUpload(posterFile as File)
			: null;

		if (loopBytes) {
			const bakKey = await backupHeroAsset(HERO_LOOP_KEY, HERO_LOOP_BAK_KEY);
			if (bakKey) backups.push({ liveKey: HERO_LOOP_KEY, bakKey });
		}
		if (posterBytes) {
			const bakKey = await backupHeroAsset(
				HERO_POSTER_KEY,
				HERO_POSTER_BAK_KEY,
			);
			if (bakKey) backups.push({ liveKey: HERO_POSTER_KEY, bakKey });
		}

		try {
			if (loopBytes) {
				await putMediaBytes(HERO_LOOP_KEY, loopBytes, "video/mp4");
			}
			if (posterBytes) {
				await putMediaBytes(HERO_POSTER_KEY, posterBytes, "image/webp");
			}

			const { revision: next, refresh } = await touchHeroMedia(
				newMediaVersion(),
				mutationCacheOpts(request, locals),
				current.revision,
			);

			await clearHeroBackups(backups.map((item) => item.bakKey));

			const hero = await readHeroCatalog();
			return jsonResponse({
				rev: next.rev,
				version: hero.mediaVersion,
				catalogVersion: hero.catalogVersion,
				loop: hero.loop
					? {
							src: hero.loopSrc,
							size: hero.loop.size,
							contentType: hero.loop.httpMetadata?.contentType ?? "video/mp4",
						}
					: null,
				poster: hero.poster
					? {
							src: hero.posterSrc,
							size: hero.poster.size,
							contentType:
								hero.poster.httpMetadata?.contentType ?? "image/webp",
						}
					: null,
				replaced: {
					loop: Boolean(loopBytes),
					poster: Boolean(posterBytes),
				},
				publish: mutationPublishFromRefresh(refresh),
			});
		} catch (error) {
			if (backups.length) await restoreHeroBackups(backups);
			throw error;
		}
	} catch (error) {
		const mapped = httpError(error);
		if (mapped) return jsonResponse({ error: mapped.message }, mapped.status);
		const { message, status } = publicApiError(
			error,
			"Could not replace hero media.",
			"api/hero POST",
		);
		return jsonResponse({ error: message }, status);
	}
};
