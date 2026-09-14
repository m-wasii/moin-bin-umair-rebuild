/**
 * Quick verification of byte-range parsing (run: node scripts/verify-http-range.mjs).
 * Mirrors src/lib/http-range.ts — keep in sync when changing range semantics.
 */

function parseByteRange(header, size) {
	if (header == null) return { kind: "absent" };
	const trimmed = header.trim();
	if (!trimmed) return { kind: "absent" };
	if (trimmed.includes(",")) return { kind: "invalid" };
	const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
	if (!match) return { kind: "invalid" };
	const startRaw = match[1];
	const endRaw = match[2];
	const hasStart = startRaw !== "";
	const hasEnd = endRaw !== "";
	if (!hasStart && !hasEnd) return { kind: "invalid" };
	if (size <= 0) return { kind: "unsatisfiable" };
	if (!hasStart && hasEnd) {
		if (!/^\d+$/.test(endRaw)) return { kind: "invalid" };
		const suffix = Number(endRaw);
		if (!Number.isSafeInteger(suffix) || suffix < 0) return { kind: "invalid" };
		if (suffix === 0) return { kind: "unsatisfiable" };
		const length = Math.min(suffix, size);
		const start = size - length;
		const end = size - 1;
		return { kind: "range", start, end, length };
	}
	if (!/^\d+$/.test(startRaw)) return { kind: "invalid" };
	const start = Number(startRaw);
	if (!Number.isSafeInteger(start) || start < 0) return { kind: "invalid" };
	if (start >= size) return { kind: "unsatisfiable" };
	if (!hasEnd) {
		const end = size - 1;
		return { kind: "range", start, end, length: end - start + 1 };
	}
	if (!/^\d+$/.test(endRaw)) return { kind: "invalid" };
	const end = Number(endRaw);
	if (!Number.isSafeInteger(end) || end < 0) return { kind: "invalid" };
	if (start > end) return { kind: "invalid" };
	const clampedEnd = Math.min(end, size - 1);
	return {
		kind: "range",
		start,
		end: clampedEnd,
		length: clampedEnd - start + 1,
	};
}

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
];

let failed = 0;
for (const [header, expected] of cases) {
	const result = parseByteRange(header, size);
	const ok = result.kind === expected;
	if (!ok) {
		failed += 1;
		console.error(`FAIL ${JSON.stringify(header)} → ${result.kind} (want ${expected})`);
	} else {
		console.log(`ok  ${JSON.stringify(header)} → ${result.kind}`);
	}
}

// suffix last 100 of 1000
const suffix = parseByteRange("bytes=-100", size);
if (
	suffix.kind !== "range" ||
	suffix.start !== 900 ||
	suffix.end !== 999 ||
	suffix.length !== 100
) {
	failed += 1;
	console.error("FAIL suffix range values", suffix);
}

if (failed) {
	console.error(`\n${failed} case(s) failed`);
	process.exit(1);
}
console.log("\nall range cases passed");
