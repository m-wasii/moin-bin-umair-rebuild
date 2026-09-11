#!/usr/bin/env node
/**
 * Confirm every photography WebP from photos.seed.json is reachable on the
 * public Worker (R2-backed /media/photos routes).
 *
 *   node scripts/verify-photos-r2.mjs
 *   VERIFY_BASE=https://mbu.wasi-workdesk.workers.dev node scripts/verify-photos-r2.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base =
	process.env.VERIFY_BASE || "https://mbu.wasi-workdesk.workers.dev";
const seed = JSON.parse(
	readFileSync(join(root, "src/data/photos.seed.json"), "utf8"),
);
const photos = seed.photos ?? [];
const missing = [];
let ok = 0;

for (const photo of photos) {
	const url = `${base}${photo.src}`;
	const response = await fetch(url, { method: "HEAD" });
	if (response.ok) {
		ok += 1;
		continue;
	}
	missing.push(`${photo.category}/${photo.slug} → ${response.status}`);
}

console.log(`verify-photos-r2: ${ok}/${photos.length} stills reachable on ${base}`);
if (missing.length) {
	console.error("Missing:");
	for (const line of missing) console.error(`  - ${line}`);
	process.exit(1);
}
