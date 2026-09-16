#!/usr/bin/env node
/**
 * Run all safe, local verification scripts (no Cloudflare deploy / R2 writes).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stripTypes = ["--experimental-strip-types"];

const checks = [
	{
		name: "http-range",
		args: [...stripTypes, "scripts/verify-http-range.mjs"],
	},
	{
		name: "catalog-integrity",
		args: [...stripTypes, "scripts/verify-catalog-integrity.mjs"],
	},
	{
		name: "dashboard-auth",
		args: [...stripTypes, "scripts/verify-dashboard-auth.mjs"],
	},
	{
		name: "purge-auth",
		args: [...stripTypes, "scripts/verify-purge-auth.mjs"],
	},
	{
		name: "mutation-auth",
		args: [...stripTypes, "scripts/verify-mutation-auth.mjs"],
	},
	{
		name: "catalog-mutations",
		args: [...stripTypes, "scripts/verify-catalog-mutations.mjs"],
	},
	{
		name: "request-body",
		args: [...stripTypes, "scripts/verify-request-body.mjs"],
	},
	{
		name: "target-guard",
		args: ["scripts/verify-target-guard.mjs"],
	},
	{
		name: "serialize-json-for-script",
		args: [...stripTypes, "scripts/verify-serialize-json-for-script.mjs"],
	},
];

let failed = 0;
for (const check of checks) {
	console.log(`\n=== verify:${check.name} ===`);
	const result = spawnSync(process.execPath, check.args, {
		cwd: root,
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) {
		failed += 1;
		console.error(`verify:${check.name} failed (exit ${result.status})`);
	}
}

if (failed) {
	console.error(`\n${failed} verification suite(s) failed`);
	process.exit(1);
}
console.log("\nAll local verification suites passed.");
