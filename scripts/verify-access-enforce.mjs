/**
 * Access enforcement dual-flag policy + deploy config hygiene.
 * Run: node --experimental-strip-types scripts/verify-access-enforce.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideAccessEnforced } from "../src/lib/access-enforce-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

const defaultOn = decideAccessEnforced({});
if (defaultOn.enforced && !defaultOn.rejectedInsecureDisable)
	ok("default enforced");
else fail("default should enforce");

const trueFlag = decideAccessEnforced({ enforceFlag: "true" });
if (trueFlag.enforced) ok("enforce=true → enforced");
else fail("enforce=true should enforce");

const loneFalse = decideAccessEnforced({ enforceFlag: "false" });
if (loneFalse.enforced && loneFalse.rejectedInsecureDisable)
	ok("lone enforce=false ignored");
else fail("lone enforce=false must still enforce");

const bringUp = decideAccessEnforced({
	enforceFlag: "false",
	allowInsecureBringUp: "true",
});
if (!bringUp.enforced && !bringUp.rejectedInsecureDisable)
	ok("dual-flag bring-up disables enforcement");
else fail("dual-flag bring-up should disable");

const secondOnly = decideAccessEnforced({
	allowInsecureBringUp: "true",
});
if (secondOnly.enforced) ok("second flag alone does not disable");
else fail("ALLOW_INSECURE alone must not disable");

// Deploy hygiene: committed Wrangler config must not disable Access.
const wranglerPath = join(root, "wrangler.jsonc");
const wranglerRaw = readFileSync(wranglerPath, "utf8");
const wranglerJson = wranglerRaw
	.replace(/^\s*\/\/.*$/gm, "")
	.replace(/,\s*([\]}])/g, "$1");
let wrangler;
try {
	wrangler = JSON.parse(wranglerJson);
} catch (error) {
	fail(`wrangler.jsonc parse failed: ${error}`);
	wrangler = {};
}

const vars = {
	...(wrangler.vars ?? {}),
	...(wrangler.env?.production?.vars ?? {}),
	...(wrangler.env?.dashboard?.vars ?? {}),
};

if (vars.DASHBOARD_ENFORCE_CF_ACCESS === "false") {
	fail("wrangler.jsonc sets DASHBOARD_ENFORCE_CF_ACCESS=false");
} else {
	ok("wrangler.jsonc does not disable Access enforcement");
}

if (vars.ALLOW_INSECURE_DASHBOARD_BRINGUP === "true") {
	fail("wrangler.jsonc enables ALLOW_INSECURE_DASHBOARD_BRINGUP");
} else {
	ok("wrangler.jsonc does not enable insecure bring-up");
}

if (process.exitCode) {
	console.error("access enforce verification failed");
	process.exit(1);
}
console.log("access enforce verification passed");
