/**
 * Purge/warm must target the public Worker entrypoint, not marketing SITE.
 * Run: node --experimental-strip-types scripts/verify-worker-cache-origin.mjs
 */
import { siteOrigin, workerCacheOrigin } from "../src/lib/hosts.ts";

const cases = [
	{
		name: "dashboard workers.dev → mbu workers.dev",
		url: "https://dashboard.wasi-workdesk.workers.dev/api/shorts",
		expect: "https://mbu.wasi-workdesk.workers.dev",
	},
	{
		name: "mbu workers.dev → itself",
		url: "https://mbu.wasi-workdesk.workers.dev/",
		expect: "https://mbu.wasi-workdesk.workers.dev",
	},
	{
		name: "custom dashboard host → apex (when custom domain is live)",
		url: "https://dashboard.moinbinumair.com/api/shorts",
		expect: "https://moinbinumair.com",
	},
	{
		name: "localhost dashboard stays on-host",
		url: "http://localhost:4321/api/shorts",
		expect: "http://localhost:4321",
	},
];

let failed = 0;
for (const c of cases) {
	const got = workerCacheOrigin(new URL(c.url));
	if (got !== c.expect) {
		console.error(`FAIL ${c.name}: got ${got}, expected ${c.expect}`);
		failed += 1;
	} else {
		console.log(`ok ${c.name}`);
	}
}

// Regression: marketing SITE must not hijack purge origin on workers.dev.
const dash = new URL("https://dashboard.wasi-workdesk.workers.dev/api/shorts");
const cacheOrigin = workerCacheOrigin(dash);
if (cacheOrigin.includes("moinbinumair.com")) {
	console.error(
		"FAIL workerCacheOrigin must not resolve to marketing SITE on workers.dev",
	);
	failed += 1;
} else {
	console.log("ok workers.dev purge origin ignores marketing domain");
}

// siteOrigin may still prefer SITE when Astro bakes it — that is intentional
// for canonical links; purge must use workerCacheOrigin instead.
if (typeof siteOrigin !== "function") {
	console.error("FAIL siteOrigin export missing");
	failed += 1;
}

if (failed) {
	console.error(`worker-cache-origin verification failed (${failed})`);
	process.exit(1);
}
console.log("worker-cache-origin verification passed");
