import type { Project, ProjectCategory, VideoProvider } from "../data/projects";
import { ClientError } from "./api-errors";
import {
	assertPositiveDuration,
	assertSafeStorageSegment,
	assertSortOrder,
	assertYear,
} from "./catalog-integrity";
import type { StoredVideo } from "./store";

const CATEGORIES = new Set<ProjectCategory>(["indie", "local", "bts"]);

/** Map legacy catalog keys from pre–Indie/Art IA. */
const LEGACY_CATEGORIES: Record<string, ProjectCategory> = {
	commercial: "indie",
	art: "local",
};

const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const FETCH_TIMEOUT_MS = 8_000;

export function normalizeProjectCategory(
	value: string,
): ProjectCategory | null {
	if (CATEGORIES.has(value as ProjectCategory)) {
		return value as ProjectCategory;
	}
	return LEGACY_CATEGORIES[value] ?? null;
}

export function isProjectCategory(value: string): value is ProjectCategory {
	return CATEGORIES.has(value as ProjectCategory);
}

function yearFromRemoteDate(value: unknown, fallback: number): number {
	const yearText = String(value ?? "").slice(0, 4);
	if (!/^\d{4}$/.test(yearText)) return fallback;
	try {
		return assertYear(Number(yearText));
	} catch {
		return fallback;
	}
}

function assertYoutubeId(id: string) {
	if (!YOUTUBE_ID.test(id)) {
		throw new ClientError("Invalid YouTube video id.");
	}
}

function assertVimeoId(id: string) {
	if (!VIMEO_ID.test(id)) {
		throw new ClientError("Invalid Vimeo video id.");
	}
}

export function canonicalVideoUrl(provider: VideoProvider, id: string) {
	if (provider === "youtube") {
		assertYoutubeId(id);
		return `https://www.youtube.com/watch?v=${id}`;
	}
	assertVimeoId(id);
	return `https://vimeo.com/${id}`;
}

export function parseVideoUrl(url: string): {
	provider: VideoProvider;
	id: string;
} {
	let parsed: URL;
	try {
		parsed = new URL(url.trim());
	} catch {
		throw new ClientError("Invalid video URL.");
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new ClientError("Video URL must be http(s).");
	}

	const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

	if (host === "youtu.be") {
		const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
		assertYoutubeId(id);
		return { provider: "youtube", id };
	}

	if (
		host === "youtube.com" ||
		host === "m.youtube.com" ||
		host === "youtube-nocookie.com"
	) {
		if (parsed.pathname.startsWith("/shorts/")) {
			const id = parsed.pathname.split("/")[2] ?? "";
			assertYoutubeId(id);
			return { provider: "youtube", id };
		}
		if (parsed.pathname.startsWith("/embed/")) {
			const id = parsed.pathname.split("/")[2] ?? "";
			assertYoutubeId(id);
			return { provider: "youtube", id };
		}
		const id = parsed.searchParams.get("v") ?? "";
		assertYoutubeId(id);
		return { provider: "youtube", id };
	}

	if (host === "vimeo.com" || host === "player.vimeo.com") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const id = parts.find((part) => VIMEO_ID.test(part));
		if (!id) throw new ClientError("Could not parse Vimeo id from that URL.");
		assertVimeoId(id);
		return { provider: "vimeo", id };
	}

	throw new ClientError("Only YouTube and Vimeo URLs are supported.");
}

function upgradeVimeoThumbnail(thumbnail: string) {
	return thumbnail
		.replace(/_640(\.|$|\?)/, "_1280x720$1")
		.replace(/_200x150(\.|$|\?)/, "_1280x720$1")
		.replace(/_100x75(\.|$|\?)/, "_1280x720$1");
}

function parseIso8601Duration(iso: string) {
	const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
	if (!match) throw new ClientError("Unrecognized YouTube duration.");
	return (
		Number(match[1] ?? 0) * 3600 +
		Number(match[2] ?? 0) * 60 +
		Number(match[3] ?? 0)
	);
}

function assertAllowedMetadataUrl(url: string) {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new ClientError("Could not load video metadata.");
	}
	if (parsed.protocol !== "https:") {
		throw new ClientError("Could not load video metadata.");
	}
	const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
	const allowed =
		host === "vimeo.com" || host === "youtube.com" || host === "googleapis.com";
	if (!allowed) {
		console.error("[video-metadata] blocked outbound host", host);
		throw new ClientError("Could not load video metadata.");
	}
}

async function fetchJson(url: string) {
	assertAllowedMetadataUrl(url);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "error",
			signal: controller.signal,
			headers: { accept: "application/json" },
		});
		if (!response.ok) {
			console.error("[video-metadata] upstream HTTP", response.status);
			throw new ClientError("Could not load video metadata.");
		}
		return response.json();
	} catch (error) {
		if (error instanceof ClientError) throw error;
		console.error("[video-metadata] fetch failed", error);
		throw new ClientError("Could not load video metadata.");
	} finally {
		clearTimeout(timer);
	}
}

export function slugifyVideo(title: string, id: string) {
	const base = title
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	const fallback = assertSafeStorageSegment(id.toLowerCase(), "video id");
	return base || fallback;
}

export interface VideoInput {
	url: string;
	category: ProjectCategory;
	slug?: string;
	title?: string;
	description?: string;
	year?: number;
	duration?: number;
	featured?: boolean;
	sortOrder?: number;
}

export async function enrichVideo(
	input: VideoInput,
	youtubeApiKey?: string,
): Promise<StoredVideo> {
	const { provider, id } = parseVideoUrl(input.url);
	const url = canonicalVideoUrl(provider, id);

	if (provider === "vimeo") {
		const remote = (await fetchJson(
			`https://vimeo.com/api/v2/video/${encodeURIComponent(id)}.json`,
		)) as Array<Record<string, unknown>>;
		const video = remote?.[0];
		if (!video) {
			throw new ClientError("Vimeo video was not found. Is it public?");
		}

		const title =
			input.title?.trim() || String(video.title ?? "").trim() || `Vimeo ${id}`;
		const year = assertYear(
			input.year ??
				yearFromRemoteDate(video.upload_date, new Date().getFullYear()),
		);
		const duration = assertPositiveDuration(
			input.duration ?? Number(video.duration ?? 0),
		);
		const thumbnailRaw = String(
			video.thumbnail_large ||
				video.thumbnail_medium ||
				video.thumbnail_small ||
				"",
		);
		let thumbnail = "";
		if (thumbnailRaw) {
			try {
				const thumbUrl = new URL(thumbnailRaw);
				if (thumbUrl.protocol === "https:") {
					thumbnail = upgradeVimeoThumbnail(thumbUrl.toString());
				}
			} catch {
				thumbnail = "";
			}
		}

		const slug = assertSafeStorageSegment(
			input.slug?.trim() || slugifyVideo(title, id),
			"video slug",
		);

		return {
			slug,
			url,
			id,
			title,
			category: input.category,
			year,
			duration,
			thumbnail,
			provider: "vimeo",
			sortOrder: assertSortOrder(input.sortOrder ?? 100),
			...(input.description?.trim()
				? { description: input.description.trim() }
				: {}),
			...(input.featured ? { featured: true } : {}),
		};
	}

	const oembed = (await fetchJson(
		`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
	)) as { title?: string };

	let duration = input.duration;
	if (duration == null && youtubeApiKey) {
		const data = (await fetchJson(
			`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(youtubeApiKey)}`,
		)) as {
			items?: Array<{ contentDetails?: { duration?: string } }>;
		};
		const iso = data?.items?.[0]?.contentDetails?.duration;
		if (iso) duration = parseIso8601Duration(iso);
	}

	if (duration == null) {
		throw new ClientError(
			"YouTube videos need a duration in seconds (or a configured API key).",
		);
	}

	if (input.year == null) {
		throw new ClientError("YouTube videos need a year.");
	}

	const title = input.title?.trim() || String(oembed.title ?? "").trim() || id;
	const slug = assertSafeStorageSegment(
		input.slug?.trim() || slugifyVideo(title, id),
		"video slug",
	);

	return {
		slug,
		url,
		id,
		title,
		category: input.category,
		year: assertYear(input.year),
		duration: assertPositiveDuration(duration),
		thumbnail: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
		provider: "youtube",
		sortOrder: assertSortOrder(input.sortOrder ?? 100),
		...(input.description?.trim()
			? { description: input.description.trim() }
			: {}),
		...(input.featured ? { featured: true } : {}),
	};
}

export function storedVideoToProject(video: StoredVideo): Project {
	const category = normalizeProjectCategory(video.category) ?? video.category;
	return {
		id: video.id,
		title: video.title,
		category,
		year: video.year,
		duration: video.duration,
		thumbnail: video.thumbnail,
		provider: video.provider,
		...(video.description ? { description: video.description } : {}),
		...(video.featured ? { featured: true } : {}),
	};
}
