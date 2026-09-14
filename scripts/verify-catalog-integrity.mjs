#!/usr/bin/env node
/**
 * Catalog integrity helpers — imports the real TypeScript modules.
 * Run: node --experimental-strip-types scripts/verify-catalog-integrity.mjs
 */
import {
	assertCompleteSlugOrder,
	assertExpectedRev,
	CatalogConflictError,
	classifyCatalogList,
	isKebabSlug,
	isSafeStorageSegment,
	parseCatalogRev,
	parseRequiredInt,
} from "../src/lib/catalog-integrity.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

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

if (!isKebabSlug("film-portraits-trieste")) fail("kebab slug rejected");
else ok("kebab slug accepted");

if (isKebabSlug("Film_Portraits")) fail("non-kebab accepted");
else ok("non-kebab rejected");

try {
	parseRequiredInt(NaN, "n", { min: 0, max: 100 });
	fail("NaN accepted");
} catch {
	ok("NaN rejected");
}

try {
	parseRequiredInt(Infinity, "n", { min: 0, max: 100 });
	fail("Infinity accepted");
} catch {
	ok("Infinity rejected");
}

try {
	parseRequiredInt(12.5, "n", { min: 0, max: 100 });
	fail("float accepted");
} catch {
	ok("float rejected");
}

if (parseRequiredInt("2024", "year", { min: 1900, max: 2100 }) !== 2024)
	fail("year string failed");
else ok("year string accepted");

try {
	parseRequiredInt(-1, "n", { min: 0, max: 100 });
	fail("negative accepted");
} catch {
	ok("negative rejected");
}

try {
	parseRequiredInt(1800, "year", { min: 1900, max: 2100 });
	fail("unreasonable year accepted");
} catch {
	ok("unreasonable year rejected");
}

// Empty catalog semantics (present [] must not become seed)
const seed = [{ slug: "seed" }];
const emptyPresent = classifyCatalogList(true, []);
if (emptyPresent.kind !== "present" || emptyPresent.items.length !== 0)
	fail("empty array fell back / misclassified");
else ok("empty array kept as intentional empty");

const missing = classifyCatalogList(false, undefined);
if (missing.kind !== "missing") fail("missing catalog misclassified");
else ok("missing catalog classified for seed fallback");

const malformed = classifyCatalogList(true, {});
if (malformed.kind !== "malformed") fail("malformed catalog misclassified");
else ok("malformed catalog classified");

// seed unused but documents contract used by callers
void seed;

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

if (parseCatalogRev(4) !== 4 || parseCatalogRev(undefined) !== 0)
	fail("parseCatalogRev broken");
else ok("parseCatalogRev");

try {
	assertExpectedRev(3, 2);
	fail("rev conflict accepted");
} catch (error) {
	if (error instanceof CatalogConflictError) ok("rev conflict → 409");
	else fail("rev conflict wrong error type");
}

try {
	assertExpectedRev(3, 3);
	ok("matching rev accepted");
} catch {
	fail("matching rev rejected");
}

if (process.exitCode) {
	console.error("catalog integrity verification failed");
	process.exit(1);
}
console.log("catalog integrity verification passed");
