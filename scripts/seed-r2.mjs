#!/usr/bin/env node
/**
 * Upload seed WebP stills and catalog JSON to the moin-media R2 bucket.
 *
 * Requires CLOUDFLARE_API_TOKEN (and usually CLOUDFLARE_ACCOUNT_ID).
 *
 *   npm run seed:r2
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bucket = "moin-media";
const photographyRoot = join(root, "public/photography");
const wranglerCli = join(root, "node_modules/wrangler/bin/wrangler.js");
const tmpDir = join(root, ".data", "r2-seed");

function listWebp(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listWebp(path));
		else if (entry.name.endsWith(".webp")) out.push(path);
	}
	return out;
}

function putObject(key, file, contentType) {
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

async function runPool(items, limit, worker) {
	let index = 0;
	const errors = [];
	async function next() {
		const current = index++;
		if (current >= items.length) return;
		try {
			await worker(items[current]);
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

const seedPhotos = JSON.parse(
	readFileSync(join(root, "src/data/photos.seed.json"), "utf8"),
);
const seedVideos = JSON.parse(
	readFileSync(join(root, "src/data/videos.seed.json"), "utf8"),
);

const photos = {
	photos: seedPhotos.photos.map((photo) => ({
		...photo,
		src: `/media/photos/${photo.category}/${photo.slug}.webp`,
	})),
};

mkdirSync(tmpDir, { recursive: true });
const photosCatalog = join(tmpDir, "photos.json");
const videosCatalog = join(tmpDir, "videos.json");
writeFileSync(photosCatalog, `${JSON.stringify(photos, null, "\t")}\n`);
writeFileSync(videosCatalog, `${JSON.stringify(seedVideos, null, "\t")}\n`);

const stills = listWebp(photographyRoot).map((file) => ({
	key: `photography/${relative(photographyRoot, file).replaceAll("\\", "/")}`,
	file,
	contentType: "image/webp",
}));

const objects = [
	...stills,
	{
		key: "catalog/photos.json",
		file: photosCatalog,
		contentType: "application/json",
	},
	{
		key: "catalog/videos.json",
		file: videosCatalog,
		contentType: "application/json",
	},
];

console.log(`seed-r2: uploading ${objects.length} objects to ${bucket}`);
await runPool(objects, 4, async ({ key, file, contentType }) => {
	await putObject(key, file, contentType);
	console.log(`  ✓ ${key}`);
});
console.log("seed-r2: done");
