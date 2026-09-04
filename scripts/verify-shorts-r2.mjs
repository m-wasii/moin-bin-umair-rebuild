#!/usr/bin/env node
/**
 * Confirm every Shorts MP4 from the seed catalog exists in remote R2.
 *
 *   npm run verify:shorts-r2
 *
 * Requires CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const bucket = "moin-media";

if (!accountId || !token) {
	throw new Error(
		"verify-shorts-r2: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
	);
}

const seed = JSON.parse(
	readFileSync(join(root, "src/data/shorts.seed.json"), "utf8"),
);
const expected = seed.shorts.flatMap((entry) =>
	entry.clips.map((clip) => {
		const match = /\/media\/shorts\/([^/]+)\/(\d{2}\.mp4)$/i.exec(clip.src);
		if (!match) throw new Error(`unexpected short src ${clip.src}`);
		return `shorts/${match[1]}/${match[2].toLowerCase()}`;
	}),
);

const url = new URL(
	`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`,
);
url.searchParams.set("prefix", "shorts/");
url.searchParams.set("per_page", "1000");

const response = await fetch(url, {
	headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
	throw new Error(
		`verify-shorts-r2: list failed ${response.status} ${await response.text()}`,
	);
}
const payload = await response.json();
const present = new Set(
	(payload.result ?? []).map((object) => String(object.key).toLowerCase()),
);
const missing = expected.filter((key) => !present.has(key.toLowerCase()));

console.log(
	`verify-shorts-r2: ${expected.length - missing.length}/${expected.length} Shorts MP4s in ${bucket}`,
);
if (missing.length) {
	console.error("Missing:");
	for (const key of missing) console.error(`  - ${key}`);
	process.exit(1);
}
console.log("verify-shorts-r2: ok");
