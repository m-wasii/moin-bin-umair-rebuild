import { ClientError } from "./api-errors";
import type { ProjectCategory, VideoProvider } from "../data/projects";
import type { StoredPhoto, StoredPhotoCategory } from "../data/photos";
import type { StoredShort, StoredShortClip } from "../data/shorts";
import type { StoredVideo } from "./store";

/** Concurrent catalog write lost the race (etag/rev mismatch). */
export class CatalogConflictError extends ClientError {
	constructor(
		message = "Catalog was updated concurrently. Please retry.",
	) {
		super(message, 409);
		this.name = "CatalogConflictError";
	}
}

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
const DURATION_MAX_SEC = 86_400;
const SORT_ORDER_MAX = 1_000_000;
const SLUG_MAX = 80;

/** Safe single path segment for R2/local media keys (preserves legacy ids). */
export function isSafeStorageSegment(value: string): boolean {
	if (!value || value.length > SLUG_MAX) return false;
	if (value === "." || value === "..") return false;
	if (/[\\/\0\r\n\t]/.test(value)) return false;
	if (value.startsWith(".") || value.endsWith(".")) return false;
	return /^[a-zA-Z0-9._-]+$/.test(value);
}

export function assertSafeStorageSegment(
	value: string,
	label = "identifier",
): string {
	const trimmed = value.trim();
	if (!isSafeStorageSegment(trimmed)) {
		throw new ClientError(`Invalid ${label}.`);
	}
	return trimmed;
}

/** Prefer kebab slugs for new photo/category entries. */
export function isKebabSlug(value: string): boolean {
	return (
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= SLUG_MAX
	);
}

export function assertKebabSlug(value: string, label = "slug"): string {
	const trimmed = value.trim();
	if (!isKebabSlug(trimmed)) {
		throw new ClientError(`Invalid ${label}.`);
	}
	return trimmed;
}

export function parseCatalogRev(value: unknown): number {
	if (value == null) return 0;
	if (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		Number.isSafeInteger(value)
	) {
		return value;
	}
	return 0;
}

/**
 * Parse a required finite integer. Rejects NaN, Infinity, floats, and
 * non-numeric strings (no silent truncation).
 */
export function parseRequiredInt(
	value: unknown,
	field: string,
	opts: { min: number; max: number },
): number {
	if (typeof value === "boolean" || value == null) {
		throw new ClientError(`Invalid ${field}.`);
	}

	let n: number;
	if (typeof value === "number") {
		n = value;
	} else if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed || !/^[+-]?\d+$/.test(trimmed)) {
			throw new ClientError(`Invalid ${field}.`);
		}
		n = Number(trimmed);
	} else {
		throw new ClientError(`Invalid ${field}.`);
	}

	if (!Number.isFinite(n) || !Number.isInteger(n) || !Number.isSafeInteger(n)) {
		throw new ClientError(`Invalid ${field}.`);
	}
	if (n < opts.min || n > opts.max) {
		throw new ClientError(`Invalid ${field}.`);
	}
	return n;
}

export function parseOptionalInt(
	value: unknown,
	field: string,
	opts: { min: number; max: number },
): number | undefined {
	if (value == null || value === "") return undefined;
	return parseRequiredInt(value, field, opts);
}

export function assertYear(value: unknown, field = "year"): number {
	return parseRequiredInt(value, field, { min: YEAR_MIN, max: YEAR_MAX });
}

export function assertDuration(value: unknown, field = "duration"): number {
	return parseRequiredInt(value, field, { min: 0, max: DURATION_MAX_SEC });
}

export function assertPositiveDuration(
	value: unknown,
	field = "duration",
): number {
	return parseRequiredInt(value, field, { min: 1, max: DURATION_MAX_SEC });
}

export function assertSortOrder(value: unknown, field = "sortOrder"): number {
	return parseRequiredInt(value, field, { min: 0, max: SORT_ORDER_MAX });
}

export function optionalYear(value: unknown): number | undefined {
	return parseOptionalInt(value, "year", { min: YEAR_MIN, max: YEAR_MAX });
}

export function optionalDuration(value: unknown): number | undefined {
	return parseOptionalInt(value, "duration", {
		min: 0,
		max: DURATION_MAX_SEC,
	});
}

export function optionalPositiveDuration(value: unknown): number | undefined {
	return parseOptionalInt(value, "duration", {
		min: 1,
		max: DURATION_MAX_SEC,
	});
}

export function optionalSortOrder(value: unknown): number | undefined {
	return parseOptionalInt(value, "sortOrder", {
		min: 0,
		max: SORT_ORDER_MAX,
	});
}

/**
 * Expected catalog revision from `If-Match` or JSON `rev`.
 * Undefined means the server uses its own read snapshot only.
 */
export function expectedRevFromRequest(
	request: Request,
	body?: Record<string, unknown>,
): number | undefined {
	const header = request.headers.get("If-Match");
	if (header != null && header.trim() !== "") {
		const raw = header.trim().replace(/^W\//, "").replaceAll('"', "");
		if (raw === "*") return undefined;
		return parseRequiredInt(raw, "If-Match revision", {
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
		});
	}
	if (body && "rev" in body) {
		return parseRequiredInt(body.rev, "rev", {
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
		});
	}
	return undefined;
}

export function assertExpectedRev(actual: number, expected?: number) {
	if (expected != null && expected !== actual) {
		throw new CatalogConflictError();
	}
}

/**
 * Complete deterministic reorder: no duplicates, no omissions, every id known.
 */
export function assertCompleteSlugOrder(
	currentSlugs: string[],
	incoming: string[],
	label = "items",
): string[] {
	if (!incoming.length) {
		throw new ClientError(`Missing ${label}.`);
	}

	const normalized = incoming.map((slug, index) => {
		if (typeof slug !== "string" && typeof slug !== "number") {
			throw new ClientError(`Invalid ${label} at index ${index}.`);
		}
		return assertSafeStorageSegment(String(slug), label);
	});

	if (new Set(normalized).size !== normalized.length) {
		throw new ClientError(`Duplicate ${label} in reorder.`);
	}

	if (normalized.length !== currentSlugs.length) {
		throw new ClientError(
			`Reorder must include every ${label} exactly once.`,
		);
	}

	const known = new Set(currentSlugs);
	for (const slug of normalized) {
		if (!known.has(slug)) {
			throw new ClientError(`One or more ${label} were not found.`, 404);
		}
	}

	return normalized;
}

function assertString(
	value: unknown,
	field: string,
	opts: { min?: number; max?: number; allowEmpty?: boolean } = {},
): string {
	if (typeof value !== "string") {
		throw new ClientError(`Invalid ${field}.`);
	}
	const min = opts.min ?? (opts.allowEmpty ? 0 : 1);
	const max = opts.max ?? 2_000;
	if (value.length < min || value.length > max) {
		throw new ClientError(`Invalid ${field}.`);
	}
	return value;
}

function assertProvider(value: unknown): VideoProvider {
	if (value === "youtube" || value === "vimeo") return value;
	throw new ClientError("Invalid video provider.");
}

function assertVideoCategory(value: unknown): ProjectCategory {
	if (value === "indie" || value === "local" || value === "bts") return value;
	throw new ClientError("Invalid video category.");
}

export function assertStoredVideo(value: unknown): StoredVideo {
	if (!value || typeof value !== "object") {
		throw new ClientError("Invalid video entry.");
	}
	const raw = value as Record<string, unknown>;
	const slug = assertSafeStorageSegment(String(raw.slug ?? ""), "video slug");
	const id = assertSafeStorageSegment(String(raw.id ?? ""), "video id");
	const provider = assertProvider(raw.provider);
	const category = assertVideoCategory(raw.category);
	const title = assertString(raw.title, "title", { max: 500 });
	const url = assertString(raw.url, "url", { max: 2_000 });
	const thumbnail = assertString(raw.thumbnail, "thumbnail", {
		allowEmpty: true,
		max: 2_000,
	});
	const year = assertYear(raw.year);
	const duration = assertDuration(raw.duration);
	const video: StoredVideo = {
		slug,
		url,
		id,
		title,
		category,
		year,
		duration,
		thumbnail,
		provider,
	};

	if (raw.description != null) {
		video.description = assertString(raw.description, "description", {
			allowEmpty: true,
			max: 8_000,
		});
	}
	if (raw.featured != null) {
		if (typeof raw.featured !== "boolean") {
			throw new ClientError("Invalid featured flag.");
		}
		if (raw.featured) video.featured = true;
	}
	if (raw.sortOrder != null) {
		video.sortOrder = assertSortOrder(raw.sortOrder);
	}

	return video;
}

export function assertStoredVideos(values: unknown): StoredVideo[] {
	if (!Array.isArray(values)) {
		throw new ClientError("Invalid videos catalog.");
	}
	const videos = values.map(assertStoredVideo);
	const slugs = new Set<string>();
	const providerIds = new Set<string>();
	for (const video of videos) {
		if (slugs.has(video.slug)) {
			throw new ClientError("Duplicate video slug in catalog.");
		}
		slugs.add(video.slug);
		const key = `${video.provider}:${video.id}`;
		if (providerIds.has(key)) {
			throw new ClientError("Duplicate video provider id in catalog.");
		}
		providerIds.add(key);
	}
	return videos;
}

export function assertStoredPhoto(value: unknown): StoredPhoto {
	if (!value || typeof value !== "object") {
		throw new ClientError("Invalid photo entry.");
	}
	const raw = value as Record<string, unknown>;
	const slug = assertSafeStorageSegment(String(raw.slug ?? ""), "photo slug");
	const category = assertSafeStorageSegment(
		String(raw.category ?? ""),
		"photo category",
	);
	if (!isKebabSlug(category)) {
		throw new ClientError("Invalid photo category.");
	}
	const title = assertString(raw.title, "title", { max: 500 });
	const alt = assertString(raw.alt, "alt", { max: 500 });
	const src = assertString(raw.src, "src", { max: 2_000 });
	const photo: StoredPhoto = { slug, category, title, alt, src };
	if (raw.v != null) {
		photo.v = assertString(raw.v, "v", { max: 80 });
	}
	return photo;
}

export function assertStoredPhotos(values: unknown): StoredPhoto[] {
	if (!Array.isArray(values)) {
		throw new ClientError("Invalid photos catalog.");
	}
	const photos = values.map(assertStoredPhoto);
	const keys = new Set<string>();
	for (const photo of photos) {
		const key = `${photo.category}/${photo.slug}`;
		if (keys.has(key)) {
			throw new ClientError("Duplicate photo in catalog.");
		}
		keys.add(key);
	}
	return photos;
}

export function assertStoredPhotoCategory(value: unknown): StoredPhotoCategory {
	if (!value || typeof value !== "object") {
		throw new ClientError("Invalid category entry.");
	}
	const raw = value as Record<string, unknown>;
	const slug = assertKebabSlug(String(raw.slug ?? ""), "category slug");
	const label = assertString(raw.label, "label", { max: 200 });
	return { slug, label };
}

export function assertStoredPhotoCategories(
	values: unknown,
): StoredPhotoCategory[] {
	if (!Array.isArray(values)) {
		throw new ClientError("Invalid categories catalog.");
	}
	const categories = values.map(assertStoredPhotoCategory);
	const slugs = new Set<string>();
	for (const entry of categories) {
		if (slugs.has(entry.slug)) {
			throw new ClientError("Duplicate category slug in catalog.");
		}
		slugs.add(entry.slug);
	}
	return categories;
}

function assertShortClip(value: unknown): StoredShortClip {
	if (!value || typeof value !== "object") {
		throw new ClientError("Invalid short clip.");
	}
	const raw = value as Record<string, unknown>;
	return {
		slug: assertSafeStorageSegment(String(raw.slug ?? ""), "clip slug"),
		src: assertString(raw.src, "clip src", { max: 2_000 }),
		poster: assertString(raw.poster, "clip poster", { max: 2_000 }),
		duration: assertPositiveDuration(raw.duration, "clip duration"),
		width: parseRequiredInt(raw.width, "clip width", { min: 1, max: 10_000 }),
		height: parseRequiredInt(raw.height, "clip height", {
			min: 1,
			max: 10_000,
		}),
	};
}

export function assertStoredShort(value: unknown): StoredShort {
	if (!value || typeof value !== "object") {
		throw new ClientError("Invalid short entry.");
	}
	const raw = value as Record<string, unknown>;
	if (!Array.isArray(raw.clips) || !raw.clips.length) {
		throw new ClientError("Short entry needs at least one clip.");
	}
	return {
		slug: assertSafeStorageSegment(String(raw.slug ?? ""), "short slug"),
		title: assertString(raw.title, "title", { max: 500 }),
		year: assertYear(raw.year),
		sortOrder: assertSortOrder(raw.sortOrder),
		clips: raw.clips.map(assertShortClip),
	};
}

export function assertStoredShorts(values: unknown): StoredShort[] {
	if (!Array.isArray(values)) {
		throw new ClientError("Invalid shorts catalog.");
	}
	const shorts = values.map(assertStoredShort);
	const slugs = new Set<string>();
	for (const entry of shorts) {
		if (slugs.has(entry.slug)) {
			throw new ClientError("Duplicate short slug in catalog.");
		}
		slugs.add(entry.slug);
	}
	return shorts;
}
