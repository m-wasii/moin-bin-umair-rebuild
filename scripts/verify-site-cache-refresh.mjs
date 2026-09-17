/**
 * Cache refresh sequencing: warm must not follow a failed purge.
 * Run: node --experimental-strip-types scripts/verify-site-cache-refresh.mjs
 */
import { runPurgeThenWarm } from "../src/lib/site-cache-refresh.ts";
import { waitUntilFromLocals } from "../src/lib/wait-until-locals.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

{
	let warmed = false;
	let skipped = false;
	const result = await runPurgeThenWarm({
		purge: async () => {
			throw new Error("purge boom");
		},
		warm: async () => {
			warmed = true;
		},
		onSkipWarmAfterPurgeFailure: () => {
			skipped = true;
		},
	});
	if (!result.purged && !result.warmed && !warmed && skipped)
		ok("purge failure skips warm");
	else fail("warm ran after purge failure");
}

{
	let warmed = false;
	const result = await runPurgeThenWarm({
		purge: async () => {},
		warm: async () => {
			warmed = true;
		},
	});
	if (result.purged && result.warmed && warmed) ok("success purges then warms");
	else fail("successful refresh should purge and warm");
}

{
	const result = await runPurgeThenWarm({
		purge: async () => {},
		warm: async () => {
			throw new Error("warm boom");
		},
	});
	if (result.purged && !result.warmed) ok("warm failure still reports purged");
	else fail("warm failure shape wrong");
}

{
	const bound = [];
	const locals = {
		cfContext: {
			waitUntil(promise) {
				bound.push(promise);
			},
		},
	};
	const waitUntil = waitUntilFromLocals(locals);
	if (!waitUntil) fail("waitUntilFromLocals missing with cfContext");
	else {
		waitUntil(Promise.resolve("done"));
		if (bound.length === 1) ok("waitUntilFromLocals binds cfContext.waitUntil");
		else fail("waitUntil not invoked");
	}
}

{
	if (waitUntilFromLocals(undefined) === undefined)
		ok("missing locals → no waitUntil");
	else fail("undefined locals should yield undefined");
}

{
	if (waitUntilFromLocals({}) === undefined)
		ok("missing cfContext → no waitUntil");
	else fail("empty locals should yield undefined");
}

if (process.exitCode) {
	console.error("site-cache refresh verification failed");
	process.exit(1);
}
console.log("site-cache refresh verification passed");
