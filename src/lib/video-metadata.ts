import type { Project, ProjectCategory, VideoProvider } from "../data/projects";
import type { StoredVideo } from "./store";

const CATEGORIES = new Set<ProjectCategory>(["commercial", "art", "shorts"]);

export function isProjectCategory(value: string): value is ProjectCategory {
	return CATEGORIES.has(value as ProjectCategory);
}

function coerceYear(value: unknown, fallback: number): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) && n >= 1900 && n <= 2100 ? Math.trunc(n) : fallback;
}

export function parseVideoUrl(url: string): { provider: VideoProvider; id: string } {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	const host = parsed.hostname.replace(/^www\./, "");

	if (host === "youtu.be") {
		const id = parsed.pathname.split("/").filter(Boolean)[0];
		if (!id) throw new Error(`Could not parse YouTube id from ${url}`);
		return { provider: "youtube", id };
	}

	if (
		host === "youtube.com" ||
		host === "m.youtube.com" ||
		host === "youtube-nocookie.com"
	) {
		if (parsed.pathname.startsWith("/shorts/")) {
			const id = parsed.pathname.split("/")[2];
			if (!id) throw new Error(`Could not parse YouTube Shorts id from ${url}`);
			return { provider: "youtube", id };
		}
		const id = parsed.searchParams.get("v");
		if (!id) throw new Error(`Could not parse YouTube id from ${url}`);
		return { provider: "youtube", id };
	}

	if (host === "vimeo.com" || host === "player.vimeo.com") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const id = parts.find((part) => /^\d+$/.test(part));
		if (!id) throw new Error(`Could not parse Vimeo id from ${url}`);
		return { provider: "vimeo", id };
	}

	throw new Error(`Unsupported video host in ${url}`);
}

function upgradeVimeoThumbnail(thumbnail: string) {
	return thumbnail
		.replace(/_640(\.|$|\?)/, "_1280x720$1")
		.replace(/_200x150(\.|$|\?)/, "_1280x720$1")
		.replace(/_100x75(\.|$|\?)/, "_1280x720$1");
}

function parseIso8601Duration(iso: string) {
	const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
	if (!match) throw new Error(`Unrecognized YouTube duration: ${iso}`);
	return (
		Number(match[1] ?? 0) * 3600 +
		Number(match[2] ?? 0) * 60 +
		Number(match[3] ?? 0)
	);
}

async function fetchJson(url: string) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return response.json();
}

export function slugifyVideo(title: string, id: string) {
	const base = title
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	return base || id.toLowerCase();
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

	if (provider === "vimeo") {
		const remote = (await fetchJson(
			`https://vimeo.com/api/v2/video/${encodeURIComponent(id)}.json`,
		)) as Array<Record<string, unknown>>;
		const video = remote?.[0];
		if (!video) {
			throw new Error(`Vimeo video ${id} was not found. Is it public?`);
		}

		const title =
			input.title?.trim() || String(video.title ?? "").trim() || `Vimeo ${id}`;
		const year =
			input.year ??
			coerceYear(String(video.upload_date ?? "").slice(0, 4), new Date().getFullYear());
		const duration = input.duration ?? Number(video.duration ?? 0);
		const thumbnail = upgradeVimeoThumbnail(
			String(
				video.thumbnail_large ||
					video.thumbnail_medium ||
					video.thumbnail_small ||
					"",
			),
		);

		return {
			slug: input.slug || slugifyVideo(title, id),
			url: input.url,
			id,
			title,
			category: input.category,
			year,
			duration,
			thumbnail,
			provider: "vimeo",
			sortOrder: input.sortOrder ?? 100,
			...(input.description?.trim()
				? { description: input.description.trim() }
				: {}),
			...(input.featured ? { featured: true } : {}),
		};
	}

	const oembed = (await fetchJson(
		`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
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
		throw new Error(
			"YouTube videos need a duration in seconds (or a YOUTUBE_API_KEY secret).",
		);
	}

	if (input.year == null) {
		throw new Error("YouTube videos need a year.");
	}

	const title = input.title?.trim() || String(oembed.title ?? "").trim() || id;

	return {
		slug: input.slug || slugifyVideo(title, id),
		url: input.url,
		id,
		title,
		category: input.category,
		year: input.year,
		duration,
		thumbnail: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
		provider: "youtube",
		sortOrder: input.sortOrder ?? 100,
		...(input.description?.trim()
			? { description: input.description.trim() }
			: {}),
		...(input.featured ? { featured: true } : {}),
	};
}

export function storedVideoToProject(video: StoredVideo): Project {
	return {
		id: video.id,
		title: video.title,
		category: video.category,
		year: video.year,
		duration: video.duration,
		thumbnail: video.thumbnail,
		provider: video.provider,
		...(video.description ? { description: video.description } : {}),
		...(video.featured ? { featured: true } : {}),
	};
}
