#!/usr/bin/env node
/**
 * One-shot: split fashion-lookbook → fashion + editorial, rename
 * portraits-fashion → random-experimentations, rewrite seed + live R2 catalogs,
 * and copy/move media object keys under photography/{category}/.
 *
 *   node scripts/migrate-fashion-editorial.mjs
 */
import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	readdirSync,
	cpSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bucket = "moin-media";
const wranglerCli = join(root, "node_modules/wrangler/bin/wrangler.js");
const mediaRoot = join(root, ".data", "media");
const photographyRoot = join(mediaRoot, "photography");
const catalogDir = join(mediaRoot, "catalog");
const tmpMedia = join(root, ".data", "r2-migrate-fashion");

/** Location / outdoor / textured wall → fashion. Studio / seamless → editorial. */
const FASHION_SLUGS = new Set([
	"1-16",
	"2-2",
	"2-4",
	"2-5",
	"2-7",
	"2-10",
	"2-11",
	"2-14",
	"2-15",
	"2-16",
	"3-15",
	"3-4", // media missing; prefer fashion when unsure
	"4-2",
	"4-4",
	"4-6",
	"4-9",
	"4-10",
	"4-13",
	"4-14",
	"4",
	"5",
	"6-3",
	"dsc-0725",
	"mg-8600",
	"mg-8626",
	"mg-8634",
	"mg-8684",
	"mg-8708",
	"mg-8740",
	"mg-8786",
	"mg-8795",
	"mg-8881",
	"mg-8882",
]);

const EDITORIAL_SLUGS = new Set([
	"0-10",
	"0-19",
	"0-20",
	"1-2-2",
	"1-2",
	"1-3",
	"1-4",
	"1-5",
	"1-6",
	"1-7",
	"1-8",
	"1-9",
	"1-10",
	"1-11",
	"1-12",
	"1-13",
	"1-14",
	"1-15",
	"1-17",
	"01-47",
	"1",
	"2-2-2",
	"2-3",
	"2-6",
	"2-8",
	"2-9",
	"2-12",
	"2-13",
	"2",
	"3-2",
	"3-3",
	"3-5",
	"3-6",
	"3-7",
	"3-8",
	"3-9",
	"3-10",
	"3-11",
	"3-12",
	"3-13",
	"3-14",
	"3-16",
	"3",
	"4-3",
	"4-5",
	"4-7",
	"4-8",
	"4-11",
	"4-12",
	"5-2",
	"5-3",
	"5-4",
	"5-5",
	"5-6",
	"5-7",
	"5-8",
	"5-9",
	"5-10",
	"5-11",
	"6-2",
	"6-4",
	"6",
	"dsc-0357-2",
	"dsc-0359",
]);

const TARGET_CATEGORIES = [
	{ slug: "film-portraits-trieste", label: "Trieste" },
	{ slug: "behind-the-scenes", label: "Behind the scenes" },
	{ slug: "street-photography", label: "Street" },
	{ slug: "portfolio-spreads", label: "Portfolio Spreads" },
	{ slug: "fashion", label: "Fashion" },
	{ slug: "editorial", label: "Editorial" },
	{ slug: "events-wedding", label: "Events & wedding" },
	{ slug: "product-photography", label: "Product Photography" },
	{ slug: "architecture", label: "Architecture" },
	{ slug: "random-experimentations", label: "Random Experimentations" },
];

/** Orphan catalog entries with no R2 object — drop from catalogs. */
const DROP_SLUGS = new Set(["3-4"]);

function mapLookbookCategory(slug) {
	if (FASHION_SLUGS.has(slug)) return "fashion";
	if (EDITORIAL_SLUGS.has(slug)) return "editorial";
	// Prefer fashion when unsure
	return "fashion";
}

function remapPhoto(photo) {
	if (DROP_SLUGS.has(photo.slug) && photo.category === "fashion-lookbook") {
		return null;
	}
	let category = photo.category;
	if (category === "fashion-lookbook") {
		category = mapLookbookCategory(photo.slug);
	} else if (category === "portraits-fashion") {
		category = "random-experimentations";
	}
	return {
		...photo,
		category,
		src: `/media/photos/${category}/${photo.slug}.webp`,
	};
}

function remapPhotos(photos) {
	return photos.map(remapPhoto).filter(Boolean);
}

function putObjectOnce(key, file, contentType) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				wranglerCli,
				"r2",
				"object",
				"put",
				`${bucket}/${key}`,
				"--file",
				file,
				"--content-type",
				contentType,
				"--remote",
				"--force",
			],
			{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Failed to put ${key}: ${stderr.trim()}`));
		});
	});
}

async function putObject(key, file, contentType, attempts = 4) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			await putObjectOnce(key, file, contentType);
			return;
		} catch (error) {
			lastError = error;
			if (attempt === attempts) break;
			await new Promise((r) => setTimeout(r, 1000 * attempt));
		}
	}
	throw lastError;
}

function deleteObjectOnce(key) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				wranglerCli,
				"r2",
				"object",
				"delete",
				`${bucket}/${key}`,
				"--remote",
			],
			{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			// Treat missing keys as success
			if (code === 0 || /does not exist|not found/i.test(stderr)) resolve();
			else reject(new Error(`Failed to delete ${key}: ${stderr.trim()}`));
		});
	});
}

async function runPool(items, limit, worker) {
	let index = 0;
	const errors = [];
	async function next() {
		const current = index++;
		if (current >= items.length) return;
		try {
			await worker(items[current], current);
		} catch (error) {
			errors.push(error);
		}
		await next();
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, next),
	);
	if (errors.length) throw errors[0];
}

function countsByCategory(photos) {
	const by = {};
	for (const p of photos) by[p.category] = (by[p.category] || 0) + 1;
	return by;
}

// --- Validate classification covers seed lookbook ---
const seed = JSON.parse(
	readFileSync(join(root, "src/data/photos.seed.json"), "utf8"),
);
const lookbook = seed.photos.filter((p) => p.category === "fashion-lookbook");
const unclassified = lookbook
	.map((p) => p.slug)
	.filter((s) => !FASHION_SLUGS.has(s) && !EDITORIAL_SLUGS.has(s));
if (unclassified.length) {
	console.warn("Unclassified lookbook slugs (default fashion):", unclassified);
}
const overlap = [...FASHION_SLUGS].filter((s) => EDITORIAL_SLUGS.has(s));
if (overlap.length) {
	throw new Error(`Slug in both sets: ${overlap.join(", ")}`);
}

const remappedSeed = remapPhotos(seed.photos);
writeFileSync(
	join(root, "src/data/photos.seed.json"),
	`${JSON.stringify({ photos: remappedSeed }, null, "\t")}\n`,
);
console.log("seed counts", countsByCategory(remappedSeed));
console.log(
	`fashion=${remappedSeed.filter((p) => p.category === "fashion").length}`,
	`editorial=${remappedSeed.filter((p) => p.category === "editorial").length}`,
	`random=${remappedSeed.filter((p) => p.category === "random-experimentations").length}`,
);

// Local media dirs if present
mkdirSync(photographyRoot, { recursive: true });
const localLookbook = join(photographyRoot, "fashion-lookbook");
const localPortraits = join(photographyRoot, "portraits-fashion");
if (existsSync(localLookbook)) {
	mkdirSync(join(photographyRoot, "fashion"), { recursive: true });
	mkdirSync(join(photographyRoot, "editorial"), { recursive: true });
	for (const name of readdirSync(localLookbook)) {
		if (!name.endsWith(".webp")) continue;
		const slug = name.replace(/\.webp$/, "");
		if (DROP_SLUGS.has(slug)) continue;
		const destCat = mapLookbookCategory(slug);
		renameSync(
			join(localLookbook, name),
			join(photographyRoot, destCat, name),
		);
	}
	rmSync(localLookbook, { recursive: true, force: true });
	console.log("migrated local fashion-lookbook/");
}
if (existsSync(localPortraits)) {
	const dest = join(photographyRoot, "random-experimentations");
	mkdirSync(dest, { recursive: true });
	for (const name of readdirSync(localPortraits)) {
		renameSync(join(localPortraits, name), join(dest, name));
	}
	rmSync(localPortraits, { recursive: true, force: true });
	console.log("migrated local portraits-fashion/");
}

mkdirSync(catalogDir, { recursive: true });

// Live catalog: start from remote photos (preserves street/powder extras)
const livePhotosPath = "/tmp/photos.json";
if (!existsSync(livePhotosPath)) {
	throw new Error("Missing /tmp/photos.json — download live catalog first");
}
const live = JSON.parse(readFileSync(livePhotosPath, "utf8"));
const remappedLive = remapPhotos(live.photos);
const categoriesPayload = { categories: TARGET_CATEGORIES };
const photosPayload = { photos: remappedLive };

writeFileSync(
	join(catalogDir, "photo-categories.json"),
	`${JSON.stringify(categoriesPayload, null, "\t")}\n`,
);
writeFileSync(
	join(catalogDir, "photos.json"),
	`${JSON.stringify(photosPayload, null, "\t")}\n`,
);
writeFileSync(
	"/tmp/migrated-photo-categories.json",
	`${JSON.stringify(categoriesPayload, null, "\t")}\n`,
);
writeFileSync(
	"/tmp/migrated-photos.json",
	`${JSON.stringify(photosPayload, null, "\t")}\n`,
);

console.log("live remapped counts", countsByCategory(remappedLive));

// Prepare media uploads from /tmp/fashion-lookbook downloads + re-download portraits
mkdirSync(tmpMedia, { recursive: true });
const fashionSrcDir = "/tmp/fashion-lookbook";
const uploads = [];

for (const photo of remappedLive) {
	if (photo.category !== "fashion" && photo.category !== "editorial") continue;
	const local = join(fashionSrcDir, `${photo.slug}.webp`);
	if (!existsSync(local) || statSync(local).size < 500) {
		console.warn(`skip missing media for ${photo.category}/${photo.slug}`);
		continue;
	}
	uploads.push({
		key: `photography/${photo.category}/${photo.slug}.webp`,
		file: local,
		contentType: "image/webp",
		oldKey: `photography/fashion-lookbook/${photo.slug}.webp`,
	});
}

// Download portraits-fashion stills then upload to random-experimentations
const portraits = remappedLive.filter(
	(p) => p.category === "random-experimentations",
);
const portraitsDir = join(tmpMedia, "random-experimentations");
mkdirSync(portraitsDir, { recursive: true });

function getObject(key, file) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				wranglerCli,
				"r2",
				"object",
				"get",
				`${bucket}/${key}`,
				"--file",
				file,
				"--remote",
			],
			{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
		);
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Failed to get ${key}: ${stderr.trim()}`));
		});
	});
}

console.log(`downloading ${portraits.length} random-experimentations stills…`);
await runPool(portraits, 6, async (photo) => {
	const dest = join(portraitsDir, `${photo.slug}.webp`);
	if (existsSync(dest) && statSync(dest).size > 500) return;
	const oldKey = `photography/portraits-fashion/${photo.slug}.webp`;
	await getObject(oldKey, dest);
});

for (const photo of portraits) {
	const file = join(portraitsDir, `${photo.slug}.webp`);
	if (!existsSync(file) || statSync(file).size < 500) {
		console.warn(`skip missing portraits media ${photo.slug}`);
		continue;
	}
	uploads.push({
		key: `photography/random-experimentations/${photo.slug}.webp`,
		file,
		contentType: "image/webp",
		oldKey: `photography/portraits-fashion/${photo.slug}.webp`,
	});
}

console.log(`uploading ${uploads.length} media objects…`);
await runPool(uploads, 4, async ({ key, file, contentType }, i) => {
	await putObject(key, file, contentType);
	if ((i + 1) % 10 === 0 || i + 1 === uploads.length) {
		console.log(`  media ${i + 1}/${uploads.length}`);
	}
});

console.log("uploading catalogs…");
await putObject(
	"catalog/photo-categories.json",
	"/tmp/migrated-photo-categories.json",
	"application/json",
);
await putObject(
	"catalog/photos.json",
	"/tmp/migrated-photos.json",
	"application/json",
);

console.log("deleting old media keys…");
const deletes = uploads.map((u) => u.oldKey).filter(Boolean);
await runPool(deletes, 4, async (key, i) => {
	await deleteObjectOnce(key);
	if ((i + 1) % 20 === 0 || i + 1 === deletes.length) {
		console.log(`  deleted ${i + 1}/${deletes.length}`);
	}
});

console.log("migrate-fashion-editorial: done");
console.log(
	"categories:",
	TARGET_CATEGORIES.map((c) => c.slug).join(" → "),
);
console.log("counts:", countsByCategory(remappedLive));
