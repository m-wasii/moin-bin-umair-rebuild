#!/usr/bin/env node
/**
 * Post-deploy Workers Caching purge for the public site Worker.
 * Calls the Worker’s own `/cdn-purge` so purge is entrypoint-scoped.
 *
 * Usage:
 *   node scripts/purge-workers-cache.mjs --target production --i-know-this-is-production --scope everything --warm
 *   node scripts/purge-workers-cache.mjs --target preview --origin https://mbu-pr-12.example.workers.dev
 *   node scripts/purge-workers-cache.mjs --target production --i-know-this-is-production --origin https://mbu.example.workers.dev
 */
import { argValue, hasFlag, requireScriptTarget } from "./lib/target-guard.mjs";

const DEFAULT_PRODUCTION_ORIGIN = "https://mbu.wasi-workdesk.workers.dev";
const WARM_PATHS = ["/", "/de/"];

async function sleep(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function purgeOnce(origin, scope) {
	const secret = (process.env.CDN_PURGE_SECRET || "").trim();
	if (!secret) {
		throw new Error(
			"CDN_PURGE_SECRET is required (Worker secret / CI repository secret).",
		);
	}
	const url = new URL("/cdn-purge", `${origin}/`);
	url.searchParams.set("scope", scope);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			accept: "application/json",
			// Avoid Cloudflare’s “Cross-site POST form submissions are forbidden”
			// (triggered for form-like Content-Types / missing JSON type).
			"content-type": "application/json",
			authorization: `Bearer ${secret}`,
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
	const { target, origin: originFlag } = requireScriptTarget({
		script: "purge-workers-cache",
		allow: ["preview", "production"],
		requireOrigin: false,
	});

	let origin = (
		originFlag ||
		process.env.MBU_SITE_ORIGIN ||
		process.env.SITE_ORIGIN ||
		""
	).replace(/\/$/, "");

	if (!origin) {
		if (target === "production") {
			origin = DEFAULT_PRODUCTION_ORIGIN;
		} else {
			console.error(
				"purge-workers-cache: --origin is required for --target preview",
			);
			process.exit(1);
		}
	}

	if (target === "preview") {
		try {
			const host = new URL(origin).hostname.toLowerCase();
			if (
				host === "mbu.wasi-workdesk.workers.dev" ||
				host.startsWith("dashboard.")
			) {
				console.error(
					`purge-workers-cache: refusing production-like origin under --target preview: ${origin}`,
				);
				process.exit(1);
			}
			if (!host.includes("-pr-") && !host.includes("pages.dev")) {
				console.warn(
					`purge-workers-cache: preview origin does not look like a PR Worker (${origin})`,
				);
			}
		} catch {
			console.error(`purge-workers-cache: invalid --origin ${origin}`);
			process.exit(1);
		}
	}

	const scope = (
		argValue(process.argv, "--scope") || "everything"
	).toLowerCase();
	const shouldWarm = hasFlag(process.argv, "--warm");
	const attempts = Number(process.env.PURGE_ATTEMPTS || 5);

	console.log(
		`Purging Workers cache at ${origin} (target=${target}, scope=${scope})`,
	);

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
