/**
 * Mutation authorization policy.
 * Run: node --experimental-strip-types scripts/verify-mutation-auth.mjs
 */
import { decideMutationAuth } from "../src/lib/mutation-auth-policy.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

const allowDev = decideMutationAuth({
	isDev: true,
	accessEnforced: true,
	isDashboardHost: false,
	hasJwtConfig: false,
	hasValidIdentity: false,
});
if (allowDev.allow) ok("dev allows mutations");
else fail("dev should allow");

const bringUp = decideMutationAuth({
	isDev: false,
	accessEnforced: false,
	isDashboardHost: false,
	hasJwtConfig: false,
	hasValidIdentity: false,
});
if (bringUp.allow) ok("access-disabled bring-up allows");
else fail("bring-up should allow");

const publicHost = decideMutationAuth({
	isDev: false,
	accessEnforced: true,
	isDashboardHost: false,
	hasJwtConfig: true,
	hasValidIdentity: true,
});
if (!publicHost.allow && publicHost.status === 401) ok("public host blocked");
else fail("public host should 401");

const missingCfg = decideMutationAuth({
	isDev: false,
	accessEnforced: true,
	isDashboardHost: true,
	hasJwtConfig: false,
	hasValidIdentity: false,
});
if (!missingCfg.allow && missingCfg.status === 503)
	ok("missing Access config → 503");
else fail("missing config should 503");

const badJwt = decideMutationAuth({
	isDev: false,
	accessEnforced: true,
	isDashboardHost: true,
	hasJwtConfig: true,
	hasValidIdentity: false,
});
if (!badJwt.allow && badJwt.status === 401) ok("invalid JWT → 401");
else fail("invalid JWT should 401");

const okDash = decideMutationAuth({
	isDev: false,
	accessEnforced: true,
	isDashboardHost: true,
	hasJwtConfig: true,
	hasValidIdentity: true,
});
if (okDash.allow) ok("dashboard + valid JWT allowed");
else fail("valid dashboard mutation rejected");

if (process.exitCode) {
	console.error("mutation auth verification failed");
	process.exit(1);
}
console.log("mutation auth verification passed");
