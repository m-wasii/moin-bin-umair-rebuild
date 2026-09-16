/**
 * Request-body parsing helpers (boolean coercion, JSON objects).
 * Run: node --experimental-strip-types scripts/verify-request-body.mjs
 */
import { ClientError } from "../src/lib/api-errors.ts";
import {
	parseOptionalBoolean,
	readJsonObject,
} from "../src/lib/request-body.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

function assertEq(actual, expected, label) {
	if (actual !== expected) {
		fail(
			`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
		return;
	}
	ok(label);
}

assertEq(parseOptionalBoolean(true), true, "boolean true");
assertEq(parseOptionalBoolean(false), false, "boolean false");
assertEq(parseOptionalBoolean("true"), true, 'string "true"');
assertEq(
	parseOptionalBoolean("false"),
	false,
	'string "false" (not Boolean())',
);
assertEq(parseOptionalBoolean("FALSE"), false, "case-insensitive false");
assertEq(parseOptionalBoolean(" True "), true, "trimmed true");
assertEq(parseOptionalBoolean(undefined), undefined, "undefined → absent");
assertEq(parseOptionalBoolean(null), undefined, "null → absent");
assertEq(parseOptionalBoolean(""), undefined, "empty string → absent");
assertEq(parseOptionalBoolean("maybe"), undefined, "unknown string → absent");
assertEq(
	parseOptionalBoolean("on"),
	undefined,
	'"on" not accepted (dashboard sends boolean)',
);
assertEq(parseOptionalBoolean("off"), undefined, '"off" not accepted');
assertEq(parseOptionalBoolean("no"), undefined, '"no" not accepted');
assertEq(parseOptionalBoolean("0"), undefined, '"0" not accepted');
assertEq(parseOptionalBoolean("1"), undefined, '"1" not accepted');
assertEq(parseOptionalBoolean(0), undefined, "number 0 not accepted");
assertEq(parseOptionalBoolean(1), undefined, "number 1 not accepted");
assertEq(parseOptionalBoolean("yes"), undefined, '"yes" not accepted');

if (Boolean("false") !== true) {
	fail('sanity: Boolean("false") should be true in JS');
} else {
	ok('sanity: Boolean("false") === true (why explicit parser exists)');
}

const validRequest = new Request("https://example.test", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ featured: "false", title: "x" }),
});

try {
	const body = await readJsonObject(validRequest);
	if (body.featured !== "false" || body.title !== "x") {
		fail("readJsonObject field mismatch");
	} else {
		ok("readJsonObject accepts objects");
	}
} catch (error) {
	fail(`readJsonObject rejected valid body: ${error}`);
}

const arrayRequest = new Request("https://example.test", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: "[]",
});

try {
	await readJsonObject(arrayRequest);
	fail("array body accepted");
} catch (error) {
	if (error instanceof ClientError) ok("array body rejected");
	else fail(`wrong error for array body: ${error}`);
}

const nullRequest = new Request("https://example.test", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: "null",
});

try {
	await readJsonObject(nullRequest);
	fail("null body accepted");
} catch (error) {
	if (error instanceof ClientError) ok("null body rejected");
	else fail(`wrong error for null body: ${error}`);
}

const primitiveRequest = new Request("https://example.test", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: '"hello"',
});

try {
	await readJsonObject(primitiveRequest);
	fail("primitive body accepted");
} catch (error) {
	if (error instanceof ClientError) ok("primitive body rejected");
	else fail(`wrong error for primitive body: ${error}`);
}

const bogusRequest = new Request("https://example.test", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: "{",
});

try {
	await readJsonObject(bogusRequest);
	fail("malformed JSON accepted");
} catch (error) {
	if (error instanceof ClientError) ok("malformed JSON rejected");
	else fail(`wrong error for malformed JSON: ${error}`);
}

if (process.exitCode) {
	console.error("request-body verification failed");
	process.exit(process.exitCode);
}
console.log("request-body verification passed");
