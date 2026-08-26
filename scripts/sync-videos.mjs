#!/usr/bin/env node
/**
 * Sync portfolio projects from Keystatic content.
 *
 * Client workflow:
 * 1. Open http://127.0.0.1:4321/keystatic while `npm run dev` is running
 * 2. Add/edit a video (URL + category; optional title/description/year/duration)
 * 3. Run `npm run sync:videos` (or wait for the GitHub Action)
 * 4. Commit the updated content files + projects.generated.json
 *
 * Vimeo: title/year/duration/thumbnail are fetched automatically (optional overrides).
 * YouTube: title/thumbnail are fetched; duration and year should be set in Keystatic
 *          (or provide YOUTUBE_API_KEY to fill duration automatically).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const settingsPath = join(root, "src/data/video-settings.json");
const videosDir = join(root, "src/content/videos");
const outputPath = join(root, "src/data/projects.generated.json");

const CATEGORIES = new Set(["commercial", "art", "shorts"]);

/**
 * @typedef {"commercial" | "art" | "shorts"} ProjectCategory
 * @typedef {"vimeo" | "youtube"} VideoProvider
 *
 * @typedef {object} CatalogEntry
 * @property {string} url
 * @property {ProjectCategory} category
 * @property {string} [title]
 * @property {string} [description]
 * @property {number} [year]
 * @property {number} [duration]
 * @property {string} [thumbnail]
 * @property {boolean} [featured]
 * @property {number} [sortOrder]
 * @property {string} [slug]
 *
 * @typedef {object} Project
 * @property {string} id
 * @property {string} title
 * @property {ProjectCategory} category
 * @property {number} year
 * @property {number} duration
 * @property {string} thumbnail
 * @property {string} [description]
 * @property {boolean} [featured]
 * @property {VideoProvider} [provider]
 */

function fail(message) {
	console.error(`sync-videos: ${message}`);
	process.exit(1);
}

/**
 * @param {string} url
 * @returns {{ provider: VideoProvider, id: string }}
 */
function parseVideoUrl(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		fail(`Invalid URL: ${url}`);
	}

	const host = parsed.hostname.replace(/^www\./, "");

	if (host === "youtu.be") {
		const id = parsed.pathname.split("/").filter(Boolean)[0];
		if (!id) fail(`Could not parse YouTube id from ${url}`);
		return { provider: "youtube", id };
	}

	if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
		if (parsed.pathname.startsWith("/shorts/")) {
			const id = parsed.pathname.split("/")[2];
			if (!id) fail(`Could not parse YouTube Shorts id from ${url}`);
			return { provider: "youtube", id };
		}
		const id = parsed.searchParams.get("v");
		if (!id) fail(`Could not parse YouTube id from ${url}`);
		return { provider: "youtube", id };
	}

	if (host === "vimeo.com" || host === "player.vimeo.com") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		const id = parts.find((part) => /^\d+$/.test(part));
		if (!id) fail(`Could not parse Vimeo id from ${url}`);
		return { provider: "vimeo", id };
	}

	fail(`Unsupported video host in ${url}`);
}

/**
 * @param {string} url
 */
async function fetchJson(url, init) {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return response.json();
}

/**
 * @param {string} user
 * @returns {Promise<Map<string, any>>}
 */
async function fetchVimeoVideos(user) {
	/** @type {Map<string, any>} */
	const videos = new Map();
	let page = 1;

	while (page <= 20) {
		const url = `https://vimeo.com/api/v2/${encodeURIComponent(user)}/videos.json?page=${page}`;
		const response = await fetch(url);
		if (response.status === 404 || response.status === 400) break;
		if (!response.ok) {
			throw new Error(`Vimeo list failed (${response.status}) for ${url}`);
		}

		const text = await response.text();
		if (!text.trim()) break;

		const batch = JSON.parse(text);
		if (!Array.isArray(batch) || batch.length === 0) break;

		for (const video of batch) {
			videos.set(String(video.id), video);
		}

		if (batch.length < 20) break;
		page += 1;
	}

	return videos;
}

/**
 * @param {string} thumbnail
 */
function upgradeVimeoThumbnail(thumbnail) {
	return thumbnail
		.replace(/_640(\.|$|\?)/, "_1280x720$1")
		.replace(/_200x150(\.|$|\?)/, "_1280x720$1")
		.replace(/_100x75(\.|$|\?)/, "_1280x720$1");
}

/**
 * @param {string} id
 * @param {any} remote
 * @param {CatalogEntry} entry
 * @param {string} vimeoUser
 * @returns {Project}
 */
function projectFromVimeo(id, remote, entry, vimeoUser) {
	if (!remote) {
		fail(`Vimeo video ${id} was not found on user "${vimeoUser}". Is it public?`);
	}

	const year = entry.year ?? Number(String(remote.upload_date).slice(0, 4));
	const thumbnail =
		entry.thumbnail ??
		upgradeVimeoThumbnail(
			remote.thumbnail_large ||
				remote.thumbnail_medium ||
				remote.thumbnail_small,
		);

	/** @type {Project} */
	const project = {
		id,
		title: entry.title?.trim() || String(remote.title).trim(),
		category: entry.category,
		year,
		duration: entry.duration ?? Number(remote.duration),
		thumbnail,
	};

	if (entry.description?.trim()) project.description = entry.description.trim();
	if (entry.featured) project.featured = true;

	return project;
}

/**
 * @param {string} id
 * @param {CatalogEntry} entry
 * @param {string | undefined} apiKey
 * @returns {Promise<Project>}
 */
async function projectFromYoutube(id, entry, apiKey) {
	const oembed = await fetchJson(
		`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
	);

	let duration = entry.duration;
	if (duration == null && apiKey) {
		const data = await fetchJson(
			`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(apiKey)}`,
		);
		const iso = data?.items?.[0]?.contentDetails?.duration;
		if (iso) duration = parseIso8601Duration(iso);
	}

	if (duration == null) {
		fail(
			`YouTube video ${id} needs a "duration" (seconds) in catalog.json, or set YOUTUBE_API_KEY.`,
		);
	}

	if (entry.year == null) {
		fail(`YouTube video ${id} needs a "year" in catalog.json.`);
	}

	/** @type {Project} */
	const project = {
		id,
		title: entry.title?.trim() || String(oembed.title).trim(),
		category: entry.category,
		year: entry.year,
		duration,
		thumbnail:
			entry.thumbnail ?? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
		provider: "youtube",
	};

	if (entry.description?.trim()) project.description = entry.description.trim();
	if (entry.featured) project.featured = true;

	return project;
}

/**
 * @param {string} iso
 */
function parseIso8601Duration(iso) {
	const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
	if (!match) fail(`Unrecognized YouTube duration: ${iso}`);
	const hours = Number(match[1] ?? 0);
	const minutes = Number(match[2] ?? 0);
	const seconds = Number(match[3] ?? 0);
	return hours * 3600 + minutes * 60 + seconds;
}

/**
 * @returns {CatalogEntry[]}
 */
function loadVideoEntries() {
	let files;
	try {
		files = readdirSync(videosDir).filter((name) => name.endsWith(".json"));
	} catch {
		fail(`Missing videos folder at src/content/videos. Add videos in Keystatic.`);
	}

	/** @type {CatalogEntry[]} */
	const entries = files.map((file) => {
		const raw = JSON.parse(readFileSync(join(videosDir, file), "utf8"));
		/** @type {CatalogEntry} */
		const entry = {
			url: String(raw.url ?? ""),
			category: raw.category,
			slug: file.replace(/\.json$/, ""),
			sortOrder: Number(raw.sortOrder ?? 100),
		};

		if (typeof raw.title === "string" && raw.title.trim()) {
			entry.title = raw.title.trim();
		}
		if (typeof raw.description === "string" && raw.description.trim()) {
			entry.description = raw.description.trim();
		}
		if (raw.year != null && raw.year !== "") entry.year = Number(raw.year);
		if (raw.duration != null && raw.duration !== "") {
			entry.duration = Number(raw.duration);
		}
		if (raw.featured) entry.featured = true;
		if (typeof raw.thumbnail === "string" && raw.thumbnail.trim()) {
			entry.thumbnail = raw.thumbnail.trim();
		}

		return entry;
	});

	entries.sort((a, b) => {
		const order = (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
		if (order !== 0) return order;
		return String(a.slug).localeCompare(String(b.slug));
	});

	return entries;
}

/** @type {{ vimeoUser?: string }} */
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const vimeoUser = settings.vimeoUser;

if (!vimeoUser || typeof vimeoUser !== "string") {
	fail("src/data/video-settings.json must include a string vimeoUser.");
}

const entries = loadVideoEntries();
if (entries.length === 0) {
	fail("No videos found in src/content/videos. Add some in Keystatic.");
}

const youtubeApiKey = process.env.YOUTUBE_API_KEY;
const vimeoVideos = await fetchVimeoVideos(vimeoUser);
console.log(
	`sync-videos: loaded ${vimeoVideos.size} public Vimeo videos for ${vimeoUser}`,
);

/** @type {Project[]} */
const projects = [];
const seen = new Set();

for (const [index, entry] of entries.entries()) {
	const label = entry.slug ?? `videos[${index}]`;
	if (!entry?.url) fail(`${label} is missing url.`);
	if (!CATEGORIES.has(entry.category)) {
		fail(
			`${label} has invalid category "${entry.category}". Use commercial, art, or shorts.`,
		);
	}

	const { provider, id } = parseVideoUrl(entry.url);
	const key = `${provider}:${id}`;
	if (seen.has(key)) fail(`Duplicate video entry for ${entry.url}`);
	seen.add(key);

	const project =
		provider === "vimeo"
			? projectFromVimeo(id, vimeoVideos.get(id), entry, vimeoUser)
			: await projectFromYoutube(id, entry, youtubeApiKey);

	projects.push(project);
	console.log(`  ✓ ${provider} ${id} → ${project.category} / ${project.title}`);
}

const payload = {
	generatedAt: new Date().toISOString(),
	source: "src/content/videos + src/data/video-settings.json",
	projects,
};

writeFileSync(outputPath, `${JSON.stringify(payload, null, "\t")}\n`);
console.log(
	`sync-videos: wrote ${projects.length} projects to src/data/projects.generated.json`,
);
