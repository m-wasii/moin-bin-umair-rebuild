#!/usr/bin/env node
/**
 * Convert Sorted album folders into `.data/media/photography` WebP and write
 * src/data/photos.seed.json. Replaces each album's contents (does not keep old
 * stills). Binaries stay out of public/git; upload with `npm run seed:r2`.
 *
 *   PHOTO_INPUT_DIR="C:\\Users\\DELL\\Downloads\\New folder (7)\\Sorted" npm run seed:photos
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputRoot =
	process.env.PHOTO_INPUT_DIR ||
	"C:\\Users\\DELL\\Downloads\\New folder (7)\\Sorted";
const localMediaRoot = join(root, ".data", "media");
const outRoot = join(localMediaRoot, "photography");

/** Site album order → Sorted folder names (ignore _rank-work and anything else). */
const albums = [
	{
		category: "film-portraits-trieste",
		folders: ["Film-Portraits-Trieste"],
	},
	{ category: "architecture", folders: ["Architecture"] },
	{ category: "behind-the-scenes", folders: ["Behind-The-Scenes"] },
	{ category: "portraits-fashion", folders: ["Portraits-Fashion"] },
	{ category: "fashion-lookbook", folders: ["Fashion-Lookbook"] },
	{ category: "events-wedding", folders: ["Events-Wedding"] },
	{ category: "street-photography", folders: ["Street-Photography"] },
	{ category: "portfolio-spreads", folders: ["Portfolio-Spreads"] },
	{ category: "product-photography", folders: ["Product-Photography"] },
];

const IMAGE_EXT = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".tif",
	".tiff",
]);

function slugifyPhotoName(value) {
	return value
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/^\d+-/, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function titleFromSlug(slug) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function listImages(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith(".")) continue;
			out.push(...listImages(path));
			continue;
		}
		const ext = extname(entry.name).toLowerCase();
		if (IMAGE_EXT.has(ext)) out.push(path);
	}
	return out;
}

function uniqueSlug(base, used) {
	let slug = base || "photo";
	if (!used.has(slug)) {
		used.add(slug);
		return slug;
	}
	let n = 2;
	while (used.has(`${slug}-${n}`)) n += 1;
	const next = `${slug}-${n}`.slice(0, 80);
	used.add(next);
	return next;
}

if (!existsSync(inputRoot)) {
	console.error(`seed-photos: input root missing: ${inputRoot}`);
	process.exit(1);
}

// Replace mode: wipe photography media, then rebuild from Sorted only.
if (existsSync(outRoot)) {
	rmSync(outRoot, { recursive: true, force: true });
}
mkdirSync(outRoot, { recursive: true });

const photos = [];
const counts = [];

for (const album of albums) {
	const used = new Set();
	const sources = [];
	for (const folder of album.folders) {
		sources.push(...listImages(join(inputRoot, folder)));
	}
	sources.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

	const destDir = join(outRoot, album.category);
	mkdirSync(destDir, { recursive: true });

	let written = 0;
	for (const input of sources) {
		const base = slugifyPhotoName(basename(input));
		const slug = uniqueSlug(base, used);
		const dest = join(destDir, `${slug}.webp`);
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

		const title = titleFromSlug(slug);
		photos.push({
			slug,
			category: album.category,
			title,
			alt: title,
			src: `/media/photos/${album.category}/${slug}.webp`,
		});
		written += 1;
		console.log(`  ✓ ${album.category}/${slug}`);
	}

	counts.push(`${album.category}: ${written}`);
	if (written === 0) {
		console.warn(`seed-photos: no images for ${album.category}`);
	}
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

writeFileSync(
	join(catalogDir, "photo-categories.json"),
	`${JSON.stringify(
		{
			categories: [
				{ slug: "film-portraits-trieste", label: "Trieste" },
				{ slug: "architecture", label: "Architecture" },
				{ slug: "behind-the-scenes", label: "Behind the scenes" },
				{ slug: "portraits-fashion", label: "Portraits & fashion" },
				{ slug: "fashion-lookbook", label: "Fashion Editorial" },
				{ slug: "events-wedding", label: "Events & wedding" },
				{ slug: "street-photography", label: "Street" },
				{ slug: "portfolio-spreads", label: "Portfolio Spreads" },
				{ slug: "product-photography", label: "Product Photography" },
			],
		},
		null,
		"\t",
	)}\n`,
);

console.log(`seed-photos: wrote ${photos.length} stills from ${inputRoot}`);
for (const line of counts) console.log(`  ${line}`);
