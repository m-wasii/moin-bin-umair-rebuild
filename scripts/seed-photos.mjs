#!/usr/bin/env node
/**
 * Convert Drive Top JPEGs in /tmp/drive-top into public/photography WebP
 * and write src/data/photos.seed.json.
 *
 * Expected input: /tmp/drive-top/{category}/{slug}.jpg (or .jpeg/.png)
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
	readFileSync(join(root, "scripts/photos-manifest.json"), "utf8"),
);
const inputRoot = process.env.PHOTO_INPUT_DIR || "/tmp/drive-top";
const outRoot = join(root, "public/photography");

const photos = [];

for (const entry of manifest) {
	const dir = join(inputRoot, entry.category);
	let source;
	try {
		const files = readdirSync(dir);
		source = files.find((name) =>
			name.toLowerCase().startsWith(entry.slug.toLowerCase()),
		);
		if (!source) {
			const original = entry.filename.replace(/\.[^.]+$/, "").toLowerCase();
			source = files.find((name) =>
				name.toLowerCase().includes(entry.slug.replace(/-/g, "")),
			);
			if (!source) {
				source = files.find((name) =>
					name.toLowerCase().includes(original.slice(0, 12).toLowerCase()),
				);
			}
		}
	} catch {
		source = undefined;
	}

	const direct = join(dir, `${entry.slug}.jpg`);
	const candidates = [
		direct,
		join(dir, `${entry.slug}.jpeg`),
		join(dir, `${entry.slug}.png`),
		source ? join(dir, source) : "",
	].filter(Boolean);

	const input = candidates.find((path) => {
		try {
			readFileSync(path);
			return true;
		} catch {
			return false;
		}
	});

	if (!input) {
		console.warn(`seed-photos: missing ${entry.category}/${entry.slug}`);
		continue;
	}

	const destDir = join(outRoot, entry.category);
	mkdirSync(destDir, { recursive: true });
	const dest = join(destDir, `${entry.slug}.webp`);
	await sharp(input)
		.rotate()
		.resize({
			width: 1600,
			height: 1600,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: 80 })
		.toFile(dest);

	photos.push({
		slug: entry.slug,
		category: entry.category,
		title: entry.title,
		alt: entry.title,
		src: `/media/photos/${entry.category}/${entry.slug}.webp`,
	});
	console.log(`  ✓ ${entry.category}/${entry.slug}`);
}

writeFileSync(
	join(root, "src/data/photos.seed.json"),
	`${JSON.stringify({ photos }, null, "\t")}\n`,
);
console.log(`seed-photos: wrote ${photos.length} stills`);
