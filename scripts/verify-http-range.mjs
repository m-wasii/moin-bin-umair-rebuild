/**
 * Byte-range parsing against the real src/lib/http-range.ts helper.
 * Run via: node --experimental-strip-types scripts/verify-http-range.mjs
 */
import { parseByteRange } from "../src/lib/http-range.ts";

const size = 1000;
const cases = [
	[null, "absent"],
	["", "absent"],
	["bytes=0-99", "range"],
	["bytes=500-", "range"],
	["bytes=-100", "range"],
	["bytes=-0", "unsatisfiable"],
	["bytes=1000-1001", "unsatisfiable"],
	["bytes=200-100", "invalid"],
	["bytes=abc-10", "invalid"],
	["bytes=0-1,2-3", "invalid"],
	["foobar", "invalid"],
	["bytes=", "invalid"],
	["bytes=-", "invalid"],
];

let failed = 0;
for (const [header, expected] of cases) {
	const result = parseByteRange(header, size);
	if (result.kind !== expected) {
		failed += 1;
		console.error(
			`FAIL ${JSON.stringify(header)} → ${result.kind} (want ${expected})`,
		);
	} else {
		console.log(`ok  ${JSON.stringify(header)} → ${result.kind}`);
	}
}

const suffix = parseByteRange("bytes=-100", size);
if (
	suffix.kind !== "range" ||
	suffix.start !== 900 ||
	suffix.end !== 999 ||
	suffix.length !== 100
) {
	failed += 1;
	console.error("FAIL suffix range values", suffix);
} else {
	console.log("ok  suffix last-100 values");
}

const empty = parseByteRange("bytes=0-0", 0);
if (empty.kind !== "unsatisfiable") {
	failed += 1;
	console.error("FAIL size=0 should be unsatisfiable", empty);
} else {
	console.log("ok  size=0 unsatisfiable");
}

if (failed) {
	console.error(`\n${failed} case(s) failed`);
	process.exit(1);
}
console.log("\nall range cases passed");
