#!/usr/bin/env node
/**
 * Post-deploy Workers Caching purge for the public `mbu` Worker.
 * Calls the Worker’s own `/cdn-purge` so purge is entrypoint-scoped.
 *
 * Usage:
 *   node scripts/purge-workers-cache.mjs
 *   node scripts/purge-workers-cache.mjs --origin https://mbu.example.workers.dev
 *   node scripts/purge-workers-cache.mjs --scope html
 *   node scripts/purge-workers-cache.mjs --warm
 */
const DEFAULT_ORIGIN = "https://mbu.wasi-workdesk.workers.dev";
const WARM_PATHS = ["/", "/de/"];

function argValue(flag) {
	const index = process.argv.indexOf(flag);
	if (index === -1) return null;
	return process.argv[index + 1] ?? null;
}

function hasFlag(flag) {
	return process.argv.includes(flag);
}

async function sleep(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function purgeOnce(origin, scope) {
	const url = new URL("/cdn-purge", `${origin}/`);
	url.searchParams.set("scope", scope);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			accept: "application/json",
			// Avoid Cloudflare’s “Cross-site POST form submissions are forbidden”
			// (triggered for form-like Content-Types / missing JSON type).
			"content-type": "application/json",
			origin: origin,
		},
		body: "{}",
	});
	const text = await response.text();
	let body = text;
	try {
		body = JSON.stringify(JSON.parse(text));
	} catch {
		// keep raw text
	}
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${body.slice(0, 400)}`);
	}
	return body;
}

async function warm(origin) {
	for (const path of WARM_PATHS) {
		const response = await fetch(new URL(path, `${origin}/`), {
			method: "GET",
			headers: { accept: "text/html" },
		});
		if (!response.ok) {
			throw new Error(`warm ${path} → HTTP ${response.status}`);
		}
		await response.arrayBuffer().catch(() => undefined);
		console.log(`warmed ${path}`);
	}
}

async function main() {
	const origin = (
		argValue("--origin") ||
		process.env.MBU_SITE_ORIGIN ||
		process.env.SITE_ORIGIN ||
		DEFAULT_ORIGIN
	).replace(/\/$/, "");
	const scope = (argValue("--scope") || "everything").toLowerCase();
	const shouldWarm = hasFlag("--warm");
	const attempts = Number(process.env.PURGE_ATTEMPTS || 5);

	console.log(`Purging Workers cache at ${origin} (scope=${scope})`);

	let lastError = null;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const body = await purgeOnce(origin, scope);
			console.log(`purge ok (attempt ${attempt}): ${body}`);
			if (shouldWarm) await warm(origin);
			return;
		} catch (error) {
			lastError = error;
			console.warn(
				`purge attempt ${attempt}/${attempts} failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			if (attempt < attempts) await sleep(2000 * attempt);
		}
	}

	console.error("Workers cache purge failed after retries.");
	if (lastError) console.error(lastError);
	process.exit(1);
}

main();
