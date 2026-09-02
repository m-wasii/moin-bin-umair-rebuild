#!/usr/bin/env node
/**
 * Convert ranked JPEGs from the local Top folder into public/photography WebP
 * and write src/data/photos.seed.json.
 *
 *   PHOTO_INPUT_DIR="C:\\Users\\DELL\\Downloads\\New folder (7)\\Top" npm run seed:photos
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
	readFileSync(join(root, "scripts/photos-manifest.json"), "utf8"),
);
const inputRoot =
	process.env.PHOTO_INPUT_DIR ||
	join(root, "..", "Downloads", "New folder (7)", "Top");
const outRoot = join(root, "public/photography");
const localMediaRoot = join(root, ".data", "media");

const foldersByCategory = {
	architecture: ["Architecture", "architecture"],
	"behind-the-scenes": ["Behind-The-Scenes", "behind-the-scenes"],
	"portraits-fashion": ["Portraits-Fashion", "portraits-fashion"],
	"fashion-lookbook": ["Fashion-Lookbook", "fashion-lookbook"],
	"events-wedding": ["Events-Wedding", "events-wedding"],
	"street-photography": ["Street-Photography", "street-photography"],
	"film-portraits-trieste": ["Film-Portraits-Trieste", "film-portraits-trieste"],
};

function findSource(entry) {
	const folders = foldersByCategory[entry.category] ?? [entry.category];
	const names = [
		entry.filename,
		`${entry.slug}.jpg`,
		`${entry.slug}.jpeg`,
		`${entry.slug}.JPG`,
		`${entry.slug}.png`,
	];

	for (const folder of folders) {
		for (const name of names) {
			const path = join(inputRoot, folder, name);
			if (existsSync(path)) return path;
		}
	}

	return null;
}

const photos = [];
const missing = [];

for (const entry of manifest) {
	const input = findSource(entry);
	if (!input) {
		missing.push(`${entry.category}/${entry.slug} (${entry.filename})`);
		console.warn(`seed-photos: missing ${entry.category}/${entry.filename}`);
		continue;
	}

	const destDir = join(outRoot, entry.category);
	mkdirSync(destDir, { recursive: true });
	const dest = join(destDir, `${entry.slug}.webp`);
	await sharp(input, { failOn: "none" })
		.rotate()
		.resize({
			width: 1800,
			height: 1800,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: 82 })
		.toFile(dest);

	const localDir = join(localMediaRoot, "photography", entry.category);
	mkdirSync(localDir, { recursive: true });
	copyFileSync(dest, join(localDir, `${entry.slug}.webp`));

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

const catalogDir = join(localMediaRoot, "catalog");
mkdirSync(catalogDir, { recursive: true });
writeFileSync(
	join(catalogDir, "photos.json"),
	`${JSON.stringify({ photos }, null, "\t")}\n`,
);

if (missing.length) {
	console.error(`seed-photos: ${missing.length} missing stills`);
	process.exitCode = 1;
}

console.log(`seed-photos: wrote ${photos.length} stills from ${inputRoot}`);
