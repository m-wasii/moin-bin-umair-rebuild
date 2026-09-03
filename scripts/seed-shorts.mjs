#!/usr/bin/env node
/**
 * Convert the Shorts zip into web MP4 + WebP posters.
 * Writes src/data/shorts.seed.json, .data/media/shorts/, and public/shorts/.
 *
 *   SHORTS_INPUT_DIR="C:\\Users\\DELL\\Downloads\\Shorts" npm run seed:shorts
 */
import { execFile } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputRoot =
	process.env.SHORTS_INPUT_DIR || join(root, ".data", "shorts-source", "Shorts");
const mediaRoot = join(root, ".data", "media", "shorts");
const publicRoot = join(root, "public", "shorts");
const seedPath = join(root, "src", "data", "shorts.seed.json");
const year = Number(process.env.SHORTS_YEAR || 2026);

const ENTRIES = [
	{
		slug: "asly-dost",
		title: "Asly Dost",
		files: [
			"Asly Dost.mp4",
			"Asly Dost(1).mp4",
			"Asly Dost(2).mp4",
			"Asly Dost(3).mp4",
			"Asly Dost_.mp4",
		],
	},
	{
		slug: "jafferjees",
		title: "Jafferjees",
		files: [
			"Jafferjees.mp4",
			"Jafferjees Accessory.mp4",
			"Jafferjees Bag.mp4",
			"Jafferjees Bag(1).mp4",
			"Jafferjees Bag(2).mp4",
		],
	},
	{
		slug: "dress-code",
		title: "Dress Code",
		files: ["Dress Code.mp4", "Dress Code(1).mp4"],
	},
	{
		slug: "erum-surani",
		title: "Erum Surani",
		files: ["Erum Surani.mp4"],
	},
	{
		slug: "fashion-experimentation",
		title: "Fashion Experimentation",
		files: ["Fashion Experimentation.mp4"],
	},
	{
		slug: "helpers-dvc",
		title: "Helpers D.V.C",
		files: ["Helpers D.V.C"],
	},
];

function ffmpegBin(name) {
	return process.env[`FF${name.toUpperCase()}`] || name;
}

async function run(bin, args) {
	const { stdout } = await execFileAsync(bin, args, {
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
}

async function probe(file) {
	const raw = await run(ffmpegBin("ffprobe"), [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=codec_name,width,height,pix_fmt",
		"-show_entries",
		"format=duration",
		"-of",
		"json",
		file,
	]);
	const audio = await run(ffmpegBin("ffprobe"), [
		"-v",
		"error",
		"-select_streams",
		"a:0",
		"-show_entries",
		"stream=codec_name",
		"-of",
		"csv=p=0",
		file,
	]).catch(() => "");
	const data = JSON.parse(raw);
	const stream = data.streams?.[0] ?? {};
	return {
		codec: String(stream.codec_name ?? ""),
		pixFmt: String(stream.pix_fmt ?? ""),
		audio: String(audio).trim().split("\n")[0] ?? "",
		width: Number(stream.width) || 0,
		height: Number(stream.height) || 0,
		duration: Math.max(1, Math.round(Number(data.format?.duration) || 0)),
	};
}

function isWebReady(info) {
	return (
		info.codec === "h264" &&
		info.pixFmt === "yuv420p" &&
		info.audio === "aac"
	);
}

async function encodeMp4(input, output, info) {
	if (isWebReady(info)) {
		await run(ffmpegBin("ffmpeg"), [
			"-y",
			"-i",
			input,
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			output,
		]);
		return;
	}

	await run(ffmpegBin("ffmpeg"), [
		"-y",
		"-i",
		input,
		"-vf",
		"scale=-2:1080:force_original_aspect_ratio=decrease",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-profile:v",
		"high",
		"-crf",
		"23",
		"-preset",
		"veryfast",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-movflags",
		"+faststart",
		output,
	]);
}

async function posterWebp(input, output, duration) {
	const seek = Math.min(Math.max(1, duration * 0.2), Math.max(0.5, duration - 0.5));
	const { stdout } = await execFileAsync(
		ffmpegBin("ffmpeg"),
		[
			"-y",
			"-ss",
			String(seek),
			"-i",
			input,
			"-frames:v",
			"1",
			"-f",
			"image2pipe",
			"-vcodec",
			"png",
			"pipe:1",
		],
		{ windowsHide: true, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
	);
	await sharp(stdout, { failOn: "none" })
		.rotate()
		.resize({
			width: 1080,
			height: 1080,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: 78 })
		.toFile(output);
}

if (!existsSync(inputRoot)) {
	throw new Error(`seed-shorts: missing source folder ${inputRoot}`);
}

const shorts = [];

for (const [entryIndex, entry] of ENTRIES.entries()) {
	const destDir = join(mediaRoot, entry.slug);
	const publicDir = join(publicRoot, entry.slug);
	mkdirSync(destDir, { recursive: true });
	mkdirSync(publicDir, { recursive: true });
	const clips = [];

	for (const [clipIndex, filename] of entry.files.entries()) {
		const input = join(inputRoot, filename);
		if (!existsSync(input)) {
			throw new Error(`seed-shorts: missing ${filename}`);
		}

		const clipSlug = String(clipIndex + 1).padStart(2, "0");
		const mp4 = join(destDir, `${clipSlug}.mp4`);
		const poster = join(destDir, `${clipSlug}.webp`);
		console.log(`seed-shorts: ${entry.title} / ${clipSlug} ← ${filename}`);

		const info = await probe(input);
		const alreadyDone =
			existsSync(mp4) &&
			existsSync(poster) &&
			statSync(mp4).size > 1024 &&
			statSync(poster).size > 1024;
		if (!alreadyDone) {
			await encodeMp4(input, mp4, info);
			if (!existsSync(poster) || statSync(poster).size < 1024) {
				const encoded = await probe(mp4);
				await posterWebp(mp4, poster, encoded.duration || info.duration);
			}
		}
		const encoded = alreadyDone || existsSync(mp4) ? await probe(mp4) : info;
		copyFileSync(mp4, join(publicDir, `${clipSlug}.mp4`));
		copyFileSync(poster, join(publicDir, `${clipSlug}.webp`));

		clips.push({
			slug: clipSlug,
			src: `/media/shorts/${entry.slug}/${clipSlug}.mp4`,
			poster: `/media/shorts/${entry.slug}/${clipSlug}.webp`,
			duration: encoded.duration || info.duration,
			width: encoded.width || info.width,
			height: encoded.height || info.height,
		});
	}

	shorts.push({
		slug: entry.slug,
		title: entry.title,
		year,
		sortOrder: (entryIndex + 1) * 10,
		clips,
	});
}

const payload = `${JSON.stringify({ shorts }, null, "\t")}\n`;
writeFileSync(seedPath, payload);
const catalogDir = join(root, ".data", "media", "catalog");
mkdirSync(catalogDir, { recursive: true });
writeFileSync(join(catalogDir, "shorts.json"), payload);
console.log(`seed-shorts: wrote ${shorts.length} entries to ${seedPath}`);
