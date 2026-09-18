#!/usr/bin/env node
/**
 * Astro's redirected deploy config (dist/server/wrangler.json) does not keep
 * wrangler.jsonc `services`. Dashboard must bind to `mbu` or same-zone
 * fetch() returns Cloudflare error 1042.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"dist",
	"server",
	"wrangler.json",
);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const services = Array.isArray(config.services) ? config.services : [];
const hasSiteWorker = services.some(
	(binding) => binding && binding.binding === "SITE_WORKER",
);
if (!hasSiteWorker) {
	services.push({ binding: "SITE_WORKER", service: "mbu" });
}
config.services = services;
writeFileSync(configPath, `${JSON.stringify(config)}\n`);
console.log("inject-site-worker-binding: SITE_WORKER → mbu");
