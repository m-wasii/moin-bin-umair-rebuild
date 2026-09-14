#!/usr/bin/env node
/**
 * Inline album JSON must not break out of <script type="application/json">.
 * Run: node --experimental-strip-types scripts/verify-serialize-json-for-script.mjs
 */
import { serializeJsonForScript } from "../src/lib/serialize-json-for-script.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

const breakout = "</script><script>alert(1)</script>";
const payload = [
	{
		src: "/media/photos/x.webp",
		alt: breakout,
		width: 800,
		height: 600,
	},
];

const raw = JSON.stringify(payload);
if (!raw.includes("</script>")) fail("control case missing </script>");
else ok("control case contains literal </script>");

const safe = serializeJsonForScript(payload);

if (safe.includes("</script>") || safe.includes("<script>")) {
	fail("escaped output still contains script breakout markup");
} else {
	ok("escaped output has no script breakout markup");
}

if (!safe.includes("\\u003c") || !safe.includes("\\u003e")) {
	fail("expected < and > unicode escapes missing");
} else {
	ok("< and > escaped as unicode");
}

const roundTrip = JSON.parse(safe);
if (roundTrip[0]?.alt !== breakout) {
	fail(`round-trip alt mismatch: ${JSON.stringify(roundTrip[0]?.alt)}`);
} else {
	ok("JSON.parse recovers original alt text");
}

const withAmp = serializeJsonForScript({ alt: "A & B < C > D" });
if (withAmp.includes("<") || withAmp.includes(">") || withAmp.includes("&")) {
	fail(`amp/bracket still raw in: ${withAmp}`);
} else {
	ok("< > & escaped in mixed string");
}

const ampRoundTrip = JSON.parse(withAmp);
if (ampRoundTrip.alt !== "A & B < C > D") {
	fail(`amp round-trip failed: ${JSON.stringify(ampRoundTrip.alt)}`);
} else {
	ok("ampersand round-trip intact");
}

/** Simulate HTML script embedding: anything after a raw </script> is outside. */
function scriptWouldBreakOut(serialized) {
	const html = `<script type="application/json">${serialized}</script>`;
	const close = html.toLowerCase().indexOf("</script>");
	const expectedClose = html.length - "</script>".length;
	return close !== expectedClose;
}

if (scriptWouldBreakOut(raw)) ok("unescaped JSON would break out of script");
else fail("unescaped control should break out");

if (scriptWouldBreakOut(safe)) fail("escaped JSON still breaks out of script");
else ok("escaped JSON stays inside script element");

if (process.exitCode) {
	console.error("serialize-json-for-script verification failed");
	process.exit(process.exitCode);
}
console.log("serialize-json-for-script: all checks passed");
