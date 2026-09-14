/**
 * Target-guard safety for destructive scripts.
 * Run: node scripts/verify-target-guard.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertSafePreviewWorkerName,
	isPreviewWorkerName,
} from "./lib/target-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

if (!isPreviewWorkerName("mbu-pr-12")) fail("preview name rejected");
else ok("preview name accepted");

if (isPreviewWorkerName("mbu")) fail("production mbu accepted as preview");
else ok("production mbu rejected as preview");

if (isPreviewWorkerName("dashboard")) fail("dashboard accepted as preview");
else ok("dashboard rejected as preview");

try {
	assertSafePreviewWorkerName("mbu");
	fail("assert allowed mbu");
} catch {
	ok("assert blocks mbu");
}

try {
	assertSafePreviewWorkerName("mbu-pr-3");
	ok("assert allows mbu-pr-3");
} catch {
	fail("assert blocked valid preview");
}

// purge without --target must fail closed
const purge = spawnSync(
	process.execPath,
	["scripts/purge-workers-cache.mjs", "--scope", "html"],
	{ cwd: root, encoding: "utf8" },
);
if (purge.status !== 0) ok("purge without --target exits non-zero");
else fail("purge without --target should fail");

if (process.exitCode) {
	console.error("target-guard verification failed");
	process.exit(1);
}
console.log("target-guard verification passed");
