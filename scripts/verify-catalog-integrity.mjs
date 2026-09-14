#!/usr/bin/env node
/**
 * Lightweight checks for catalog integrity helpers (no R2 / Workers runtime).
 * Run: node --experimental-strip-types scripts/verify-catalog-integrity.mjs
 *
 * This file re-implements the critical contracts so it can run without Astro.
 * Keep in sync with src/lib/catalog-integrity.ts.
 */

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

function isSafeStorageSegment(value) {
	if (!value || value.length > 80) return false;
	if (value === "." || value === "..") return false;
	if (/[\\/\0\r\n\t]/.test(value)) return false;
	if (value.startsWith(".") || value.endsWith(".")) return false;
	return /^[a-zA-Z0-9._-]+$/.test(value);
}

function parseRequiredInt(value, opts) {
	let n;
	if (typeof value === "number") n = value;
	else if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed || !/^[+-]?\d+$/.test(trimmed)) return null;
		n = Number(trimmed);
	} else return null;
	if (!Number.isFinite(n) || !Number.isInteger(n) || !Number.isSafeInteger(n)) {
		return null;
	}
	if (n < opts.min || n > opts.max) return null;
	return n;
}

function assertCompleteSlugOrder(currentSlugs, incoming) {
	if (new Set(incoming).size !== incoming.length) {
		throw new Error("duplicates");
	}
	if (incoming.length !== currentSlugs.length) {
		throw new Error("omission");
	}
	const known = new Set(currentSlugs);
	for (const slug of incoming) {
		if (!known.has(slug)) throw new Error("unknown");
	}
	return incoming;
}

// Identifier safety
if (!isSafeStorageSegment("by-chance")) fail("valid slug rejected");
else ok("valid slug accepted");

if (!isSafeStorageSegment("_abc-DEFghij")) fail("youtube-like id rejected");
else ok("youtube-like id accepted");

if (isSafeStorageSegment("../etc")) fail("path traversal accepted");
else ok("path traversal rejected");

if (isSafeStorageSegment("a/b")) fail("slash accepted");
else ok("slash rejected");

if (isSafeStorageSegment("has space")) fail("space accepted");
else ok("space rejected");

// Numeric validation
if (parseRequiredInt(NaN, { min: 0, max: 100 }) != null) fail("NaN accepted");
else ok("NaN rejected");

if (parseRequiredInt(Infinity, { min: 0, max: 100 }) != null)
	fail("Infinity accepted");
else ok("Infinity rejected");

if (parseRequiredInt(12.5, { min: 0, max: 100 }) != null) fail("float accepted");
else ok("float rejected");

if (parseRequiredInt("2024", { min: 1900, max: 2100 }) !== 2024)
	fail("year string failed");
else ok("year string accepted");

if (parseRequiredInt(-1, { min: 0, max: 100 }) != null) fail("negative accepted");
else ok("negative rejected");

if (parseRequiredInt(1800, { min: 1900, max: 2100 }) != null)
	fail("unreasonable year accepted");
else ok("unreasonable year rejected");

// Empty catalog semantics
function resolveList(payload, seed) {
	if (payload && Array.isArray(payload.items)) return payload.items;
	return seed;
}

const seed = [{ slug: "seed" }];
const emptyStored = resolveList({ items: [] }, seed);
if (emptyStored.length !== 0) fail("empty array fell back to seed");
else ok("empty array kept as intentional empty");

const missing = resolveList({}, seed);
if (missing !== seed) fail("missing property did not fall back");
else ok("missing property falls back to seed");

const absent = resolveList(null, seed);
if (absent !== seed) fail("absent catalog did not fall back");
else ok("absent catalog falls back to seed");

// Reorder completeness
try {
	assertCompleteSlugOrder(["a", "b"], ["a", "a"]);
	fail("duplicate reorder accepted");
} catch {
	ok("duplicate reorder rejected");
}

try {
	assertCompleteSlugOrder(["a", "b"], ["a"]);
	fail("partial reorder accepted");
} catch {
	ok("partial reorder rejected");
}

try {
	assertCompleteSlugOrder(["a", "b"], ["a", "b"]);
	ok("complete reorder accepted");
} catch {
	fail("complete reorder rejected");
}

// Revision monotonicity contract
function nextRev(current) {
	return (current ?? 0) + 1;
}
if (nextRev(0) !== 1 || nextRev(undefined) !== 1 || nextRev(4) !== 5) {
	fail("revision increment broken");
} else ok("revision increments");

if (process.exitCode) {
	console.error("catalog integrity verification failed");
	process.exit(1);
}
console.log("catalog integrity verification passed");
