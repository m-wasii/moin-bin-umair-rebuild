/**
 * CDN purge bearer authorization.
 * Run: node --experimental-strip-types scripts/verify-purge-auth.mjs
 */
import {
	authorizeCdnPurgeBearer,
	parseBearerToken,
	timingSafeEqualString,
} from "../src/lib/bearer-token.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

if (parseBearerToken(null) != null) fail("null header parsed");
else ok("null header → null token");

if (parseBearerToken("Bearer secret-value") !== "secret-value")
	fail("bearer parse failed");
else ok("bearer parse");

if (parseBearerToken("Basic x") != null) fail("basic accepted as bearer");
else ok("non-bearer rejected");

if (!timingSafeEqualString("abc", "abc")) fail("equal strings mismatch");
else ok("timing-safe equal");

if (timingSafeEqualString("abc", "abd")) fail("different strings matched");
else ok("timing-safe unequal");

const missing = authorizeCdnPurgeBearer(undefined, "Bearer x");
if (!missing.ok && missing.status === 503) ok("missing secret → 503");
else fail("missing secret should 503");

const bad = authorizeCdnPurgeBearer("correct-secret", "Bearer wrong");
if (!bad.ok && bad.status === 401) ok("wrong token → 401");
else fail("wrong token should 401");

const none = authorizeCdnPurgeBearer("correct-secret", null);
if (!none.ok && none.status === 401) ok("missing token → 401");
else fail("missing token should 401");

const good = authorizeCdnPurgeBearer("correct-secret", "Bearer correct-secret");
if (good.ok) ok("matching token authorized");
else fail("matching token rejected");

if (process.exitCode) {
	console.error("purge auth verification failed");
	process.exit(1);
}
console.log("purge auth verification passed");
